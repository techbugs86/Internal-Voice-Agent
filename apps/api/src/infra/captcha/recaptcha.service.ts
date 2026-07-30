import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../common/config/env.schema";

/**
 * Google reCAPTCHA v2 (checkbox) verification.
 *
 * The browser widget produces a single-use token; this exchanges it with Google
 * for a yes/no. A token is only valid for two minutes and cannot be replayed,
 * so there is nothing to cache.
 */

const VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

type SiteVerifyResponse = {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  "error-codes"?: string[];
};

@Injectable()
export class RecaptchaService {
  private readonly logger = new Logger(RecaptchaService.name);
  private readonly secret: string;

  constructor(config: ConfigService<Env, true>) {
    this.secret = config.get("RECAPTCHA_SECRET_KEY", { infer: true });
  }

  /**
   * Returns true only when Google affirmatively says the token is good.
   *
   * Fails closed: a network problem reaching Google is treated as a failed
   * check. The alternative — letting requests through when the captcha is
   * unreachable — turns an outage into an open door on endpoints that spend
   * money.
   */
  async verify(token: string, remoteIp?: string): Promise<boolean> {
    if (!token) return false;

    const form = new URLSearchParams({ secret: this.secret, response: token });
    if (remoteIp) form.set("remoteip", remoteIp);

    try {
      const res = await fetch(VERIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });

      if (!res.ok) {
        this.logger.error(`reCAPTCHA verify returned HTTP ${res.status}`);
        return false;
      }

      const body = (await res.json()) as SiteVerifyResponse;
      if (!body.success) {
        // Codes like `invalid-input-secret` are configuration bugs, not abuse —
        // worth seeing in the logs so they are not mistaken for bot traffic.
        this.logger.warn(
          `reCAPTCHA rejected a token: ${(body["error-codes"] ?? ["no reason given"]).join(", ")}`,
        );
      }
      return body.success === true;
    } catch (err) {
      this.logger.error(
        `Could not reach reCAPTCHA: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }
}
