import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  assessFieldRisk,
  combineRiskDriversDetailed,
  isAnyFeedStale,
  isFreshAge,
  listStaleFeeds,
  MAX_FEED_AGE_MINUTES,
  resolvePreset,
  sampleGloTecAt,
  scoreToLevel,
  type FeedName,
  type RiskAssessmentInput,
  type SatelliteObservation,
} from "../src/index.js";

// Review-fix properties P21-P27 (FR-RE-14..FR-RE-21). Fixed seed for reproducibility.
const RUNS = { seed: 20260214, numRuns: 100 };

const FEEDS: FeedName[] = ["solarWind", "glotec", "kp", "gnss"];
const AGE_KEY = {
  solarWind: "solarWindAgeMin",
  glotec: "glotecAgeMin",
  kp: "kpAgeMin",
  gnss: "gnssAgeMin",
} as const;

const presetIdArb = fc.constantFrom("TRACTOR_RTK", "SURVEY_DRONE", "CUSTOM");
const maskArb = fc.oneof(
  fc.double({ min: -20, max: 120, noNaN: true }),
  fc.constantFrom(Number.NaN, Infinity, undefined as unknown as number)
);
const nonFiniteArb = fc.constantFrom(Number.NaN, Infinity, -Infinity);
const invalidAgeArb = fc.oneof(
  fc.double({ min: -1e6, max: -Number.MIN_VALUE, noNaN: true }),
  fc.constantFrom(Number.NaN, Infinity, -Infinity, null, undefined)
) as fc.Arbitrary<number | null>;

function sat(id: string, el: number, az: number): SatelliteObservation {
  return { id, name: `SAT ${id}`, constellation: "GPS", elevationDeg: el, azimuthDeg: az };
}

function baseInput(over: Partial<RiskAssessmentInput> = {}): RiskAssessmentInput {
  return {
    latDeg: 30.1575,
    lonDeg: 71.5249,
    timestampIso: "2026-11-26T06:00:00Z",
    solarWind: {
      timestampIso: "2026-11-26T05:58:00Z",
      speedKmS: 400,
      densityCm3: 5,
      btNt: 5,
      byNt: 1,
      bzNt: 1,
      source: "SOLAR-1",
    },
    glotec: {
      timestampIso: "2026-11-26T05:55:00Z",
      latStepDeg: 2.5,
      lonStepDeg: 5,
      cells: [{ latDeg: 30, lonDeg: 70, vTec: 10, anomaly: 1 }],
    },
    kpIndex: 1,
    satellites: [sat("G01", 60, 90), sat("G02", 45, 200)],
    feedAges: { solarWindAgeMin: 2, glotecAgeMin: 5, kpAgeMin: 15, gnssAgeMin: 120 },
    ...over,
  };
}

