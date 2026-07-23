/**
 * Thin wrapper over the Retell REST API.
 *
 * Every function here runs server-side only — RETELL_API_KEY must never be
 * shipped to the browser.
 */

const BASE = "https://api.retellai.com";

function apiKey(): string {
  const key = process.env.RETELL_API_KEY;
  if (!key) {
    throw new Error(
      "RETELL_API_KEY is not set. Copy .env.example to .env.local and fill it in.",
    );
  }
  return key;
}

async function call<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    // Retell returns a JSON error body; fall back to raw text if it doesn't.
    const detail = await res.text();
    throw new Error(`Retell ${init.method} ${path} failed (${res.status}): ${detail}`);
  }

  return (await res.json()) as T;
}

export type RetellLlm = { llm_id: string };
export type RetellAgent = { agent_id: string; agent_name?: string };
export type RetellWebCall = { access_token: string; call_id: string };

/**
 * Step 1 of agent creation: create the "brain".
 * `general_prompt` is the field that carries tone + instructions.
 */
export function createRetellLlm(params: {
  generalPrompt: string;
  beginMessage: string;
  model?: string;
}): Promise<RetellLlm> {
  return call<RetellLlm>("/create-retell-llm", {
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
export function createRetellAgent(params: {
  llmId: string;
  voiceId: string;
  agentName: string;
  language: string;
}): Promise<RetellAgent> {
  return call<RetellAgent>("/create-agent", {
    method: "POST",
    body: {
      response_engine: { type: "retell-llm", llm_id: params.llmId },
      voice_id: params.voiceId,
      agent_name: params.agentName,
      language: params.language,
    },
  });
}

/**
 * Mint a short-lived token that lets a browser join a call with this agent.
 * Only the token goes to the client — never the API key.
 */
export function createWebCall(agentId: string): Promise<RetellWebCall> {
  return call<RetellWebCall>("/v2/create-web-call", {
    method: "POST",
    body: { agent_id: agentId },
  });
}
