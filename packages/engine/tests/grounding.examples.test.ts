import { describe, it, expect, expectTypeOf } from "vitest";
import {
  assessFieldRisk,
  buildGroundedEchoes,
  buildGroundedMap,
  explainAssessment,
  explainAssessmentVerified,
  normalizeText,
  verifyGroundedNumbers,
  type GroundedMap,
  type RiskAssessmentInput,
} from "../src/index.js";

// --- Task 22 edge tests: normalization and identifier handling (FR-RE-24, FR-RE-25) ---

describe("verifyGroundedNumbers normalization edges (FR-RE-24, FR-RE-25)", () => {
  const bzAllowed: GroundedMap = { bz: { value: 5, unit: "nT" } };

  it("rejects U+2212 minus '−5 nT' when the grounded Bz is +5", () => {
    // Minus-sign normalizes to '-', so cited -5 does not match +5.
    expect(verifyGroundedNumbers("Bz is \u22125 nT", bzAllowed).ok).toBe(false);
    // The ASCII positive form is grounded.
    expect(verifyGroundedNumbers("Bz is 5 nT", bzAllowed).ok).toBe(true);
  });

  it("accepts Arabic-Indic ٥, Persian ۵ and fullwidth ５ for a grounded 5 nT", () => {
    expect(verifyGroundedNumbers("Bz is \u0665 nT", bzAllowed).ok).toBe(true); // ٥
    expect(verifyGroundedNumbers("Bz is \u06f5 nT", bzAllowed).ok).toBe(true); // ۵
    expect(verifyGroundedNumbers("Bz is \uff15 nT", bzAllowed).ok).toBe(true); // ５
  });

  it("normalizeText maps unicode digits and signs to ASCII", () => {
    expect(normalizeText("\u0665\u06f6\uff17")).toBe("567");
    expect(normalizeText("\u2212\u2013\u2012\uFE63")).toBe("----");
  });

  it("treats 5-15 min and 10-minute hyphens as separators, not signs", () => {
    const allowed: GroundedMap = {
      a: { value: 5, unit: "min" },
      b: { value: 15, unit: "min" },
    };
    // "5-15 min": both 5 and 15 are read as positive; 15 carries the unit, 5 is unitless-adjacent.
    expect(verifyGroundedNumbers("window 5-15 min", allowed).ok).toBe(true);
    const ten: GroundedMap = { t: { value: 10, unit: "min" } };
    expect(verifyGroundedNumbers("a 10-minute gap", ten).ok).toBe(true);
  });

  it("accepts literal L1 and ignores G05, PRN 12, SGP4 digits", () => {
    const allowed: GroundedMap = { score: { value: 7, unit: "" } };
    const r = verifyGroundedNumbers("L1 band, PRN 12, G05, SGP4; score 7", allowed);
    expect(r.ok).toBe(true);
    expect(r.ungrounded).toEqual([]);
  });
});

// --- Task 23 edge tests: metric/unit binding and allowlist source (FR-RE-26, FR-RE-27) ---

