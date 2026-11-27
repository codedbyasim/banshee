import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  degreesToRadians,
  ecfToLookAngles,
  eciToEcf,
  gstime,
  propagate,
  radiansToDegrees,
  twoline2satrec,
} from "satellite.js";
import { constellationFromObjectName, propagateGnssElements } from "../src/orbits.js";
import type { GnssOmmElement } from "../src/types.js";

/**
 * GPS-like MEO elements written once as a TLE and once as the equivalent CelesTrak OMM
 * record. The TLE epoch 24130.50000000 is 2024-05-09T12:00:00Z (2024 is a leap year).
 * CelesTrak is unreachable from the dev machine, so these are representative elements,
 * not a downloaded element set; the test checks json2satrec/twoline2satrec consistency.
 */
const GPS_TLE_1 = "1 24876U 97035A   24130.50000000  .00000045  00000-0  00000+0 0  9998";
const GPS_TLE_2 = "2 24876  55.6573 158.2914 0091234  52.7342 308.1234  2.00563178195432";

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

function omm(overrides: Partial<GnssOmmElement>): GnssOmmElement {
  return { ...GPS_OMM, ...overrides };
}

const FIXTURE: GnssOmmElement[] = [
  GPS_OMM,
  omm({ OBJECT_NAME: "GSAT0101 (GALILEO-PFM)", NORAD_CAT_ID: 37846, MEAN_MOTION: 1.70475, INCLINATION: 56.1, RA_OF_ASC_NODE: 20.4, MEAN_ANOMALY: 10 }),
  omm({ OBJECT_NAME: "COSMOS 2433 (720)", NORAD_CAT_ID: 32275, MEAN_MOTION: 2.13102, INCLINATION: 64.8, RA_OF_ASC_NODE: 250, MEAN_ANOMALY: 120 }),
  omm({ OBJECT_NAME: "BEIDOU-3 M1 (C19)", NORAD_CAT_ID: 43001, MEAN_MOTION: 1.86231, INCLINATION: 55.2, RA_OF_ASC_NODE: 300, MEAN_ANOMALY: 200 }),
];

const EPOCH_MS = Date.parse("2024-05-09T12:00:00Z");
const AT = "2024-05-09T18:30:00Z";

describe("constellationFromObjectName", () => {
  it("maps CelesTrak GNSS names and rejects other systems", () => {
    expect(constellationFromObjectName("GPS BIIR-2  (PRN 13)")).toBe("GPS");
    expect(constellationFromObjectName("GSAT0101 (GALILEO-PFM)")).toBe("GALILEO");
    expect(constellationFromObjectName("COSMOS 2433 (720)")).toBe("GLONASS");
    expect(constellationFromObjectName("BEIDOU-3 M1 (C19)")).toBe("BEIDOU");
    expect(constellationFromObjectName("QZS-2 (QZSS/PRN 184)")).toBeNull();
    expect(constellationFromObjectName("IRNSS-1B")).toBeNull();
  });
});

describe("propagateGnssElements", () => {
  it("json2satrec path matches twoline2satrec for the same elements within 1e-6 deg", () => {
    const lat = 30.1575;
    const lon = 71.5249;
    const res = propagateGnssElements([GPS_OMM], lat, lon, AT);
    expect(res.skipped).toBe(0);
    expect(res.satellites).toHaveLength(1);

    const date = new Date(Date.parse(AT));
    const satrec = twoline2satrec(GPS_TLE_1, GPS_TLE_2);
    const pv = propagate(satrec, date);
    if (!pv) throw new Error("TLE propagation failed");
    const look = ecfToLookAngles(
      { latitude: degreesToRadians(lat), longitude: degreesToRadians(lon), height: 0 },
      eciToEcf(pv.position, gstime(date))
    );
    const sat = res.satellites[0]!;
    expect(Math.abs(sat.elevationDeg - radiansToDegrees(look.elevation))).toBeLessThan(1e-6);
    const az = ((radiansToDegrees(look.azimuth) % 360) + 360) % 360;
    expect(Math.abs(sat.azimuthDeg - az)).toBeLessThan(1e-6);
    expect(sat.id).toBe("24876");
    expect(sat.name).toBe("GPS BIIR-2  (PRN 13)");
    expect(sat.constellation).toBe("GPS");
  });

  it("returns all four systems with in-range look angles, including below-horizon satellites", () => {
    const res = propagateGnssElements(FIXTURE, 30.1575, 71.5249, AT);
    expect(res.skipped).toBe(0);
    expect(res.satellites.map((s) => s.constellation).sort()).toEqual(["BEIDOU", "GALILEO", "GLONASS", "GPS"]);
    for (const s of res.satellites) {
      expect(s.elevationDeg).toBeGreaterThanOrEqual(-90);
      expect(s.elevationDeg).toBeLessThanOrEqual(90);
      expect(s.azimuthDeg).toBeGreaterThanOrEqual(0);
      expect(s.azimuthDeg).toBeLessThan(360);
    }
  });

  it("skips and counts unsupported systems and bad elements", () => {
    const bad = [
      ...FIXTURE,
      omm({ OBJECT_NAME: "QZS-2 (QZSS/PRN 184)", NORAD_CAT_ID: 42738, MEAN_MOTION: 1.0027 }),
      omm({ OBJECT_NAME: "GPS BIIF-1  (PRN 25)", MEAN_MOTION: Number.NaN }),
      omm({ OBJECT_NAME: "GPS BIIF-2  (PRN 01)", ECCENTRICITY: 1.5 }),
      omm({ OBJECT_NAME: "GPS BIIF-3  (PRN 24)", EPOCH: "not-a-date" }),
      null as unknown as GnssOmmElement,
      { OBJECT_NAME: "GPS III" } as unknown as GnssOmmElement,
    ];
    const res = propagateGnssElements(bad, 30.1575, 71.5249, AT);
    expect(res.satellites).toHaveLength(4);
    expect(res.skipped).toBe(bad.length - 4);
  });

  it("invalid timestamp or observer gives an empty result with every element skipped", () => {
    expect(propagateGnssElements(FIXTURE, 30, 71, "not-a-time")).toEqual({ satellites: [], skipped: 4 });
    expect(propagateGnssElements(FIXTURE, 95, 71, AT)).toEqual({ satellites: [], skipped: 4 });
    expect(propagateGnssElements(FIXTURE, 30, Number.NaN, AT)).toEqual({ satellites: [], skipped: 4 });
  });

  it("PBT: random observers within +/-3 days of epoch give finite in-range look angles and never throw", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -90, max: 90, noNaN: true }),
        fc.double({ min: -180, max: 180, noNaN: true }),
        fc.integer({ min: -3 * 86_400_000, max: 3 * 86_400_000 }),
        (lat, lon, offsetMs) => {
          const iso = new Date(EPOCH_MS + offsetMs).toISOString();
          const res = propagateGnssElements(FIXTURE, lat, lon, iso);
          expect(res.satellites.length + res.skipped).toBe(FIXTURE.length);
          for (const s of res.satellites) {
            expect(Number.isFinite(s.elevationDeg)).toBe(true);
            expect(Number.isFinite(s.azimuthDeg)).toBe(true);
            expect(s.elevationDeg).toBeGreaterThanOrEqual(-90);
            expect(s.elevationDeg).toBeLessThanOrEqual(90);
            expect(s.azimuthDeg).toBeGreaterThanOrEqual(0);
            expect(s.azimuthDeg).toBeLessThan(360);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
