import { Inject, Injectable } from "@nestjs/common";
import { count, desc, eq } from "drizzle-orm";
import type { AgentSummary, StoredAgent } from "@agent/shared";
import { DRIZZLE, type Database } from "../../db/db.module";
import { agents, type AgentRow } from "../../db/schema";

/**
 * A list entry before the share URL is attached. Building that URL needs
 * APP_URL, which is application config rather than stored data, so the service
 * adds it.
 */
export type AgentListRow = Omit<AgentSummary, "url">;

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
        userId: agent.userId,
        llmId: agent.llmId,
        agentName: agent.spec.agentName,
        spec: agent.spec,
        compiledPrompt: agent.compiledPrompt,
        createdAt: new Date(agent.createdAt),
      })
      .onConflictDoUpdate({
        target: agents.agentId,
        set: {
          llmId: agent.llmId,
          agentName: agent.spec.agentName,
          spec: agent.spec,
          compiledPrompt: agent.compiledPrompt,
        },
      });
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

  /** The signed-in user's agents, newest first. */
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

  /** How many agents this user owns. Backs the per-account limit. */
  async countByOwner(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(agents)
      .where(eq(agents.userId, userId));
    return row?.total ?? 0;
  }
}

function toStored(row: AgentRow): StoredAgent {
  return {
    agentId: row.agentId,
    userId: row.userId,
    llmId: row.llmId,
    spec: row.spec,
    compiledPrompt: row.compiledPrompt,
    createdAt: row.createdAt.toISOString(),
  };
}
