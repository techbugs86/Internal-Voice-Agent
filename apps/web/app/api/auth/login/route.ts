import { NextResponse } from "next/server";
import type { AuthResult } from "@agent/shared";
import { callApi, errorMessage } from "@/lib/api-client";
import { writeSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let payload: { email?: string; password?: string; captchaToken?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const { status, body } = await callApi("/auth/login", {
    method: "POST",
    body: { email: payload.email, password: payload.password },
    captchaToken: payload.captchaToken,
  });

  if (status < 200 || status >= 300) {
    return NextResponse.json(
      { error: errorMessage(body, "Could not sign you in.") },
      { status },
    );
  }

  const result = body as AuthResult;
  const res = NextResponse.json({ ok: true });
  if (result.session) writeSession(res.cookies, result.session);
  return res;
}
