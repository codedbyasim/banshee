import { describe, it, expect } from "vitest";
import {
  SENSITIVITY_PRESETS,
  resolvePreset,
  assessFieldRisk,
  computeL1LeadTimeMinutes,
  computeSlantFactor,
  isLowLatPostSunsetWindow,
  listStaleFeeds,
  MAX_FEED_AGE_MINUTES,
  type RiskAssessmentInput,
} from "../src/index.js";

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
    glotec: { timestampIso: "2026-11-26T05:55:00Z", latStepDeg: 2.5, lonStepDeg: 5, cells: [{ latDeg: 30, lonDeg: 70, vTec: 10, anomaly: 1 }] },
    kpIndex: 1,
    // FR-RE-20: an empty satellites array means the gnss feed is stale, so the fresh baseline has one.
    satellites: [{ id: "G01", name: "GPS 1", constellation: "GPS", elevationDeg: 60, azimuthDeg: 90 }],
    feedAges: { solarWindAgeMin: 2, glotecAgeMin: 5, kpAgeMin: 15, gnssAgeMin: 120 },
    ...over,
  };
}

describe("Risk engine example tests", () => {
  it("preset table is valid", () => {
    expect(SENSITIVITY_PRESETS.CUSTOM.gain).toBe(1);
    expect(SENSITIVITY_PRESETS.CUSTOM.elevationMaskDeg).toBe(15);
    for (const p of Object.values(SENSITIVITY_PRESETS)) {
      expect(p.elevationMaskDeg).toBeGreaterThanOrEqual(0);
      expect(p.elevationMaskDeg).toBeLessThanOrEqual(90);
      expect(p.gain).toBeGreaterThanOrEqual(1);
      expect(p.gain).toBeLessThanOrEqual(1.5);
    }
  });

  it("CUSTOM mask examples", () => {
    expect(resolvePreset("CUSTOM", 5).preset.elevationMaskDeg).toBe(5);
    expect(resolvePreset("CUSTOM", 120).preset.elevationMaskDeg).toBe(90);
    expect(resolvePreset("CUSTOM", -10).preset.elevationMaskDeg).toBe(0);
    const nan = resolvePreset("CUSTOM", NaN);
    expect(nan.preset.elevationMaskDeg).toBe(15);
    expect(nan.customMaskDefaulted).toBe(true);
    const r = assessFieldRisk(baseInput({ presetId: "CUSTOM", elevationMaskDeg: NaN }));
    expect(r.customMaskDefaultedReason).toBeTruthy();
    expect(Object.isFrozen(SENSITIVITY_PRESETS)).toBe(true);
    expect(SENSITIVITY_PRESETS.CUSTOM.elevationMaskDeg).toBe(15);
  });

  it("staleness boundary: max age is fresh, max+1 is stale, per feed", () => {
    const keys = {
      solarWind: "solarWindAgeMin",
      glotec: "glotecAgeMin",
      kp: "kpAgeMin",
      gnss: "gnssAgeMin",
    } as const;
    for (const feed of Object.keys(keys) as (keyof typeof keys)[]) {
      const max = MAX_FEED_AGE_MINUTES[feed];
      const fresh = { solarWindAgeMin: 1, glotecAgeMin: 1, kpAgeMin: 1, gnssAgeMin: 1 };
      expect(listStaleFeeds(baseInput({ feedAges: { ...fresh, [keys[feed]]: max } }))).toEqual([]);
      expect(listStaleFeeds(baseInput({ feedAges: { ...fresh, [keys[feed]]: max + 1 } }))).toEqual([feed]);
    }
  });

  it("lead time is null outside [250, 3000]", () => {
    expect(computeL1LeadTimeMinutes(249.9)).toBeNull();
    expect(computeL1LeadTimeMinutes(3000.1)).toBeNull();
    expect(computeL1LeadTimeMinutes(NaN)).toBeNull();
    expect(computeL1LeadTimeMinutes(250)).not.toBeNull();
    expect(computeL1LeadTimeMinutes(3000)).not.toBeNull();
  });

  it("replay without label is stale and unverified, never live (FR-RE-22 supersedes FR-RE-10)", () => {
    const r = assessFieldRisk(baseInput({ isReplay: true }));
    expect(r.isReplay).toBe(true);
    expect(r.replayState).toBe("unverified");
    expect(r.replayInvalidReason).toBeTruthy();
    expect(r.isStale).toBe(true);
    expect(r.level).not.toBe("Safe");
    const r2 = assessFieldRisk(baseInput({ isReplay: true, replayLabel: "Gannon", replayArchiveIso: "2024-05-10T12:00:00Z" }));
    expect(r2.isReplay).toBe(true);
    expect(r2.replayState).toBe("verified");
  });

  it("slant mapping M(el) >= 1 and non-increasing in elevation", () => {
    let prev = Infinity;
    for (let el = 0; el <= 90; el += 1) {
      const m = computeSlantFactor(el);
      expect(m).toBeGreaterThanOrEqual(1);
      expect(m).toBeLessThanOrEqual(prev + 1e-12);
      prev = m;
    }
  });

  it("post-sunset window and factor behaviour", () => {
    // Lahore-ish lon 71.5E: local solar time = UTC + ~4.77h
    expect(isLowLatPostSunsetWindow(30.1575, 71.5249, "2026-11-26T14:00:00Z")).toBe(true); // ~18:46
    expect(isLowLatPostSunsetWindow(30.1575, 71.5249, "2026-11-26T06:00:00Z")).toBe(false); // ~10:46
    expect(isLowLatPostSunsetWindow(80, 0, "2026-11-26T14:00:00Z")).toBe(false); // high mag lat
    const night = assessFieldRisk(baseInput({ timestampIso: "2026-11-26T14:00:00Z" }));
    const day = assessFieldRisk(baseInput({ timestampIso: "2026-11-26T06:00:00Z" }));
    expect(night.lowLatPostSunsetActive).toBe(true);
    expect(day.lowLatPostSunsetActive).toBe(false);
    expect(night.topReasons.concat(night.topReasons).length).toBeGreaterThan(0);
    expect(night.score).toBeGreaterThan(day.score);
  });
});
