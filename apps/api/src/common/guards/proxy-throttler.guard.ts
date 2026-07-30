import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { Request } from "express";
import { clientIp } from "../http/authed-request";

/**
 * Rate limiting keyed on the real client IP rather than the socket address.
 *
 * This matters the moment the app sits behind Cloudflare or any reverse proxy:
 * the default tracker sees the proxy's address, so every visitor in the world
 * shares one bucket and the first few requests per minute lock out everyone
 * else. Reading the forwarded header restores per-visitor limits.
 */
@Injectable()
export class ProxyThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    return clientIp(req as unknown as Request) ?? "unknown";
  }
}
