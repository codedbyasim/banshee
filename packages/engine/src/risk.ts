import type {
  AlertDecision,
  AlertState,
  FeedAgesMinutes,
  RiskAssessment,
  RiskAssessmentInput,
  RiskDriver,
  RiskLevel,
} from "./types.js";
import {
  computeL1LeadTimeMinutes,
  computeNewellCoupling,
  isLowLatPostSunsetWindow,
} from "./physics.js";
import { evaluateSatelliteSky } from "./geometry.js";
import { resolvePreset } from "./presets.js";
import { safeText, sanitizeInput } from "./sanitize.js";
import { replayFeedAges, validateReplay } from "./replay.js";

export const MAX_FEED_AGE_MINUTES = {
  solarWind: 30,
  glotec: 45,
  kp: 180,
  gnss: 2880, // 48 hours
} as const;

export const RISK_THRESHOLDS = {
  uneasyMin: 35,
  hauntedMin: 65,
} as const;

export const HONESTY_DISCLAIMER =
  "Advisory space-weather heuristic from public NOAA/CelesTrak data, not a trained ML model. TEC values are a regional ionosphere estimate; not certified for aviation or safety-of-life navigation.";

export type FeedName = keyof typeof MAX_FEED_AGE_MINUTES;

/**
 * FR-RE-21: an age is fresh only when it is a finite number in [0, max].
 * Negative, NaN, infinite, null or missing ages are stale.
 */
export function isFreshAge(age: unknown, maxMinutes: number): boolean {
  return typeof age === "number" && Number.isFinite(age) && age >= 0 && age <= maxMinutes;
}

/**
 * FR-RE-15: non-finite scores never map to Safe. Safe requires a finite score <= 34.
 */
export function scoreToLevel(score: number, isStale: boolean): RiskLevel {
  if (!Number.isFinite(score)) return "Uneasy";
  if (score >= RISK_THRESHOLDS.hauntedMin) return "Haunted";
  if (score > RISK_THRESHOLDS.uneasyMin - 1) return "Uneasy";
  return isStale ? "Uneasy" : "Safe";
}

export interface NormalizedDriverInputs {
  newellCoupling: number;       // >= 0
  tecAnomalyTecu: number;       // >= 0
  kpIndex: number;              // 0..9
  ghostFraction: number;        // 0..1 (higher = worse)
  lowLatPostSunsetFactor: number; // 0..1 (higher = worse)
  isStale: boolean;
  /** Preset sensitivity gain k (default 1). Applied as clamp(round(raw * k), 0, 100). */
  gain?: number;
}

export interface CombinedScore {
  /** Integer in [0, 100], stale floor applied when stale or nonFinite. */
  score: number;
  /** Unrounded sum of finite driver points. */
  raw: number;
  /** True when any driver contribution or the scaled score was non-finite (FR-RE-15). */
  nonFinite: boolean;
}

/**
 * Pure monotonic combiner with a non-finite guard: a non-finite contribution
 * is replaced by 0 and flags the result as stale (stale floor applies).
 */
export function combineRiskDriversDetailed(inputs: NormalizedDriverInputs): CombinedScore {
  // Each component is non-decreasing in its driver
  const parts = [
    Math.min(35, (Math.max(0, inputs.newellCoupling) / 18000) * 35),
    Math.min(25, (Math.max(0, inputs.tecAnomalyTecu) / 30) * 25),
    Math.min(20, (Math.max(0, Math.min(9, inputs.kpIndex)) / 9) * 20),
    Math.min(20, Math.max(0, Math.min(1, inputs.ghostFraction)) * 20),
    Math.min(18, Math.max(0, Math.min(1, inputs.lowLatPostSunsetFactor)) * 18),
  ];
  let nonFinite = false;
  let raw = 0;
  for (const p of parts) {
    if (Number.isFinite(p)) raw += p;
    else nonFinite = true;
  }
  const k =
    inputs.gain !== undefined && Number.isFinite(inputs.gain) && inputs.gain > 0
      ? inputs.gain
      : 1;
  let scaled = Math.round(raw * k);
  if (!Number.isFinite(scaled)) {
    nonFinite = true;
    scaled = 0;
  }
  const bounded = Math.max(0, Math.min(100, scaled));
  const floored =
    inputs.isStale || nonFinite ? Math.max(RISK_THRESHOLDS.uneasyMin, bounded) : bounded;
  return { score: floored, raw, nonFinite };
}

