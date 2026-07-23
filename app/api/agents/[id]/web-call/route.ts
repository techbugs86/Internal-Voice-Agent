import { NextResponse } from "next/server";
import { createWebCall } from "@/lib/retell";
import { store } from "@/lib/store";

export const runtime = "nodejs";

/**
 * Mints a Retell web-call access token for an agent we created.
 *
 * The browser gets only the token — the API key stays here. We look the agent
 * up first so this can't be used to mint tokens for arbitrary agent ids.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const agent = await store.get(id);
    if (!agent) {
      return NextResponse.json({ error: "Unknown agent." }, { status: 404 });
    }

    const call = await createWebCall(agent.agentId);
    return NextResponse.json({
      accessToken: call.access_token,
      callId: call.call_id,
    });
  } catch (err) {
    console.error("Web call creation failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not start the call." },
      { status: 502 },
    );
  }
}
