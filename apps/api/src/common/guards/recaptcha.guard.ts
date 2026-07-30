import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from "@nestjs/common";
import { RecaptchaService } from "../../infra/captcha/recaptcha.service";
import { AuthedRequest, clientIp } from "../http/authed-request";

/** The header the browser sends the widget's token in. */
export const RECAPTCHA_HEADER = "x-recaptcha-token";

/**
 * Rejects a request unless it carries a reCAPTCHA token Google vouches for.
 *
 * The token rides in a header rather than the body so request DTOs stay purely
 * about the domain — the captcha is transport-level plumbing, and the schemas
 * in `@agent/shared` are also used by the browser, which has no business
 * knowing about it.
 *
 * Order matters where this is combined with other work: it runs before the
 * handler, so a rejected request never reaches Anthropic or Retell.
 */
@Injectable()
export class RecaptchaGuard implements CanActivate {
  constructor(private readonly recaptcha: RecaptchaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();

    const raw = req.headers[RECAPTCHA_HEADER];
    const token = typeof raw === "string" ? raw : "";
    if (!token) {
      throw new BadRequestException(
        "Complete the “I'm not a robot” check first.",
      );
    }

    const ok = await this.recaptcha.verify(token, clientIp(req));
    if (!ok) {
      throw new BadRequestException(
        "That check did not pass. Tick the box again and retry.",
      );
    }

    return true;
  }
}
