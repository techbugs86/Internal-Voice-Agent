import type { Metadata } from "next";
import Link from "next/link";
import Builder from "@/components/builder";

export const metadata: Metadata = { title: "Build an agent · Agent Builder" };

/**
 * The builder form.
 *
 * Middleware guarantees a session before this renders, and there is no
 * per-account allowance left to look up, so the page needs nothing from the
 * API — the form posts to /api/agents on submit and that is the only call.
 */
export default function BuildPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12">
      <header className="mb-8">
        <Link
          href="/"
          className="text-[13px] text-[var(--color-muted)] transition hover:text-[#e8eaed]"
        >
          ← Back to your agents
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          Build an agent
        </h1>
        <p className="mt-2 text-[15px] text-[var(--color-muted)]">
          Fill in the details of your business and how you want the agent to
          sound. We build your personalized AI agent and hand you a link you can
          call.
        </p>
      </header>

      <Builder />
    </main>
  );
}
