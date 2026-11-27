import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  assessFieldRisk,
  propagateGnssElements,
  type GloTecCell,
  type GnssOmmElement,
  type RiskAssessmentInput,
} from "@banshee/engine";
import { STORM_REPLAYS } from "@banshee/feeds";
import { GET } from "@/app/api/assess/route";
import { AssessmentStatus, ReasonList } from "@/components/AssessmentStatus";
import { buildAssessResponse, type AssessResponse, type LiveFeedDeps } from "@/lib/assess";
import { formatMetric } from "@/lib/format";

const ARABIC_SCRIPT = /[\u0600-\u06FF]/;
const gannon = STORM_REPLAYS["gannon-2024"];

/** Live path with every feed offline (no network): no fallback data, all feeds stale. */
const offlineDeps: LiveFeedDeps = {
  fetchLiveSolarWind: async () => null,
  fetchLiveGloTec: async () => null,
  fetchLiveKp: async () => null,
  fetchLiveGnssElements: async () => null,
  nowIso: () => "2026-11-26T14:30:00Z",
};

const NOW = "2026-11-26T14:30:00Z";
const minutesBefore = (min: number) => new Date(Date.parse(NOW) - min * 60_000).toISOString();

const gnssFixture: GnssOmmElement[] = [
  {
    OBJECT_NAME: "GPS BIIR-2  (PRN 13)",
    OBJECT_ID: "1997-035A",
    EPOCH: "2026-11-26T12:00:00.000000",
    MEAN_MOTION: 2.00563178,
    ECCENTRICITY: 0.0091234,
    INCLINATION: 55.6573,
    RA_OF_ASC_NODE: 158.2914,
    ARG_OF_PERICENTER: 52.7342,
    MEAN_ANOMALY: 308.1234,
    NORAD_CAT_ID: 24876,
    ELEMENT_SET_NO: 999,
    BSTAR: 0,
    MEAN_MOTION_DOT: 0,
    MEAN_MOTION_DDOT: 0,
  },
  {
    OBJECT_NAME: "GSAT0101 (GALILEO-PFM)",
    OBJECT_ID: "2011-060A",
    EPOCH: "2026-11-26T12:00:00.000000",
    MEAN_MOTION: 1.70475,
    ECCENTRICITY: 0.0003,
    INCLINATION: 56.1,
    RA_OF_ASC_NODE: 20.4,
    ARG_OF_PERICENTER: 10,
    MEAN_ANOMALY: 10,
    NORAD_CAT_ID: 37846,
    ELEMENT_SET_NO: 999,
    BSTAR: 0,
    MEAN_MOTION_DOT: 0,
    MEAN_MOTION_DDOT: 0,
  },
];

function freshDeps(): LiveFeedDeps {
  const cells: GloTecCell[] = [];
  for (let lat = 23.75; lat <= 36.25; lat += 2.5) {
    for (let lon = 62.5; lon <= 82.5; lon += 5) cells.push({ latDeg: lat, lonDeg: lon, vTec: 12, anomaly: -0.4 });
  }
  return {
    fetchLiveSolarWind: async () => ({
      timestampIso: minutesBefore(7),
      speedKmS: 401.5,
      densityCm3: 3.3,
      btNt: 4.4,
      byNt: 1.1,
      bzNt: 0.7,
      source: "SOLAR-1",
    }),
    fetchLiveGloTec: async () => ({ timestampIso: minutesBefore(15), latStepDeg: 2.5, lonStepDeg: 5, cells }),
    fetchLiveKp: async () => ({ kpIndex: 1.33, timestampIso: minutesBefore(90) }),
    fetchLiveGnssElements: async () => ({ fetchedAtIso: minutesBefore(120), elements: gnssFixture }),
    nowIso: () => NOW,
  };
}

function replayInput(overrides: Partial<RiskAssessmentInput>): RiskAssessmentInput {
  return {
    latDeg: gannon.defaultLatDeg,
    lonDeg: gannon.defaultLonDeg,
    timestampIso: gannon.timestampIso,
    solarWind: gannon.solarWind,
    glotec: gannon.glotec,
    kpIndex: gannon.kpIndex,
    satellites: gannon.satellites,
    feedAges: { solarWindAgeMin: 1, glotecAgeMin: 5, kpAgeMin: 10, gnssAgeMin: 60 },
    isReplay: true,
    replayLabel: "Gannon Storm",
    replayArchiveIso: gannon.timestampIso,
    ...overrides,
  };
}

