import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * FR-RE-33 repo check: no Urdu text, RTL rule or language toggle in the web app, the engine
 * source, steering or agents. grounding.ts handles Arabic-Indic and Persian digits by code
 * point only, so it needs no exemption.
 */
const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const SCAN_DIRS = ["apps/web/src", "packages/engine/src", ".kiro/steering", ".kiro/agents"];
const TEXT_EXT = /\.(ts|tsx|js|mjs|cjs|jsx|json|md|css)$/i;

const PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "urdu", re: /urdu/i },
  { name: "rtl", re: /\brtl\b/i },
  { name: "U+0600-U+06FF", re: /[\u0600-\u06FF]/ },
];

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else if (TEXT_EXT.test(entry)) out.push(full);
  }
  return out;
}

describe("English-only scope (FR-RE-33)", () => {
  it.each(SCAN_DIRS)("%s has no Urdu, RTL or Urdu-script characters", (dir) => {
    const files = listFiles(join(ROOT, dir));
    expect(files.length).toBeGreaterThan(0);
    const hits: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, i) => {
        for (const p of PATTERNS) {
          if (p.re.test(line)) hits.push(`${relative(ROOT, file)}:${i + 1} [${p.name}]`);
        }
      });
    }
    expect(hits).toEqual([]);
  });

  it("the scanner detects each forbidden pattern", () => {
    expect(PATTERNS.map((p) => p.re.test("Urdu"))).toEqual([true, false, false]);
    expect(PATTERNS.map((p) => p.re.test('dir="rtl"'))).toEqual([false, true, false]);
    expect(PATTERNS.map((p) => p.re.test("\u0627\u0631\u062f\u0648"))).toEqual([false, false, true]);
    expect(PATTERNS.some((p) => p.re.test("controls"))).toBe(false);
  });
});
