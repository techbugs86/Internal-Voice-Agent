import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../common/config/env.schema";

/**
 * Thin wrapper over the Retell REST API.
 *
 * RETELL_API_KEY lives here and nowhere else — the browser is only ever handed
 * a short-lived web-call access token, never the key itself.
 */

const BASE = "https://api.retellai.com";

export type RetellLlm = { llm_id: string };
export type RetellAgent = { agent_id: string; agent_name?: string };
export type RetellWebCall = { access_token: string; call_id: string };
export type RetellAgentDetail = {
  agent_id: string;
  agent_name?: string;
  voice_id?: string;
  language?: string;
};

@Injectable()
export class RetellService {
  private readonly logger = new Logger(RetellService.name);
  private readonly apiKey: string;

  constructor(config: ConfigService<Env, true>) {
    this.apiKey = config.get("RETELL_API_KEY", { infer: true });
  }

  /**
   * Step 1 of agent creation: create the "brain".
   * `general_prompt` is the field that carries tone + instructions.
   */
  createLlm(params: {
    generalPrompt: string;
    beginMessage: string;
    model?: string;
  }): Promise<RetellLlm> {
    return this.call<RetellLlm>("/create-retell-llm", {
      method: "POST",
      body: {
        general_prompt: params.generalPrompt,
        // Retell defaults to gpt-4.1 when unset; pin it so behaviour is stable.
        model: params.model ?? "gpt-4.1",
        begin_message: params.beginMessage,
      },
    });
  }

  /** Step 2: create the agent that wires the brain to a voice. */
  createAgent(params: {
    llmId: string;
    voiceId: string;
    agentName: string;
    language: string;
    /**
     * Retell hangs up by itself once a call reaches this. Set on the agent
     * rather than per call, so the ceiling cannot be bypassed by whoever holds
     * the share link.
     */
    maxCallDurationMs: number;
  }): Promise<RetellAgent> {
    return this.call<RetellAgent>("/create-agent", {
      method: "POST",
      body: {
        response_engine: { type: "retell-llm", llm_id: params.llmId },
        voice_id: params.voiceId,
        agent_name: params.agentName,
        language: params.language,
        max_call_duration_ms: params.maxCallDurationMs,
      },
    });
  }

  /**
   * Retell stores every agent we create, so it doubles as our source of truth
   * when our own registry is unavailable.
   */
  getAgent(agentId: string): Promise<RetellAgentDetail> {
    return this.call<RetellAgentDetail>(
      `/get-agent/${encodeURIComponent(agentId)}`,
      { method: "GET" },
    );
  }

  /**
   * Removes an agent once its trial window closes.
   *
   * A 404 is success, not a failure: it means the agent is already gone, which
   * is the state we were asking for. Anything else is reported, so a cleanup
   * run that silently achieved nothing cannot look like a clean one.
   */
  async deleteAgent(agentId: string): Promise<void> {
    await this.callVoid(`/delete-agent/${encodeURIComponent(agentId)}`);
  }

  /**
   * Removes the brain behind a deleted agent.
   *
   * Retell bills per call rather than per stored LLM, so leaving these behind
   * costs nothing directly. They are still removed: an account with hundreds of
   * orphaned LLMs and no agents using them is one nobody can reason about.
   */
  async deleteLlm(llmId: string): Promise<void> {
    await this.callVoid(`/delete-retell-llm/${encodeURIComponent(llmId)}`);
  }

  /**
   * Mint a short-lived token that lets a browser join a call with this agent.
   * Only the token goes to the client — never the API key.
   */
  createWebCall(agentId: string): Promise<RetellWebCall> {
    return this.call<RetellWebCall>("/v2/create-web-call", {
      method: "POST",
      body: { agent_id: agentId },
    });
  }

  /** DELETE, which Retell answers with an empty body. */
  private async callVoid(path: string): Promise<void> {
    const res = await fetch(`${BASE}${path}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    // Already absent is the outcome we wanted.
    if (res.status === 404) return;

    if (!res.ok) {
      const detail = await res.text();
      this.logger.error(`Retell DELETE ${path} failed (${res.status}): ${detail}`);
      throw new Error(`Retell DELETE ${path} failed (${res.status}): ${detail}`);
    }
  }

  private async call<T>(
    path: string,
    init: { method: "GET" | "POST"; body?: unknown },
  ): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });

    if (!res.ok) {
      // Retell returns a JSON error body; fall back to raw text if it doesn't.
      const detail = await res.text();
      this.logger.error(
        `Retell ${init.method} ${path} failed (${res.status}): ${detail}`,
      );
      throw new Error(
        `Retell ${init.method} ${path} failed (${res.status}): ${detail}`,
      );
    }

    return (await res.json()) as T;
  }
}
