import type { AuthSession } from "@agent/shared";

/**
 * Session cookies.
 *
 * The tokens live in httpOnly cookies on this app's own origin, so no script in
 * the page can read them — that closes the usual XSS token-theft path, and it
 * is why the browser talks to `/api/*` here instead of calling the backend
 * directly.
 *
 * This module is imported by middleware (Edge runtime) as well as route
 * handlers, so it must stay free of Node-only imports. Anything needing
 * `next/headers` belongs in server-session.ts.
 */

export const ACCESS_COOKIE = "sb-access-token";
export const REFRESH_COOKIE = "sb-refresh-token";

/** Refresh tokens outlive access tokens by a long way — this is the ceiling. */
const REFRESH_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** The slice of `NextResponse["cookies"]` we actually use. */
export type CookieJar = {
  set(
    name: string,
    value: string,
    options?: {
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: "lax" | "strict" | "none";
      path?: string;
      maxAge?: number;
    },
  ): unknown;
  delete(name: string): unknown;
};

function baseOptions() {
  return {
    httpOnly: true,
    // Lax, not Strict: the email-confirmation link is a top-level navigation
    // from another origin, and Strict would drop the cookie on arrival.
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

export function writeSession(jar: CookieJar, session: AuthSession): void {
  jar.set(ACCESS_COOKIE, session.accessToken, {
    ...baseOptions(),
    // Expire the cookie a minute early so a request never leaves with a token
    // that dies in flight.
    maxAge: Math.max(session.expiresIn - 60, 60),
  });
  jar.set(REFRESH_COOKIE, session.refreshToken, {
    ...baseOptions(),
    maxAge: REFRESH_MAX_AGE_SECONDS,
  });
}

export function clearSession(jar: CookieJar): void {
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}
