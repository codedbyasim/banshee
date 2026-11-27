import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { bestSafeWindow, type RiskLevel, type SafeWindow } from "../src/index.js";

const RUNS = { seed: 20260101, numRuns: 200 };

type Hour = { level: RiskLevel; score: number };

/** Brute force: enumerate every all-Safe [s, e] interval, keep the best by (length, -mean, -start). */
function reference(hours: readonly Hour[]): SafeWindow | null {
  let best: SafeWindow | null = null;
  for (let s = 0; s < hours.length; s++) {
    for (let e = s; e < hours.length; e++) {
      const slice = hours.slice(s, e + 1);
      if (!slice.every((h) => h.level === "Safe")) break;
      const durationHours = e - s + 1;
      const meanScore = slice.reduce((a, h) => a + h.score, 0) / durationHours;
      const cand: SafeWindow = { startHourOffset: s, endHourOffset: e, durationHours, meanScore };
      if (
        best === null ||
        durationHours > best.durationHours ||
        (durationHours === best.durationHours && meanScore < best.meanScore)
      ) {
        best = cand;
      }
    }
  }
  return best;
}

const hourArb: fc.Arbitrary<Hour> = fc.record({
  level: fc.constantFrom<RiskLevel>("Safe", "Safe", "Uneasy", "Haunted"),
  score: fc.integer({ min: 0, max: 100 }),
});

describe("bestSafeWindow PBT", () => {
  // Feature: mission-planner-ui, Property 3: bestSafeWindow returns the longest Safe run with
  // deterministic tie-breaking, or none.
  // **Validates: Requirements 4.13, 4.14, 4.16**
  it("Property 3: matches brute-force reference and satisfies run invariants", () => {
    fc.assert(
      fc.property(fc.array(hourArb, { minLength: 12, maxLength: 12 }), (hours) => {
        const got = bestSafeWindow(hours);
        expect(got).toEqual(reference(hours));

        if (!hours.some((h) => h.level === "Safe")) {
          expect(got).toBeNull();
          return;
        }
        expect(got).not.toBeNull();
        const w = got as SafeWindow;
        for (let i = w.startHourOffset; i <= w.endHourOffset; i++) {
          expect(hours[i]?.level).toBe("Safe");
        }
        // Maximal run: bounded by non-Safe hours or array edges.
        if (w.startHourOffset > 0) expect(hours[w.startHourOffset - 1]?.level).not.toBe("Safe");
        if (w.endHourOffset < hours.length - 1) {
          expect(hours[w.endHourOffset + 1]?.level).not.toBe("Safe");
        }
        expect(w.durationHours).toBe(w.endHourOffset - w.startHourOffset + 1);
      }),
      RUNS
    );
  });
});
