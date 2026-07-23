/**
 * The two voices we offer.
 *
 * Retell exposes ~300 voices, which is noise in a demo — the client should be
 * choosing a business, not auditioning voice actors. Both options are
 * ElevenLabs American so the two sound like they came from the same product.
 *
 * No secrets here, so this is safe to import from client components.
 */
export const VOICE_OPTIONS = [
  {
    gender: "female",
    label: "Female",
    name: "Mia",
    accent: "American",
    voiceId: "11labs-Mia",
  },
  {
    gender: "male",
    label: "Male",
    name: "Brian",
    accent: "American",
    voiceId: "11labs-Brian",
  },
] as const;

export type VoiceOption = (typeof VOICE_OPTIONS)[number];

export const DEFAULT_VOICE_ID: string = VOICE_OPTIONS[0].voiceId;

export const ALLOWED_VOICE_IDS: readonly string[] = VOICE_OPTIONS.map(
  (v) => v.voiceId,
);

export function isAllowedVoice(voiceId: string): boolean {
  return ALLOWED_VOICE_IDS.includes(voiceId);
}