/** Score-only form of {@link combineRiskDriversDetailed}. */
export function combineRiskDrivers(inputs: NormalizedDriverInputs): number {
  return combineRiskDriversDetailed(inputs).score;
}

/** FR-RE-22: delegates to {@link validateReplay}; kept for existing callers. */
export function isValidReplay(input: RiskAssessmentInput): boolean {
  return validateReplay(input).valid;
}

/**
 * Single staleness implementation (FR-RE-3, FR-RE-20, FR-RE-21).
 * A feed is stale when it is missing, empty, or its age is not fresh.
 */
export function listStaleFeeds(rawInput: RiskAssessmentInput): FeedName[] {
  const input = sanitizeInput(rawInput).clean;
  const a: Partial<FeedAgesMinutes> = input.feedAges ?? {};
  const out: FeedName[] = [];
  if (input.solarWind === null || !isFreshAge(a.solarWindAgeMin, MAX_FEED_AGE_MINUTES.solarWind)) {
    out.push("solarWind");
  }
  if (
    input.glotec === null ||
    input.glotec.cells.length === 0 ||
    !isFreshAge(a.glotecAgeMin, MAX_FEED_AGE_MINUTES.glotec)
  ) {
    out.push("glotec");
  }
  if (input.kpIndex === null || !isFreshAge(a.kpAgeMin, MAX_FEED_AGE_MINUTES.kp)) out.push("kp");
  if (input.satellites.length === 0 || !isFreshAge(a.gnssAgeMin, MAX_FEED_AGE_MINUTES.gnss)) {
    out.push("gnss");
  }
  return out;
}

/** FR-RE-21: delegates to {@link listStaleFeeds}; no second staleness implementation. */
export function isAnyFeedStale(input: RiskAssessmentInput): boolean {
  return listStaleFeeds(input).length > 0;
}

/**
 * FR-RE-18: max age in minutes among stale feeds that are present and carry a
 * finite, non-negative age; null when none qualifies. No sentinel values.
 */
export function maxPresentStaleAge(input: RiskAssessmentInput, staleFeeds: readonly FeedName[]): number | null {
  const a: Partial<FeedAgesMinutes> = input.feedAges ?? {};
  const present: Record<FeedName, boolean> = {
    solarWind: input.solarWind !== null,
    glotec: input.glotec !== null && input.glotec.cells.length > 0,
    kp: input.kpIndex !== null,
    gnss: input.satellites.length > 0,
  };
  const age: Record<FeedName, unknown> = {
    solarWind: a.solarWindAgeMin,
    glotec: a.glotecAgeMin,
    kp: a.kpAgeMin,
    gnss: a.gnssAgeMin,
  };
  let best: number | null = null;
  for (const f of staleFeeds) {
    const v = age[f];
    if (present[f] && typeof v === "number" && Number.isFinite(v) && v >= 0) {
      best = best === null ? v : Math.max(best, v);
    }
  }
  return best;
}

