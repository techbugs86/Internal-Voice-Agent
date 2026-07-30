/**
 * Applies src/db/init.sql to the database in DATABASE_URL.
 *
 * The alternative is pasting the file into the Supabase SQL editor by hand,
 * which is fine once and tedious every time a teammate sets up. Every statement
 * in init.sql is `if not exists`, so running this twice is harmless.
 *
 *   npm run db:init -w @agent/api
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const apiRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env reader — this runs before Nest boots, so ConfigModule is not
// available, and pulling in a parser for four lines is not worth a dependency.
const envText = await readFile(path.join(apiRoot, ".env"), "utf8").catch(() => "");
for (const line of envText.split(/\r?\n/)) {
  const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (match && process.env[match[1]] === undefined) {
    process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env first.",
  );
  process.exit(1);
}

const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])/.test(url);
const sql = postgres(url, {
  prepare: false,
  ssl: isLocal ? false : "require",
  max: 1,
});

try {
  const statements = await readFile(path.join(apiRoot, "src/db/init.sql"), "utf8");
  await sql.unsafe(statements);
  console.log("✓ init.sql applied\n");

  const columns = await sql`
    select column_name, data_type, is_nullable
      from information_schema.columns
     where table_schema = 'public' and table_name = 'agents'
     order by ordinal_position
  `;

  if (columns.length === 0) {
    console.error("✗ The agents table does not exist. Something went wrong.");
    process.exit(1);
  }

  console.log("public.agents");
  for (const c of columns) {
    console.log(
      `  ${c.column_name.padEnd(16)} ${c.data_type}${c.is_nullable === "NO" ? " not null" : ""}`,
    );
  }

  const [rls] = await sql`
    select relrowsecurity from pg_class where oid = 'public.agents'::regclass
  `;
  console.log(`\nRow Level Security: ${rls.relrowsecurity ? "enabled" : "DISABLED"}`);
} catch (err) {
  console.error("✗ Failed to apply init.sql:", err.message);
  process.exit(1);
} finally {
  await sql.end();
}
