import { describe, it, expect } from "vitest";
import {
  assessFieldRisk,
  combineRiskDriversDetailed,
  isAnyFeedStale,
  isFreshAge,
  listStaleFeeds,
  MAX_FEED_AGE_MINUTES,
  sampleGloTecAt,
  sanitizeInput,
  scoreToLevel,
  type RiskAssessmentInput,
  type SatelliteObservation,
} from "../src/index.js";

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

const reason = (r: ReturnType<typeof assessFieldRisk>, code: string) =>
  r.topReasons.find((d) => d.code === code);

describe("Task 16: input sanitization edge cases (FR-RE-14)", () => {
  it("fresh baseline is Safe with no INVALID_INPUT", () => {
    const r = assessFieldRisk(baseInput());
    expect(r.level).toBe("Safe");
    expect(r.invalidInput).toBeUndefined();
  });

  it.each([
    ["NaN lat", { latDeg: Number.NaN }, ["latDeg"]],
    ["Infinity lon", { lonDeg: Infinity }, ["lonDeg"]],
    ['"not-a-date" timestamp', { timestampIso: "not-a-date" }, ["timestampIso"]],
  ] as const)("%s is never Safe and names the field", (_name, over, fields) => {
    const r = assessFieldRisk(baseInput(over));
    expect(r.level).not.toBe("Safe");
    expect(r.isStale).toBe(true);
    expect(r.invalidInput).toEqual(fields);
    expect(reason(r, "INVALID_INPUT")?.label).toContain(fields[0]);
    expect(Number.isInteger(r.score)).toBe(true);
  });

  it("drops satellites with NaN elevation or NaN azimuth", () => {
    const input = baseInput({
      satellites: [sat("OK", 50, 10), sat("BADEL", Number.NaN, 10), sat("BADAZ", 50, Number.NaN)],
    });
    const s = sanitizeInput(input);
    expect(s.droppedSatellites).toBe(2);
    expect(s.clean.satellites.map((x) => x.id)).toEqual(["OK"]);
    const r = assessFieldRisk(input);
    expect(r.satellites.map((x) => x.id)).toEqual(["OK"]);
    expect(r.visibleSatellites).toBe(1);
  });
});

describe("Task 17: non-finite score guard (FR-RE-15)", () => {
  it("scoreToLevel maps NaN, Infinity and -Infinity to Uneasy", () => {
    for (const s of [Number.NaN, Infinity, -Infinity]) {
      expect(scoreToLevel(s, false)).toBe("Uneasy");
      expect(scoreToLevel(s, true)).toBe("Uneasy");
    }
    expect(scoreToLevel(34, false)).toBe("Safe");
    expect(scoreToLevel(34.5, false)).toBe("Uneasy");
  });

  it("NaN contributions become 0, flag nonFinite and apply the stale floor", () => {
    const base = { newellCoupling: 0, tecAnomalyTecu: 0, kpIndex: 0, ghostFraction: 0, lowLatPostSunsetFactor: 0, isStale: false };
    const res = combineRiskDriversDetailed({ ...base, kpIndex: Number.NaN });
    expect(res).toEqual({ score: 35, raw: 0, nonFinite: true });
    const inf = combineRiskDriversDetailed({ ...base, newellCoupling: Infinity, kpIndex: -Infinity });
    expect(inf.nonFinite).toBe(false);
    expect(inf.score).toBe(35); // coupling clamps to its 35-point cap
    expect(combineRiskDriversDetailed(base)).toEqual({ score: 0, raw: 0, nonFinite: false });
  });
});

