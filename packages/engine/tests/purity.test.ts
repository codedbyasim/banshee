import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Validates: Requirements FR-RE-8 (engine is pure, DOM-free, deterministic)
const SRC_DIR = join(__dirname, "..", "src");

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const files = readdirSync(SRC_DIR)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => ({ name: f, code: stripComments(readFileSync(join(SRC_DIR, f), "utf8")) }));

const FORBIDDEN: Array<[string, RegExp]> = [
  ["window", /\bwindow\s*[.[]|\btypeof\s+window\b|\bglobalThis\b/],
  ["document", /\bdocument\s*[.[]|\btypeof\s+document\b/],
  ["fetch", /\bfetch\s*\(/],
  ["localStorage", /\blocalStorage\b/],
  ["Date.now", /\bDate\.now\s*\(/],
  ["Math.random", /\bMath\.random\s*\(/],
  ["new Date()", /\bnew\s+Date\s*\(\s*\)/],
  ["module-level let/var", /^(?:export\s+)?(?:let|var)\s/m],
];

describe("engine purity (static check)", () => {
  it("finds engine source files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const [label, re] of FORBIDDEN) {
    it(`has no ${label} in packages/engine/src`, () => {
      const offenders = files.filter((f) => re.test(f.code)).map((f) => f.name);
      expect(offenders).toEqual([]);
    });
  }
});
