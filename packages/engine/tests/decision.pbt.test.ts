import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  assessFieldRisk,
  levelToDecision,
  type Decision,
  type RiskLevel,
} from "../src/index.js";

const RUNS = { seed: 20260101, numRuns: 100 };

describe("decision PBT", () => {
  // Feature: mission-planner-ui, Property 4: levelToDecision is total and order-preserving.
  // **Validates: Requirements 6.1**
  it("Property 4: levelToDecision is total, injective and order-preserving", () => {
    const levels: RiskLevel[] = ["Safe", "Uneasy", "Haunted"];
    const valid: Decision[] = ["GO", "CAUTION", "HOLD"];
    const expected: Record<RiskLevel, Decision> = {
      Safe: "GO",
      Uneasy: "CAUTION",
      Haunted: "HOLD",
    };
    fc.assert(
      fc.property(
        fc.constantFrom(...levels),
        fc.constantFrom(...levels),
        (a, b) => {
          const da = levelToDecision(a);
          const db = levelToDecision(b);
          expect(valid).toContain(da);
          expect(da).toBe(expected[a]);
          if (a !== b) expect(da).not.toBe(db);
          // severity order preserved
          expect(levels.indexOf(a) - levels.indexOf(b)).toBe(
            valid.indexOf(da) - valid.indexOf(db),
          );
        },
      ),
      RUNS,
    );
  });

  // Feature: mission-planner-ui, Property 5: stale or missing data never yields GO.
  // **Validates: Requirements 6.2**
  it("Property 5: any stale or missing feed never yields GO", () => {
    const feedArb = fc.record({
      which: fc.constantFrom("solarWind", "glotec", "kp", "gnss"),
      mode: fc.constantFrom("nullAge", "tooOld", "nullFeed"),
      excess: fc.integer({ min: 1, max: 500 }),
    });
    const maxAge = { solarWind: 30, glotec: 45, kp: 180, gnss: 2880 } as const;
    fc.assert(
      fc.property(
        feedArb,
        fc.double({ min: 0, max: 9, noNaN: true }),
        fc.double({ min: 300, max: 800, noNaN: true }),
        fc.double({ min: -10, max: 10, noNaN: true }),
        (feed, kp, speed, bz) => {
          const ages: Record<string, number | null> = {
            solarWindAgeMin: 2,
            glotecAgeMin: 5,
            kpAgeMin: 15,
            gnssAgeMin: 120,
          };
          let solarWind: Parameters<typeof assessFieldRisk>[0]["solarWind"] = {
            timestampIso: "2026-11-26T13:58:00Z",
            speedKmS: speed,
            densityCm3: 4,
            btNt: Math.abs(bz) + 1,
            byNt: 1,
            bzNt: bz,
            source: "SOLAR-1",
          };
          let glotec: Parameters<typeof assessFieldRisk>[0]["glotec"] = {
            timestampIso: "2026-11-26T13:55:00Z",
            latStepDeg: 2.5,
            lonStepDeg: 5,
            cells: [{ latDeg: 30, lonDeg: 70, vTec: 20, anomaly: 0 }],
          };
          let kpIndex: number | null = kp;
          const key = `${feed.which}AgeMin`;
          if (feed.mode === "nullAge") ages[key] = null;
          else if (feed.mode === "tooOld") ages[key] = maxAge[feed.which] + feed.excess;
          else if (feed.which === "solarWind") solarWind = null;
          else if (feed.which === "glotec") glotec = null;
          else if (feed.which === "kp") kpIndex = null;
          else ages[key] = null;

          const res = assessFieldRisk({
            latDeg: 30.1575,
            lonDeg: 71.5249,
            timestampIso: "2026-11-26T14:00:00Z",
            elevationMaskDeg: 10,
            solarWind,
            glotec,
            kpIndex,
            satellites: [],
            feedAges: ages as never,
          });
          expect(res.isStale).toBe(true);
          expect(res.level).not.toBe("Safe");
          expect(levelToDecision(res.level)).not.toBe("GO");
        },
      ),
      RUNS,
    );
  });
});
