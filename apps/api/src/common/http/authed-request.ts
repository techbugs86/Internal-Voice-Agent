import type { Request } from "express";
import type { AuthUser } from "@agent/shared";

/** A request that has passed through `AuthGuard`. */
export interface AuthedRequest extends Request {
  user?: AuthUser;
}

/** Reads a bearer token out of the Authorization header. */
export function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * Best-effort client IP.
 *
 * Behind Cloudflare the socket address is Cloudflare's, so the real one has to
 * come from a header. `CF-Connecting-IP` is set by Cloudflare and stripped from
 * anything a client sends, which makes it the one to trust when the app sits
 * behind the proxy. `X-Forwarded-For` is the generic fallback for a plain
 * reverse proxy; its first entry is the original client.
 *
 * Only used to give reCAPTCHA extra signal — nothing is authorised on it, so a
 * spoofed value costs nothing.
 */
export function clientIp(req: Request): string | undefined {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf) return cf;

  const forwarded = req.headers["x-forwarded-for"];
  const first =
    typeof forwarded === "string"
      ? forwarded.split(",")[0]
      : Array.isArray(forwarded)
        ? forwarded[0]
        : undefined;
  if (first?.trim()) return first.trim();

  return req.ip;
}