export function assessFieldRisk(rawInput: RiskAssessmentInput): RiskAssessment {
  // FR-RE-14: sanitize first (drop non-finite satellites, null non-finite feeds).
  const sanitized = sanitizeInput(rawInput);
  const invalidFields = sanitized.invalidFields;
  const observerValid = !invalidFields.includes("latDeg") && !invalidFields.includes("lonDeg");

  // FR-RE-22/23: a valid replay measures feed ages from sample timestamps against the
  // archive instant. An invalid replay is never treated as live: it is stale and unverified.
  const replay = validateReplay(sanitized.clean);
  const input: RiskAssessmentInput =
    replay.valid && replay.archiveMs !== null
      ? { ...sanitized.clean, feedAges: replayFeedAges(sanitized.clean, replay.archiveMs) }
      : sanitized.clean;
  const replayInvalid = replay.state === "unverified";

  const resolved = resolvePreset(input.presetId, input.elevationMaskDeg);
  const preset = resolved.preset;
  const staleFeeds = listStaleFeeds(input);

  // FR-RE-23: a valid replay uses the archive instant for the post-sunset window.
  const windowIso =
    replay.valid && typeof input.replayArchiveIso === "string" ? input.replayArchiveIso : input.timestampIso;
  const lowLatPostSunsetActive =
    invalidFields.length === 0 && isLowLatPostSunsetWindow(input.latDeg, input.lonDeg, windowIso);

  // Geometry needs a valid observer position; otherwise no satellite can be evaluated.
  const sky = evaluateSatelliteSky(
    input.latDeg,
    input.lonDeg,
    preset.elevationMaskDeg,
    observerValid ? input.satellites : [],
    input.glotec,
    lowLatPostSunsetActive
  );

  // FR-RE-20: zero visible satellites after the mask (only meaningful with a valid observer).
  const noVisible = observerValid && sky.details.length === 0;

  const newellCoupling = input.solarWind
    ? computeNewellCoupling(
        input.solarWind.speedKmS,
        input.solarWind.byNt,
        input.solarWind.bzNt
      )
    : 0;

  const rawLead = input.solarWind ? computeL1LeadTimeMinutes(input.solarWind.speedKmS) : null;
  const leadTimeMinutes = rawLead === null ? null : Number(rawLead.toFixed(1));

  const anomalies = sky.details
    .map((d) => d.anomaly)
    .filter((v): v is number => v !== null);
  const maxAnomaly = anomalies.length > 0 ? Math.max(0, ...anomalies) : 0;

  const ghostFraction =
    sky.details.length > 0 ? sky.ghostCount / sky.details.length : 1;

  const lowLatPostSunsetFactor = lowLatPostSunsetActive
    ? Math.min(1, 0.55 + Math.max(0, maxAnomaly) / 30)
    : 0;

  const kpVal = input.kpIndex;

  const floorBeforeScore =
    staleFeeds.length > 0 || invalidFields.length > 0 || noVisible || replayInvalid;

  const combined = combineRiskDriversDetailed({
    newellCoupling,
    tecAnomalyTecu: sky.tecAvailable ? maxAnomaly : 0,
    kpIndex: kpVal ?? 0,
    ghostFraction,
    lowLatPostSunsetFactor,
    isStale: floorBeforeScore,
    gain: preset.gain,
  });
  const isStale = floorBeforeScore || combined.nonFinite;
  const score = combined.score;

  const level = scoreToLevel(score, isStale);

  const drivers: RiskDriver[] = [];
  if (staleFeeds.length > 0) {
    drivers.push({
      code: "STALE_DATA",
      label: `Stale or missing live feeds: ${staleFeeds.join(", ")}; cannot mark Safe.`,
      contribution: RISK_THRESHOLDS.uneasyMin,
      metricValue: maxPresentStaleAge(input, staleFeeds),
      unit: "min",
    });
  }
  if (invalidFields.length > 0) {
    drivers.push({
      code: "INVALID_INPUT",
      label: `Invalid input: ${invalidFields.join(", ")} is missing, non-finite or unparseable; cannot mark Safe.`,
      contribution: RISK_THRESHOLDS.uneasyMin,
      metricValue: null,
      unit: "fields",
    });
  }
  if (replayInvalid) {
    drivers.push({
      code: "REPLAY_UNVERIFIED",
      label: `Unverified archive: ${replay.reason ?? "replay rejected"} Cannot mark Safe.`,
      contribution: RISK_THRESHOLDS.uneasyMin,
      metricValue: null,
      unit: "replay",
    });
  }
  if (noVisible) {
    drivers.push({
      code: "NO_VISIBLE_SATELLITES",
      label: "No satellites are visible above the effective elevation mask; cannot mark Safe.",
      contribution: RISK_THRESHOLDS.uneasyMin,
      metricValue: 0,
      unit: "satellites",
    });
  }
  if (input.solarWind) {
    drivers.push({
      code: "SOLAR_WIND_COUPLING",
      label: `L1 solar wind at ${Math.round(input.solarWind.speedKmS)} km/s with Bz ${input.solarWind.bzNt.toFixed(1)} nT${leadTimeMinutes !== null ? ` (${leadTimeMinutes} min lead time)` : ""}.`,
      contribution: Math.min(35, (newellCoupling / 18000) * 35),
      metricValue: Number(input.solarWind.speedKmS.toFixed(1)),
      unit: "km/s",
    });
  }
  if (sky.tecAvailable) {
    drivers.push({
      code: "IONOSPHERE_TEC",
      label: `Regional ionosphere estimate: peak TEC anomaly ${maxAnomaly.toFixed(1)} TECU${sky.maxL1DelayMeters !== null ? ` (max L1 delay ${sky.maxL1DelayMeters.toFixed(1)} m)` : ""}.`,
      contribution: Math.min(25, (maxAnomaly / 30) * 25),
      metricValue: Number(maxAnomaly.toFixed(1)),
      unit: "TECU",
    });
  } else {
    // FR-RE-16: no invented TECU number.
    drivers.push({
      code: "IONOSPHERE_TEC",
      label: "Regional ionosphere estimate unavailable (GloTEC feed missing or empty).",
      contribution: 0,
      metricValue: null,
      unit: "TECU",
    });
  }
  if (kpVal !== null) {
    drivers.push({
      code: "KP_GEOMAGNETIC",
      label: `Global geomagnetic Kp index is ${kpVal.toFixed(1)}.`,
      contribution: Math.min(20, (Math.max(0, Math.min(9, kpVal)) / 9) * 20),
      metricValue: Number(kpVal.toFixed(1)),
      unit: "Kp",
    });
  } else {
    // FR-RE-17: never report Kp 0.0 for a missing feed.
    drivers.push({
      code: "KP_GEOMAGNETIC",
      label: "Kp unavailable (feed missing).",
      contribution: 0,
      metricValue: null,
      unit: "Kp",
    });
  }
  drivers.push({
    code: "CLEAN_SATELLITES",
    label: `${sky.ghostCount} of ${sky.details.length} visible satellites pierce disturbed sky (${sky.cleanCount} clean).`,
    contribution: Math.min(20, ghostFraction * 20),
    metricValue: sky.ghostCount,
    unit: "satellites",
  });
  if (lowLatPostSunsetActive) {
    drivers.push({
      code: "LOW_LAT_POST_SUNSET",
      label: "Low-latitude post-sunset scintillation watch active (equatorial plasma bubble window).",
      contribution: lowLatPostSunsetFactor * 18,
      metricValue: 1,
      unit: "watch",
    });
  }

  for (const d of drivers) {
    if (!Number.isFinite(d.contribution)) d.contribution = 0;
  }
  drivers.sort((a, b) => b.contribution - a.contribution);

  const feedAges: Partial<FeedAgesMinutes> = input.feedAges ?? {};

  return {
    score,
    level,
    isStale,
    isReplay: replay.requested,
    replayState: replay.state,
    ...(replay.reason !== null ? { replayInvalidReason: replay.reason } : {}),
    ...(replay.requested && typeof input.replayLabel === "string" ? { replayLabel: input.replayLabel } : {}),
    ...(replay.requested && typeof input.replayArchiveIso === "string"
      ? { replayArchiveIso: input.replayArchiveIso }
      : {}),
    leadTimeMinutes,
    newellCoupling: Number(newellCoupling.toFixed(1)),
    kpIndex: input.kpIndex,
    solarWindSpeedKmS: input.solarWind ? Number(input.solarWind.speedKmS.toFixed(1)) : null,
    bzNt: input.solarWind ? Number(input.solarWind.bzNt.toFixed(1)) : null,
    visibleSatellites: sky.details.length,
    cleanSatellites: sky.cleanCount,
    ghostSatellites: sky.ghostCount,
    cleanPdopEstimate: sky.cleanPdopEstimate,
    meanVtec: sky.meanVtec,
    maxL1DelayMeters: sky.maxL1DelayMeters,
    lowLatPostSunsetActive,
    satellites: sky.details,
    topReasons: drivers.slice(0, 3),
    preset: {
      id: preset.id,
      label: preset.label,
      elevationMaskDeg: preset.elevationMaskDeg,
      gain: preset.gain,
    },
    feeds: {
      solarWind: { ageMin: feedAges.solarWindAgeMin ?? null, source: input.solarWind ? input.solarWind.source : null },
      glotec: {
        ageMin: feedAges.glotecAgeMin ?? null,
        source: input.glotec && input.glotec.cells.length > 0 ? "NOAA GloTEC" : null,
      },
      kp: { ageMin: feedAges.kpAgeMin ?? null, source: input.kpIndex !== null ? "NOAA SWPC Kp" : null },
      gnss: { ageMin: feedAges.gnssAgeMin ?? null, source: input.satellites.length > 0 ? "CelesTrak GP" : null },
    },
    ...(invalidFields.length > 0 ? { invalidInput: [...invalidFields] } : {}),
    ...(resolved.unknownRequested !== null
      ? {
          // FR-RE-32: the caller-supplied id is stripped of control characters and capped.
          unknownPresetReason: `Requested preset "${safeText(resolved.unknownRequested)}" is unknown; default TRACTOR_RTK applied.`,
        }
      : {}),
    ...(resolved.customMaskDefaulted
      ? {
          customMaskDefaultedReason:
            "Custom elevation mask was missing or invalid; 15 degrees applied.",
        }
      : {}),
    disclaimer: HONESTY_DISCLAIMER,
    assessedAtIso: typeof input.timestampIso === "string" ? input.timestampIso : "",
  };
}

