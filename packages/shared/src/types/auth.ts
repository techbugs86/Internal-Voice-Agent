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

/**
 * What a successful sign-in produces. There is no partial case: registration is
 * closed, so an account is either usable or the sign-in failed outright.
 */
export type AuthResult = {
  user: AuthUser;
  session: AuthSession;
};