describe("Review-fix properties P21-P27", () => {
  it("P21 sanitization: non-finite satellites are dropped and score stays an integer in [0,100]", () => {
    // **Validates: Requirements FR-RE-14**
    const valueArb = fc.oneof(fc.double({ min: -10, max: 90, noNaN: true }), nonFiniteArb);
    fc.assert(
      fc.property(
        presetIdArb,
        maskArb,
        fc.array(fc.tuple(valueArb, fc.oneof(fc.double({ min: 0, max: 360, noNaN: true }), nonFiniteArb)), {
          maxLength: 10,
        }),
        (presetId, mask, pairs) => {
          const sats = pairs.map(([el, az], i) => sat(`S${i}`, el, az));
          const r = assessFieldRisk(baseInput({ presetId, elevationMaskDeg: mask, satellites: sats }));
          const dropped = new Set(
            sats.filter((s) => !Number.isFinite(s.elevationDeg) || !Number.isFinite(s.azimuthDeg)).map((s) => s.id)
          );
          for (const d of r.satellites) expect(dropped.has(d.id)).toBe(false);
          expect(r.visibleSatellites).toBe(r.cleanSatellites + r.ghostSatellites);
          expect(Number.isInteger(r.score)).toBe(true);
          expect(r.score).toBeGreaterThanOrEqual(0);
          expect(r.score).toBeLessThanOrEqual(100);
        }
      ),
      RUNS
    );
  });

  it("P22 invalid lat, lon or timestamp is never Safe and carries INVALID_INPUT, for every preset", () => {
    // **Validates: Requirements FR-RE-14**
    const latArb = fc.oneof(fc.constant(30.1575), nonFiniteArb);
    const lonArb = fc.oneof(fc.constant(71.5249), nonFiniteArb);
    const tsArb = fc.oneof(
      fc.constant("2026-11-26T06:00:00Z"),
      fc.constantFrom("not-a-date", "", "2026-99-99T99:99:99Z", undefined as unknown as string)
    );
    fc.assert(
      fc.property(
        presetIdArb,
        maskArb,
        latArb,
        lonArb,
        tsArb,
        (presetId, mask, lat, lon, ts) => {
          const invalid: string[] = [];
          if (!Number.isFinite(lat)) invalid.push("latDeg");
          if (!Number.isFinite(lon)) invalid.push("lonDeg");
          if (typeof ts !== "string" || !Number.isFinite(Date.parse(ts))) invalid.push("timestampIso");
          fc.pre(invalid.length > 0);
          const r = assessFieldRisk(
            baseInput({ presetId, elevationMaskDeg: mask, latDeg: lat, lonDeg: lon, timestampIso: ts })
          );
          expect(r.level).not.toBe("Safe");
          expect(r.invalidInput).toEqual(invalid);
          const reason = r.topReasons.find((d) => d.code === "INVALID_INPUT");
          expect(reason).toBeDefined();
          for (const f of invalid) expect(reason!.label).toContain(f);
          expect(Number.isInteger(r.score)).toBe(true);
        }
      ),
      RUNS
    );
  });

  it("P23 non-finite score guard: Safe only for finite scores <= 34; combiner returns a finite score", () => {
    // **Validates: Requirements FR-RE-15**
    const scoreArb = fc.oneof(fc.double({ min: -50, max: 150 }), nonFiniteArb);
    fc.assert(
      fc.property(scoreArb, fc.boolean(), (score, stale) => {
        const level = scoreToLevel(score, stale);
        if (level === "Safe") {
          expect(Number.isFinite(score)).toBe(true);
          expect(score).toBeLessThanOrEqual(34);
          expect(stale).toBe(false);
        }
        if (!Number.isFinite(score)) expect(level).toBe("Uneasy");
      }),
      RUNS
    );
    const driverArb = (max: number) => fc.oneof(fc.double({ min: 0, max, noNaN: true }), nonFiniteArb);
    fc.assert(
      fc.property(
        driverArb(20000),
        driverArb(40),
        driverArb(9),
        driverArb(1),
        driverArb(1),
        fc.boolean(),
        fc.oneof(fc.constantFrom(1, 1.15), nonFiniteArb),
        (c, t, k, g, l, stale, gain) => {
          const res = combineRiskDriversDetailed({
            newellCoupling: c,
            tecAnomalyTecu: t,
            kpIndex: k,
            ghostFraction: g,
            lowLatPostSunsetFactor: l,
            isStale: stale,
            gain,
          });
          expect(Number.isInteger(res.score)).toBe(true);
          expect(res.score).toBeGreaterThanOrEqual(0);
          expect(res.score).toBeLessThanOrEqual(100);
          expect(Number.isFinite(res.raw)).toBe(true);
          // NaN propagates through every clamp; +/-Infinity is clamped to a finite point value.
          const anyNaN = [c, t, k, g, l].some((v) => Number.isNaN(v));
          expect(res.nonFinite).toBe(anyNaN);
          if (res.nonFinite) {
            expect(res.score).toBeGreaterThanOrEqual(35);
            expect(scoreToLevel(res.score, true)).not.toBe("Safe");
          }
        }
      ),
      RUNS
    );
  });

  it("P24 unavailable GloTEC and Kp carry null metrics and no invented number", () => {
    // **Validates: Requirements FR-RE-16, FR-RE-17**
    fc.assert(
      fc.property(
        fc.constantFrom("null", "empty"),
        fc.boolean(),
        fc.boolean(),
        fc.double({ min: -90, max: 90, noNaN: true }),
        fc.double({ min: -180, max: 180, noNaN: true }),
        presetIdArb,
        (glotecMode, kpMissing, swMissing, lat, lon, presetId) => {
          const base = baseInput();
          const glotec = glotecMode === "null" ? null : { ...base.glotec!, cells: [] };
          expect(sampleGloTecAt(glotec, lat, lon)).toEqual({ status: "unavailable" });
          const r = assessFieldRisk(
            baseInput({
              presetId,
              glotec,
              kpIndex: kpMissing ? null : 4,
              solarWind: swMissing ? null : base.solarWind,
            })
          );
          expect(r.meanVtec).toBeNull();
          expect(r.maxL1DelayMeters).toBeNull();
          for (const s of r.satellites) {
            expect(s.vTec).toBeNull();
            expect(s.sTec).toBeNull();
            expect(s.l1DelayMeters).toBeNull();
            expect(s.anomaly).toBeNull();
          }
          const tec = r.topReasons.find((d) => d.code === "IONOSPHERE_TEC");
          if (tec) {
            expect(tec.metricValue).toBeNull();
            expect(tec.label).toContain("unavailable");
            expect(tec.label).not.toMatch(/\d/);
          }
          // With no solar wind, STALE_DATA, TEC and Kp are the top three by insertion order.
          if (swMissing) expect(tec).toBeDefined();
          if (kpMissing) {
            expect(r.kpIndex).toBeNull();
            const kp = r.topReasons.find((d) => d.code === "KP_GEOMAGNETIC");
            if (swMissing) expect(kp).toBeDefined();
            if (kp) {
              expect(kp.metricValue).toBeNull();
              expect(kp.label).toContain("unavailable");
              expect(kp.label).not.toMatch(/\d/);
            }
          }
          expect(r.level).not.toBe("Safe");
        }
      ),
      RUNS
    );
  });

  it("P25 STALE_DATA.metricValue is the max age of present stale feeds, else null, never 999", () => {
    // **Validates: Requirements FR-RE-18**
    const ageArb = fc.oneof(fc.integer({ min: 0, max: 998 }), invalidAgeArb);
    fc.assert(
      fc.property(
        fc.record({ solarWind: ageArb, glotec: ageArb, kp: ageArb, gnss: ageArb }),
        fc.record({ solarWind: fc.boolean(), glotec: fc.boolean(), kp: fc.boolean(), gnss: fc.boolean() }),
        (ages, present) => {
          const base = baseInput();
          const input = baseInput({
            solarWind: present.solarWind ? base.solarWind : null,
            glotec: present.glotec ? base.glotec : { ...base.glotec!, cells: [] },
            kpIndex: present.kp ? base.kpIndex : null,
            satellites: present.gnss ? base.satellites : [],
            feedAges: {
              solarWindAgeMin: ages.solarWind,
              glotecAgeMin: ages.glotec,
              kpAgeMin: ages.kp,
              gnssAgeMin: ages.gnss,
            },
          });
          const stale = listStaleFeeds(input);
          const r = assessFieldRisk(input);
          const reason = r.topReasons.find((d) => d.code === "STALE_DATA");
          if (stale.length === 0) {
            expect(reason).toBeUndefined();
            return;
          }
          expect(reason).toBeDefined();
          let expected: number | null = null;
          for (const f of stale) {
            const a = ages[f];
            if (present[f] && typeof a === "number" && Number.isFinite(a) && a >= 0) {
              expected = expected === null ? a : Math.max(expected, a);
            }
          }
          expect(reason!.metricValue).toBe(expected);
          expect(reason!.metricValue).not.toBe(999);
        }
      ),
      RUNS
    );
  });

  it("P26 empty satellites or empty GloTEC cells are stale and never Safe", () => {
    // **Validates: Requirements FR-RE-20**
    fc.assert(
      fc.property(presetIdArb, maskArb, fc.boolean(), fc.boolean(), (presetId, mask, emptySats, emptyCells) => {
        fc.pre(emptySats || emptyCells);
        const base = baseInput();
        const input = baseInput({
          presetId,
          elevationMaskDeg: mask,
          satellites: emptySats ? [] : base.satellites,
          glotec: emptyCells ? { ...base.glotec!, cells: [] } : base.glotec,
        });
        const stale = listStaleFeeds(input);
        const r = assessFieldRisk(input);
        const reason = r.topReasons.find((d) => d.code === "STALE_DATA");
        expect(reason).toBeDefined();
        if (emptySats) {
          expect(stale).toContain("gnss");
          expect(reason!.label).toContain("gnss");
        }
        if (emptyCells) {
          expect(stale).toContain("glotec");
          expect(reason!.label).toContain("glotec");
        }
        expect(r.isStale).toBe(true);
        expect(r.level).not.toBe("Safe");
      }),
      RUNS
    );
  });

  it("P26 zero visible satellites after the mask is never Safe and carries NO_VISIBLE_SATELLITES", () => {
    // **Validates: Requirements FR-RE-20**
    const caseArb = fc
      .tuple(presetIdArb, fc.oneof(fc.double({ min: 0, max: 90, noNaN: true }), fc.constant(90)))
      .chain(([presetId, mask]) => {
        const eff = resolvePreset(presetId, mask).preset.elevationMaskDeg;
        return fc.record({
          presetId: fc.constant(presetId),
          mask: fc.constant(mask),
          sats: fc.array(
            fc.record({
              el: fc.double({ min: -90, max: eff, maxExcluded: true, noNaN: true }),
              az: fc.double({ min: 0, max: 360, noNaN: true }),
            }),
            { minLength: 1, maxLength: 8 }
          ),
        });
      });
    fc.assert(
      fc.property(caseArb, ({ presetId, mask, sats }) => {
        const r = assessFieldRisk(
          baseInput({
            presetId,
            elevationMaskDeg: mask,
            satellites: sats.map((s, i) => sat(`B${i}`, s.el, s.az)),
          })
        );
        expect(r.visibleSatellites).toBe(0);
        expect(r.level).not.toBe("Safe");
        expect(r.score).toBeGreaterThanOrEqual(35);
        expect(r.topReasons.some((d) => d.code === "NO_VISIBLE_SATELLITES")).toBe(true);
      }),
      RUNS
    );
  });

  it("P27 age validity: invalid ages are stale, [0, max] is fresh, isAnyFeedStale delegates", () => {
    // **Validates: Requirements FR-RE-21**
    fc.assert(
      fc.property(fc.constantFrom(...FEEDS), invalidAgeArb, (feed, age) => {
        const max = MAX_FEED_AGE_MINUTES[feed];
        expect(isFreshAge(age, max)).toBe(false);
        const input = baseInput({ feedAges: { ...baseInput().feedAges, [AGE_KEY[feed]]: age } });
        expect(listStaleFeeds(input)).toEqual([feed]);
        expect(isAnyFeedStale(input)).toBe(true);
      }),
      RUNS
    );
    fc.assert(
      fc.property(
        fc.constantFrom(...FEEDS).chain((feed) =>
          fc.tuple(fc.constant(feed), fc.double({ min: 0, max: MAX_FEED_AGE_MINUTES[feed], noNaN: true }))
        ),
        ([feed, age]) => {
          expect(isFreshAge(age, MAX_FEED_AGE_MINUTES[feed])).toBe(true);
          const input = baseInput({ feedAges: { ...baseInput().feedAges, [AGE_KEY[feed]]: age } });
          expect(listStaleFeeds(input)).toEqual([]);
          expect(isAnyFeedStale(input)).toBe(false);
        }
      ),
      RUNS
    );
    const anyAge = fc.oneof(fc.double({ min: -100, max: 4000 }), invalidAgeArb);
    fc.assert(
      fc.property(
        fc.record({ solarWind: anyAge, glotec: anyAge, kp: anyAge, gnss: anyAge }),
        fc.boolean(),
        fc.boolean(),
        (ages, swNull, satsEmpty) => {
          const input = baseInput({
            solarWind: swNull ? null : baseInput().solarWind,
            satellites: satsEmpty ? [] : baseInput().satellites,
            feedAges: {
              solarWindAgeMin: ages.solarWind,
              glotecAgeMin: ages.glotec,
              kpAgeMin: ages.kp,
              gnssAgeMin: ages.gnss,
            },
          });
          expect(isAnyFeedStale(input)).toBe(listStaleFeeds(input).length > 0);
        }
      ),
      RUNS
    );
  });
});
