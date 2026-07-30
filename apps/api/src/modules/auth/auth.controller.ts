import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  credentialsSchema,
  refreshSchema,
  type AuthResult,
  type AuthSession,
  type AuthUser,
  type Credentials,
} from "@agent/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthGuard } from "../../common/guards/auth.guard";
import { RecaptchaGuard } from "../../common/guards/recaptcha.guard";
import { bearerToken, type AuthedRequest } from "../../common/http/authed-request";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { AuthService } from "./auth.service";

/**
 * Sign-in.
 *
 * This goes through our API rather than the browser talking to Supabase Auth
 * directly, and that is the whole reason the captcha is worth anything: if the
 * browser held the Supabase anon key and posted straight to GoTrue, a bot would
 * simply skip us. Routing credentials through here makes this the only door.
 *
 * There is deliberately no sign-up endpoint. Registration is closed — accounts
 * are created by hand in the Supabase dashboard — so the only way to mint one is
 * with the service-role key, which this app never holds.
 */
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  @UseGuards(RecaptchaGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  signIn(
    @Body(new ZodValidationPipe(credentialsSchema)) body: Credentials,
  ): Promise<AuthResult> {
    return this.auth.signIn(body.email, body.password);
  }

  /**
   * Exchanges a refresh token for a fresh access token.
   *
   * No captcha: the caller already holds a credential we issued, and the web
   * app's middleware calls this silently on expiry — a widget the user never
   * sees cannot be ticked.
   */
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  refresh(
    @Body(new ZodValidationPipe(refreshSchema)) body: { refreshToken: string },
  ): Promise<AuthSession> {
    return this.auth.refresh(body.refreshToken);
  }

  /**
   * Revokes the current token.
   *
   * Deliberately not behind `AuthGuard`: signing out with an already-expired
   * token must still succeed, and the client clears its cookies either way.
   */
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async signOut(@Req() req: AuthedRequest): Promise<void> {
    const token = bearerToken(req);
    if (token) await this.auth.signOut(token);
  }

  /** Who am I? Used by the web app to render the header. */
  @Get("me")
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
