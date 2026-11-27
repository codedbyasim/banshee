import {
  projectForecastHours,
  type ForecastHourResult,
  type RiskAssessment,
  type SafeWindow,
} from "@banshee/engine";
import {
  ageMinutes,
  findReplay,
  parseCoord,
  presetOptions,
  settle,
  type LiveFeedDeps,
} from "@/lib/assess";
import { validateLatLon } from "@/lib/validateLatLon";

const DEFAULT_LAT = 30.1575;
const DEFAULT_LON = 71.5249;

export interface ForecastResponse {
  /** Exactly 12 hours, offsets +0h..+11h. */
  hours: ForecastHourResult[];
  disclaimer: string;
  feeds: RiskAssessment["feeds"];
  bestSafeWindow: SafeWindow | null;
  isReplay: boolean;
  replayLabel?: string;
  replayArchiveIso?: string;
}

export interface ForecastErrorResponse {
  error: string;
}

export type ForecastResult =
  | { status: 200; body: ForecastResponse }
  | { status: 400; body: ForecastErrorResponse };

const PROJECTION_NOTE = "Hours after +0h are a heuristic projection from current conditions, not a measured prediction.";

/**
 * Build the /api/forecast response. Coordinates are validated before any feed is fetched
 * (HTTP 400 on failure). A failed live feed becomes null and the engine marks every hour Stale.
 */
export async function buildForecastResponse(
  params: URLSearchParams,
  deps: LiveFeedDeps
): Promise<ForecastResult> {
  const presetOpts = presetOptions(params);
  const scenario = findReplay(params.get("replay"));

  const latRaw = parseCoord(params.get("lat"), scenario?.defaultLatDeg ?? DEFAULT_LAT);
  const lonRaw = parseCoord(params.get("lon"), scenario?.defaultLonDeg ?? DEFAULT_LON);
  const validation = validateLatLon(latRaw, lonRaw);
  if (!validation.ok || validation.latDeg === null || validation.lonDeg === null) {
    return { status: 400, body: { error: validation.message ?? "Invalid latitude or longitude." } };
  }
  const latDeg = validation.latDeg;
  const lonDeg = validation.lonDeg;

  if (scenario) {
    const result = projectForecastHours({
      latDeg,
      lonDeg,
      baseTimestampIso: scenario.timestampIso,
      ...presetOpts,
      solarWind: scenario.solarWind,
      glotec: scenario.glotec,
      kpIndex: scenario.kpIndex,
      // Archived scenarios carry pre-computed look angles, not OMM elements.
      gnssElements: null,
      feedAges: { solarWindAgeMin: 1, glotecAgeMin: 5, kpAgeMin: 10, gnssAgeMin: 60 },
      isReplay: true,
      replayLabel: `${scenario.name} (${scenario.dateLabel})`,
      replayArchiveIso: scenario.timestampIso,
    });
    return { status: 200, body: toResponse(result.hours, result.bestSafeWindow, true) };
  }

  const nowIso = deps.nowIso();
  const [wind, glotec, kp, gnss] = await Promise.all([
    settle(deps.fetchLiveSolarWind),
    settle(deps.fetchLiveGloTec),
    settle(deps.fetchLiveKp),
    settle(deps.fetchLiveGnssElements),
  ]);

  const result = projectForecastHours({
    latDeg,
    lonDeg,
    baseTimestampIso: nowIso,
    ...presetOpts,
    solarWind: wind,
    glotec,
    kpIndex: kp ? kp.kpIndex : null,
    gnssElements: gnss ? gnss.elements : null,
    feedAges: {
      solarWindAgeMin: ageMinutes(nowIso, wind?.timestampIso),
      glotecAgeMin: ageMinutes(nowIso, glotec?.timestampIso),
      kpAgeMin: ageMinutes(nowIso, kp?.timestampIso),
      gnssAgeMin: ageMinutes(nowIso, gnss?.fetchedAtIso),
    },
    isReplay: false,
  });
  return { status: 200, body: toResponse(result.hours, result.bestSafeWindow, false) };
}

function toResponse(
  hours: ForecastHourResult[],
  bestSafeWindow: SafeWindow | null,
  isReplay: boolean
): ForecastResponse {
  const base = hours[0]?.assessment;
  const body: ForecastResponse = {
    hours,
    disclaimer: `${base?.disclaimer ?? ""} ${PROJECTION_NOTE}`.trim(),
    feeds: base?.feeds as RiskAssessment["feeds"],
    bestSafeWindow,
    isReplay,
  };
  if (isReplay && base) {
    if (base.replayLabel !== undefined) body.replayLabel = base.replayLabel;
    if (base.replayArchiveIso !== undefined) body.replayArchiveIso = base.replayArchiveIso;
  }
  return body;
}
