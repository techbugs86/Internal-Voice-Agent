import type { Config } from "drizzle-kit";

/**
 * `npm run db:generate` diffs src/db/schema.ts against the previous snapshot and
 * writes a versioned SQL file into src/db/migrations. Those files are the source
 * of truth for the schema — apply them with `npm run db:push` (development) or
 * by running the SQL in the Supabase SQL editor (production).
 */
export default {
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
} satisfies Config;
