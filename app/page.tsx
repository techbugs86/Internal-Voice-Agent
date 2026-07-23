import Builder from "./builder";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Agent Builder</h1>
        <p className="mt-2 text-[15px] text-[var(--color-muted)]">
          Fill in the details of your business and how you want the agent to
          sound. We build it on Retell and hand you a link you can call.
        </p>
      </header>
      <Builder />
    </main>
  );
}
