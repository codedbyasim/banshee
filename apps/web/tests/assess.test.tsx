import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { assessFieldRisk, type RiskAssessmentInput } from "@banshee/engine";
import { STORM_REPLAYS } from "@banshee/feeds";
import { GET } from "@/app/api/assess/route";
import { AssessmentStatus, ReasonList } from "@/components/AssessmentStatus";
import { buildAssessResponse, type AssessResponse, type LiveFeedDeps } from "@/lib/assess";
import { formatMetric } from "@/lib/format";

const ARABIC_SCRIPT = /[\u0600-\u06FF]/;
const gannon = STORM_REPLAYS["gannon-2024"];

/** Live path with feeds offline (no network): the route falls back and marks feeds stale. */
const offlineDeps: LiveFeedDeps = {
  fetchLiveSolarWind: async () => null,
  fetchLiveKpIndex: async () => null,
  nowIso: () => "2026-11-26T14:30:00Z",
};

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
