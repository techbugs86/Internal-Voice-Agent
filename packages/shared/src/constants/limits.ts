/**
 * Product limits.
 *
 * Shared so the browser and the API cannot disagree: the UI uses these to
 * disable buttons and show counters, the API uses them as the actual gate.
 *
 * There is no cap on agents per account — a user may create as many as they
 * like. Creation is still gated by sign-in, reCAPTCHA, and a per-IP rate limit.
 */

/**
 * Hard ceiling on a single voice call.
 *
 * Enforced in two places on purpose. Retell is told to end the call itself, so
 * the cap holds even if the browser tab is left open or the page is tampered
 * with; the browser also runs its own countdown so the caller sees time
 * remaining and the call ends cleanly rather than being cut mid-sentence.
 */
export const MAX_CALL_DURATION_MS = 3 * 60 * 1000;

/**
 * How long an agent stays callable after it is built.
 *
 * Agents are a 30-day trial. Past this the agent is deleted from Retell, which
 * is where the cost lives, but the row is deliberately kept: it holds the spec
 * and the compiled prompt, so the same agent can be rebuilt on the same share
 * link whenever the client asks. Expiry is a pause, not a deletion.
 */
export const AGENT_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The moment an agent built at `createdAt` stops accepting calls. */
export function agentExpiresAt(createdAt: string | Date): Date {
  const created =
    typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  return new Date(created.getTime() + AGENT_RETENTION_DAYS * DAY_MS);
}

/**
 * Whether an agent has passed its trial window.
 *
 * Derived from `createdAt` alone rather than from whether the cleanup job has
 * run. The two are separate on purpose: expiry is exact to the second, while
 * removing the agent from Retell is housekeeping that is allowed to lag behind
 * by up to a day. Reading expiry off the cleanup would leave a live Call button
 * on an agent whose trial ended overnight.
 */
export function isAgentExpired(
  createdAt: string | Date,
  now: Date = new Date(),
): boolean {
  return agentExpiresAt(createdAt).getTime() <= now.getTime();
}
