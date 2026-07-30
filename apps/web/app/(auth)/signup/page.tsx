import type { Metadata } from "next";
import { Suspense } from "react";
import AuthForm from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Create an account · Agent Builder" };

export default function SignupPage() {
  return (
    <>
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create your account
        </h1>
        <p className="mt-2 text-[15px] text-[var(--color-muted)]">
          Build a voice agent for your business in a couple of minutes.
        </p>
      </header>
      <Suspense fallback={null}>
        <AuthForm mode="signup" />
      </Suspense>
    </>
  );
}
