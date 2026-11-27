import { propagateGnssElements } from "./orbits.js";
import { wrapLongitudeDeg } from "./physics.js";
import type { PresetId } from "./presets.js";
import { assessFieldRisk } from "./risk.js";
import type {
  FeedAgesMinutes,
  GloTecGrid,
  GnssOmmElement,
  RiskAssessment,
  RiskLevel,
  SolarWindSample,
} from "./types.js";

/** Number of hourly projections produced by `projectForecastHours` (+0h..+11h). */
export const FORECAST_HOURS = 12;

export interface SafeWindow {
  startHourOffset: number;
  /** Inclusive. */
  endHourOffset: number;
  durationHours: number;
  meanScore: number;
}

export interface ForecastInput {
  latDeg: number;
  lonDeg: number;
  baseTimestampIso: string;
  presetId?: PresetId | (string & {});
  elevationMaskDeg?: number;
  solarWind: SolarWindSample | null;
  glotec: GloTecGrid | null;
  kpIndex: number | null;
  /** Raw OMM elements; re-propagated for every forecast hour. */
  gnssElements: GnssOmmElement[] | null;
  /** Feed ages at `baseTimestampIso`. */
  feedAges: FeedAgesMinutes;
  isReplay?: boolean;
  replayLabel?: string;
  replayArchiveIso?: string;
}

export interface ForecastHourResult {
  hourOffset: number;
  timestampIso: string;
  assessment: RiskAssessment;
  postSunsetActive: boolean;
}

export interface ForecastResult {
  hours: ForecastHourResult[];
  bestSafeWindow: SafeWindow | null;
}

/**
 * Longest run of consecutive `Safe` hours. Ties: lower mean score, then earlier start.
 * Returns null when no hour is `Safe`.
 */
export function bestSafeWindow(
  hours: readonly { level: RiskLevel; score: number }[]
): SafeWindow | null {
  let best: SafeWindow | null = null;
  let i = 0;
  while (i < hours.length) {
    if (hours[i]?.level !== "Safe") {
      i++;
      continue;
    }
    let j = i;
    let sum = 0;
    while (j < hours.length && hours[j]?.level === "Safe") {
      sum += hours[j]?.score ?? 0;
      j++;
    }
    const durationHours = j - i;
    const meanScore = sum / durationHours;
    if (
      best === null ||
      durationHours > best.durationHours ||
      (durationHours === best.durationHours && meanScore < best.meanScore)
    ) {
      best = { startHourOffset: i, endHourOffset: j - 1, durationHours, meanScore };
    }
    i = j;
  }
  return best;
}

function addMinutes(age: number | null, minutes: number): number | null {
  return typeof age === "number" && Number.isFinite(age) ? age + minutes : age;
}

function addHoursIso(baseIso: string, hours: number): string {
  const ms = Date.parse(baseIso);
  // Invalid base time: leave it untouched so the engine reports INVALID_INPUT for every hour.
  if (!Number.isFinite(ms)) return baseIso;
  return new Date(ms + hours * 3_600_000).toISOString();
}

/**
 * Project 12 hourly assessments from current telemetry. Solar wind, GloTEC and Kp are held
 * constant (persistence); each feed ages by 60 min per hour; GNSS geometry is re-propagated
 * with SGP4 for each hour. Pure: all time comes from the input.
 */
export function projectForecastHours(input: ForecastInput): ForecastResult {
  const hours: ForecastHourResult[] = [];
  const lonForPropagation = Number.isFinite(input.lonDeg) ? wrapLongitudeDeg(input.lonDeg) : input.lonDeg;

  for (let hourOffset = 0; hourOffset < FORECAST_HOURS; hourOffset++) {
    const timestampIso = addHoursIso(input.baseTimestampIso, hourOffset);
    const minutes = hourOffset * 60;
    const satellites = propagateGnssElements(
      input.gnssElements ?? [],
      input.latDeg,
      lonForPropagation,
      timestampIso
    ).satellites;

    const assessment = assessFieldRisk({
      latDeg: input.latDeg,
      lonDeg: input.lonDeg,
      timestampIso,
      presetId: input.presetId,
      elevationMaskDeg: input.elevationMaskDeg,
      solarWind: input.solarWind,
      glotec: input.glotec,
      kpIndex: input.kpIndex,
      satellites,
      feedAges: {
        solarWindAgeMin: addMinutes(input.feedAges.solarWindAgeMin, minutes),
        glotecAgeMin: addMinutes(input.feedAges.glotecAgeMin, minutes),
        kpAgeMin: addMinutes(input.feedAges.kpAgeMin, minutes),
        gnssAgeMin: addMinutes(input.feedAges.gnssAgeMin, minutes),
      },
      isReplay: input.isReplay,
      replayLabel: input.replayLabel,
      replayArchiveIso: input.replayArchiveIso,
    });

    hours.push({
      hourOffset,
      timestampIso,
      assessment,
      postSunsetActive: assessment.lowLatPostSunsetActive,
    });
  }

  return {
    hours,
    bestSafeWindow: bestSafeWindow(hours.map((h) => ({ level: h.assessment.level, score: h.assessment.score }))),
  };
}
