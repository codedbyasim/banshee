import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  assessFieldRisk,
  isLowLatPostSunsetWindow,
  parseStrictIsoInstant,
  validateReplay,
  type RiskAssessmentInput,
} from "../src/index.js";

// Replay properties P28-P29 (FR-RE-22, FR-RE-23). Fixed seed for reproducibility.
const RUNS = { seed: 20260221, numRuns: 100 };

const NOW_ISO = "2026-11-26T06:00:00Z";
const NOW_MS = Date.parse(NOW_ISO);
const MIN_ARCHIVE_MS = Date.parse("2003-01-01T00:00:00Z");

function baseInput(over: Partial<RiskAssessmentInput> = {}): RiskAssessmentInput {
  return {
    latDeg: 30.1575,
    lonDeg: 71.5249,
    timestampIso: NOW_ISO,
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
    satellites: [
      { id: "G01", name: "GPS 1", constellation: "GPS", elevationDeg: 60, azimuthDeg: 90 },
      { id: "G02", name: "GPS 2", constellation: "GPS", elevationDeg: 45, azimuthDeg: 200 },
    ],
    feedAges: { solarWindAgeMin: 2, glotecAgeMin: 5, kpAgeMin: 15, gnssAgeMin: 120 },
    ...over,
  };
}

const presetIdArb = fc.constantFrom("TRACTOR_RTK", "SURVEY_DRONE", "CUSTOM");
const archiveMsArb = fc.integer({ min: MIN_ARCHIVE_MS, max: NOW_MS });

/** Overrides that make a requested replay invalid in exactly one of the three FR-RE-22 ways. */
const invalidReplayArb: fc.Arbitrary<Partial<RiskAssessmentInput>> = fc.oneof(
  // Empty or missing label with a valid archive.
  fc.record({
    replayLabel: fc.constantFrom(undefined, "", "   ", "\t\n"),
    replayArchiveIso: archiveMsArb.map((ms) => new Date(ms).toISOString()),
  }),
  // Non-ISO archive strings.
  fc.record({
    replayLabel: fc.constant("Gannon Storm"),
    replayArchiveIso: fc.oneof(
      fc.string().filter((s) => parseStrictIsoInstant(s) === null),
      fc.constantFrom(
        undefined,
        "2024-02-31T00:00:00Z",
        "2024-05-10",
        "2024-05-10T18:00Z",
        "2024-05-10 18:00:00Z",
        "2024-13-01T00:00:00Z",
        "2024-05-10T24:00:00Z",
        "May 10 2024"
      )
    ),
  }),
  // Archive later than timestampIso.
  fc.record({
    replayLabel: fc.constant("Gannon Storm"),
    replayArchiveIso: fc
      .integer({ min: 1000, max: 365 * 24 * 3600 * 1000 })
      .map((d) => new Date(NOW_MS + d).toISOString()),
  })
) as fc.Arbitrary<Partial<RiskAssessmentInput>>;

