import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  assessFieldRisk,
  projectForecastHours,
  type FeedAgesMinutes,
  type ForecastInput,
  type GnssOmmElement,
} from "../src/index.js";
import { propagateGnssElements } from "../src/orbits.js";

const RUNS = { seed: 20260101, numRuns: 100 };

const GPS_OMM: GnssOmmElement = {
  OBJECT_NAME: "GPS BIIR-2  (PRN 13)",
  OBJECT_ID: "1997-035A",
  EPOCH: "2024-05-09T12:00:00.000000",
  MEAN_MOTION: 2.00563178,
  ECCENTRICITY: 0.0091234,
  INCLINATION: 55.6573,
  RA_OF_ASC_NODE: 158.2914,
  ARG_OF_PERICENTER: 52.7342,
  MEAN_ANOMALY: 308.1234,
  EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE: "U",
  NORAD_CAT_ID: 24876,
  ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 19543,
  BSTAR: 0,
  MEAN_MOTION_DOT: 4.5e-7,
  MEAN_MOTION_DDOT: 0,
};
const ELEMENTS: GnssOmmElement[] = [
  GPS_OMM,
  { ...GPS_OMM, OBJECT_NAME: "GSAT0101 (GALILEO-PFM)", NORAD_CAT_ID: 37846, MEAN_MOTION: 1.70475, INCLINATION: 56.1, RA_OF_ASC_NODE: 20.4, MEAN_ANOMALY: 10 },
  { ...GPS_OMM, OBJECT_NAME: "COSMOS 2433 (720)", NORAD_CAT_ID: 32275, MEAN_MOTION: 2.13102, INCLINATION: 64.8, RA_OF_ASC_NODE: 250, MEAN_ANOMALY: 120 },
  { ...GPS_OMM, OBJECT_NAME: "BEIDOU-3 M1 (C19)", NORAD_CAT_ID: 43001, MEAN_MOTION: 1.86231, INCLINATION: 55.2, RA_OF_ASC_NODE: 300, MEAN_ANOMALY: 200 },
];

const BASE_MS = Date.parse("2024-05-09T12:00:00Z");

const freshAgesArb: fc.Arbitrary<FeedAgesMinutes> = fc.record({
  solarWindAgeMin: fc.integer({ min: 0, max: 30 }),
  glotecAgeMin: fc.integer({ min: 0, max: 45 }),
  kpAgeMin: fc.integer({ min: 0, max: 180 }),
  gnssAgeMin: fc.integer({ min: 0, max: 2880 }),
});

/** Ages where exactly one feed is missing or beyond its limit at +0h. */
const staleAgesArb: fc.Arbitrary<FeedAgesMinutes> = fc
  .tuple(
    freshAgesArb,
    fc.constantFrom("solarWindAgeMin", "glotecAgeMin", "kpAgeMin", "gnssAgeMin" as const),
    fc.constantFrom("null", "old")
  )
  .map(([ages, key, mode]) => {
    const limits = { solarWindAgeMin: 30, glotecAgeMin: 45, kpAgeMin: 180, gnssAgeMin: 2880 };
    const k = key as keyof FeedAgesMinutes;
    return { ...ages, [k]: mode === "null" ? null : limits[k] + 1 };
  });

const inputArb = (ages: fc.Arbitrary<FeedAgesMinutes>): fc.Arbitrary<ForecastInput> =>
  fc.record({
    latDeg: fc.double({ min: -85, max: 85, noNaN: true }),
    lonDeg: fc.double({ min: -540, max: 540, noNaN: true }),
    baseTimestampIso: fc.integer({ min: 0, max: 5 * 86_400_000 }).map((o) => new Date(BASE_MS + o).toISOString()),
    presetId: fc.constantFrom("TRACTOR_RTK", "SURVEY_DRONE"),
    solarWind: fc.record({
      timestampIso: fc.constant("2024-05-09T11:58:00Z"),
      speedKmS: fc.double({ min: 250, max: 1500, noNaN: true }),
      densityCm3: fc.double({ min: 0.1, max: 50, noNaN: true }),
      btNt: fc.double({ min: 0, max: 60, noNaN: true }),
      byNt: fc.double({ min: -30, max: 30, noNaN: true }),
      bzNt: fc.double({ min: -50, max: 30, noNaN: true }),
      source: fc.constant("SOLAR-1" as const),
    }),
    glotec: fc.constant({
      timestampIso: "2024-05-09T11:55:00Z",
      latStepDeg: 2.5,
      lonStepDeg: 5,
      cells: [{ latDeg: 30, lonDeg: 70, vTec: 24, anomaly: 6 }],
    }),
    kpIndex: fc.double({ min: 0, max: 9, noNaN: true }),
    gnssElements: fc.constant(ELEMENTS),
    feedAges: ages,
  });

describe("projectForecastHours PBT", () => {
  // Feature: mission-planner-ui, Property 6: Hourly projection always returns 12
  // engine-produced assessments, and base staleness floors every hour.
  // **Validates: Requirements 4.1, 4.2, 4.8, 10.5**
  it("Property 6: 12 engine-produced hours (fresh base)", () => {
    fc.assert(
      fc.property(inputArb(freshAgesArb), (input) => {
        const res = projectForecastHours(input);
        expect(res.hours).toHaveLength(12);
        res.hours.forEach((h, i) => {
          expect(h.hourOffset).toBe(i);
          expect(h.timestampIso).toBe(new Date(Date.parse(input.baseTimestampIso) + i * 3_600_000).toISOString());
          expect(h.postSunsetActive).toBe(h.assessment.lowLatPostSunsetActive);
          expect(Number.isInteger(h.assessment.score)).toBe(true);
          expect(h.assessment.score).toBeGreaterThanOrEqual(0);
          expect(h.assessment.score).toBeLessThanOrEqual(100);

          // Exactly what the engine produces for that hour's own input.
          const minutes = i * 60;
          const expected = assessFieldRisk({
            latDeg: input.latDeg,
            lonDeg: input.lonDeg,
            timestampIso: h.timestampIso,
            presetId: input.presetId,
            solarWind: input.solarWind,
            glotec: input.glotec,
            kpIndex: input.kpIndex,
            satellites: propagateGnssElements(ELEMENTS, input.latDeg, ((((input.lonDeg + 180) % 360) + 360) % 360) - 180, h.timestampIso).satellites,
            feedAges: {
              solarWindAgeMin: input.feedAges.solarWindAgeMin! + minutes,
              glotecAgeMin: input.feedAges.glotecAgeMin! + minutes,
              kpAgeMin: input.feedAges.kpAgeMin! + minutes,
              gnssAgeMin: input.feedAges.gnssAgeMin! + minutes,
            },
          });
          expect(h.assessment.score).toBe(expected.score);
          expect(h.assessment.level).toBe(expected.level);
          expect(h.assessment.isStale).toBe(expected.isStale);
        });
      }),
      RUNS
    );
  });

  it("Property 6: stale base feed floors every hour above Safe", () => {
    fc.assert(
      fc.property(inputArb(staleAgesArb), (input) => {
        const res = projectForecastHours(input);
        expect(res.hours).toHaveLength(12);
        for (const h of res.hours) {
          expect(h.assessment.isStale).toBe(true);
          expect(h.assessment.level).not.toBe("Safe");
        }
        expect(res.bestSafeWindow).toBeNull();
      }),
      RUNS
    );
  });
});
