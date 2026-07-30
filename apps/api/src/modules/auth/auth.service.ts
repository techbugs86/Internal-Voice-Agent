import { Injectable } from "@nestjs/common";
import type { AuthResult, AuthSession, AuthUser } from "@agent/shared";
import { SupabaseAuthService } from "../../infra/supabase/supabase-auth.service";

/**
 * Account lifecycle.
 *
 * Thin today — it forwards to the Supabase adapter — but it is the seam that
 * matters: the controller depends on this, not on `SupabaseAuthService`. Any
 * behaviour that is ours rather than the provider's (audit trails, an
 * allowlist, org membership) belongs here, and adding it will not touch the
 * HTTP layer.
 *
 * There is no sign-up: accounts are created by hand in the Supabase dashboard.
 */
@Injectable()
export class AuthService {
  constructor(private readonly supabase: SupabaseAuthService) {}

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
