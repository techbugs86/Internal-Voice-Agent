"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      // Whatever the API said, the cookies are gone — send them to sign-in.
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <button
      onClick={signOut}
      disabled={busy}
      className="shrink-0 rounded-lg border border-[var(--color-edge)] px-3.5 py-2 text-[13px] text-[var(--color-muted)] transition hover:border-[var(--color-muted)] hover:text-[#e8eaed] disabled:opacity-40"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
