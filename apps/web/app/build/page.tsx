import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MAX_AGENTS_PER_USER, type AgentListResult } from "@agent/shared";
import Builder from "@/components/builder";
import { apiGet } from "@/lib/api-client";
import { getAccessToken } from "@/lib/server-session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Build an agent · Agent Builder" };

export default async function BuildPage() {
  const accessToken = await getAccessToken();
  const result = await apiGet<AgentListResult>("/agents", accessToken);

  // Nobody should reach a form they cannot submit. The API rejects the request
  // too — this only saves the user filling it in first.
  if (result && result.remaining <= 0) redirect("/");

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

      <Builder remaining={result?.remaining ?? MAX_AGENTS_PER_USER} />
    </main>
  );
}
