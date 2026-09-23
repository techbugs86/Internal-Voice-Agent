"use client";

import { useState } from "react";
import type { AgentSummary } from "@agent/shared";

/**
 * The dashboard list.
 *
 * Each row carries the two things an owner actually does with an agent: open it
 * to hear it, or copy the link to send someone. The link is shown in full
 * rather than hidden behind the copy button, because people want to see what
 * they are about to paste into an email.
 */
export default function AgentList({ agents }: { agents: AgentSummary[] }) {
  if (agents.length === 0) return null;

  return (
    <section>
      <h2 className="mb-4 text-sm font-semibold tracking-wide uppercase">
        Built agents
      </h2>
      <ul className="flex flex-col gap-3">
        {agents.map((agent) => (
          <AgentRow key={agent.agentId} agent={agent} />
        ))}
      </ul>
    </section>
  );
}

function AgentRow({ agent }: { agent: AgentSummary }) {
  const [copied, setCopied] = useState(false);
  const expired = agent.status === "expired";

  async function copy() {
    try {
      await navigator.clipboard.writeText(agent.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be refused (insecure origin, denied permission).
      // The link is on screen, so the user can still select it by hand.
    }
  }

  return (
    <li className="rounded-xl border border-[var(--color-edge)] bg-[var(--color-panel)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[15px] font-medium">
            <span className="truncate">{agent.agentName}</span>
            {expired && (
              <span className="shrink-0 rounded-full border border-amber-700/40 bg-amber-950/30 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                Trial ended
              </span>
            )}
          </p>
          <p className="mt-0.5 truncate text-[13px] text-[var(--color-muted)]">
            {agent.companyName || "—"} · built {formatDate(agent.createdAt)} ·{" "}
            {expired
              ? `ended ${formatDate(agent.expiresAt)}`
              : remaining(agent.expiresAt)}
          </p>
        </div>
        {expired ? (
          // Deliberately not a link. The share page still works and explains
          // itself, but offering the owner a "Talk with" button for an agent
          // that cannot answer is the confusion this badge exists to prevent.
          <span className="shrink-0 rounded-lg border border-[var(--color-edge)] px-4 py-2.5 text-sm text-[var(--color-muted)]">
            Not taking calls
          </span>
        ) : (
          <a
            href={agent.url}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:brightness-110"
          >
            🎙 Talk with {agent.agentName}
          </a>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate rounded-md bg-[#0a0c0f] px-3 py-2 font-mono text-[13px] text-[var(--color-accent)]">
          {agent.url}
        </span>
        <button
          onClick={copy}
          className="rounded-md border border-[var(--color-edge)] px-3 py-2 text-sm hover:border-[var(--color-muted)]"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </li>
  );
}

/** "expires in 6 days" while it matters, and nothing while it does not. */
function remaining(expiresAt: string): string {
  const days = Math.ceil(
    (new Date(expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
  );
  if (!Number.isFinite(days)) return "";
  if (days <= 1) return "expires today";
  return `expires in ${days} days`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
