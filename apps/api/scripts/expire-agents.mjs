/**
 * Retires agents whose trial window has closed.
 *
 * Exactly what AgentExpiryService does every night at 03:00 UTC, as a script you
 * can point at the database and inspect first. Use it for the first sweep, when
 * the backlog is every agent ever built rather than the handful that lapsed
 * yesterday, and afterwards whenever you want to see what is pending without
 * waiting for the small hours.
 *
 * The agent and its LLM are deleted from Retell. The row is kept, always: it
 * holds the spec and the compiled prompt, which is what lets an expired agent be
 * rebuilt later on the very same share link. `retell_deleted_at` records that
 * the cleanup happened, so neither this script nor the nightly job re-issues a
 * delete for an agent already gone.
 *
 * Expiry itself is not decided here. An agent is expired the moment
 * created_at + AGENT_RETENTION_DAYS passes, which is what the share page and
 * the web-call endpoint read. This only does the cleanup behind that.
 *
 *   node scripts/expire-agents.mjs --dry-run
 *   node scripts/expire-agents.mjs --yes
 *
 * Flags:
 *   --dry-run     list what would be retired, delete nothing
 *   --yes         required for a live run
 *   --limit=N     stop after N agents
 *   --delay=MS    pause between agents, default 200ms
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const apiRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RETELL_BASE = "https://api.retellai.com";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const CONFIRMED = args.includes("--yes");
const LIMIT = num(args.find((a) => a.startsWith("--limit=")), Infinity);
const DELAY_MS = num(args.find((a) => a.startsWith("--delay=")), 200);

function num(flag, fallback) {
  if (!flag) return fallback;
  const parsed = Number(flag.split("=")[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Read from the shared package so the script and the API cannot disagree about
// how long a trial lasts.
let AGENT_RETENTION_DAYS;
try {
  const shared = await import("@agent/shared");
  AGENT_RETENTION_DAYS = (shared.default ?? shared).AGENT_RETENTION_DAYS;
} catch {
  AGENT_RETENTION_DAYS = undefined;
}
if (typeof AGENT_RETENTION_DAYS !== "number") {
  console.error(
    [
      "Could not read AGENT_RETENTION_DAYS from @agent/shared.",
      "Build it first:  npm run build:shared",
    ].join("\n"),
  );
  process.exit(1);
}

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
  console.error("DATABASE_URL and RETELL_API_KEY must both be set in apps/api/.env.");
  process.exit(1);
}

const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])/.test(databaseUrl);
const sql = postgres(databaseUrl, {
  prepare: false,
  ssl: isLocal ? false : "require",
  max: 1,
});

/** 404 means it is already gone, which is the state we were asking for. */
async function retellDelete(pathname) {
  const res = await fetch(`${RETELL_BASE}${pathname}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${retellKey}` },
  });
  if (res.status === 404 || res.ok) return;
  throw new Error(`Retell DELETE ${pathname} -> ${res.status}: ${await res.text()}`);
}

function formatDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}

try {
  const [column] = await sql`
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'agents'
       and column_name  = 'retell_deleted_at'
  `;
  if (!column) {
    console.error(
      [
        "The retell_deleted_at column does not exist yet.",
        "Apply the schema change first:  npm run db:init -w @agent/api",
      ].join("\n"),
    );
    process.exit(1);
  }

  const cutoff = new Date(Date.now() - AGENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const due = await sql`
    select agent_id, retell_agent_id, llm_id, agent_name, spec, created_at
      from public.agents
     where created_at <= ${cutoff}
       and retell_deleted_at is null
     order by created_at asc
  `;

  const [{ total }] = await sql`select count(*)::int as total from public.agents`;
  const [{ retired }] = await sql`
    select count(*)::int as retired from public.agents where retell_deleted_at is not null
  `;

  console.log(`Trial window   : ${AGENT_RETENTION_DAYS} days`);
  console.log(`Built on/before: ${formatDate(cutoff)} has expired`);
  console.log(`Registry       : ${total} agent(s), ${retired} already retired`);
  console.log(`Due for cleanup: ${due.length}`);
  console.log("");

  if (due.length === 0) {
    console.log("Nothing to retire.");
    process.exit(0);
  }

  if (DRY_RUN) {
    for (const row of due) {
      console.log(
        `  would retire ${row.agent_id}  "${row.agent_name}"  ` +
          `(${row.spec?.companyName || "no company"}, built ${formatDate(row.created_at)})`,
      );
    }
    console.log("\nDry run complete. Nothing was changed.");
    process.exit(0);
  }

  if (!CONFIRMED) {
    console.error(
      [
        `About to delete ${due.length} agent(s) from Retell using the key ending ` +
          `...${retellKey.slice(-4)}.`,
        "Database rows are kept, so this stays reversible by rebuilding them.",
        "",
        "Re-run with --yes once the list above looks right.",
      ].join("\n"),
    );
    process.exit(1);
  }

  let deleted = 0;
  const failures = [];

  for (const row of due) {
    if (deleted >= LIMIT) {
      console.log(`\nStopping at --limit=${LIMIT}.`);
      break;
    }
    try {
      // Agent first: while it exists it can still take a call, and it is the
      // thing that references the LLM.
      await retellDelete(`/delete-agent/${encodeURIComponent(row.retell_agent_id)}`);
      await retellDelete(`/delete-retell-llm/${encodeURIComponent(row.llm_id)}`);

      await sql`
        update public.agents
           set retell_deleted_at = now()
         where agent_id = ${row.agent_id}
      `;

      deleted += 1;
      console.log(`  retired ${row.agent_id}  "${row.agent_name}"`);
    } catch (err) {
      failures.push({ row, message: err.message });
      console.log(`  FAIL    ${row.agent_id}  "${row.agent_name}"  ${err.message}`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`\nRetired ${deleted} agent(s).`);
  if (failures.length) {
    console.log(`${failures.length} failed; they will be retried on the next run.`);
  }
  console.log("Rows were kept. Their share links now show the trial-ended page.");
} catch (err) {
  console.error("Sweep failed:", err.message);
  process.exit(1);
} finally {
  await sql.end();
}
