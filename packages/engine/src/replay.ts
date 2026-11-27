import type { FeedAgesMinutes, ReplayState, RiskAssessmentInput } from "./types.js";

/**
 * Strict ISO-8601 instant: `YYYY-MM-DDTHH:mm:ss[.sss]` followed by `Z` or `±HH:mm`.
 * Date-only strings, missing seconds and missing zone designators are rejected.
 */
const STRICT_ISO_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-](\d{2}):(\d{2}))$/;

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * Parse a strictly valid ISO-8601 instant to epoch milliseconds, or null.
 * The calendar fields are range-checked (round trip), so `2024-02-31T00:00:00Z` is rejected.
 */
export function parseStrictIsoInstant(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = STRICT_ISO_INSTANT.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  if (m[7] !== undefined && (Number(m[7]) > 23 || Number(m[8]) > 59)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export interface ReplayValidation {
  /** True when the input asked for a replay (`isReplay === true`). */
  requested: boolean;
  /** True only for a requested replay that passed every check. */
  valid: boolean;
  /** Archive instant in epoch ms for a valid replay, else null. */
  archiveMs: number | null;
  /** Why a requested replay was rejected; null when valid or not requested. */
  reason: string | null;
  state: ReplayState;
}

/**
 * FR-RE-22: a requested replay is valid only with a non-empty label, a strictly valid
 * ISO-8601 archive instant, and an archive instant not later than `timestampIso`.
 */
export function validateReplay(input: RiskAssessmentInput): ReplayValidation {
  if (input.isReplay !== true) {
    return { requested: false, valid: false, archiveMs: null, reason: null, state: "none" };
  }
  const invalid = (reason: string): ReplayValidation => ({
    requested: true,
    valid: false,
    archiveMs: null,
    reason,
    state: "unverified",
  });
  if (typeof input.replayLabel !== "string" || input.replayLabel.trim().length === 0) {
    return invalid("Replay label is missing or empty.");
  }
  const archiveMs = parseStrictIsoInstant(input.replayArchiveIso);
  if (archiveMs === null) {
    return invalid("Archive timestamp is missing or not a strict ISO-8601 instant.");
  }
  const assessedMs = typeof input.timestampIso === "string" ? Date.parse(input.timestampIso) : NaN;
  if (!Number.isFinite(assessedMs)) {
    return invalid("Assessment timestamp is unparseable, so the archive time cannot be checked.");
  }
  if (archiveMs > assessedMs) {
    return invalid("Archive timestamp is later than the assessment timestamp.");
  }
  return { requested: true, valid: true, archiveMs, reason: null, state: "verified" };
}

/**
 * Age in minutes of a sample relative to the archive instant. A present but invalid
 * sample timestamp yields null (stale); an absent one yields `fallback`.
 */
function sampleAgeMin(sampleIso: unknown, archiveMs: number, fallback: number | null): number | null {
  if (sampleIso === undefined || sampleIso === null) return fallback;
  const sampleMs = parseStrictIsoInstant(sampleIso);
  return sampleMs === null ? null : (archiveMs - sampleMs) / 60000;
}

/**
 * FR-RE-23: for a valid replay, feed age = archive time minus sample time, for every feed
 * whose sample carries a timestamp (solar wind, GloTEC). Feeds without a sample timestamp
 * (Kp, GNSS) keep the supplied age.
 */
export function replayFeedAges(input: RiskAssessmentInput, archiveMs: number): FeedAgesMinutes {
  const supplied: Partial<FeedAgesMinutes> = input.feedAges ?? {};
  return {
    solarWindAgeMin: input.solarWind
      ? sampleAgeMin(input.solarWind.timestampIso, archiveMs, supplied.solarWindAgeMin ?? null)
      : supplied.solarWindAgeMin ?? null,
    glotecAgeMin: input.glotec
      ? sampleAgeMin(input.glotec.timestampIso, archiveMs, supplied.glotecAgeMin ?? null)
      : supplied.glotecAgeMin ?? null,
    kpAgeMin: supplied.kpAgeMin ?? null,
    gnssAgeMin: supplied.gnssAgeMin ?? null,
  };
}
