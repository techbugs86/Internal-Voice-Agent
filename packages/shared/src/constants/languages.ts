/** Languages the builder offers. Retell supports more; these are the curated set. */
export const LANGUAGE_OPTIONS = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "en-IN", label: "English (India)" },
  { value: "es-ES", label: "Spanish" },
  { value: "fr-FR", label: "French" },
  { value: "de-DE", label: "German" },
  { value: "hi-IN", label: "Hindi" },
  { value: "multi", label: "Multilingual" },
] as const;

export const DEFAULT_LANGUAGE = "en-US";