describe("Task 18: feed age validity and empty feeds (FR-RE-20, FR-RE-21)", () => {
  it("ages -1, NaN and null are stale; 0 and exactly max are fresh", () => {
    for (const age of [-1, Number.NaN, null]) {
      expect(isFreshAge(age, 30)).toBe(false);
      expect(listStaleFeeds(baseInput({ feedAges: { ...baseInput().feedAges, solarWindAgeMin: age } }))).toEqual([
        "solarWind",
      ]);
    }
    expect(isFreshAge(0, 30)).toBe(true);
    expect(isFreshAge(MAX_FEED_AGE_MINUTES.solarWind, MAX_FEED_AGE_MINUTES.solarWind)).toBe(true);
    const fresh0 = baseInput({ feedAges: { solarWindAgeMin: 0, glotecAgeMin: 0, kpAgeMin: 0, gnssAgeMin: 0 } });
    expect(isAnyFeedStale(fresh0)).toBe(false);
  });

  it("empty satellites makes gnss stale; empty glotec.cells makes glotec stale", () => {
    const noSats = assessFieldRisk(baseInput({ satellites: [] }));
    expect(listStaleFeeds(baseInput({ satellites: [] }))).toEqual(["gnss"]);
    expect(noSats.level).not.toBe("Safe");
    expect(reason(noSats, "STALE_DATA")?.label).toContain("gnss");

    const emptyGrid = baseInput({ glotec: { ...baseInput().glotec!, cells: [] } });
    expect(listStaleFeeds(emptyGrid)).toEqual(["glotec"]);
    const r = assessFieldRisk(emptyGrid);
    expect(r.level).not.toBe("Safe");
    expect(reason(r, "STALE_DATA")?.label).toContain("glotec");
  });
});

describe("Task 19: zero visible satellites (FR-RE-20)", () => {
  it("all satellites below the mask yields NO_VISIBLE_SATELLITES and at least Uneasy", () => {
    const r = assessFieldRisk(baseInput({ satellites: [sat("LOW", 5, 0), sat("NEG", -3, 90)] }));
    expect(r.visibleSatellites).toBe(0);
    expect(r.level).not.toBe("Safe");
    expect(reason(r, "NO_VISIBLE_SATELLITES")?.label).toContain("No satellites are visible");
  });

  it("a single satellite exactly at the mask elevation is visible", () => {
    const r = assessFieldRisk(baseInput({ presetId: "TRACTOR_RTK", satellites: [sat("EDGE", 15, 120)] }));
    expect(r.visibleSatellites).toBe(1);
    expect(reason(r, "NO_VISIBLE_SATELLITES")).toBeUndefined();
    const custom = assessFieldRisk(
      baseInput({ presetId: "CUSTOM", elevationMaskDeg: 90, satellites: [sat("ZEN", 90, 0)] })
    );
    expect(custom.visibleSatellites).toBe(1);
    expect(reason(custom, "NO_VISIBLE_SATELLITES")).toBeUndefined();
  });
});

describe("Task 20: unavailable data instead of invented numbers (FR-RE-16..19)", () => {
  it("GloTEC sampler returns unavailable for null or empty grids (no 15 TECU)", () => {
    expect(sampleGloTecAt(null, 30, 70)).toEqual({ status: "unavailable" });
    expect(sampleGloTecAt({ timestampIso: "", latStepDeg: 2.5, lonStepDeg: 5, cells: [] }, 30, 70)).toEqual({
      status: "unavailable",
    });
    const r = assessFieldRisk(baseInput({ glotec: null, solarWind: null }));
    const tec = reason(r, "IONOSPHERE_TEC");
    expect(tec?.metricValue).toBeNull();
    expect(tec?.label).toContain("Regional ionosphere estimate unavailable");
    expect(r.meanVtec).toBeNull();
    expect(r.satellites.every((s) => s.vTec === null)).toBe(true);
    expect(JSON.stringify(r)).not.toContain("15 TECU");
  });

  it("missing Kp yields an unavailable Kp driver, never Kp 0.0", () => {
    const r = assessFieldRisk(baseInput({ kpIndex: null, solarWind: null }));
    const kp = reason(r, "KP_GEOMAGNETIC");
    expect(kp?.metricValue).toBeNull();
    expect(kp?.label).toBe("Kp unavailable (feed missing).");
    expect(r.topReasons.some((d) => d.label.includes("Kp index is 0.0"))).toBe(false);
    expect(r.kpIndex).toBeNull();
  });

  it("STALE_DATA.metricValue is the max present stale age, null when all stale feeds are absent", () => {
    const old = assessFieldRisk(
      baseInput({ feedAges: { solarWindAgeMin: 40, glotecAgeMin: 60, kpAgeMin: 15, gnssAgeMin: 120 } })
    );
    expect(reason(old, "STALE_DATA")?.metricValue).toBe(60);

    const absent = assessFieldRisk(
      baseInput({
        solarWind: null,
        glotec: null,
        feedAges: { solarWindAgeMin: null, glotecAgeMin: null, kpAgeMin: 15, gnssAgeMin: 120 },
      })
    );
    const s = reason(absent, "STALE_DATA");
    expect(s?.metricValue).toBeNull();
    expect(s?.metricValue).not.toBe(999);
  });
});
