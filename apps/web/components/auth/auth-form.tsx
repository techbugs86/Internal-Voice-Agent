"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { credentialsSchema } from "@agent/shared";
import Recaptcha, { type RecaptchaHandle } from "./recaptcha";

/**
 * Sign-in and sign-up share one form — the fields, the captcha, and the error
 * handling are identical, and only the copy and the endpoint differ.
 *
 * Validation comes from `credentialsSchema` in @agent/shared, the same object
 * the API validates against. The check here is only to save a round trip; the
 * API never trusts it.
 */
export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const search = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkInbox, setCheckInbox] = useState(false);

  const captchaRef = useRef<RecaptchaHandle | null>(null);

  const isSignup = mode === "signup";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = credentialsSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your details.");
      return;
    }
    if (!captchaToken) {
      setError("Tick the “I'm not a robot” box first.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...parsed.data, captchaToken }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");

      if (isSignup && body.emailConfirmationRequired) {
        setCheckInbox(true);
        return;
      }

      // `refresh` re-runs the server components with the new cookie, so the
      // builder page renders signed-in rather than flashing the old state.
      const next = safeNext(search.get("next"));
      router.replace(next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
      // The token was consumed by that attempt whether or not it succeeded.
      captchaRef.current?.reset();
      setCaptchaToken(null);
    }
  }

  if (checkInbox) {
    return (
      <div className="rounded-xl border border-[var(--color-edge)] bg-[var(--color-panel)] p-6 text-center">
        <p className="text-lg font-medium">Check your inbox</p>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--color-muted)]">
          We sent a confirmation link to{" "}
          <span className="text-[var(--color-accent)]">{email}</span>. Click it,
          then come back and sign in.
        </p>
        <Link
          href="/login"
          className="mt-5 inline-block text-sm text-[var(--color-accent)] hover:underline"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-[var(--color-edge)] bg-[var(--color-panel)] p-6"
    >
      <div className="flex flex-col gap-4">
        <label className="block">
          <span className="mb-1.5 block text-[13px] text-[var(--color-muted)]">
            Email
          </span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[13px] text-[var(--color-muted)]">
            Password
            {isSignup && (
              <span className="ml-1.5 text-[#5c6472]">— at least 8 characters</span>
            )}
          </span>
          <input
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className={inputClass}
          />
        </label>

        <Recaptcha ref={captchaRef} onChange={setCaptchaToken} />

        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-[var(--color-accent)] px-5 py-3 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy
            ? isSignup
              ? "Creating your account…"
              : "Signing you in…"
            : isSignup
              ? "Create account"
              : "Sign in"}
        </button>

        {error && (
          <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        <p className="text-center text-[13px] text-[var(--color-muted)]">
          {isSignup ? "Already have an account? " : "No account yet? "}
          <Link
            href={isSignup ? "/login" : "/signup"}
            className="text-[var(--color-accent)] hover:underline"
          >
            {isSignup ? "Sign in" : "Create one"}
          </Link>
        </p>
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded-lg border border-[var(--color-edge)] bg-[#0f1216] px-3.5 py-2.5 text-sm leading-relaxed outline-none placeholder:text-[#4c5462] focus:border-[var(--color-accent)]";

/**
 * `next` comes from the query string, so it is attacker-controlled. Only
 * same-site paths are allowed — without this check, a crafted link could bounce
 * a freshly-signed-in user to an external site.
 */
function safeNext(value: string | null): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}