describe("Replay properties P28-P29", () => {
  it("P28 invalid replay: never Safe, reason set, state unverified, stale", () => {
    // **Validates: Requirements FR-RE-22**
    fc.assert(
      fc.property(presetIdArb, invalidReplayArb, (presetId, over) => {
        const r = assessFieldRisk(baseInput({ presetId, isReplay: true, ...over }));
        expect(r.level).not.toBe("Safe");
        expect(r.isStale).toBe(true);
        expect(r.isReplay).toBe(true);
        expect(r.replayState).toBe("unverified");
        expect(typeof r.replayInvalidReason).toBe("string");
        expect((r.replayInvalidReason ?? "").length).toBeGreaterThan(0);
      }),
      RUNS
    );
  });

  it("P29 valid replay: age = archive - sample; post-sunset window uses archive time", () => {
    // **Validates: Requirements FR-RE-23**
    fc.assert(
      fc.property(
        archiveMsArb,
        fc.integer({ min: -30, max: 120 }),
        fc.integer({ min: -30, max: 120 }),
        fc.double({ min: -40, max: 40, noNaN: true }),
        fc.double({ min: -180, max: 179.999, noNaN: true }),
        (archiveMs, swOffsetMin, gtOffsetMin, latDeg, lonDeg) => {
          const archiveIso = new Date(archiveMs).toISOString();
          const base = baseInput();
          const input = baseInput({
            latDeg,
            lonDeg,
            isReplay: true,
            replayLabel: "Archive run",
            replayArchiveIso: archiveIso,
            solarWind: { ...base.solarWind!, timestampIso: new Date(archiveMs - swOffsetMin * 60000).toISOString() },
            glotec: { ...base.glotec!, timestampIso: new Date(archiveMs - gtOffsetMin * 60000).toISOString() },
          });
          const r = assessFieldRisk(input);
          expect(r.replayState).toBe("verified");
          expect(r.replayInvalidReason).toBeUndefined();
          expect(r.feeds?.solarWind.ageMin).toBe(swOffsetMin);
          expect(r.feeds?.glotec.ageMin).toBe(gtOffsetMin);
          // Feeds without sample timestamps keep the supplied age.
          expect(r.feeds?.kp.ageMin).toBe(15);
          expect(r.feeds?.gnss.ageMin).toBe(120);
          const expected = isLowLatPostSunsetWindow(latDeg, lonDeg, archiveIso);
          expect(r.lowLatPostSunsetActive).toBe(expected);
          const live = assessFieldRisk({ ...input, isReplay: false, timestampIso: archiveIso });
          expect(r.lowLatPostSunsetActive).toBe(live.lowLatPostSunsetActive);
        }
      ),
      RUNS
    );
  });
});

describe("Replay edge tests (FR-RE-22, FR-RE-23)", () => {
  const replay = (archive: string | undefined, over: Partial<RiskAssessmentInput> = {}) =>
    assessFieldRisk(baseInput({ isReplay: true, replayLabel: "Gannon", replayArchiveIso: archive, ...over }));

  it("rejects impossible calendar date 2024-02-31T00:00:00Z", () => {
    expect(parseStrictIsoInstant("2024-02-31T00:00:00Z")).toBeNull();
    const r = replay("2024-02-31T00:00:00Z");
    expect(r.replayState).toBe("unverified");
    expect(r.level).not.toBe("Safe");
    expect(r.replayArchiveIso).toBe("2024-02-31T00:00:00Z");
    expect(r.topReasons.some((d) => d.code === "REPLAY_UNVERIFIED")).toBe(true);
  });

  it("accepts leap day 2024-02-29T00:00:00Z", () => {
    expect(parseStrictIsoInstant("2024-02-29T00:00:00Z")).toBe(Date.parse("2024-02-29T00:00:00Z"));
    expect(parseStrictIsoInstant("2023-02-29T00:00:00Z")).toBeNull();
  });

  it("rejects date-only 2024-05-10", () => {
    expect(parseStrictIsoInstant("2024-05-10")).toBeNull();
    const r = replay("2024-05-10");
    expect(r.replayState).toBe("unverified");
    expect(r.isStale).toBe(true);
  });

  it("accepts numeric offset +05:00 and measures ages against the UTC instant", () => {
    const archive = "2024-05-10T23:00:00+05:00"; // 18:00Z
    expect(parseStrictIsoInstant(archive)).toBe(Date.parse("2024-05-10T18:00:00Z"));
    const base = baseInput();
    const r = replay(archive, {
      solarWind: { ...base.solarWind!, timestampIso: "2024-05-10T17:59:00Z" },
      glotec: { ...base.glotec!, timestampIso: "2024-05-10T18:00:00Z" },
    });
    expect(r.replayState).toBe("verified");
    expect(r.feeds?.solarWind.ageMin).toBe(1);
    expect(r.feeds?.glotec.ageMin).toBe(0);
  });

  it("archive equal to timestampIso is valid; one second later is not", () => {
    expect(validateReplay(baseInput({ isReplay: true, replayLabel: "x", replayArchiveIso: NOW_ISO })).valid).toBe(true);
    const later = validateReplay(
      baseInput({ isReplay: true, replayLabel: "x", replayArchiveIso: "2026-11-26T06:00:01Z" })
    );
    expect(later.valid).toBe(false);
    expect(later.state).toBe("unverified");
  });

  it("non-replay input has replayState none and no reason", () => {
    const r = assessFieldRisk(baseInput());
    expect(r.isReplay).toBe(false);
    expect(r.replayState).toBe("none");
    expect(r.replayInvalidReason).toBeUndefined();
  });
});
