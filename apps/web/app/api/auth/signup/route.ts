import { NextResponse } from "next/server";
import type { AuthResult } from "@agent/shared";
import { callApi, errorMessage } from "@/lib/api-client";
import { writeSession } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Sign-up, proxied to the API so the tokens can land in httpOnly cookies.
 *
 * The response deliberately carries no tokens — the browser gets only whether
 * it worked and whether a confirmation email is waiting.
 */
export async function POST(req: Request) {
  let payload: { email?: string; password?: string; captchaToken?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const { status, body } = await callApi("/auth/signup", {
    method: "POST",
    body: { email: payload.email, password: payload.password },
    captchaToken: payload.captchaToken,
  });

  if (status < 200 || status >= 300) {
    return NextResponse.json(
      { error: errorMessage(body, "Could not create your account.") },
      { status },
    );
  }

  const result = body as AuthResult;
  const res = NextResponse.json({
    emailConfirmationRequired: result.emailConfirmationRequired,
  });

  // Null when the project requires email confirmation — the account exists but
  // is not usable yet, so there is no session to store.
  if (result.session) writeSession(res.cookies, result.session);

  return res;
}
