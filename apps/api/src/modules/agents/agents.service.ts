import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  MAX_AGENTS_PER_USER,
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

  async create(spec: AgentSpec, userId: string): Promise<CreateAgentResult> {
    // Checked before anything costs money. The UI also hides the button at the
    // limit, but that is presentation — this is the rule.
    //
    // Two simultaneous requests could both pass this check and produce a fourth
    // agent. Closing that properly needs a database constraint or a lock; at
    // three-per-account it is not worth the complexity.
    const owned = await this.repo.countByOwner(userId);
    if (owned >= MAX_AGENTS_PER_USER) {
      throw new ForbiddenException(
        `You have reached the limit of ${MAX_AGENTS_PER_USER} agents.`,
      );
    }

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
    //    Best-effort on purpose: the agent already exists in Retell by this
    //    point and the share link already works, so a database blip must not
    //    turn a successful creation into an error the user sees. The cost is
    //    that the agent will be missing from their list — logged loudly.
    try {
      await this.repo.save({
        agentId,
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

  /** Backs the dashboard: the agents plus how many more are allowed. */
  async listForUser(userId: string): Promise<AgentListResult> {
    const rows = await this.repo.listByOwner(userId);
    return {
      agents: rows.map((r) => ({ ...r, url: this.shareUrl(r.agentId) })),
      remaining: Math.max(MAX_AGENTS_PER_USER - rows.length, 0),
      limit: MAX_AGENTS_PER_USER,
    };
  }

  private shareUrl(agentId: string): string {
    return `${this.appUrl}/a/${agentId}`;
  }

  /**
   * Resolves an agent for the public /a/<id> page.
   *
   * Order matters:
   *   1. Our registry — has the full intake form, including the company name.
   *   2. Retell itself — every agent we created lives there permanently, so the
   *      share link keeps working even when our database is down.
   *
   * Returns null only when neither knows the agent, which is a genuine 404.
   */
  async getPublicView(agentId: string): Promise<AgentView | null> {
    try {
      const stored = await this.repo.findById(agentId);
      if (stored) {
        return {
          agentId: stored.agentId,
          agentName: stored.spec.agentName,
          companyName: stored.spec.companyName,
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
        agentId: agent.agent_id,
        agentName: agent.agent_name?.trim() || "your AI agent",
        companyName: "",
      };
    } catch {
      // Retell 404s for an unknown id, which is the normal "no such agent" path.
      return null;
    }
  }

  /**
   * Mints a Retell web-call access token.
   *
   * The agent is looked up first so this cannot be used to start calls against
   * arbitrary agent ids in the Retell account — only ones reachable through a
   * share link we handed out.
   */
  async createWebCall(agentId: string): Promise<WebCallToken> {
    const agent = await this.getPublicView(agentId);
    if (!agent) throw new NotFoundException("Unknown agent.");

    try {
      const call = await this.retell.createWebCall(agent.agentId);
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
