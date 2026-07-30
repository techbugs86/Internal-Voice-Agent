"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

/**
 * Google reCAPTCHA v2, checkbox variant.
 *
 * Rendered explicitly rather than with the automatic `g-recaptcha` class,
 * because the automatic mode scans the DOM once on script load and would miss
 * a widget React mounts afterwards.
 *
 * A token is single-use and expires after two minutes, so the parent must call
 * `reset()` after every submit — successful or not — or the second attempt is
 * rejected with a token Google has already seen.
 */

const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? "";
const READY_CALLBACK = "__onRecaptchaReady";

type Grecaptcha = {
  render(container: HTMLElement, params: Record<string, unknown>): number;
  reset(widgetId?: number): void;
};

declare global {
  interface Window {
    grecaptcha?: Grecaptcha;
    [READY_CALLBACK]?: () => void;
  }
}

/** Shared across every instance — the script must only ever be added once. */
let scriptPromise: Promise<void> | null = null;

function loadRecaptcha(): Promise<void> {
  if (window.grecaptcha?.render) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    window[READY_CALLBACK] = () => resolve();

    const script = document.createElement("script");
    script.src = `https://www.google.com/recaptcha/api.js?onload=${READY_CALLBACK}&render=explicit`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      scriptPromise = null; // allow a retry on the next mount
      reject(new Error("Could not load reCAPTCHA."));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export type RecaptchaHandle = {
  /** Clears the tick and invalidates the current token. */
  reset: () => void;
};

const Recaptcha = forwardRef<
  RecaptchaHandle,
  { onChange: (token: string | null) => void }
>(function Recaptcha({ onChange }, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    reset() {
      if (widgetIdRef.current !== null) {
        window.grecaptcha?.reset(widgetIdRef.current);
        onChange(null);
      }
    },
  }));

  useEffect(() => {
    if (!SITE_KEY) {
      setError(
        "NEXT_PUBLIC_RECAPTCHA_SITE_KEY is not set — see apps/web/.env.example.",
      );
      return;
    }

    let cancelled = false;

    loadRecaptcha()
      .then(() => {
        // Guards against React Strict Mode running effects twice in
        // development, which would otherwise render two widgets.
        if (cancelled || widgetIdRef.current !== null || !containerRef.current) {
          return;
        }
        widgetIdRef.current = window.grecaptcha!.render(containerRef.current, {
          sitekey: SITE_KEY,
          theme: "dark",
          callback: (token: string) => onChange(token),
          "expired-callback": () => onChange(null),
          "error-callback": () => onChange(null),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not load the verification widget. Check your connection.");
        }
      });

    return () => {
      cancelled = true;
    };
    // Mount-only: re-rendering the widget on every parent render would reset
    // the user's tick mid-form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <p className="rounded-lg border border-amber-900/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-300">
        {error}
      </p>
    );
  }

  return <div ref={containerRef} />;
});

export default Recaptcha;
