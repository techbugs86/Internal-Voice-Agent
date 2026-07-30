import { z } from "zod";

/**
 * Every environment variable the API reads, in one place.
 *
 * This is validated at boot (see `validateEnv` below, wired into ConfigModule).
 * A missing or malformed variable stops the process with a readable list rather
 * than surfacing hours later as an undefined-header error inside an HTTP call —
 * which matters most on a staging box where nobody is watching the logs.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  PORT: z.coerce.number().int().positive().default(4100),

  /** Comma-separated list of origins allowed to call this API from a browser. */
  CORS_ORIGIN: z.string().default("http://localhost:3100"),

  /** Public base URL of the frontend. Used to build the shareable /a/<id> link. */
  APP_URL: z.string().url(),

  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required (Supabase → Settings → Database → URI)."),

  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),

  RETELL_API_KEY: z.string().min(1),

  /** Optional: without it the deterministic prompt compiler is used instead. */
  ANTHROPIC_API_KEY: z.string().optional(),

  RECAPTCHA_SECRET_KEY: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  const problems = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");

  throw new Error(
    `Invalid environment configuration:\n${problems}\n\n` +
      `Copy apps/api/.env.example to apps/api/.env and fill in the blanks.`,
  );
}

/** Split CORS_ORIGIN into the array Nest's `enableCors` expects. */
export function corsOrigins(value: string): string[] {
  return value
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
}
