import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { AgentSpec } from "@agent/shared";

/**
 * The agent registry.
 *
 * This file is the schema — `npm run db:generate` diffs it and writes the SQL.
 * That is the point of moving off hand-rolled REST calls: previously the table
 * shape lived only in a comment, so nothing caught it drifting from the real
 * database.
 *
 * The whole intake form is stored as jsonb so adding a field to `AgentSpec`
 * does not require a migration.
 */
export const agents = pgTable(
  "agents",
  {
    /** Retell's id. Ours too — there is no reason to mint a second one. */
    agentId: text("agent_id").primaryKey(),

    /**
     * Owner. References auth.users(id) with ON DELETE CASCADE — see init.sql.
     * Drizzle does not model Supabase's `auth` schema, so the foreign key is
     * declared in SQL rather than here.
     */
    userId: uuid("user_id").notNull(),

    llmId: text("llm_id").notNull(),

    /** Denormalised from `spec` so the list query does not unpack jsonb. */
    agentName: text("agent_name").notNull(),

    spec: jsonb("spec").$type<AgentSpec>().notNull(),

    /** Exactly what we sent Retell as `general_prompt`. */
    compiledPrompt: text("compiled_prompt").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // Every list query is "this user's agents, newest first".
    byOwner: index("agents_user_id_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
  }),
);

export type AgentRow = typeof agents.$inferSelect;
export type NewAgentRow = typeof agents.$inferInsert;
