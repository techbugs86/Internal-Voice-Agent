import { cookies } from "next/headers";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "./session";

/**
 * Reading the session from a server component or route handler.
 *
 * Split out from session.ts because `next/headers` is not available in
 * middleware's Edge runtime, and importing it there breaks the build.
 *
 * There is deliberately no refresh-on-read here: server components cannot set
 * cookies in Next 15, so a refreshed token would be thrown away. Refreshing is
 * middleware's job — see middleware.ts.
 */

export async function getAccessToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(ACCESS_COOKIE)?.value ?? null;
}

export async function getRefreshToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(REFRESH_COOKIE)?.value ?? null;
}

/**
 * Presence check, not a validity check.
 *
 * Good enough to decide what to render; the API is what actually enforces
 * access, and it re-checks the token on every call.
 */
export async function isSignedIn(): Promise<boolean> {
  return (await getAccessToken()) !== null;
}
