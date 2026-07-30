import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // `standalone` emits a self-contained server bundle, which is what makes the
  // Dockerfile small. `outputFileTracingRoot` points at the repo root so the
  // trace follows the symlink into packages/shared instead of stopping at
  // apps/web and shipping a build that cannot resolve it.
  //
  // Vercel builds its own output format and does not need the standalone
  // bundle, so it is skipped there — the tracing root below still applies,
  // which is what lets the monorepo resolve @agent/shared either way.
  output: process.env.VERCEL ? undefined : "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),

  // Compiled from TypeScript in the workspace rather than installed from a
  // registry, so Next needs to be told to put it through its own pipeline.
  transpilePackages: ["@agent/shared"],
};

export default nextConfig;