describe("/api/assess ignores lang (26.2, FR-RE-33)", () => {
  it("returns the same English response with or without lang=ur", async () => {
    const base = "http://localhost/api/assess?replay=gannon-2024&presetId=TRACTOR_RTK";
    const plain = (await (await GET(new Request(base) as never)).json()) as AssessResponse;
    const withLang = (await (await GET(new Request(`${base}&lang=ur`) as never)).json()) as AssessResponse;
    expect(withLang).toEqual(plain);
    expect(withLang.explanation).toMatch(/REPLAY/);
    expect(ARABIC_SCRIPT.test(JSON.stringify(withLang))).toBe(false);
  });

  it("live path ignores lang and returns English text", async () => {
    const a = await buildAssessResponse(new URLSearchParams("lang=ur"), offlineDeps);
    const b = await buildAssessResponse(new URLSearchParams(""), offlineDeps);
    expect(a).toEqual(b);
    expect(ARABIC_SCRIPT.test(a.explanation)).toBe(false);
    expect(a.explanation).toMatch(/[A-Za-z]{3,}/);
  });
});

describe("/api/assess output shape (27.1)", () => {
  it("passes invalid coordinates to the engine, which reports INVALID_INPUT and never Safe", async () => {
    const res = await buildAssessResponse(new URLSearchParams("lat=abc&lon=71.5"), offlineDeps);
    expect(res.assessment.invalidInput).toEqual(["latDeg"]);
    expect(res.assessment.level).not.toBe("Safe");
    expect(res.assessment.topReasons.map((r) => r.code)).toContain("INVALID_INPUT");
  });

  it("blank lat is invalid instead of silently defaulted", async () => {
    const res = await buildAssessResponse(new URLSearchParams("lat=&replay=gannon-2024"), offlineDeps);
    expect(res.assessment.invalidInput).toContain("latDeg");
  });

  it("verified replay keeps the REPLAY label and archive timestamp", async () => {
    const res = await buildAssessResponse(new URLSearchParams("replay=gannon-2024"), offlineDeps);
    expect(res.assessment.replayState).toBe("verified");
    expect(res.assessment.replayArchiveIso).toBe(gannon.timestampIso);
  });
});

