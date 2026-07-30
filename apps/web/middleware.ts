import { NextResponse, type NextRequest } from "next/server";
import type { AuthSession } from "@agent/shared";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearSession,
  writeSession,
} from "./lib/session";

/**
 * Two jobs: keep the session alive, and decide who may see what.
 *
 * Refreshing happens here rather than in a server component because Next 15
 * does not let a server component set cookies — a token refreshed there would
 * be computed and then discarded. Middleware can write to the response, so this
 * is the only place the rotation can actually stick.
 *
 * The gate below is for user experience, not security. Presence of a cookie is
 * all it checks; the API re-validates the token on every call and is what
 * actually protects anything.
 */

const API_URL = (process.env.API_URL ?? "http://localhost:4100").replace(
  /\/$/,
  "",
);

const AUTH_PAGES = ["/login", "/signup"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The share link is the product: someone a client sent a link to has no
  // account and must never be bounced to a sign-in page. Same for the BFF
  // routes under /api, which do their own auth and must return JSON rather
  // than a redirect.
  if (pathname.startsWith("/a/") || pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  let accessToken = request.cookies.get(ACCESS_COOKIE)?.value ?? null;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value ?? null;

  let refreshed: AuthSession | null = null;
  let refreshFailed = false;

  // The access cookie expires before the refresh cookie, so "no access token
  // but a refresh token" is the ordinary end of a session's first hour.
  if (!accessToken && refreshToken) {
    refreshed = await refreshSession(refreshToken);
    if (refreshed) {
      accessToken = refreshed.accessToken;
      request.cookies.set(ACCESS_COOKIE, refreshed.accessToken);
      request.cookies.set(REFRESH_COOKIE, refreshed.refreshToken);
    } else {
      refreshFailed = true;
    }
  }

  const signedIn = accessToken !== null;
  const onAuthPage = AUTH_PAGES.some((p) => pathname.startsWith(p));

  let response: NextResponse;
  if (onAuthPage && signedIn) {
    response = NextResponse.redirect(new URL("/", request.url));
  } else if (!onAuthPage && !signedIn) {
    const url = new URL("/login", request.url);
    // So the user lands where they were headed once they sign in.
    if (pathname !== "/") url.searchParams.set("next", pathname);
    response = NextResponse.redirect(url);
  } else {
    response = NextResponse.next({ request });
  }

  if (refreshed) writeSession(response.cookies, refreshed);
  // A refresh token the server rejected is dead — drop it, or every single
  // request from this browser pays for a doomed round trip.
  if (refreshFailed) clearSession(response.cookies);

  return response;
}

async function refreshSession(refreshToken: string): Promise<AuthSession | null> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as AuthSession;
  } catch {
    // API unreachable. Treat as signed out rather than 500 the whole page.
    return null;
  }
}

export const config = {
  matcher: [
    // Everything except Next's own assets and static files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
