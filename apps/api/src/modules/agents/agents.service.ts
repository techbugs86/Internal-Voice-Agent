import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  MAX_CALL_DURATION_MS,
  type AgentListResult,
  type AgentSpec,
  type AgentView,
  type CreateAgentResult,
  type WebCallToken,
} from "@agent/shared";
import type { Env } from "../../common/config/env.schema";
import { PromptCompilerService } from "../../infra/prompt/prompt-compiler.service";
import { RetellService } from "../../infra/retell/retell.service";
import { AgentsRepository } from "./agents.repository";

/**
 * A share id resolved into the two things callers need: what the page renders,
 * and which Retell agent to dial.
 *
 * They are separate values. `view.agentId` is the id in the share link and is
 * what the browser sees; `retellAgentId` is an implementation detail of
 * whichever Retell account hosts the agent, and never leaves this API.
 */
type ResolvedAgent = {
  view: AgentView;
  retellAgentId: string;
};

/**
 * Everything the product does with agents.
 *
 * The controller handles HTTP, the repository handles storage, and the ordering
 * and failure policy live here.
 */
@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);
  private readonly appUrl: string;

  constructor(
    private readonly repo: AgentsRepository,
    private readonly retell: RetellService,
    private readonly prompts: PromptCompilerService,
    config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get("APP_URL", { infer: true }).replace(/\/$/, "");
  }

  /**
   * Builds an agent for a user. There is no per-account cap — the brakes on
   * this are the auth guard, the reCAPTCHA guard, and the per-IP rate limit on
   * the controller, all of which run before anything here costs money.
   */
  async create(spec: AgentSpec, userId: string): Promise<CreateAgentResult> {
    let compiledPrompt: string;
    let llmId: string;
    let agentId: string;

    try {
      // 1. Expand the intake form into a structured Retell prompt.
      compiledPrompt = await this.prompts.compile(spec);

      // 2. The brain.
      const llm = await this.retell.createLlm({
        generalPrompt: compiledPrompt,
        beginMessage: spec.firstLine,
      });
      llmId = llm.llm_id;

      // 3. The agent that gives the brain a voice, with the call ceiling baked
      //    in so Retell hangs up on its own.
      const agent = await this.retell.createAgent({
        llmId,
        voiceId: spec.voiceId,
        agentName: spec.agentName,
        language: spec.language,
        maxCallDurationMs: MAX_CALL_DURATION_MS,
      });
      agentId = agent.agent_id;
    } catch (err) {
      this.logger.error(
        `Agent creation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new BadGatewayException(
        "Could not build the agent. Please try again in a moment.",
      );
    }

    // 4. Remember it, so /a/<agentId> can show the company name and the owner
    //    can find it again.
    //
    //    Both id columns get Retell's id here. A freshly built agent lives in
    //    the account we just called, so the share id and the Retell id start
    //    out identical. They diverge only if the agent is later migrated to a
    //    different account, which rewrites retellAgentId and leaves the share
    //    id — and therefore every link already handed out — untouched.
    //
    //    Best-effort on purpose: the agent already exists in Retell by this
    //    point and the share link already works, so a database blip must not
    //    turn a successful creation into an error the user sees. The cost is
    //    that the agent will be missing from their list — logged loudly.
    try {
      await this.repo.save({
        agentId,
        retellAgentId: agentId,
        userId,
        llmId,
        spec,
        compiledPrompt,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      this.logger.error(
        `Agent ${agentId} was created in Retell but not saved to the registry. ` +
          `It will not appear in the owner's list. Cause: ${
            err instanceof Error ? err.message : String(err)
          }`,
      );
    }

    return {
      agentId,
      agentName: spec.agentName,
      url: this.shareUrl(agentId),
    };
  }

  /** Backs the dashboard. */
  async listForUser(userId: string): Promise<AgentListResult> {
    const rows = await this.repo.listByOwner(userId);
    return {
      agents: rows.map((r) => ({ ...r, url: this.shareUrl(r.agentId) })),
    };
  }

  private shareUrl(agentId: string): string {
    return `${this.appUrl}/a/${agentId}`;
  }

  /**
   * Resolves a share id to the page content and the Retell agent behind it.
   *
   * Order matters:
   *   1. Our registry — has the full intake form, including the company name,
   *      and is the only place that knows which Retell agent a share id maps to
   *      once the two have diverged.
   *   2. Retell itself — so the share link keeps working when our database is
   *      down.
   *
   * The fallback can only answer for agents whose share id *is* their Retell
   * id: every agent created since the account move, and none of the ones
   * migrated across it. A migrated agent therefore 404s while the registry is
   * unavailable, rather than rendering a button that cannot work. That is the
   * same honest failure the old account cutoff produced, now scoped to an
   * outage instead of applying permanently.
   */
  private async resolve(agentId: string): Promise<ResolvedAgent | null> {
    try {
      const stored = await this.repo.findById(agentId);
      if (stored) {
        return {
          retellAgentId: stored.retellAgentId,
          view: {
            agentId: stored.agentId,
            agentName: stored.spec.agentName,
            companyName: stored.spec.companyName,
          },
        };
      }
    } catch (err) {
      // A broken registry must not take the share link down with it.
      this.logger.error(
        `Agent registry unavailable, falling back to Retell: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    try {
      const agent = await this.retell.getAgent(agentId);
      if (!agent?.agent_id) return null;
      return {
        retellAgentId: agent.agent_id,
        view: {
          agentId: agent.agent_id,
          agentName: agent.agent_name?.trim() || "your AI agent",
          companyName: "",
        },
      };
    } catch {
      // Retell 404s for an unknown id, which is the normal "no such agent" path.
      return null;
    }
  }

  /** Resolves an agent for the public /a/<id> page. */
  async getPublicView(agentId: string): Promise<AgentView | null> {
    const resolved = await this.resolve(agentId);
    return resolved?.view ?? null;
  }

  /**
   * Mints a Retell web-call access token.
   *
   * The agent is looked up first so this cannot be used to start calls against
   * arbitrary agent ids in the Retell account — only ones reachable through a
   * share link we handed out. That gate is also what makes it safe to dial
   * `retellAgentId` here: the caller supplies a share id, and only the registry
   * can turn one of those into a Retell id.
   */
  async createWebCall(agentId: string): Promise<WebCallToken> {
    const resolved = await this.resolve(agentId);
    if (!resolved) throw new NotFoundException("Unknown agent.");

    try {
      const call = await this.retell.createWebCall(resolved.retellAgentId);
      return { accessToken: call.access_token, callId: call.call_id };
    } catch (err) {
      this.logger.error(
        `Web call creation failed for ${agentId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new BadGatewayException("Could not start the call. Please try again.");
    }
  }
}
