import { NextResponse } from "next/server";
import { callApi } from "@/lib/api-client";
import { getAccessToken } from "@/lib/server-session";
import { clearSession } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Signs out.
 *
 * The cookies are cleared whatever the API says — if revocation fails (an
 * already-expired token, the API being down), the user still expects to be
 * signed out of this browser, and leaving the cookies in place would look
 * broken.
 */
export async function POST() {
  const accessToken = await getAccessToken();
  if (accessToken) {
    await callApi("/auth/logout", { method: "POST", accessToken });
  }

  const res = NextResponse.json({ ok: true });
  clearSession(res.cookies);
  return res;
}
