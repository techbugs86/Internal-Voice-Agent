import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { AGENT_RETENTION_DAYS } from "@agent/shared";
import { RetellService } from "../../infra/retell/retell.service";
import { AgentsRepository } from "./agents.repository";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Retell rate-limits; a nightly sweep has no reason to hurry. */
const PAUSE_BETWEEN_AGENTS_MS = 200;

export type SweepResult = {
  deleted: number;
  failed: number;
};

/**
 * Retires agents once their trial window closes.
 *
 * Agents are deleted from Retell, which is where the cost sits, and the row is
 * deliberately kept. That is what makes expiry reversible: `spec` and
 * `compiled_prompt` are still on file, so an expired agent can be rebuilt later
 * on the very same share link, which is exactly what the contact link on the
 * expired page is for.
 *
 * Note what this job does *not* decide. An agent is expired the moment its
 * window closes, because that is derived from `created_at` -- see
 * `isAgentExpired`. This only does the cleanup, so it is free to run once a day
 * and to lag behind by a few hours without anyone being able to place a call
 * they should not have.
 *
 * Runs in-process rather than as a crontab entry: it needs the same database
 * pool, the same Retell key and the same config as the API, its output lands in
 * the same pm2 log as everything else, and there is no second deployment
 * artefact to keep in step. The tradeoff is that it assumes a single instance.
 * If this is ever scaled past one, the `running` latch below is not enough and
 * the claim needs to move into the database.
 */
@Injectable()
export class AgentExpiryService {
  private readonly logger = new Logger(AgentExpiryService.name);

  /**
   * Guards against a slow sweep still running when the next one fires. With 30
   * agents this cannot happen; with three thousand and a degraded Retell it
   * could, and two concurrent sweeps would double-delete and log nonsense.
   */
  private running = false;

  constructor(
    private readonly repo: AgentsRepository,
    private readonly retell: RetellService,
  ) {}

  /**
   * 03:00 UTC. Fixed to UTC rather than server-local so the window does not
   * silently shift by an hour twice a year.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    name: "agent-expiry",
    timeZone: "UTC",
  })
  async scheduledSweep(): Promise<void> {
    await this.sweep();
  }

  /** Exposed separately so it can be triggered by hand without waiting a day. */
  async sweep(): Promise<SweepResult> {
    if (this.running) {
      this.logger.warn("Previous sweep is still running; skipping this one.");
      return { deleted: 0, failed: 0 };
    }
    this.running = true;

    try {
      const cutoff = new Date(Date.now() - AGENT_RETENTION_DAYS * DAY_MS);
      const due = await this.repo.listExpiredAwaitingCleanup(cutoff);

      if (due.length === 0) {
        this.logger.log("Nothing to retire.");
        return { deleted: 0, failed: 0 };
      }

      this.logger.log(
        `Retiring ${due.length} agent(s) built before ${cutoff.toISOString()}.`,
      );

      let deleted = 0;
      let failed = 0;

      for (const row of due) {
        try {
          // Agent first: while it exists it can still take a call, and it is
          // the thing that references the LLM.
          await this.retell.deleteAgent(row.retellAgentId);
          await this.retell.deleteLlm(row.llmId);

          // Only recorded once Retell has actually let go. If this write fails
          // the agent is picked up again tomorrow, and both deletes treat an
          // already-absent id as success, so the retry is harmless.
          await this.repo.markRetellDeleted(row.agentId, new Date());

          deleted += 1;
          this.logger.log(`Retired ${row.agentId} ("${row.agentName}").`);
        } catch (err) {
          failed += 1;
          this.logger.error(
            `Could not retire ${row.agentId} ("${row.agentName}"): ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }

        await new Promise((resolve) =>
          setTimeout(resolve, PAUSE_BETWEEN_AGENTS_MS),
        );
      }

      this.logger.log(`Sweep finished: ${deleted} retired, ${failed} failed.`);
      return { deleted, failed };
    } catch (err) {
      // A sweep that cannot even read its work queue must not take the API down
      // with it -- the product keeps working, the agents simply retire a day
      // late.
      this.logger.error(
        `Sweep aborted: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { deleted: 0, failed: 0 };
    } finally {
      this.running = false;
    }
  }
}
