export type AuthUser = {
  id: string;
  email: string;
};

/**
 * The token pair the API hands back after a successful sign-in.
 *
 * The browser never sees this directly — the web app's BFF routes store it in
 * httpOnly cookies. See apps/web/lib/session.ts.
 */
export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  /** Seconds until `accessToken` expires. */
  expiresIn: number;
};

export type AuthResult = {
  user: AuthUser;
  /**
   * Null when the project requires email confirmation — the account exists but
   * cannot be used until the user clicks the link in their inbox.
   */
  session: AuthSession | null;
  /** True when `session` is null because confirmation is pending. */
  emailConfirmationRequired: boolean;
};
