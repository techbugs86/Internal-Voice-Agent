/**
 * Product limits.
 *
 * Shared so the browser and the API cannot disagree: the UI uses these to
 * disable buttons and show counters, the API uses them as the actual gate.
 */

/** Agents one account may create. */
export const MAX_AGENTS_PER_USER = 3;

/**
 * Hard ceiling on a single voice call.
 *
 * Enforced in two places on purpose. Retell is told to end the call itself, so
 * the cap holds even if the browser tab is left open or the page is tampered
 * with; the browser also runs its own countdown so the caller sees time
 * remaining and the call ends cleanly rather than being cut mid-sentence.
 */
export const MAX_CALL_DURATION_MS = 3 * 60 * 1000;
