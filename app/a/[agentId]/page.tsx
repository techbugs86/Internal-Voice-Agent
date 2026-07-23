import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAgentView } from "@/lib/agents";
import CallClient from "./call-client";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ agentId: string }>;
}): Promise<Metadata> {
  const { agentId } = await params;
  const agent = await getAgentView(agentId);
  const name = agent?.agentName ?? "your AI agent";
  return {
    title: `Talk with ${name}`,
    description: `Start a live voice conversation with ${name}.`,
  };
}

export default async function AgentPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  const spec = await getAgentView(agentId);
  if (!spec) notFound();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-5 py-16">
      <div className="text-center">
        {spec.companyName && (
          <p className="text-[13px] tracking-[0.12em] text-[var(--color-muted)] uppercase">
            {spec.companyName}
          </p>
        )}
        <h1 className="mt-3 text-[2.1rem] leading-tight font-semibold tracking-tight">
          Engage with your AI agent
        </h1>
        <p className="mt-2 text-[2.1rem] leading-tight font-semibold tracking-tight text-[var(--color-accent)]">
          {spec.agentName}
        </p>
        <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-[var(--color-muted)]">
          Press the button below and {spec.agentName} will pick up. Talk to it
          the way you would talk to someone answering the phone — it listens and
          replies in real time.
        </p>
      </div>

      <div className="mt-10">
        <CallClient agentId={spec.agentId} agentName={spec.agentName} />
      </div>

      <p className="mt-10 text-center text-xs text-[#5c6472]">
        Runs in your browser. Your microphone is only active during the call.
      </p>
    </main>
  );
}
