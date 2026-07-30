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
 * Sign-up and sign-in.
 *
 * These go through our API rather than the browser talking to Supabase Auth
 * directly, and that is the whole reason the captcha is worth anything: if the
 * browser held the Supabase anon key and posted straight to GoTrue, a bot would
 * simply skip us. Routing credentials through here makes this the only door.
 */
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Open registration — anyone can create an account. */
  @Post("signup")
  @UseGuards(RecaptchaGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  signUp(
    @Body(new ZodValidationPipe(credentialsSchema)) body: Credentials,
  ): Promise<AuthResult> {
    return this.auth.signUp(body.email, body.password);
  }

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