describe("buildGroundedMap / binding edges (FR-RE-26, FR-RE-27)", () => {
  it("rejects 5 TECU cited as 5 min when only a TECU metric of 5 exists", () => {
    const allowed: GroundedMap = { tec: { value: 5, unit: "TECU" } };
    expect(verifyGroundedNumbers("value 5 TECU", allowed).ok).toBe(true);
    expect(verifyGroundedNumbers("value 5 min", allowed).ok).toBe(false);
  });

  it("applies displayed-precision tolerance: 12.3 matches 12.34, 12.4 does not", () => {
    const allowed: GroundedMap = { tec: { value: 12.34, unit: "TECU" } };
    expect(verifyGroundedNumbers("tec 12.3 TECU", allowed).ok).toBe(true);
    expect(verifyGroundedNumbers("tec 12.4 TECU", allowed).ok).toBe(false);
  });

  it("includes feeds.solarWind.ageMin in the allowlist", () => {
    const base: RiskAssessmentInput = {
      latDeg: 30,
      lonDeg: 71,
      timestampIso: "2026-11-26T14:00:00Z",
      presetId: "TRACTOR_RTK",
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
      satellites: [{ id: "G01", name: "GPS PRN 01", constellation: "GPS", elevationDeg: 55, azimuthDeg: 40 }],
      feedAges: { solarWindAgeMin: 7, glotecAgeMin: 5, kpAgeMin: 15, gnssAgeMin: 120 },
    };
    const a = assessFieldRisk(base);
    const map = buildGroundedMap(a);
    expect(map["ageMin.solarWind"]).toEqual({ value: 7, unit: "min" });
    // A sentence citing that age is grounded.
    expect(verifyGroundedNumbers("solar wind is 7 min old", map).ok).toBe(true);
  });

  it("never pulls numbers from replayLabel or replayArchiveIso into the allowlist", () => {
    const base: RiskAssessmentInput = {
      latDeg: 30,
      lonDeg: 71,
      timestampIso: "2024-05-10T18:00:00Z",
      presetId: "TRACTOR_RTK",
      solarWind: {
        timestampIso: "2024-05-10T17:59:00Z",
        speedKmS: 714,
        densityCm3: 28,
        btNt: 52,
        byNt: -18,
        bzNt: -47,
        source: "OMNI_ARCHIVE",
      },
      glotec: {
        timestampIso: "2024-05-10T17:58:00Z",
        latStepDeg: 2.5,
        lonStepDeg: 5,
        cells: [{ latDeg: 30, lonDeg: 70, vTec: 58, anomaly: 34 }],
      },
      kpIndex: 9,
      satellites: [{ id: "G01", name: "GPS PRN 01", constellation: "GPS", elevationDeg: 55, azimuthDeg: 40 }],
      feedAges: { solarWindAgeMin: 1, glotecAgeMin: 2, kpAgeMin: 10, gnssAgeMin: 60 },
      isReplay: true,
      replayLabel: "Storm 8888 special",
      replayArchiveIso: "2024-05-10T18:00:00Z",
    };
    const map = buildGroundedMap(assessFieldRisk(base));
    expect(Object.values(map).some((m) => m.value === 8888)).toBe(false);
  });
});

// --- Task 24 example tests: explainer wording (FR-RE-19, FR-RE-28..33) ---

function baseInput(over: Partial<RiskAssessmentInput> = {}): RiskAssessmentInput {
  return {
    latDeg: 30.1575,
    lonDeg: 71.5249,
    timestampIso: "2026-11-26T14:00:00Z",
    presetId: "TRACTOR_RTK",
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
    satellites: [
      { id: "G01", name: "GPS PRN 01", constellation: "GPS", elevationDeg: 55, azimuthDeg: 40 },
      { id: "G02", name: "GPS PRN 02", constellation: "GPS", elevationDeg: 25, azimuthDeg: 210 },
    ],
    feedAges: { solarWindAgeMin: 2, glotecAgeMin: 5, kpAgeMin: 15, gnssAgeMin: 120 },
    ...over,
  };
}

describe("explainAssessment wording (FR-RE-28..33)", () => {
  it("explainAssessment has no lang parameter (English-only, FR-RE-33)", () => {
    // Type-level: the function takes exactly one argument (the assessment).
    expectTypeOf(explainAssessment).parameters.toEqualTypeOf<[Parameters<typeof explainAssessment>[0]]>();
    expectTypeOf(explainAssessment).parameters.toMatchTypeOf<[unknown]>();
  });

  it("names a stale solar wind feed with its age and states not current (FR-RE-29)", () => {
    const a = assessFieldRisk(
      baseInput({ feedAges: { solarWindAgeMin: 90, glotecAgeMin: 5, kpAgeMin: 15, gnssAgeMin: 120 } })
    );
    const text = explainAssessment(a);
    expect(a.isStale).toBe(true);
    expect(text).toContain("solar wind 90 min");
    expect(text.toLowerCase()).toContain("not current");
  });

  it("includes the unknown preset reason text (FR-RE-31)", () => {
    const a = assessFieldRisk(baseInput({ presetId: "NOT_A_PRESET" }));
    const text = explainAssessment(a);
    expect(a.unknownPresetReason).toBeTruthy();
    expect(text).toContain(a.unknownPresetReason!);
    expect(text).toContain("TRACTOR_RTK");
  });

  it("includes the defaulted custom mask reason text (FR-RE-31)", () => {
    const a = assessFieldRisk(baseInput({ presetId: "CUSTOM", elevationMaskDeg: NaN }));
    const text = explainAssessment(a);
    expect(a.customMaskDefaultedReason).toBeTruthy();
    expect(text).toContain(a.customMaskDefaultedReason!);
  });

  it("describes the preset gain as a sensitivity multiplier (FR-RE-31)", () => {
    const a = assessFieldRisk(baseInput({ presetId: "SURVEY_DRONE" }));
    const text = explainAssessment(a);
    expect(text).toContain("sensitivity multiplier");
    expect(text).toContain("1.15");
  });

  it("renders a null metric as 'unavailable' (FR-RE-19)", () => {
    // Missing Kp and GloTEC -> unavailable metrics and null leadTime handled.
    const a = assessFieldRisk(baseInput({ glotec: null, kpIndex: null }));
    const text = explainAssessment(a);
    expect(a.meanVtec).toBeNull();
    expect(text).toContain("unavailable");
  });

  it("uses 'unverified archive' wording and the invalid reason for a bad replay (FR-RE-30)", () => {
    const a = assessFieldRisk(
      baseInput({
        isReplay: true,
        replayLabel: "",
        replayArchiveIso: "2026-11-26T13:00:00Z",
      })
    );
    const text = explainAssessment(a);
    expect(a.replayState).toBe("unverified");
    expect(text).toContain("REPLAY");
    expect(text.toLowerCase()).toContain("unverified archive");
    expect(text.toLowerCase()).not.toContain("live");
  });

  it("is self-grounded for SURVEY_DRONE (FR-RE-28)", () => {
    const a = assessFieldRisk(baseInput({ presetId: "SURVEY_DRONE" }));
    const check = verifyGroundedNumbers(explainAssessment(a), buildGroundedMap(a));
    expect(check.ok).toBe(true);
  });
});

