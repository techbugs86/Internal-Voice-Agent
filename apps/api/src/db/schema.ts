import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
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
    /**
     * The id in the share link, and our primary key.
     *
     * This used to be Retell's id as well, on the assumption that one account
     * would host every agent forever. Moving accounts broke that: Retell
     * workspaces are isolated, so recreating an agent elsewhere mints a new id.
     * Rewriting this column would have changed every share URL already handed
     * to a client, so it no longer tracks Retell at all — it is ours, it is
     * stable, and `retell_agent_id` below carries whatever Retell calls the
     * agent today.
     */
    agentId: text("agent_id").primaryKey(),

    /**
     * The id Retell knows this agent by, in whichever account currently hosts
     * it. Equal to `agent_id` for everything created since the last account
     * move; different for agents migrated across one.
     *
     * Every call into the Retell API uses this. Nothing user-facing does.
     */
    retellAgentId: text("retell_agent_id").notNull(),

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

    /**
     * When the agent was deleted from Retell after its trial ended. Null while
     * it still lives there.
     *
     * A record of what the cleanup job has done, not the definition of expiry
     * -- that is derived from created_at, so an agent is expired the moment its
     * window closes rather than whenever the job next runs. This column exists
     * so the job can find what is left to do instead of re-deleting everything
     * every night.
     */
    retellDeletedAt: timestamp("retell_deleted_at", { withTimezone: true }),
  },
  (table) => ({
    // Every list query is "this user's agents, newest first".
    byOwner: index("agents_user_id_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
    // Two rows pointing at one Retell agent would mean a migration ran twice
    // and silently pointed two share links at the same place.
    byRetellId: uniqueIndex("agents_retell_agent_id_key").on(table.retellAgentId),
  }),
);

export type AgentRow = typeof agents.$inferSelect;
export type NewAgentRow = typeof agents.$inferInsert;
