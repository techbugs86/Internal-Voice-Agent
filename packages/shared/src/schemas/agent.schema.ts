import { z } from "zod";
import { DEFAULT_VOICE_ID, isAllowedVoice } from "../constants/voices";
import { DEFAULT_LANGUAGE } from "../constants/languages";

/**
 * Validation for the builder intake form.
 *
 * Lives in `shared` so the browser and the API enforce exactly the same rules —
 * the frontend uses it to decide when to enable the Generate button, the API
 * uses it as the real gate. One definition, no drift.
 *
 * Fields are forgiving on purpose: a partially-completed form should still
 * produce an agent. Only the three things the prompt compiler cannot invent are
 * required.
 */

/** Trims, and treats a missing field as an empty string. */
const optionalText = z
  .string()
  .optional()
  .transform((v) => (typeof v === "string" ? v.trim() : ""));

export const agentSpecSchema = z
  .object({
    // Not cosmetic: this becomes the agent's persona in the prompt ("You are
    // Sofia...") and the headline on the talk page, so we refuse to invent one.
    agentName: z
      .string({
        required_error:
          "Give the agent a name — it introduces itself with it on the call.",
      })
      .transform((v) => v.trim())
      .refine((v) => v.length > 0, {
        message:
          "Give the agent a name — it introduces itself with it on the call.",
      }),

    // Deliberately not trimmed — leading space in an opening line is the
    // user's business.
    firstLine: z
      .string()
      .optional()
      .transform((v) => v ?? ""),

    companyName: z
      .string({ required_error: "Enter the company name." })
      .transform((v) => v.trim())
      .refine((v) => v.length > 0, { message: "Enter the company name." }),

    companyDescription: optionalText,
    businessHours: optionalText,
    contactDetails: optionalText,
    services: optionalText,
    tone: optionalText,
    callGoal: optionalText,
    guardrails: optionalText,

    // Only the two curated voices are permitted — the picker offers nothing
    // else, so anything different means a hand-crafted request.
    voiceId: z
      .string()
      .optional()
      .transform((v) => v?.trim() || DEFAULT_VOICE_ID)
      .refine(isAllowedVoice, {
        message: "Choose either the female or the male voice.",
      }),

    language: z
      .string()
      .optional()
      .transform((v) => v?.trim() || DEFAULT_LANGUAGE),
  })
  .refine((s) => s.companyDescription.length > 0 || s.services.length > 0, {
    message: "Describe what the company does, or list the services it offers.",
    path: ["companyDescription"],
  });

/** The validated, defaulted shape. Structurally identical to `AgentSpec`. */
export type AgentSpecInput = z.infer<typeof agentSpecSchema>;
