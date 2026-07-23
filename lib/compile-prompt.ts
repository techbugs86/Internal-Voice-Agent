import Anthropic from "@anthropic-ai/sdk";
import type { AgentSpec } from "./types";

/**
 * Turns the builder form into a Retell `general_prompt`.
 *
 * Two paths:
 *   - With ANTHROPIC_API_KEY, Claude expands the fields into a polished,
 *     production-quality voice-agent prompt.
 *   - Without it, `renderSpec` below produces a perfectly serviceable
 *     structured prompt from the same fields. The app works either way.
 */

const SYSTEM = `You write system prompts for Retell AI voice agents.

You will receive a filled-in intake form describing a business and the phone
agent it wants. Turn it into a production-quality prompt for a real-time voice
agent, using exactly these five sections:

## Identity
Who the agent is: its name, the company it represents, what that company does,
and the one-line purpose of the call.

## Company Facts
The concrete details the agent may be asked about — hours, location, contact
details, services and anything else from the form. Write these as plain
statements the agent can recite. This is the agent's only source of truth about
the business.

## Style Guardrails
How it speaks, based on the tone the user described. Concrete, checkable rules:
sentence length, formality, warmth, filler words, how it handles silence. Voice
agents are heard, not read — no markdown, no bullet lists, no emoji, no symbols
the TTS would mispronounce. Numbers, dates, prices and phone numbers must be
written the way a person says them aloud.

## Response Guidelines
How it runs the conversation: one question at a time, confirm details back to
the caller, stay on topic, what to say when it does not know something, and when
to end or transfer the call.

## Task
The steps of the call, in order, as a numbered flow, ending in the outcome the
user asked for.

Rules:
- Use every detail from the form. Never invent business facts that are not
  there — hours, prices, policies and locations must come from the form only.
- If a field was left blank, do not fabricate content for it. Instead instruct
  the agent what to say when asked about it (for example, to offer to take a
  message or connect the caller to a human).
- Where the user was vague about style, fill in sensible voice-agent defaults.
- Write in second person, addressing the agent directly ("You are...").
- Output only the prompt itself. No preamble, no explanation, no code fences.`;

/** Renders the form as a labelled block for Claude to work from. */
function asIntakeForm(spec: AgentSpec): string {
  const rows: [string, string][] = [
    ["Agent name", spec.agentName],
    ["Company name", spec.companyName],
    ["What the company does", spec.companyDescription],
    ["Business hours", spec.businessHours],
    ["Contact and location", spec.contactDetails],
    ["Services offered", spec.services],
    ["Tone and personality", spec.tone],
    ["Goal of the call", spec.callGoal],
    ["Rules and things to avoid", spec.guardrails],
    ["Language", spec.language],
    ["Opening line", spec.firstLine || "(none — the caller speaks first)"],
  ];
  return rows
    .map(([label, value]) => `${label}: ${value.trim() || "(not provided)"}`)
    .join("\n");
}

/**
 * Deterministic fallback — a structured prompt built straight from the fields,
 * with no model call. Used when ANTHROPIC_API_KEY is unset or Claude errors.
 */
export function renderSpec(spec: AgentSpec): string {
  const s = (v: string) => v.trim();
  const company = s(spec.companyName) || "the company";
  const name = s(spec.agentName) || "the assistant";

  const facts: string[] = [];
  if (s(spec.companyDescription)) facts.push(`About ${company}: ${s(spec.companyDescription)}`);
  if (s(spec.businessHours)) facts.push(`Business hours: ${s(spec.businessHours)}`);
  if (s(spec.contactDetails)) facts.push(`Contact and location: ${s(spec.contactDetails)}`);
  if (s(spec.services)) facts.push(`Services offered: ${s(spec.services)}`);

  return [
    "## Identity",
    `You are ${name}, a voice assistant answering calls for ${company}. You speak with callers over the phone in real time.`,
    "",
    "## Company Facts",
    facts.length
      ? facts.join("\n")
      : `You have not been given specific details about ${company}.`,
    "These facts are your only source of truth about the business. If a caller asks something not covered here, say you are not sure and offer to take a message or pass them to a colleague. Never guess or invent details.",
    "",
    "## Style Guardrails",
    s(spec.tone) || "Sound warm, natural and unhurried.",
    "You are heard, not read. Use short, spoken sentences. Never use markdown, bullet points, emoji, or symbols. Say numbers, prices, dates and phone numbers the way a person says them out loud. Do not sound scripted.",
    "",
    "## Response Guidelines",
    "Ask one question at a time and wait for the answer. Repeat important details back to the caller to confirm you heard them correctly. Keep the conversation on topic. If the caller goes quiet, gently check whether they are still there.",
    s(spec.guardrails) ? `\nRules you must follow:\n${s(spec.guardrails)}` : "",
    "",
    "## Task",
    s(spec.callGoal) ||
      "Understand why the caller is reaching out, answer their questions using the company facts above, and help them with what they need.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function compilePrompt(spec: AgentSpec): Promise<string> {
  const fallback = renderSpec(spec);
  if (!process.env.ANTHROPIC_API_KEY) return fallback;

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Here is the completed intake form:\n\n${asIntakeForm(spec)}`,
        },
      ],
    });

    // content is a union; a thinking block may precede the text block.
    const text = response.content.find((b) => b.type === "text");
    if (!text || !text.text.trim()) return fallback;
    return text.text.trim();
  } catch (err) {
    // A compiler failure must not block agent creation.
    console.error("Prompt compilation failed, using the structured fallback:", err);
    return fallback;
  }
}
