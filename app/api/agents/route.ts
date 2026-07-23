import { NextResponse } from "next/server";
import { compilePrompt } from "@/lib/compile-prompt";
import { createRetellAgent, createRetellLlm } from "@/lib/retell";
import { store } from "@/lib/store";
import type { AgentSpec, CreateAgentResult } from "@/lib/types";
import { DEFAULT_VOICE_ID, isAllowedVoice } from "@/lib/voices";

export const runtime = "nodejs";

function baseUrl(req: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  // Fall back to the request's own origin so the link is still correct on a
  // preview deployment where NEXT_PUBLIC_APP_URL was never set.
  return new URL(req.url).origin;
}

/** Fills in defaults so a partially-completed form still produces an agent. */
function normalise(input: Partial<AgentSpec>): AgentSpec {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return {
    agentName: str(input.agentName),
    firstLine: typeof input.firstLine === "string" ? input.firstLine : "",
    companyName: str(input.companyName),
    companyDescription: str(input.companyDescription),
    businessHours: str(input.businessHours),
    contactDetails: str(input.contactDetails),
    services: str(input.services),
    tone: str(input.tone),
    callGoal: str(input.callGoal),
    guardrails: str(input.guardrails),
    voiceId: str(input.voiceId) || DEFAULT_VOICE_ID,
    language: str(input.language) || "en-US",
  };
}

export async function POST(req: Request) {
  let body: Partial<AgentSpec>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const spec = normalise(body);

  // The agent needs a name, something to talk about, and a voice. Everything
  // else the prompt compiler can work around.
  //
  // The name is not cosmetic: it becomes the agent's persona in the prompt
  // ("You are Sofia...") and the headline on the talk page, so we refuse to
  // invent one.
  if (!spec.agentName) {
    return NextResponse.json(
      { error: "Give the agent a name — it introduces itself with it on the call." },
      { status: 400 },
    );
  }
  if (!spec.companyName) {
    return NextResponse.json({ error: "Enter the company name." }, { status: 400 });
  }
  if (!spec.companyDescription && !spec.services) {
    return NextResponse.json(
      { error: "Describe what the company does, or list the services it offers." },
      { status: 400 },
    );
  }
  // Only the two curated voices are permitted — the picker offers nothing
  // else, so anything different means a hand-crafted request.
  if (!isAllowedVoice(spec.voiceId)) {
    return NextResponse.json(
      { error: "Choose either the female or the male voice." },
      { status: 400 },
    );
  }

  try {
    // 1. Expand the intake form into a structured Retell prompt.
    const compiledPrompt = await compilePrompt(spec);

    // 2. The brain.
    const llm = await createRetellLlm({
      generalPrompt: compiledPrompt,
      beginMessage: spec.firstLine,
    });

    // 3. The agent that gives the brain a voice.
    const agent = await createRetellAgent({
      llmId: llm.llm_id,
      voiceId: spec.voiceId,
      agentName: spec.agentName,
      language: spec.language,
    });

    // 4. Remember it, so /a/<agentId> can show the company name.
    //
    // Best-effort on purpose: the agent already exists in Retell by this point,
    // and the share page falls back to Retell when the registry is missing. A
    // read-only filesystem (the default on Vercel with no database configured)
    // must not turn a successful creation into an error the user sees.
    try {
      await store.save({
        agentId: agent.agent_id,
        llmId: llm.llm_id,
        spec,
        compiledPrompt,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(
        "Agent created but could not be saved to the registry. " +
          "Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to persist agent details.",
        err,
      );
    }

    const result: CreateAgentResult = {
      agentId: agent.agent_id,
      agentName: spec.agentName,
      url: `${baseUrl(req)}/a/${agent.agent_id}`,
    };
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("Agent creation failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Agent creation failed." },
      { status: 502 },
    );
  }
}

export async function GET() {
  try {
    return NextResponse.json(await store.list());
  } catch (err) {
    console.error("Listing agents failed:", err);
    return NextResponse.json({ error: "Could not list agents." }, { status: 500 });
  }
}
