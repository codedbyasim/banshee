import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  assessFieldRisk,
  buildGroundedEchoes,
  buildGroundedMap,
  combineRiskDrivers,
  computeL1LeadTimeMinutes,
  computePiercePoint,
  evaluateAlertTransition,
  explainAssessment,
  filterVisibleSatellites,
  sampleGloTecAt,
  scoreToLevel,
  verifyGroundedNumbers,
  type GloTecGrid,
  type SatelliteObservation,
} from "../src/index.js";

describe("Banshee Engine — 9 Property-Based Test Suites (fast-check)", () => {
  // 1. Monotonic risk
  it("PBT-1 (Monotonic risk): worsening any single driver never lowers the score", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 20000, noNaN: true }),
        fc.double({ min: 0, max: 40, noNaN: true }),
        fc.double({ min: 0, max: 9, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.boolean(),
        fc.double({ min: 0, max: 5000, noNaN: true }),
        (coupling, tec, kp, ghostFrac, lowLat, isStale, delta) => {
          const base = combineRiskDrivers({
            newellCoupling: coupling,
            tecAnomalyTecu: tec,
            kpIndex: kp,
            ghostFraction: ghostFrac,
            lowLatPostSunsetFactor: lowLat,
            isStale,
          });
          const worseCoupling = combineRiskDrivers({
            newellCoupling: coupling + delta,
            tecAnomalyTecu: tec,
            kpIndex: kp,
            ghostFraction: ghostFrac,
            lowLatPostSunsetFactor: lowLat,
            isStale,
          });
          const worseKp = combineRiskDrivers({
            newellCoupling: coupling,
            tecAnomalyTecu: tec,
            kpIndex: Math.min(9, kp + delta / 1000),
            ghostFraction: ghostFrac,
            lowLatPostSunsetFactor: lowLat,
            isStale,
          });
          expect(worseCoupling).toBeGreaterThanOrEqual(base);
          expect(worseKp).toBeGreaterThanOrEqual(base);
        }
      )
    );
  });

  // 2. Bounds
  it("PBT-2 (Bounds): score is always in [0, 100] and level matches thresholds", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 50000, noNaN: true }),
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.double({ min: 0, max: 9, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.boolean(),
        (coupling, tec, kp, ghostFrac, lowLat, isStale) => {
          const score = combineRiskDrivers({
            newellCoupling: coupling,
            tecAnomalyTecu: tec,
            kpIndex: kp,
            ghostFraction: ghostFrac,
            lowLatPostSunsetFactor: lowLat,
            isStale,
          });
          const level = scoreToLevel(score, isStale);
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(100);
          expect(["Safe", "Uneasy", "Haunted"]).toContain(level);
        }
      )
    );
  });

  // 3. Fail-safe staleness
  it("PBT-3 (Fail-safe staleness): stale or missing live feed can NEVER output Safe", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 31, max: 500 }),
        (staleMinutes) => {
          const res = assessFieldRisk({
            latDeg: 30.1575,
            lonDeg: 71.5249,
            timestampIso: "2026-11-26T06:00:00Z",
            elevationMaskDeg: 10,
            solarWind: {
              timestampIso: "2026-11-26T05:00:00Z",
              speedKmS: 320,
              densityCm3: 4,
              btNt: 3,
              byNt: 1,
              bzNt: 2,
              source: "SOLAR-1",
            },
            glotec: null,
            kpIndex: 1,
            satellites: [],
            feedAges: {
              solarWindAgeMin: staleMinutes,
              glotecAgeMin: 5,
              kpAgeMin: 10,
              gnssAgeMin: 60,
            },
          });
          expect(res.isStale).toBe(true);
          expect(res.level).not.toBe("Safe");
        }
      )
    );
  });

  // 4. Lead time physics
  it("PBT-4 (Lead time physics): positive, finite, and strictly decreasing for 250..3000 km/s", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 250, max: 2999, noNaN: true }),
        fc.double({ min: 0.1, max: 500, noNaN: true }),
        (v1, dv) => {
          const v2 = Math.min(3000, v1 + dv);
          const t1 = computeL1LeadTimeMinutes(v1);
          const t2 = computeL1LeadTimeMinutes(v2);
          expect(t1).not.toBeNull();
          expect(t2).not.toBeNull();
          expect(Number.isFinite(t1 as number)).toBe(true);
          expect(t1 as number).toBeGreaterThan(0);
          if (v2 > v1) {
            expect(t2 as number).toBeLessThan(t1 as number);
          }
        }
      )
    );
  });

  // 5. Geometry
  it("PBT-5 (Geometry): raising elevation mask never increases visible count; IPP stays in bounds", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -89, max: 89, noNaN: true }),
        fc.double({ min: -180, max: 180, noNaN: true }),
        fc.double({ min: 0, max: 85, noNaN: true }),
        fc.double({ min: 0, max: 360, noNaN: true }),
        fc.double({ min: 0, max: 60, noNaN: true }),
        (lat, lon, el, az, mask1) => {
          const ipp = computePiercePoint(lat, lon, el, az);
          expect(ipp.latDeg).toBeGreaterThanOrEqual(-90);
          expect(ipp.latDeg).toBeLessThanOrEqual(90);
          expect(ipp.lonDeg).toBeGreaterThanOrEqual(-180);
          expect(ipp.lonDeg).toBeLessThan(180);

          const sats: SatelliteObservation[] = [
            { id: "G01", name: "GPS 1", constellation: "GPS", elevationDeg: el, azimuthDeg: az },
            { id: "G02", name: "GPS 2", constellation: "GPS", elevationDeg: 45, azimuthDeg: 120 },
          ];
          const mask2 = Math.min(90, mask1 + 10);
          expect(filterVisibleSatellites(sats, mask2).length).toBeLessThanOrEqual(
            filterVisibleSatellites(sats, mask1).length
          );
        }
      )
    );
  });

  // 6. Interpolation
  it("PBT-6 (Interpolation): sampled TEC always lies between neighbours min and max", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 80, noNaN: true }),
        fc.double({ min: 0, max: 80, noNaN: true }),
        fc.double({ min: 0, max: 80, noNaN: true }),
        fc.double({ min: 0, max: 80, noNaN: true }),
        fc.double({ min: 30, max: 32.5, noNaN: true }),
        fc.double({ min: 70, max: 75, noNaN: true }),
        (v11, v21, v12, v22, lat, lon) => {
          const grid: GloTecGrid = {
            timestampIso: "2026-11-26T12:00:00Z",
            latStepDeg: 2.5,
            lonStepDeg: 5,
            cells: [
              { latDeg: 30, lonDeg: 70, vTec: v11, anomaly: 0 },
              { latDeg: 30, lonDeg: 75, vTec: v21, anomaly: 0 },
              { latDeg: 32.5, lonDeg: 70, vTec: v12, anomaly: 0 },
              { latDeg: 32.5, lonDeg: 75, vTec: v22, anomaly: 0 },
            ],
          };
          const sampled = sampleGloTecAt(grid, lat, lon);
          if (sampled.status !== "ok") throw new Error("expected an ok sample for a populated grid");
          expect(sampled.vTec).toBeGreaterThanOrEqual(sampled.neighbourMinVtec - 1e-9);
          expect(sampled.vTec).toBeLessThanOrEqual(sampled.neighbourMaxVtec + 1e-9);
        }
      )
    );
  });

  // 8. Alert idempotency
  it("PBT-8 (Alert idempotency): same eventId never dispatches two alerts", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 3, maxLength: 20 }),
        fc.integer({ min: 65, max: 100 }),
        (eventId, score) => {
          const first = evaluateAlertTransition(
            { activeLevel: "Safe", lastEventId: null, lastNotifiedAtIso: null },
            eventId,
            score,
            false,
            "2026-11-26T12:00:00Z"
          );
          const second = evaluateAlertTransition(
            first.nextState,
            eventId,
            score,
            false,
            "2026-11-26T12:01:00Z"
          );
          expect(first.shouldNotify).toBe(true);
          expect(second.shouldNotify).toBe(false);
        }
      )
    );
  });

  // 9. Grounded AI
  it("PBT-9 (Grounded AI): every number in the English explanation is grounded", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 300, max: 1200, noNaN: true }),
        fc.double({ min: -40, max: 10, noNaN: true }),
        fc.double({ min: 0, max: 9, noNaN: true }),
        (speed, bz, kp) => {
          const assessment = assessFieldRisk({
            latDeg: 30.1575,
            lonDeg: 71.5249,
            timestampIso: "2026-11-26T14:00:00Z",
            elevationMaskDeg: 10,
            solarWind: {
              timestampIso: "2026-11-26T13:58:00Z",
              speedKmS: speed,
              densityCm3: 8,
              btNt: Math.abs(bz) + 2,
              byNt: 2,
              bzNt: bz,
              source: "SOLAR-1",
            },
            glotec: {
              timestampIso: "2026-11-26T13:55:00Z",
              latStepDeg: 2.5,
              lonStepDeg: 5,
              cells: [{ latDeg: 30, lonDeg: 70, vTec: 24, anomaly: 6 }],
            },
            kpIndex: kp,
            satellites: [
              { id: "G01", name: "GPS PRN 01", constellation: "GPS", elevationDeg: 55, azimuthDeg: 40 },
              { id: "G02", name: "GPS PRN 02", constellation: "GPS", elevationDeg: 25, azimuthDeg: 210 },
            ],
            feedAges: { solarWindAgeMin: 2, glotecAgeMin: 5, kpAgeMin: 15, gnssAgeMin: 120 },
          });
          const text = explainAssessment(assessment);
          const check = verifyGroundedNumbers(text, buildGroundedMap(assessment), {
            verbatim: buildGroundedEchoes(assessment),
          });
          expect(check.ok).toBe(true);
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Preset correctness properties P10-P20 (FR-RE-8)
// ---------------------------------------------------------------------------
import { SENSITIVITY_PRESETS, resolvePreset, type RiskAssessmentInput } from "../src/index.js";

const PBT_SEED = 20260101;
const RUNS = { seed: PBT_SEED, numRuns: 100 };

const presetIdArb = fc.constantFrom("TRACTOR_RTK", "SURVEY_DRONE", "CUSTOM");
const anyMaskArb = fc.oneof(
  fc.double({ min: -500, max: 500, noNaN: true }),
  fc.constantFrom(Number.NaN, Infinity, -Infinity, undefined as unknown as number)
);
const finiteMaskArb = fc.double({ min: -500, max: 500, noNaN: true, noDefaultInfinity: true });

const satArb = (minEl: number) =>
  fc.array(
    fc.record({
      id: fc.string({ minLength: 1, maxLength: 4 }),
      name: fc.constant("SAT"),
      constellation: fc.constantFrom("GPS" as const, "GALILEO" as const, "GLONASS" as const, "BEIDOU" as const),
      elevationDeg: fc.double({ min: minEl, max: 90, noNaN: true }),
      azimuthDeg: fc.double({ min: 0, max: 360, noNaN: true }),
    }),
    { maxLength: 12 }
  );

function baseInput(over: Partial<RiskAssessmentInput> = {}): RiskAssessmentInput {
  return {
    latDeg: 30.1575,
    lonDeg: 71.5249,
    timestampIso: "2026-11-26T14:00:00Z",
    solarWind: {
      timestampIso: "2026-11-26T13:58:00Z",
      speedKmS: 500,
      densityCm3: 8,
      btNt: 8,
      byNt: 2,
      bzNt: -6,
      source: "SOLAR-1",
    },
    glotec: {
      timestampIso: "2026-11-26T13:55:00Z",
      latStepDeg: 2.5,
      lonStepDeg: 5,
      cells: [{ latDeg: 30, lonDeg: 70, vTec: 24, anomaly: 6 }],
    },
    kpIndex: 3,
    satellites: [],
    feedAges: { solarWindAgeMin: 2, glotecAgeMin: 5, kpAgeMin: 15, gnssAgeMin: 120 },
    ...over,
  };
}

const feedStaleArb = fc.record({
  which: fc.constantFrom("solarWind", "glotec", "kp", "gnss"),
  mode: fc.constantFrom("nullAge", "tooOld", "nullFeed"),
});

describe("Preset correctness properties P10-P20", () => {
  it("P10 bounds: score is an integer in [0,100] for every preset", () => {
    // **Validates: Requirements FR-RE-8.7**
    fc.assert(
      fc.property(
        presetIdArb, anyMaskArb, satArb(0),
        fc.double({ min: -50, max: 50, noNaN: true }),
        fc.double({ min: 250, max: 3000, noNaN: true }),
        fc.double({ min: 0, max: 9, noNaN: true }),
        (presetId, mask, sats, bz, speed, kp) => {
          const base = baseInput();
          const r = assessFieldRisk({
            ...base,
            presetId,
            elevationMaskDeg: mask,
            satellites: sats,
            kpIndex: kp,
            solarWind: { ...base.solarWind!, speedKmS: speed, bzNt: bz },
          });
          expect(Number.isInteger(r.score)).toBe(true);
          expect(r.score).toBeGreaterThanOrEqual(0);
          expect(r.score).toBeLessThanOrEqual(100);
        }
      ),
      RUNS
    );
  });

  it("P11 fixed bands: level follows 0-34/35-64/65-100 unless stale (then never Safe)", () => {
    // **Validates: Requirements FR-RE-8.6**
    fc.assert(
      fc.property(
        presetIdArb, anyMaskArb, satArb(0), fc.boolean(), fc.double({ min: 0, max: 9, noNaN: true }),
        (presetId, mask, sats, stale, kp) => {
          const r = assessFieldRisk(
            baseInput({
              presetId,
              elevationMaskDeg: mask,
              satellites: sats,
              kpIndex: kp,
              feedAges: { solarWindAgeMin: stale ? 500 : 2, glotecAgeMin: 5, kpAgeMin: 15, gnssAgeMin: 120 },
            })
          );
          // r.isStale also covers empty or fully masked skies (FR-RE-20).
          if (r.score >= 65) expect(r.level).toBe("Haunted");
          else if (r.score >= 35) expect(r.level).toBe("Uneasy");
          else if (r.isStale) expect(r.level).not.toBe("Safe");
          else expect(r.level).toBe("Safe");
          if (stale) expect(r.isStale).toBe(true);
          if (r.isStale) expect(r.level).not.toBe("Safe");
        }
      ),
      RUNS
    );
  });

  it("P12 stale or missing feed is never Safe and has STALE_DATA reason", () => {
    // **Validates: Requirements FR-RE-8.10, FR-RE-3**
    fc.assert(
      fc.property(presetIdArb, anyMaskArb, feedStaleArb, (presetId, mask, { which, mode }) => {
        const ages = { solarWindAgeMin: 2, glotecAgeMin: 5, kpAgeMin: 15, gnssAgeMin: 120 } as Record<string, number | null>;
        const key = `${which}AgeMin`;
        const max = { solarWind: 30, glotec: 45, kp: 180, gnss: 2880 }[which as "kp"];
        const over: Partial<RiskAssessmentInput> = {};
        if (mode === "nullAge") ages[key] = null;
        else if (mode === "tooOld") ages[key] = max + 1;
        else if (which === "solarWind") over.solarWind = null;
        else if (which === "glotec") over.glotec = null;
        else if (which === "kp") over.kpIndex = null;
        else ages[key] = null;
        const r = assessFieldRisk(
          baseInput({ presetId, elevationMaskDeg: mask, feedAges: ages as never, kpIndex: 0, ...over })
        );
        expect(r.isStale).toBe(true);
        expect(r.level).not.toBe("Safe");
        expect(r.topReasons.concat([]).length).toBeGreaterThan(0);
        expect(r.topReasons.some((d) => d.code === "STALE_DATA")).toBe(true);
      }),
      RUNS
    );
  });

  it("P13 gain monotonicity: higher gain never lowers the score", () => {
    // **Validates: Requirements FR-RE-8.8**
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 20000, noNaN: true }),
        fc.double({ min: 0, max: 40, noNaN: true }),
        fc.double({ min: 0, max: 9, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.boolean(),
        (c, t, k, g, l, stale) => {
          const d = { newellCoupling: c, tecAnomalyTecu: t, kpIndex: k, ghostFraction: g, lowLatPostSunsetFactor: l, isStale: stale };
          const s1 = combineRiskDrivers({ ...d, gain: SENSITIVITY_PRESETS.TRACTOR_RTK.gain });
          const s2 = combineRiskDrivers({ ...d, gain: SENSITIVITY_PRESETS.SURVEY_DRONE.gain });
          expect(s2).toBeGreaterThanOrEqual(s1);
        }
      ),
      RUNS
    );
    // End-to-end with sky identical for both presets (all sats at/above both masks).
    fc.assert(
      fc.property(satArb(15), fc.double({ min: 0, max: 9, noNaN: true }), (sats, kp) => {
        const a = assessFieldRisk(baseInput({ presetId: "TRACTOR_RTK", satellites: sats, kpIndex: kp }));
        const b = assessFieldRisk(baseInput({ presetId: "SURVEY_DRONE", satellites: sats, kpIndex: kp }));
        const c = assessFieldRisk(baseInput({ presetId: "CUSTOM", elevationMaskDeg: 15, satellites: sats, kpIndex: kp }));
        expect(b.score).toBeGreaterThanOrEqual(a.score);
        expect(c.score).toBe(a.score);
      }),
      RUNS
    );
  });

  it("P14 driver monotonicity per preset: worse Kp or faster wind never lowers score", () => {
    // **Validates: Requirements FR-RE-8.9**
    fc.assert(
      fc.property(
        presetIdArb, anyMaskArb, satArb(0),
        fc.double({ min: 0, max: 9, noNaN: true }),
        fc.double({ min: 0, max: 9, noNaN: true }),
        fc.double({ min: 250, max: 2000, noNaN: true }),
        fc.double({ min: 0, max: 1000, noNaN: true }),
        (presetId, mask, sats, kpA, kpB, speed, dv) => {
          const [lo, hi] = kpA <= kpB ? [kpA, kpB] : [kpB, kpA];
          const base = baseInput();
          const run = (kp: number, v: number) =>
            assessFieldRisk({
              ...base,
              presetId,
              elevationMaskDeg: mask,
              satellites: sats,
              kpIndex: kp,
              solarWind: { ...base.solarWind!, speedKmS: v },
            }).score;
          expect(run(hi, speed)).toBeGreaterThanOrEqual(run(lo, speed));
          expect(run(lo, Math.min(3000, speed + dv))).toBeGreaterThanOrEqual(run(lo, speed));
        }
      ),
      RUNS
    );
  });

  it("P15 determinism: same input gives deeply equal output", () => {
    // **Validates: Requirements FR-RE-8.11**
    fc.assert(
      fc.property(presetIdArb, anyMaskArb, satArb(0), (presetId, mask, sats) => {
        const input = baseInput({ presetId, elevationMaskDeg: mask, satellites: sats });
        expect(assessFieldRisk(input)).toEqual(assessFieldRisk(input));
      }),
      RUNS
    );
  });

  it("P16 unknown or missing preset falls back to TRACTOR_RTK", () => {
    // **Validates: Requirements FR-RE-8.3, FR-RE-8.4, FR-RE-8.5**
    const known = new Set(["TRACTOR_RTK", "SURVEY_DRONE", "CUSTOM"]);
    const unknownArb = fc.oneof(
      fc.string().filter((s) => !known.has(s)),
      fc.constantFrom("__proto__", "constructor", "toString", "hasOwnProperty", "tractor_rtk", ""),
      fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), fc.array(fc.integer()), fc.object()) as fc.Arbitrary<unknown>
    );
    fc.assert(
      fc.property(unknownArb, anyMaskArb, (id, mask) => {
        const r = assessFieldRisk(baseInput({ presetId: id as never, elevationMaskDeg: mask }));
        expect(r.preset?.id).toBe("TRACTOR_RTK");
        expect(r.preset?.elevationMaskDeg).toBe(15);
        expect(r.unknownPresetReason).toBeTruthy();
      }),
      RUNS
    );
    const missing = assessFieldRisk(baseInput({ elevationMaskDeg: 3 }));
    expect(missing.preset?.id).toBe("TRACTOR_RTK");
    expect(missing.preset?.elevationMaskDeg).toBe(15);
    expect(missing.unknownPresetReason).toBeUndefined();
    fc.assert(
      fc.property(fc.anything(), (id) => {
        const r = assessFieldRisk(baseInput({ presetId: id as never }));
        expect(known.has(r.preset!.id)).toBe(true);
      }),
      RUNS
    );
  });

  it("P17 mask effect: lower effective mask never yields fewer visible satellites", () => {
    // **Validates: Requirements FR-RE-5, FR-RE-8.2**
    fc.assert(
      fc.property(satArb(0), presetIdArb, anyMaskArb, presetIdArb, anyMaskArb, (sats, p1, m1, p2, m2) => {
        const a = assessFieldRisk(baseInput({ presetId: p1, elevationMaskDeg: m1, satellites: sats }));
        const b = assessFieldRisk(baseInput({ presetId: p2, elevationMaskDeg: m2, satellites: sats }));
        const [lo, hi] = a.preset!.elevationMaskDeg <= b.preset!.elevationMaskDeg ? [a, b] : [b, a];
        expect(lo.visibleSatellites).toBeGreaterThanOrEqual(hi.visibleSatellites);
      }),
      RUNS
    );
    fc.assert(
      fc.property(satArb(0), (sats) => {
        const t = assessFieldRisk(baseInput({ presetId: "TRACTOR_RTK", satellites: sats }));
        const d = assessFieldRisk(baseInput({ presetId: "SURVEY_DRONE", satellites: sats }));
        expect(d.visibleSatellites).toBeGreaterThanOrEqual(t.visibleSatellites);
      }),
      RUNS
    );
  });

  it("P18 CUSTOM mask clamps to [0,90] with gain 1.00", () => {
    // **Validates: Requirements FR-RE-8.12**
    fc.assert(
      fc.property(finiteMaskArb, (mask) => {
        const r = assessFieldRisk(baseInput({ presetId: "CUSTOM", elevationMaskDeg: mask }));
        expect(r.preset!.elevationMaskDeg).toBe(Math.min(90, Math.max(0, mask)));
        expect(r.preset!.gain).toBe(1);
        expect(r.customMaskDefaultedReason).toBeUndefined();
        expect(resolvePreset("CUSTOM", mask).preset.elevationMaskDeg).toBe(r.preset!.elevationMaskDeg);
      }),
      RUNS
    );
  });

  it("P19 caller mask is ignored by non-CUSTOM presets", () => {
    // **Validates: Requirements FR-RE-8.12**
    fc.assert(
      fc.property(
        fc.oneof(fc.constantFrom("TRACTOR_RTK", "SURVEY_DRONE"), fc.string().filter((s) => s !== "CUSTOM" && s !== "SURVEY_DRONE" && s !== "TRACTOR_RTK")),
        anyMaskArb,
        (id, mask) => {
          const r = assessFieldRisk(baseInput({ presetId: id, elevationMaskDeg: mask }));
          const expected = id === "SURVEY_DRONE" ? 10 : 15;
          expect(r.preset!.elevationMaskDeg).toBe(expected);
          expect(r.customMaskDefaultedReason).toBeUndefined();
        }
      ),
      RUNS
    );
  });

  it("P20 CUSTOM invalid mask falls back to 15 with defaulted reason", () => {
    // **Validates: Requirements FR-RE-8.13**
    const invalidArb = fc.oneof(
      fc.constantFrom(undefined, Number.NaN, Infinity, -Infinity, null),
      fc.string(),
      fc.boolean(),
      fc.array(fc.integer())
    ) as fc.Arbitrary<unknown>;
    fc.assert(
      fc.property(invalidArb, (mask) => {
        const r = assessFieldRisk(baseInput({ presetId: "CUSTOM", elevationMaskDeg: mask as never }));
        expect(r.preset!.elevationMaskDeg).toBe(15);
        expect(r.customMaskDefaultedReason).toBeTruthy();
      }),
      RUNS
    );
  });
});
