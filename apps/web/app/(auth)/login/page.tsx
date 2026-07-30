import type { Metadata } from "next";
import { Suspense } from "react";
import AuthForm from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Sign in · Agent Builder" };

export default function LoginPage() {
  return (
    <>
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-2 text-[15px] text-[var(--color-muted)]">
          Sign in to build and manage your voice agents.
        </p>
      </header>
      {/* AuthForm reads `?next=` via useSearchParams, which Next requires to
          sit inside a Suspense boundary. */}
      <Suspense fallback={null}>
        <AuthForm mode="login" />
      </Suspense>
    </>
  );
}
