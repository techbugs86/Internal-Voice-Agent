/**
 * Rebuilds agents that live in a previous Retell account inside the current one.
 *
 * Retell workspaces are isolated: an agent id minted by one account is a 404 in
 * every other. When this project moved accounts, every agent built under the old
 * key stopped being callable. The rows were never deleted, and they hold
 * everything needed to build the agent again — `compiled_prompt` is the exact
 * `general_prompt` that was sent to Retell, and `spec` is the whole intake form.
 * So this does not export anything from the old account, and never authenticates
 * against it. It replays the same two creation calls the API makes, against the
 * new key, and records the resulting id.
 *
 * `agent_id` is never touched. That is the id in every share link already handed
 * to a client, and the entire point of `retell_agent_id` is that it can be
 * rewritten without breaking them.
 *
 * Which agents need moving is discovered, not assumed: each row's current
 * `retell_agent_id` is probed with the live key, and only the ones that come
 * back 404 are rebuilt. That makes the script safe to re-run — a second pass
 * finds everything reachable and does nothing — and means it does not depend on
 * knowing the exact moment the key was swapped.
 *
 *   node scripts/migrate-agents-to-primary.mjs --dry-run
 *   node scripts/migrate-agents-to-primary.mjs
 *
 * Flags:
 *   --dry-run     probe and report, create nothing, write nothing
 *   --yes         required for a live run, once the key check below looks right
 *   --limit=N     stop after N migrations (use it for a cautious first pass)
 *   --delay=MS    pause between agents, default 400ms, to stay under rate limits
 */
import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const apiRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RETELL_BASE = "https://api.retellai.com";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const CONFIRMED = args.includes("--yes");
const LIMIT = num(args.find((a) => a.startsWith("--limit=")), Infinity);
const DELAY_MS = num(args.find((a) => a.startsWith("--delay=")), 400);

