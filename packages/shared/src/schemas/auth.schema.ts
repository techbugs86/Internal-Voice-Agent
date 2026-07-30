import { z } from "zod";

/**
 * Credentials for sign-in.
 *
 * The password floor is 8 characters to match Supabase Auth's own default — a
 * shorter one is rejected upstream anyway, and catching it here gives a better
 * error than passing the rejection through.
 */
export const credentialsSchema = z.object({
  email: z
    .string({ required_error: "Enter your email address." })
    .trim()
    .min(1, "Enter your email address.")
    .email("That does not look like an email address.")
    .transform((v) => v.toLowerCase()),
  password: z
    .string({ required_error: "Enter a password." })
    .min(8, "Use at least 8 characters."),
});

export type Credentials = z.infer<typeof credentialsSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Missing refresh token."),
});
