import { Injectable, Logger } from "@nestjs/common";
import type { AuthResult, AuthSession, AuthUser } from "@agent/shared";
import { SupabaseAuthService } from "../../infra/supabase/supabase-auth.service";

/**
 * Account lifecycle.
 *
 * Thin today — it forwards to the Supabase adapter — but it is the seam that
 * matters: the controller depends on this, not on `SupabaseAuthService`. Any
 * behaviour that is ours rather than the provider's (welcome emails, audit
 * trails, an allowlist, org membership) belongs here, and adding it will not
 * touch the HTTP layer.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly supabase: SupabaseAuthService) {}

  async signUp(email: string, password: string): Promise<AuthResult> {
    const result = await this.supabase.signUp(email, password);
    this.logger.log(
      `Account created for ${email}` +
        (result.emailConfirmationRequired ? " (awaiting email confirmation)" : ""),
    );
    return result;
  }

  signIn(email: string, password: string): Promise<AuthResult> {
    return this.supabase.signIn(email, password);
  }

  refresh(refreshToken: string): Promise<AuthSession> {
    return this.supabase.refresh(refreshToken);
  }

  signOut(accessToken: string): Promise<void> {
    return this.supabase.signOut(accessToken);
  }

  getUser(accessToken: string): Promise<AuthUser | null> {
    return this.supabase.getUser(accessToken);
  }
}