// --- Task 24 follow-up: exact verbatim echoes (FR-RE-27, FR-RE-28, FR-RE-30, FR-RE-32) ---

describe("verbatim echo spans (FR-RE-27, FR-RE-28, FR-RE-30)", () => {
  const replay = (): ReturnType<typeof assessFieldRisk> =>
    assessFieldRisk(
      baseInput({
        isReplay: true,
        replayLabel: "Gannon May 2024",
        replayArchiveIso: "2024-05-10T12:00:00Z",
      })
    );

  it("a replay explanation with archive 2024-05-10T12:00:00Z and label 'Gannon May 2024' is grounded", () => {
    const a = replay();
    expect(a.replayState).toBe("verified");
    const v = explainAssessmentVerified(a);
    expect(v.text).toContain("Gannon May 2024");
    expect(v.text).toContain("2024-05-10T12:00:00Z");
    expect(v.ungrounded).toEqual([]);
    expect(v.grounded).toBe(true);
    // Without the echo list the label and timestamp digits are ungrounded.
    expect(verifyGroundedNumbers(v.text, buildGroundedMap(a)).ok).toBe(false);
    // The echo digits never enter the numeric allowlist.
    expect(Object.values(buildGroundedMap(a)).some((m) => m.value === 2024)).toBe(false);
  });

  it("rejects '2024 km/s' and '10 min' that only appear inside the label or timestamp", () => {
    const a = replay();
    const map = buildGroundedMap(a);
    const verbatim = buildGroundedEchoes(a);
    const base = explainAssessment(a);
    expect(verifyGroundedNumbers(base, map, { verbatim }).ok).toBe(true);
    const speed = verifyGroundedNumbers(`${base} Wind peaked at 2024 km/s.`, map, { verbatim });
    expect(speed.ok).toBe(false);
    expect(speed.ungrounded).toContain(2024);
    const lead = verifyGroundedNumbers(`${base} Expect a 10 min gap.`, map, { verbatim });
    expect(lead.ok).toBe(false);
    expect(lead.ungrounded).toContain(10);
  });

  it("does not blank an echoed string with one digit changed", () => {
    const a = replay();
    const map = buildGroundedMap(a);
    const verbatim = buildGroundedEchoes(a);
    const text = explainAssessment(a);
    const labelTampered = text.replace("Gannon May 2024", "Gannon May 2034");
    expect(labelTampered).not.toBe(text);
    const r1 = verifyGroundedNumbers(labelTampered, map, { verbatim });
    expect(r1.ok).toBe(false);
    expect(r1.ungrounded).toContain(2034);
    const isoTampered = text.replace("2024-05-10T12:00:00Z", "2024-05-10T13:00:00Z");
    expect(isoTampered).not.toBe(text);
    const r2 = verifyGroundedNumbers(isoTampered, map, { verbatim });
    expect(r2.ok).toBe(false);
  });

  it("grounds an unknown preset id containing digits (X99)", () => {
    const a = assessFieldRisk(baseInput({ presetId: "X99" }));
    const v = explainAssessmentVerified(a);
    expect(v.text).toContain('"X99"');
    expect(v.grounded).toBe(true);
  });
});
