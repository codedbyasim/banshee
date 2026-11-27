import { assessFieldRisk, explainAssessment, type RiskAssessment, type SolarWindSample } from "@banshee/engine";
import { STORM_REPLAYS, type StormReplayScenario } from "@banshee/feeds";

export interface AssessResponse {
  assessment: RiskAssessment;
  /** Deterministic English explanation (FR-RE-33). */
  explanation: string;
  summary?: string;
  liveFeedsConnected?: boolean;
}

export interface LiveFeedDeps {
  fetchLiveSolarWind: () => Promise<SolarWindSample | null>;
  fetchLiveKpIndex: () => Promise<number | null>;
  nowIso: () => string;
}

const DEFAULT_LAT = 30.1575;
const DEFAULT_LON = 71.5249;

/**
 * Parse an untrusted coordinate. A missing param uses the default; a present but blank or
 * non-numeric value becomes NaN so the engine reports INVALID_INPUT (FR-RE-14) instead of
 * the route silently substituting 0 or the default.
 */
function parseCoord(raw: string | null, fallback: number): number {
  if (raw === null) return fallback;
  if (raw.trim() === "") return Number.NaN;
  return Number(raw);
}

function presetOptions(params: URLSearchParams): { presetId?: string; elevationMaskDeg?: number } {
  const presetParam = params.get("presetId");
  const maskParam = params.get("elevationMaskDeg");
  const maskNum = maskParam !== null && maskParam.trim() !== "" ? Number(maskParam) : Number.NaN;
  const out: { presetId?: string; elevationMaskDeg?: number } = {};
  if (presetParam !== null && presetParam.length > 0 && presetParam.length <= 64) out.presetId = presetParam;
  // Non-finite masks are omitted so the engine applies its default and states the reason.
  if (Number.isFinite(maskNum)) out.elevationMaskDeg = maskNum;
  return out;
}

function findReplay(id: string | null): StormReplayScenario | null {
  if (id === null || !Object.prototype.hasOwnProperty.call(STORM_REPLAYS, id)) return null;
  return STORM_REPLAYS[id as StormReplayScenario["id"]];
}

/**
 * Build the /api/assess response. All query values go through `assessFieldRisk`, which
 * sanitizes them; any `lang` param is ignored because output is English-only (FR-RE-33).
 */
export async function buildAssessResponse(
  params: URLSearchParams,
  deps: LiveFeedDeps
): Promise<AssessResponse> {
  const presetOpts = presetOptions(params);
  const scenario = findReplay(params.get("replay"));

  if (scenario) {
    const assessment = assessFieldRisk({
      latDeg: parseCoord(params.get("lat"), scenario.defaultLatDeg),
      lonDeg: parseCoord(params.get("lon"), scenario.defaultLonDeg),
      timestampIso: scenario.timestampIso,
      ...presetOpts,
      solarWind: scenario.solarWind,
      glotec: scenario.glotec,
      kpIndex: scenario.kpIndex,
      satellites: scenario.satellites,
      feedAges: { solarWindAgeMin: 1, glotecAgeMin: 5, kpAgeMin: 10, gnssAgeMin: 60 },
      isReplay: true,
      replayLabel: `${scenario.name} (${scenario.dateLabel})`,
      replayArchiveIso: scenario.timestampIso,
    });
    return { assessment, explanation: explainAssessment(assessment), summary: scenario.summary };
  }

  const [liveWind, liveKp] = await Promise.all([deps.fetchLiveSolarWind(), deps.fetchLiveKpIndex()]);
  const fallback = STORM_REPLAYS["multan-sunset"];
  const assessment = assessFieldRisk({
    latDeg: parseCoord(params.get("lat"), DEFAULT_LAT),
    lonDeg: parseCoord(params.get("lon"), DEFAULT_LON),
    timestampIso: deps.nowIso(),
    ...presetOpts,
    solarWind: liveWind ?? fallback.solarWind,
    glotec: fallback.glotec,
    kpIndex: liveKp ?? fallback.kpIndex,
    satellites: fallback.satellites,
    feedAges: {
      solarWindAgeMin: liveWind ? 2 : 45,
      glotecAgeMin: 8,
      kpAgeMin: liveKp !== null ? 15 : 210,
      gnssAgeMin: 60,
    },
    isReplay: false,
  });
  return {
    assessment,
    explanation: explainAssessment(assessment),
    liveFeedsConnected: Boolean(liveWind),
  };
}
