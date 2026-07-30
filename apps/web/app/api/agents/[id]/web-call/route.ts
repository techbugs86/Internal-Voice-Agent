import { NextResponse } from "next/server";
import { callApi, errorMessage } from "@/lib/api-client";

export const runtime = "nodejs";

/**
 * PUBLIC. Starts a live call with an agent.
 *
 * No session is attached, on purpose: whoever was sent the share link has no
 * account, and requiring one here would break the only thing that page does.
 * Abuse is handled at the API (per-IP rate limit) and at the edge.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const { status, body } = await callApi(
    `/agents/${encodeURIComponent(id)}/web-call`,
    { method: "POST" },
  );

  if (status < 200 || status >= 300) {
    return NextResponse.json(
      { error: errorMessage(body, "Could not start the call.") },
      { status },
    );
  }
  return NextResponse.json(body);
}
