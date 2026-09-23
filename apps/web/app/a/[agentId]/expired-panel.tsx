import { AGENT_RETENTION_DAYS } from "@agent/shared";

/** Where an expired trial goes for a conversation. */
const CONTACT_EMAIL = "farhan@automaxion.io";

/**
 * What a client sees when they open a share link after the trial has lapsed.
 *
 * This page exists because the alternative is a 404, and a 404 on a link the
 * client was given by us reads as "this company lost my agent" rather than
 * "the trial finished". So it names the agent, says plainly what happened, and
 * gives one obvious way forward.
 *
 * The reassurance is not marketing copy, it is literally true: expiry deletes
 * the agent from Retell but keeps the row, including the spec and the compiled
 * prompt. Reactivating means rebuilding from that record, and because the share
 * id never changes, the link in this person's address bar is the one that
 * starts working again.
 */
export default function ExpiredPanel({
  agentId,
  agentName,
  companyName,
  expiresAt,
}: {
  agentId: string;
  agentName: string;
  companyName: string;
  expiresAt: string | null;
}) {
  const subject = `Reactivate ${agentName}`;
  const body = [
    `Hello,`,
    ``,
    `I would like to bring our AI agent back online.`,
    ``,
    `Agent: ${agentName}`,
    companyName ? `Company: ${companyName}` : "",
    `Reference: ${agentId}`,
  ]
    .filter(Boolean)
    .join("\n");

  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-5 py-16">
      <div className="rounded-2xl border border-[var(--color-edge)] bg-[var(--color-panel)] p-8 text-center">
        {companyName && (
          <p className="text-[13px] tracking-[0.12em] text-[var(--color-muted)] uppercase">
            {companyName}
          </p>
        )}

        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-amber-700/40 bg-amber-950/30 px-3 py-1 text-[12px] font-medium text-amber-300">
          <span aria-hidden>●</span> Trial ended
        </div>

        <h1 className="mt-5 text-[1.9rem] leading-tight font-semibold tracking-tight">
          {agentName} is no longer taking calls
        </h1>

        <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-[var(--color-muted)]">
          This agent was live on a {AGENT_RETENTION_DAYS}-day trial
          {expiresAt ? <>, which ended on {formatDate(expiresAt)}</> : null}.
        </p>

        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-[var(--color-muted)]">
          Everything we built is saved — the voice, the script, and this exact
          link. We can have {agentName} answering again, usually within a day.
        </p>

        <a
          href={mailto}
          className="mt-8 inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-6 py-3 text-sm font-medium text-white transition hover:brightness-110"
        >
          Get {agentName} back online
          <span aria-hidden>→</span>
        </a>

        <p className="mt-5 text-[13px] text-[var(--color-muted)]">
          or email{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-[var(--color-accent)] underline underline-offset-2"
          >
            {CONTACT_EMAIL}
          </a>
        </p>
      </div>

      <p className="mt-8 text-center text-xs text-[#5c6472]">
        Reference {agentId}
      </p>
    </main>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
