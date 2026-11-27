import {
  assessFieldRisk,
  explainAssessment,
  propagateGnssElements,
  type GloTecGrid,
  type RiskAssessment,
  type SolarWindSample,
} from "@banshee/engine";
import { STORM_REPLAYS, type GnssElementSet, type KpSample, type StormReplayScenario } from "@banshee/feeds";

/** Which live fetches succeeded on this request (live path only). */
export interface LiveFeedFlags {
  solarWind: boolean;
  glotec: boolean;
  kp: boolean;
  gnss: boolean;
}

export interface AssessResponse {
  assessment: RiskAssessment;
  /** Deterministic English explanation (FR-RE-33). */
  explanation: string;
  summary?: string;
  /** Per-feed live status (live path only). */
  liveFeeds?: LiveFeedFlags;
  /** True only when all four live feeds succeeded (live path only). */
  liveFeedsConnected?: boolean;
}

export interface LiveFeedDeps {
  fetchLiveSolarWind: () => Promise<SolarWindSample | null>;
  fetchLiveGloTec: () => Promise<GloTecGrid | null>;
  fetchLiveKp: () => Promise<KpSample | null>;
  fetchLiveGnssElements: () => Promise<GnssElementSet | null>;
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

  // Live path: only real fetched data. A failed feed is null and the engine marks it stale.
  const nowIso = deps.nowIso();
  const [liveWind, liveGlotec, liveKp, liveGnss] = await Promise.all([
    settle(deps.fetchLiveSolarWind),
    settle(deps.fetchLiveGloTec),
    settle(deps.fetchLiveKp),
    settle(deps.fetchLiveGnssElements),
  ]);
  const latDeg = parseCoord(params.get("lat"), DEFAULT_LAT);
  const lonDeg = parseCoord(params.get("lon"), DEFAULT_LON);
  const satellites = liveGnss
    ? propagateGnssElements(liveGnss.elements, latDeg, lonDeg, nowIso).satellites
    : [];

  const assessment = assessFieldRisk({
    latDeg,
    lonDeg,
    timestampIso: nowIso,
    ...presetOpts,
    solarWind: liveWind,
    glotec: liveGlotec,
    kpIndex: liveKp ? liveKp.kpIndex : null,
    satellites,
    feedAges: {
      solarWindAgeMin: ageMinutes(nowIso, liveWind?.timestampIso),
      glotecAgeMin: ageMinutes(nowIso, liveGlotec?.timestampIso),
      kpAgeMin: ageMinutes(nowIso, liveKp?.timestampIso),
      gnssAgeMin: ageMinutes(nowIso, liveGnss?.fetchedAtIso),
    },
    isReplay: false,
  });
  const liveFeeds = {
    solarWind: liveWind !== null,
    glotec: liveGlotec !== null,
    kp: liveKp !== null,
    gnss: liveGnss !== null,
  };
  return {
    assessment,
    explanation: explainAssessment(assessment),
    liveFeeds,
    liveFeedsConnected: liveFeeds.solarWind && liveFeeds.glotec && liveFeeds.kp && liveFeeds.gnss,
  };
}

/** Run a fetcher; a rejection or throw becomes null so one feed cannot break the others. */
async function settle<T>(fn: () => Promise<T | null>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

/** Minutes from `sampleIso` to `nowIso`; null when either is missing or unparseable. */
function ageMinutes(nowIso: string, sampleIso: string | undefined): number | null {
  if (sampleIso === undefined) return null;
  const now = Date.parse(nowIso);
  const t = Date.parse(sampleIso);
  if (!Number.isFinite(now) || !Number.isFinite(t)) return null;
  return (now - t) / 60_000;
}
