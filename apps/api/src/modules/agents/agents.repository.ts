import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, isNull, lte } from "drizzle-orm";
import type { AgentSummary, StoredAgent } from "@agent/shared";
import { DRIZZLE, type Database } from "../../db/db.module";
import { agents, type AgentRow } from "../../db/schema";

/**
 * A list entry before the share URL is attached. Building that URL needs
 * APP_URL, which is application config rather than stored data, so the service
 * adds it.
 */
export type AgentListRow = Omit<AgentSummary, "url" | "status" | "expiresAt">;

/** What the nightly cleanup needs to retire one agent. */
export type ExpiredAgentRow = {
  agentId: string;
  retellAgentId: string;
  llmId: string;
  agentName: string;
  createdAt: Date;
};

/**
 * All database access for agents.
 *
 * The service above never writes a query, and nothing here knows what an
 * Anthropic prompt or a Retell call is. Ownership is enforced here — every
 * user-scoped read carries a `user_id` filter, because the API connects as the
 * database owner and therefore bypasses row-level security.
 */
@Injectable()
export class AgentsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Upsert, so retrying a creation cannot fail on a duplicate id. */
  async save(agent: StoredAgent): Promise<void> {
    await this.db
      .insert(agents)
      .values({
        agentId: agent.agentId,
        retellAgentId: agent.retellAgentId,
        userId: agent.userId,
        llmId: agent.llmId,
        agentName: agent.spec.agentName,
        spec: agent.spec,
        compiledPrompt: agent.compiledPrompt,
        createdAt: new Date(agent.createdAt),
        retellDeletedAt: agent.retellDeletedAt
          ? new Date(agent.retellDeletedAt)
          : null,
      })
      .onConflictDoUpdate({
        target: agents.agentId,
        set: {
          // A retry recreates the agent in Retell, so both ids can differ from
          // whatever the first attempt stored.
          retellAgentId: agent.retellAgentId,
          llmId: agent.llmId,
          agentName: agent.spec.agentName,
          spec: agent.spec,
          compiledPrompt: agent.compiledPrompt,
          // A retry rebuilt the agent in Retell, so any record of it having
          // been cleaned up no longer describes reality.
          retellDeletedAt: null,
        },
      });
  }

  /**
   * Agents past their trial window that are still in Retell.
   *
   * Driven by `retell_deleted_at is null` rather than by date alone, so the
   * nightly run only touches what it has not already retired instead of
   * re-issuing a delete for every expired agent every night, forever.
   */
  async listExpiredAwaitingCleanup(
    expiredBefore: Date,
  ): Promise<ExpiredAgentRow[]> {
    return this.db
      .select({
        agentId: agents.agentId,
        retellAgentId: agents.retellAgentId,
        llmId: agents.llmId,
        agentName: agents.agentName,
        createdAt: agents.createdAt,
      })
      .from(agents)
      .where(
        and(
          lte(agents.createdAt, expiredBefore),
          isNull(agents.retellDeletedAt),
        ),
      )
      .orderBy(agents.createdAt);
  }

  /** Records that an agent has been removed from Retell. The row stays. */
  async markRetellDeleted(agentId: string, at: Date): Promise<void> {
    await this.db
      .update(agents)
      .set({ retellDeletedAt: at })
      .where(eq(agents.agentId, agentId));
  }

  /**
   * Looks an agent up by id alone, with no owner filter.
   *
   * That is intentional and used by exactly one caller: the public share page,
   * which anyone with the link can open without an account. Do not reuse this
   * for anything the owner is supposed to control.
   */
  async findById(agentId: string): Promise<StoredAgent | null> {
    const rows = await this.db
      .select()
      .from(agents)
      .where(eq(agents.agentId, agentId))
      .limit(1);
    return rows[0] ? toStored(rows[0]) : null;
  }

  /**
   * The signed-in user's agents, newest first.
   *
   * Everything the user owns is listed. Agents built in the previous Retell
   * account were filtered out here for as long as they were uncallable; they
   * have since been migrated into the current account and are reachable again,
   * so there is nothing left to hide.
   */
  async listByOwner(userId: string): Promise<AgentListRow[]> {
    const rows = await this.db
      .select({
        agentId: agents.agentId,
        agentName: agents.agentName,
        spec: agents.spec,
        createdAt: agents.createdAt,
      })
      .from(agents)
      .where(eq(agents.userId, userId))
      .orderBy(desc(agents.createdAt));

    return rows.map((r) => ({
      agentId: r.agentId,
      agentName: r.agentName,
      companyName: r.spec.companyName ?? "",
      createdAt: r.createdAt.toISOString(),
    }));
  }
}

function toStored(row: AgentRow): StoredAgent {
  return {
    agentId: row.agentId,
    retellAgentId: row.retellAgentId,
    userId: row.userId,
    llmId: row.llmId,
    spec: row.spec,
    compiledPrompt: row.compiledPrompt,
    createdAt: row.createdAt.toISOString(),
    retellDeletedAt: row.retellDeletedAt?.toISOString() ?? null,
  };
}
