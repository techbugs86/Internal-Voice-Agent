import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AuthResult, AuthSession, AuthUser } from "@agent/shared";
import type { Env } from "../../common/config/env.schema";

/**
 * Supabase Auth, over its REST API.
 *
 * Deliberately not the supabase-js SDK: we need exactly four calls, all
 * stateless, and the SDK's session-persistence machinery is built for a browser
 * that owns one user — not a server handling many. Raw fetch keeps this module
 * a thin, obvious adapter.
 *
 * No sign-up call: registration is closed, and accounts are created by hand in
 * the Supabase dashboard.
 *
 * Nothing above this file knows Supabase exists. Swapping in another identity
 * provider means rewriting this one class.
 */

type GoTrueUser = {
  id: string;
  email?: string;
};

type GoTrueSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: GoTrueUser;
};

/** Validated-token cache. See `getUser` for why this exists. */
type CacheEntry = { user: AuthUser; expiresAt: number };

const USER_CACHE_TTL_MS = 60_000;
const USER_CACHE_MAX = 1_000;

@Injectable()
export class SupabaseAuthService {
  private readonly logger = new Logger(SupabaseAuthService.name);
  private readonly baseUrl: string;
  private readonly anonKey: string;
  private readonly userCache = new Map<string, CacheEntry>();

  constructor(config: ConfigService<Env, true>) {
    this.baseUrl = config.get("SUPABASE_URL", { infer: true }).replace(/\/$/, "");
    this.anonKey = config.get("SUPABASE_ANON_KEY", { infer: true });
  }

  /* ------------------------------------------------------------- public API */

  async signIn(email: string, password: string): Promise<AuthResult> {
    const body = await this.call<GoTrueSession>(
      "/auth/v1/token?grant_type=password",
      { method: "POST", body: { email, password } },
    );
    return { user: toUser(body.user), session: toSession(body) };
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const body = await this.call<GoTrueSession>(
      "/auth/v1/token?grant_type=refresh_token",
      { method: "POST", body: { refresh_token: refreshToken } },
    );
    return toSession(body);
  }

  async signOut(accessToken: string): Promise<void> {
    this.userCache.delete(accessToken);
    try {
      await this.call("/auth/v1/logout", { method: "POST", accessToken });
    } catch (err) {
      // An already-expired token cannot be revoked, and the caller is signing
      // out either way — the cookies are cleared regardless.
      this.logger.warn(`Sign-out call failed (ignored): ${describe(err)}`);
    }
  }

  /**
   * Resolves an access token to a user, or null if it is invalid or expired.
   *
   * Asking Supabase on every request is one extra network hop, but it is
   * correct regardless of which signing algorithm the project uses and needs no
   * extra secret. The short cache keeps a burst of requests from one signed-in
   * user down to a single round trip; if this ever becomes hot, verify the JWT
   * locally against the project's JWKS instead.
   */
  async getUser(accessToken: string): Promise<AuthUser | null> {
    const cached = this.userCache.get(accessToken);
    if (cached && cached.expiresAt > Date.now()) return cached.user;
    if (cached) this.userCache.delete(accessToken);

    let raw: GoTrueUser;
    try {
      raw = await this.call<GoTrueUser>("/auth/v1/user", {
        method: "GET",
        accessToken,
      });
    } catch (err) {
      if (err instanceof UnauthorizedException) return null;
      throw err;
    }

    if (!raw?.id) return null;
    const user = toUser(raw);

    // Bounded, so a stream of expired tokens cannot grow this without limit.
    if (this.userCache.size >= USER_CACHE_MAX) this.userCache.clear();
    this.userCache.set(accessToken, {
      user,
      expiresAt: Date.now() + USER_CACHE_TTL_MS,
    });
    return user;
  }

  /* ---------------------------------------------------------------- transport */

  private async call<T>(
    path: string,
    init: { method: "GET" | "POST"; body?: unknown; accessToken?: string },
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: init.method,
        headers: {
          apikey: this.anonKey,
          Authorization: `Bearer ${init.accessToken ?? this.anonKey}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
      });
    } catch (err) {
      this.logger.error(`Cannot reach Supabase Auth: ${describe(err)}`);
      throw new ServiceUnavailableException(
        "The sign-in service is unreachable. Please try again shortly.",
      );
    }

    if (res.status === 204) return undefined as T;

    const text = await res.text();
    const parsed = safeJson(text);

    if (!res.ok) throw this.toHttpError(res.status, parsed, text);
    return parsed as T;
  }

  /**
   * Supabase speaks in HTTP codes plus a message; the browser needs a sentence.
   * Anything unrecognised is logged and reported generically so provider
   * internals never reach the client.
   */
  private toHttpError(status: number, parsed: unknown, raw: string): Error {
    const detail = messageOf(parsed) || raw;

    if (status === 401 || status === 403) {
      return new UnauthorizedException("That email or password is not right.");
    }
    if (status === 400) {
      // GoTrue reports bad password grants as 400 rather than 401.
      if (/invalid login|invalid credentials|grant/i.test(detail)) {
        return new UnauthorizedException("That email or password is not right.");
      }
      if (/not confirmed/i.test(detail)) {
        return new UnauthorizedException(
          "Confirm your email address before signing in — check your inbox.",
        );
      }
      return new BadRequestException(detail || "That request was not valid.");
    }
    if (status === 422) {
      return new BadRequestException(detail || "That request was not valid.");
    }
    if (status === 429) {
      return new BadRequestException(
        "Too many attempts. Wait a minute and try again.",
      );
    }

    this.logger.error(`Supabase Auth returned ${status}: ${raw}`);
    return new ServiceUnavailableException(
      "The sign-in service is having trouble. Please try again shortly.",
    );
  }
}

/* -------------------------------------------------------------------- helpers */

function toUser(user: GoTrueUser): AuthUser {
  return { id: user.id, email: user.email ?? "" };
}

function toSession(s: GoTrueSession): AuthSession {
  return {
    accessToken: s.access_token,
    refreshToken: s.refresh_token,
    expiresIn: s.expires_in,
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** GoTrue has used several error shapes over its life. Accept all of them. */
function messageOf(parsed: unknown): string {
  if (!parsed || typeof parsed !== "object") return "";
  const o = parsed as Record<string, unknown>;
  for (const key of ["error_description", "msg", "message", "error"]) {
    if (typeof o[key] === "string" && o[key]) return o[key] as string;
  }
  return "";
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
