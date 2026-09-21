/**
 * The moment this project switched Retell accounts.
 *
 * Every agent in the registry older than this was created in the company's
 * secondary Retell workspace. Those rows are deliberately kept — nothing is
 * deleted — but RETELL_API_KEY now points at the primary workspace, and Retell
 * workspaces are fully isolated: the primary account does not recognise ids
 * minted by the secondary one and returns 404 for them.
 *
 * Without this cutoff those agents would still look healthy. The dashboard
 * lists straight from the database and the share page resolves from it too, so
 * an old agent would render perfectly and then fail only once the caller
 * pressed the button — with "please try again", which reads as a temporary
 * glitch and invites endless retries. Filtering them out at the two places
 * that offer a call turns that into an honest 404.
 *
 * ---------------------------------------------------------------------------
 * THIS IS A FIXED POINT IN TIME. Never rewrite it as something relative like
 * `Date.now() - ONE_DAY`: a rolling window moves forward every day and would
 * eventually hide agents created *after* the switch as well, until the list
 * empties itself.
 * ---------------------------------------------------------------------------
 *
 * Set it to the moment the key was swapped and the API restarted. It has to sit
 * after the newest agent created under the old key and at or before the first
 * one created under the new key, so check the registry before deploying:
 *
 *     select max(created_at) from agents;
 */
export const RETELL_ACCOUNT_CUTOFF = new Date("2026-09-21T00:00:00Z");

/**
 * True for agents that live in the old Retell workspace and can therefore no
 * longer be called.
 */
export function isLegacyAgent(createdAt: Date | string): boolean {
  const created =
    typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  return created.getTime() < RETELL_ACCOUNT_CUTOFF.getTime();
}
