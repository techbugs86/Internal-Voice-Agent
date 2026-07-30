import { NextResponse } from "next/server";
import { callApi, errorMessage } from "@/lib/api-client";
import { getAccessToken } from "@/lib/server-session";

export const runtime = "nodejs";

/**
 * Proxies agent creation, attaching the session from the httpOnly cookie.
 *
 * The captcha token rides in a header the browser sets; it is forwarded rather
 * than checked here — the backend guard is the one that talks to Google, so
 * this route has nothing to verify and no secret to do it with.
 */
export async function POST(req: Request) {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  }

  let spec: unknown;
  try {
    spec = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const { status, body } = await callApi("/agents", {
    method: "POST",
    body: spec,
    accessToken,
    captchaToken: req.headers.get("x-recaptcha-token"),
  });

  if (status < 200 || status >= 300) {
    return NextResponse.json(
      { error: errorMessage(body, "Could not build the agent.") },
      { status },
    );
  }
  return NextResponse.json(body, { status });
}

/** The signed-in user's own agents. */
export async function GET() {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  }

  const { status, body } = await callApi("/agents", { accessToken });
  if (status < 200 || status >= 300) {
    return NextResponse.json(
      { error: errorMessage(body, "Could not load your agents.") },
      { status },
    );
  }
  return NextResponse.json(body);
}
