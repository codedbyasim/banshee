import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Node environment only: components are rendered with react-dom/server, so no DOM shim is needed.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environment: "node",
  },
});