describe("/api/assess live path uses only real feeds", () => {
  it("all feeds offline: never Safe, all four stale, no satellites, no multan-sunset values", async () => {
    const res = await buildAssessResponse(new URLSearchParams(""), offlineDeps);
    const a = res.assessment;
    expect(a.level).not.toBe("Safe");
    expect(a.isStale).toBe(true);
    const stale = a.topReasons.find((r) => r.code === "STALE_DATA");
    expect(stale?.label).toContain("solarWind, glotec, kp, gnss");
    expect(a.satellites).toEqual([]);
    expect(res.liveFeeds).toEqual({ solarWind: false, glotec: false, kp: false, gnss: false });
    expect(res.liveFeedsConnected).toBe(false);
    expect(a.solarWindSpeedKmS).toBeNull();
    expect(a.kpIndex).toBeNull();
    expect(a.meanVtec).toBeNull();
    expect(a.feeds).toMatchObject({
      solarWind: { ageMin: null },
      glotec: { ageMin: null },
      kp: { ageMin: null },
      gnss: { ageMin: null },
    });

    const multan = STORM_REPLAYS["multan-sunset"];
    const json = JSON.stringify(res);
    for (const s of multan.satellites) expect(json).not.toContain(`"${s.id}"`);
    expect(a.solarWindSpeedKmS).not.toBe(multan.solarWind.speedKmS);
    expect(json).not.toContain(String(multan.solarWind.speedKmS));
  });

  it("one throwing feed does not break the others", async () => {
    const deps = { ...freshDeps(), fetchLiveKp: async () => Promise.reject(new Error("boom")) };
    const res = await buildAssessResponse(new URLSearchParams(""), deps);
    expect(res.liveFeeds).toEqual({ solarWind: true, glotec: true, kp: false, gnss: true });
    expect(res.liveFeedsConnected).toBe(false);
    expect(res.assessment.level).not.toBe("Safe");
  });

  it("fresh fixtures: ages are computed from timestamps and satellites come from propagation", async () => {
    const res = await buildAssessResponse(new URLSearchParams("lat=30.1575&lon=71.5249"), freshDeps());
    const a = res.assessment;
    expect(a.feeds?.solarWind.ageMin).toBeCloseTo(7, 9);
    expect(a.feeds?.glotec.ageMin).toBeCloseTo(15, 9);
    expect(a.feeds?.kp.ageMin).toBeCloseTo(90, 9);
    expect(a.feeds?.gnss.ageMin).toBeCloseTo(120, 9);
    expect(res.liveFeeds).toEqual({ solarWind: true, glotec: true, kp: true, gnss: true });
    expect(res.liveFeedsConnected).toBe(true);
    expect(a.solarWindSpeedKmS).toBe(401.5);
    expect(a.kpIndex).toBe(1.33);

    const expected = propagateGnssElements(gnssFixture, 30.1575, 71.5249, NOW).satellites;
    expect(expected).toHaveLength(2);
    const visibleIds = new Set(a.satellites.map((s) => s.id));
    for (const id of visibleIds) expect(["24876", "37846"]).toContain(id);
    for (const s of a.satellites) {
      const src = expected.find((e) => e.id === s.id)!;
      expect(s.elevationDeg).toBeCloseTo(src.elevationDeg, 9);
      expect(s.azimuthDeg).toBeCloseTo(src.azimuthDeg, 9);
    }
  });

  it("replay path is unchanged and never calls live fetchers", async () => {
    const fail = async () => {
      throw new Error("live fetcher must not be called for a replay");
    };
    const deps: LiveFeedDeps = {
      fetchLiveSolarWind: fail,
      fetchLiveGloTec: fail,
      fetchLiveKp: fail,
      fetchLiveGnssElements: fail,
      nowIso: () => NOW,
    };
    const res = await buildAssessResponse(new URLSearchParams("replay=gannon-2024"), deps);
    expect(res.liveFeeds).toBeUndefined();
    expect(res.liveFeedsConnected).toBeUndefined();
    expect(res.summary).toBe(gannon.summary);
    const a = res.assessment;
    // Values captured from the replay path before the live-feed change.
    expect({
      score: a.score,
      level: a.level,
      isReplay: a.isReplay,
      replayState: a.replayState,
      meanVtec: a.meanVtec,
      visible: a.visibleSatellites,
      clean: a.cleanSatellites,
      ghost: a.ghostSatellites,
      maxL1: a.maxL1DelayMeters,
      kp: a.kpIndex,
      speed: a.solarWindSpeedKmS,
      bz: a.bzNt,
      lead: a.leadTimeMinutes,
      newell: a.newellCoupling,
      reasons: a.topReasons.map((r) => [r.code, r.contribution, r.metricValue]),
    }).toEqual({
      score: 100,
      level: "Haunted",
      isReplay: true,
      replayState: "verified",
      meanVtec: 80.98,
      visible: 12,
      clean: 0,
      ghost: 12,
      maxL1: 28.72,
      kp: 9,
      speed: 714,
      bz: -47,
      lead: 35,
      newell: 83176.7,
      reasons: [
        ["SOLAR_WIND_COUPLING", 35, 714],
        ["IONOSPHERE_TEC", 25, 32.1],
        ["KP_GEOMAGNETIC", 20, 9],
      ],
    });
    expect(a.satellites.map((s) => s.id)).toEqual(gannon.satellites.map((s) => s.id));
  });
});

describe("render helpers and components (27.1)", () => {
  it("formatMetric renders null as unavailable", () => {
    expect(formatMetric(null, "TECU")).toBe("unavailable");
    expect(formatMetric(12.5, "TECU")).toBe("12.5 TECU");
    expect(formatMetric(15, "°")).toBe("15°");
  });

  it("null metricValue renders as unavailable in the reason list", () => {
    const a = assessFieldRisk(replayInput({ glotec: null, kpIndex: null }));
    const html = renderToStaticMarkup(<ReasonList assessment={a} />);
    const nullReason = a.topReasons.find((r) => r.metricValue === null);
    expect(nullReason).toBeDefined();
    expect(html).toContain(`data-code="${nullReason!.code}"`);
    expect(html).toContain("[unavailable]");
  });

  it("unverified archive shows REPLAY, the archive timestamp and replayInvalidReason", () => {
    const a = assessFieldRisk(replayInput({ replayArchiveIso: "2024-02-31T00:00:00Z" }));
    expect(a.replayState).toBe("unverified");
    const html = renderToStaticMarkup(<AssessmentStatus assessment={a} />);
    expect(html).toContain("REPLAY");
    expect(html).toContain("UNVERIFIED ARCHIVE");
    expect(html).toContain("2024-02-31T00:00:00Z");
    expect(html).toContain(a.replayInvalidReason!);
  });

  it("invalid input and no visible satellites are shown", () => {
    const a = assessFieldRisk(
      replayInput({ latDeg: Number.NaN, presetId: "CUSTOM", elevationMaskDeg: 90 })
    );
    const html = renderToStaticMarkup(<AssessmentStatus assessment={a} />);
    expect(html).toContain('data-testid="invalid-input"');
    expect(html).toContain("latDeg");
    expect(a.visibleSatellites).toBe(0);
    expect(html).toContain('data-testid="no-visible"');
    expect(a.level).not.toBe("Safe");
  });
});
