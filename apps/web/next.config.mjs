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
    webpack: (config, { isServer, webpack }) => {
      config.resolve.extensionAlias = {
        ...(config.resolve.extensionAlias ?? {}),
        ".js": [".ts", ".tsx", ".js", ".jsx"],
      };
      if (!isServer) {
        // satellite.js ships an optional pthreads WASM runtime that imports Node built-ins.
        // The engine only uses the pure-JS SGP4 path, so stub them in the browser bundle.
        config.plugins.push(
          new webpack.NormalModuleReplacementPlugin(/^node:(module|worker_threads)$/, (resource) => {
            resource.request = resource.request.replace(/^node:/, "");
          }),
        );
        config.resolve.fallback = {
          ...(config.resolve.fallback ?? {}),
          module: false,
          worker_threads: false,
        };
      }
      return config;
    },
  };
}
