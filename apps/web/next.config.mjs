import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** @param {string} phase */
export default function nextConfig(phase) {
  /** @type {import('next').NextConfig} */
  return {
    // `next dev` and `next build` write to separate folders so a build never replaces dev chunks.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
    // Monorepo root; stops Next picking a stray lockfile outside the repo.
    outputFileTracingRoot: repoRoot,
    transpilePackages: ["@banshee/engine", "@banshee/feeds"],
    webpack: (config) => {
      config.resolve.extensionAlias = {
        ...(config.resolve.extensionAlias ?? {}),
        ".js": [".ts", ".tsx", ".js", ".jsx"],
      };
      return config;
    },
  };
}