/**
 * Alert idempotency + 5-point hysteresis to stop flapping notifications.
 */
export function evaluateAlertTransition(
  prev: AlertState,
  eventId: string,
  score: number,
  isStale: boolean,
  nowIso: string
): AlertDecision {
  const candidateLevel = scoreToLevel(score, isStale);

  // Idempotency: exact same event ID never triggers a duplicate alert
  if (prev.lastEventId === eventId) {
    return {
      shouldNotify: false,
      nextState: prev,
      reason: "Duplicate event ID suppressed (idempotent).",
    };
  }

  // Hysteresis: require a 5-point drop below threshold before de-escalating
  let effectiveLevel: RiskLevel = candidateLevel;
  if (prev.activeLevel === "Haunted" && candidateLevel === "Uneasy" && score >= RISK_THRESHOLDS.hauntedMin - 5) {
    effectiveLevel = "Haunted";
  } else if (prev.activeLevel === "Uneasy" && candidateLevel === "Safe" && score >= RISK_THRESHOLDS.uneasyMin - 5) {
    effectiveLevel = "Uneasy";
  }

  const escalated =
    (prev.activeLevel === "Safe" && effectiveLevel !== "Safe") ||
    (prev.activeLevel === "Uneasy" && effectiveLevel === "Haunted");

  if (!escalated) {
    return {
      shouldNotify: false,
      nextState: {
        activeLevel: effectiveLevel,
        lastEventId: prev.lastEventId,
        lastNotifiedAtIso: prev.lastNotifiedAtIso,
      },
      reason: "No escalation beyond hysteresis band.",
    };
  }

  return {
    shouldNotify: true,
    nextState: {
      activeLevel: effectiveLevel,
      lastEventId: eventId,
      lastNotifiedAtIso: nowIso,
    },
    reason: `Escalated from ${prev.activeLevel} to ${effectiveLevel}.`,
  };
}