function num(flag, fallback) {
  if (!flag) return fallback;
  const parsed = Number(flag.split("=")[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The call ceiling must match what the API bakes into every agent it builds,
// or migrated agents would quietly get a different one.
let MAX_CALL_DURATION_MS;
try {
  const shared = await import("@agent/shared");
  MAX_CALL_DURATION_MS = (shared.default ?? shared).MAX_CALL_DURATION_MS;
} catch {
  MAX_CALL_DURATION_MS = undefined;
}
if (typeof MAX_CALL_DURATION_MS !== "number") {
  console.error(
    "Could not read MAX_CALL_DURATION_MS from @agent/shared.\n" +
      "Build it first:  npm run build:shared",
  );
  process.exit(1);
}

// Minimal .env reader — matches db-init.mjs, which runs before Nest boots and
// therefore cannot use ConfigModule either.
const envText = await readFile(path.join(apiRoot, ".env"), "utf8").catch(() => "");
for (const line of envText.split(/\r?\n/)) {
  const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (match && process.env[match[1]] === undefined) {
    process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

const databaseUrl = process.env.DATABASE_URL;
const retellKey = process.env.RETELL_API_KEY;
if (!databaseUrl || !retellKey) {
  console.error(
    "DATABASE_URL and RETELL_API_KEY must both be set in apps/api/.env.\n" +
      "RETELL_API_KEY must be the key for the account agents are moving TO.",
  );
  process.exit(1);
}

const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])/.test(databaseUrl);
const sql = postgres(databaseUrl, {
  prepare: false,
  ssl: isLocal ? false : "require",
  max: 1,
});

const mappingPath = path.join(apiRoot, "scripts", "migration-mapping.csv");

async function retell(pathname, init) {
  const res = await fetch(`${RETELL_BASE}${pathname}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${retellKey}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.text();
    const err = new Error(`Retell ${pathname} -> ${res.status}: ${detail}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/** 200 = already in this account, 404 = needs rebuilding, anything else = stop. */
async function probe(retellAgentId) {
  const res = await fetch(
    `${RETELL_BASE}/get-agent/${encodeURIComponent(retellAgentId)}`,
    { headers: { Authorization: `Bearer ${retellKey}` } },
  );
  if (res.status === 200) return "reachable";
  if (res.status === 404) return "missing";
  return `error-${res.status}`;
}

/** The same two calls AgentsService.create makes, in the same order. */
async function rebuild(row) {
  const llm = await retell("/create-retell-llm", {
    method: "POST",
    body: {
      general_prompt: row.compiled_prompt,
      model: "gpt-4.1",
      begin_message: row.spec.firstLine ?? "",
    },
  });
  const agent = await retell("/create-agent", {
    method: "POST",
    body: {
      response_engine: { type: "retell-llm", llm_id: llm.llm_id },
      voice_id: row.spec.voiceId,
      agent_name: row.spec.agentName,
      language: row.spec.language,
      max_call_duration_ms: MAX_CALL_DURATION_MS,
    },
  });
  return { llmId: llm.llm_id, retellAgentId: agent.agent_id };
}

try {
  const [column] = await sql`
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'agents'
       and column_name  = 'retell_agent_id'
  `;
  if (!column) {
    console.error(
      "The retell_agent_id column does not exist yet.\n" +
        "Apply the schema change first:  npm run db:init -w @agent/api",
    );
    process.exit(1);
  }

  const rows = await sql`
    select agent_id, retell_agent_id, llm_id, agent_name, spec, compiled_prompt,
           created_at
      from public.agents
     order by created_at asc
  `;

  console.log(`${rows.length} agent(s) in the registry.`);
  console.log(`Retell key ending ...${retellKey.slice(-4)}`);
  console.log(
    DRY_RUN
      ? "DRY RUN - probing only, nothing will be created or written.\n"
      : `Migrating with ${DELAY_MS}ms between agents.\n`,
  );

  const reachable = [];
  const needsWork = [];
  const unclear = [];

  for (const row of rows) {
    const state = await probe(row.retell_agent_id);
    if (state === "reachable") reachable.push(row);
    else if (state === "missing") needsWork.push(row);
    else unclear.push({ row, state });
    await sleep(120);
  }

  console.log(`  already in this account : ${reachable.length}`);
  console.log(`  need rebuilding         : ${needsWork.length}`);
  if (unclear.length) console.log(`  could not determine     : ${unclear.length}`);
  console.log("");

  // The one way to get this badly wrong is to run it with the OLD key still in
  // .env. Agents would then be rebuilt into the account they are supposed to be
  // leaving, and the newest agents - the ones already in the right place -
  // would be the ones moved.
  //
  // That mistake has a signature. Migration always moves the oldest agents, so
  // everything needing work should predate everything reachable. If the split
  // runs the other way, the key is pointing at the wrong account.
  if (reachable.length > 0 && needsWork.length > 0) {
    const newestReachable = Math.max(...reachable.map((r) => +r.created_at));
    const oldestNeedsWork = Math.min(...needsWork.map((r) => +r.created_at));
    if (oldestNeedsWork > newestReachable) {
      console.error(
        [
          "STOP - RETELL_API_KEY looks like the wrong account.",
          "",
          "Every agent needing work is NEWER than every agent already reachable,",
          "which is backwards: migration moves old agents into the new account,",
          "not the other way round. This is what it looks like when .env still",
          "holds the previous key.",
          "",
          "Check that RETELL_API_KEY is the key for the account you are moving TO.",
        ].join("\n"),
      );
      process.exit(1);
    }
  }

  for (const { row, state } of unclear) {
    console.log(`  ? ${row.agent_id}  ${row.agent_name}  (${state})`);
  }

  if (needsWork.length === 0) {
    console.log("Nothing to do. Every agent is reachable with the current key.");
  }

  if (!DRY_RUN && !CONFIRMED && needsWork.length > 0) {
    console.error(
      [
        `About to rebuild ${needsWork.length} agent(s) using the key ending ` +
          `...${retellKey.slice(-4)}.`,
        "This creates agents in that Retell account and writes to the database.",
        "",
        "Confirm the key is the account you are moving TO, then re-run with --yes.",
      ].join("\n"),
    );
    process.exit(1);
  }

  if (DRY_RUN) {
    for (const row of needsWork) {
      console.log(
        `  would rebuild ${row.agent_id}  "${row.agent_name}"  ` +
          `voice=${row.spec.voiceId}  lang=${row.spec.language}`,
      );
    }
    console.log("\nDry run complete. Nothing was changed.");
  } else {
    let done = 0;
    const failures = [];

    for (const row of needsWork) {
      if (done >= LIMIT) {
        console.log(`\nStopping at --limit=${LIMIT}.`);
        break;
      }
      try {
        const built = await rebuild(row);

        // Recorded before the UPDATE on purpose: if the write fails, the new
        // Retell agent still exists, and this line is what lets it be matched
        // up by hand rather than leaked.
        await appendFile(
          mappingPath,
          `${row.agent_id},${row.retell_agent_id},${built.retellAgentId},` +
            `${built.llmId},${new Date().toISOString()}\n`,
          "utf8",
        );

        await sql`
          update public.agents
             set retell_agent_id = ${built.retellAgentId},
                 llm_id          = ${built.llmId}
           where agent_id        = ${row.agent_id}
        `;

        done += 1;
        console.log(
          `  ok  ${row.agent_id}  "${row.agent_name}"  -> ${built.retellAgentId}`,
        );
      } catch (err) {
        failures.push({ row, message: err.message });
        console.log(`  FAIL ${row.agent_id}  "${row.agent_name}"  ${err.message}`);
      }
      await sleep(DELAY_MS);
    }

    console.log(`\nMigrated ${done} agent(s).`);
    if (done > 0) console.log(`Mapping appended to ${mappingPath}`);

    if (failures.length) {
      console.log(`\n${failures.length} agent(s) failed:`);
      for (const f of failures) {
        console.log(`  ${f.row.agent_id}  "${f.row.agent_name}"`);
        console.log(`      voice=${f.row.spec.voiceId}  ${f.message}`);
      }
      console.log(
        "\nA 400 mentioning voice_id usually means the agent uses a cloned voice\n" +
          "from the old account. Cloned voices are account-scoped and do not\n" +
          "transfer; recreate the voice in this account, update spec.voiceId, then\n" +
          "re-run. This script is safe to re-run - finished agents are skipped.",
      );
    }

    // Final pass over everything, so the exit state is measured rather than
    // inferred from what the loop above believed it did.
    console.log("\nVerifying...");
    let ok = 0;
    let bad = 0;
    for (const row of await sql`
      select agent_id, retell_agent_id, agent_name from public.agents
    `) {
      const state = await probe(row.retell_agent_id);
      if (state === "reachable") ok += 1;
      else {
        bad += 1;
        console.log(`  unreachable: ${row.agent_id}  "${row.agent_name}"  (${state})`);
      }
      await sleep(120);
    }
    console.log(`\n  reachable   : ${ok}`);
    console.log(`  unreachable : ${bad}`);
    if (bad === 0) {
      console.log("\nEvery agent in the registry is callable with the current key.");
    }
  }
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exit(1);
} finally {
  await sql.end();
}
