"use client";

import { useState } from "react";
import type { AgentSpec, CreateAgentResult } from "@/lib/types";
import { DEFAULT_VOICE_ID, VOICE_OPTIONS } from "@/lib/voices";

const LANGUAGES = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "en-IN", label: "English (India)" },
  { value: "es-ES", label: "Spanish" },
  { value: "fr-FR", label: "French" },
  { value: "de-DE", label: "German" },
  { value: "hi-IN", label: "Hindi" },
  { value: "multi", label: "Multilingual" },
];

const EMPTY: AgentSpec = {
  agentName: "",
  firstLine: "Hi, thanks for calling — how can I help?",
  companyName: "",
  companyDescription: "",
  businessHours: "",
  contactDetails: "",
  services: "",
  tone: "",
  callGoal: "",
  guardrails: "",
  voiceId: DEFAULT_VOICE_ID,
  language: "en-US",
};

export default function Builder() {
  const [spec, setSpec] = useState<AgentSpec>(EMPTY);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateAgentResult | null>(null);
  const [copied, setCopied] = useState(false);

  function set<K extends keyof AgentSpec>(key: K, value: AgentSpec[K]) {
    setSpec((s) => ({ ...s, [key]: value }));
    // Any edit invalidates the agent we just built — force a rebuild.
    if (result) setResult(null);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setResult(null);
    setCopied(false);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(spec),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
      setResult(body as CreateAgentResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function copyUrl() {
    if (!result) return;
    await navigator.clipboard.writeText(result.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  const ready =
    !!spec.agentName.trim() &&
    !!spec.companyName.trim() &&
    (!!spec.companyDescription.trim() || !!spec.services.trim()) &&
    !!spec.voiceId;

  return (
    <div className="flex flex-col gap-5">
      {/* 1 — the agent itself */}
      <Panel
        step={1}
        title="Agent"
        hint="Who is picking up the phone, and how the call opens."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Agent name"
            hint="what it calls itself on the call"
            required
          >
            <input
              value={spec.agentName}
              onChange={(e) => set("agentName", e.target.value)}
              placeholder="Sofia"
              className={inputClass}
            />
          </Field>
          <Field label="Language">
            <select
              value={spec.language}
              onChange={(e) => set("language", e.target.value)}
              className={inputClass}
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field
              label="First line"
              hint="leave empty to let the caller speak first"
            >
              <input
                value={spec.firstLine}
                onChange={(e) => set("firstLine", e.target.value)}
                placeholder="Hi, thanks for calling Bright Smile Dental — how can I help?"
                className={inputClass}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Voice">
              <div className="grid grid-cols-2 gap-3">
                {VOICE_OPTIONS.map((v) => {
                  const selected = spec.voiceId === v.voiceId;
                  return (
                    <button
                      key={v.voiceId}
                      type="button"
                      onClick={() => set("voiceId", v.voiceId)}
                      aria-pressed={selected}
                      className={`rounded-lg border px-4 py-3 text-left transition ${
                        selected
                          ? "border-[var(--color-accent)] bg-[#16203a]"
                          : "border-[var(--color-edge)] bg-[#0f1216] hover:border-[var(--color-muted)]"
                      }`}
                    >
                      <span className="block text-sm font-medium">
                        {v.label}
                      </span>
                      <span className="mt-0.5 block text-[13px] text-[var(--color-muted)]">
                        {v.name} · {v.accent}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
        </div>
      </Panel>

      {/* 2 — the business */}
      <Panel
        step={2}
        title="Company"
        hint="Everything the agent is allowed to state as fact. It will not invent anything beyond this."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Company name" required>
              <input
                value={spec.companyName}
                onChange={(e) => set("companyName", e.target.value)}
                placeholder="Bright Smile Dental"
                className={inputClass}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="What the company does" required>
              <textarea
                value={spec.companyDescription}
                onChange={(e) => set("companyDescription", e.target.value)}
                rows={3}
                placeholder="A family dental practice in Austin. Two dentists and a hygienist. We take most major insurance and offer payment plans."
                className={`${inputClass} resize-y`}
              />
            </Field>
          </div>
          <Field label="Business hours">
            <textarea
              value={spec.businessHours}
              onChange={(e) => set("businessHours", e.target.value)}
              rows={3}
              placeholder="Monday to Friday, 9am to 5pm Central. Closed weekends and public holidays."
              className={`${inputClass} resize-y`}
            />
          </Field>
          <Field label="Contact and location">
            <textarea
              value={spec.contactDetails}
              onChange={(e) => set("contactDetails", e.target.value)}
              rows={3}
              placeholder="1200 South Lamar, Austin TX. Front desk: 512-555-0182. brightsmile.com"
              className={`${inputClass} resize-y`}
            />
          </Field>
        </div>
      </Panel>

      {/* 3 — how it talks and what it's for */}
      <Panel
        step={3}
        title="Conversation"
        hint="What the agent can talk about, how it sounds, and what it is trying to achieve."
      >
        <div className="grid gap-4">
          <Field label="Services offered" required>
            <textarea
              value={spec.services}
              onChange={(e) => set("services", e.target.value)}
              rows={3}
              placeholder="Cleanings and check-ups, fillings, crowns, teeth whitening, emergency same-day appointments."
              className={`${inputClass} resize-y`}
            />
          </Field>
          <Field label="Tone and personality">
            <textarea
              value={spec.tone}
              onChange={(e) => set("tone", e.target.value)}
              rows={3}
              placeholder="Warm and unhurried, like someone who genuinely has time for the caller. Short sentences. Never sounds scripted or salesy."
              className={`${inputClass} resize-y`}
            />
          </Field>
          <Field label="Goal of the call">
            <textarea
              value={spec.callGoal}
              onChange={(e) => set("callGoal", e.target.value)}
              rows={3}
              placeholder="Book an appointment. Get their name, the reason for the visit, and a day that works, then confirm it back to them."
              className={`${inputClass} resize-y`}
            />
          </Field>
          <Field label="Rules and things to avoid">
            <textarea
              value={spec.guardrails}
              onChange={(e) => set("guardrails", e.target.value)}
              rows={3}
              placeholder="Never give medical or dental advice. If it sounds like an emergency, tell them to hang up and call 911. Never quote a price without saying it depends on insurance."
              className={`${inputClass} resize-y`}
            />
          </Field>
        </div>
      </Panel>

      {/* 4 — build, then talk to it */}
      <Panel step={4} title={result ? "Your agent is live" : "Build"}>
        {!result ? (
          <>
            <button
              onClick={submit}
              disabled={busy || !ready}
              className="rounded-lg bg-[var(--color-accent)] px-5 py-3 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Building your agent…" : "Generate agent"}
            </button>
            {!ready && !busy && (
              <p className="mt-3 text-[13px] text-[var(--color-muted)]">
                Fill in the agent name, the company name, and what it does or
                the services it offers.
              </p>
            )}
          </>
        ) : (
          <>
            <a
              href={result.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-medium text-white transition hover:brightness-110"
            >
              🎙 Talk with your agent
              <span aria-hidden>→</span>
            </a>

            <div className="mt-5 rounded-lg border border-[var(--color-edge)] bg-[#0f1216] p-4">
              <p className="text-[13px] text-[var(--color-muted)]">
                Share this link — it opens a live call with {result.agentName}.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate rounded-md bg-[#0a0c0f] px-3 py-2.5 font-mono text-[13px] text-[var(--color-accent)]">
                  {result.url}
                </span>
                <button
                  onClick={copyUrl}
                  className="rounded-md border border-[var(--color-edge)] px-3 py-2.5 text-sm hover:border-[var(--color-muted)]"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-3 font-mono text-xs text-[#5c6472]">
                agent_id: {result.agentId}
              </p>
            </div>
          </>
        )}

        {error && (
          <p className="mt-4 rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}
      </Panel>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-[var(--color-edge)] bg-[#0f1216] px-3.5 py-2.5 text-sm leading-relaxed outline-none placeholder:text-[#4c5462] focus:border-[var(--color-accent)]";

function Panel({
  step,
  title,
  hint,
  children,
}: {
  step: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--color-edge)] bg-[var(--color-panel)] p-5">
      <div className="mb-4 flex gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#232830] text-xs font-semibold text-[var(--color-muted)]">
          {step}
        </span>
        <div>
          <h2 className="text-sm font-semibold tracking-wide uppercase">
            {title}
          </h2>
          {hint && (
            <p className="mt-1 text-[13px] text-[var(--color-muted)]">{hint}</p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] text-[var(--color-muted)]">
        {label}
        {required && <span className="ml-1 text-[var(--color-accent)]">*</span>}
        {hint && <span className="ml-1.5 text-[#5c6472]">— {hint}</span>}
      </span>
      {children}
    </label>
  );
}
