import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  projectForecastHours,
  listStaleFeeds,
  MAX_FEED_AGE_MINUTES,
  type FeedName,
  type ForecastInput,
  type GnssOmmElement,
} from "../src/index.js";
import { propagateGnssElements } from "../src/orbits.js";

const RUNS = { seed: 20260102, numRuns: 100 };
const BASE_ISO = "2024-05-09T18:00:00Z";
const LAT = 30.1575;
const LON = 71.5249;

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

const ELEMENTS: GnssOmmElement[] = Array.from({ length: 8 }, (_, i) => ({
  ...GPS_OMM,
  OBJECT_NAME: `GPS BIIR-${i} (PRN ${i + 1})`,
  NORAD_CAT_ID: 24876 + i,
  RA_OF_ASC_NODE: (158.2914 + i * 45) % 360,
  MEAN_ANOMALY: (308.1234 + i * 77) % 360,
}));

const FEED_KEY = {
  solarWind: "solarWindAgeMin",
  glotec: "glotecAgeMin",
  kp: "kpAgeMin",
  gnss: "gnssAgeMin",
} as const;

function baseInput(ages: ForecastInput["feedAges"]): ForecastInput {
  return {
    latDeg: LAT,
    lonDeg: LON,
    baseTimestampIso: BASE_ISO,
    presetId: "TRACTOR_RTK",
    solarWind: {
      timestampIso: "2024-05-09T17:58:00Z",
      speedKmS: 450,
      densityCm3: 5,
      btNt: 6,
      byNt: 1,
      bzNt: -3,
      source: "SOLAR-1",
    },
    glotec: {
      timestampIso: "2024-05-09T17:50:00Z",
      latStepDeg: 2.5,
      lonStepDeg: 5,
      cells: [{ latDeg: 30, lonDeg: 70, vTec: 20, anomaly: 1 }],
    },
    kpIndex: 2,
    gnssElements: ELEMENTS,
    feedAges: ages,
  };
}

describe("forecast aging PBT", () => {
  // Feature: mission-planner-ui, Property 7: A feed aging past its limit by a given hour marks exactly that hour Stale.
  // **Validates: Requirements 4.9, 10.5**
  it("Property 7: a feed crossing its max age at hour h is stale at h and fresh before h", () => {
    const feeds: FeedName[] = ["solarWind", "glotec", "kp", "gnss"];
    fc.assert(
      fc.property(
        fc.constantFrom(...feeds),
        fc.integer({ min: 1, max: 11 }),
        fc.integer({ min: 0, max: 59 }),
        (feed, h, j) => {
          const max = MAX_FEED_AGE_MINUTES[feed];
          // Age at +(h-1)h is max - j (fresh); at +h it is max - j + 60 (> max, stale).
          const age = max - 60 * (h - 1) - j;
          fc.pre(age >= 0);

          const ages = { solarWindAgeMin: 0, glotecAgeMin: 0, kpAgeMin: 0, gnssAgeMin: 0 };
          ages[FEED_KEY[feed]] = age;
          const input = baseInput(ages);
          const result = projectForecastHours(input);
          expect(result.hours).toHaveLength(12);

          // Staleness of the chosen feed as the engine itself sees it at each hour.
          const staleFeedsAt = (k: number): FeedName[] => {
            const hour = result.hours[k]!;
            const satellites = propagateGnssElements(ELEMENTS, LAT, LON, hour.timestampIso).satellites;
            return listStaleFeeds({
              latDeg: LAT,
              lonDeg: LON,
              timestampIso: hour.timestampIso,
              solarWind: input.solarWind,
              glotec: input.glotec,
              kpIndex: input.kpIndex,
              satellites,
              feedAges: {
                solarWindAgeMin: ages.solarWindAgeMin + 60 * k,
                glotecAgeMin: ages.glotecAgeMin + 60 * k,
                kpAgeMin: ages.kpAgeMin + 60 * k,
                gnssAgeMin: ages.gnssAgeMin + 60 * k,
              },
            });
          };

          for (let k = 0; k < h; k++) {
            expect(staleFeedsAt(k)).not.toContain(feed);
          }
          expect(staleFeedsAt(h)).toContain(feed);

          const atH = result.hours[h]!.assessment;
          expect(atH.isStale).toBe(true);
          expect(atH.level).not.toBe("Safe");
          expect(atH.feeds[feed].ageMin).toBe(age + 60 * h);
        }
      ),
      RUNS
    );
  });
});
