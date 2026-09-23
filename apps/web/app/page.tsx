import Link from "next/link";
import type { AgentListResult } from "@agent/shared";
import AgentList from "@/components/agent-list";
import SignOutButton from "@/components/sign-out-button";
import { apiGet } from "@/lib/api-client";
import { getAccessToken } from "@/lib/server-session";

// Middleware guarantees a session cookie is present before this renders.
export const dynamic = "force-dynamic";

/**
 * The dashboard, and the landing page once signed in.
 *
 * Everything an owner needs in one place: what they have built and the link to
 * hand a client for each one.
 */
export default async function Dashboard() {
  const accessToken = await getAccessToken();
  const result = await apiGet<AgentListResult>("/agents", accessToken);

  // Null means the API is unreachable. Say so rather than rendering an empty
  // dashboard, which would read as "you have no agents" and alarm the user.
  const unavailable = result === null;
  const agents = result?.agents ?? [];
  const expiredCount = agents.filter((a) => a.status === "expired").length;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12">
      <header className="mb-8 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Your agents</h1>
          <p className="mt-2 text-[15px] text-[var(--color-muted)]">
            {unavailable
              ? "We could not reach the service just now."
              : agents.length === 0
                ? "You have not built an agent yet."
                : `${agents.length} ${agents.length === 1 ? "agent" : "agents"} built${
                    expiredCount > 0 ? `, ${expiredCount} past their trial` : ""
                  }.`}
          </p>
        </div>
        <SignOutButton />
      </header>

      {unavailable ? (
        <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          Could not load your agents. Check that the API is running, then reload.
        </p>
      ) : (
        <>
          <div className="mb-8">
            <Link
              href="/build"
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-5 py-3 text-sm font-medium text-white transition hover:brightness-110"
            >
              {agents.length === 0 ? "Build your first agent" : "Build another agent"}
              <span aria-hidden>→</span>
            </Link>
          </div>

          <AgentList agents={agents} />
        </>
      )}
    </main>
  );
}
