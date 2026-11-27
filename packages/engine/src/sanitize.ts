import type { RiskAssessmentInput, SatelliteObservation } from "./types.js";

export type InvalidInputField = "latDeg" | "lonDeg" | "timestampIso";

export interface SanitizeResult {
  /** Input with non-finite satellites dropped and non-finite feeds set to null. */
  clean: RiskAssessmentInput;
  /** Observer/time fields that are non-finite or unparseable (FR-RE-14). */
  invalidFields: InvalidInputField[];
  /** Number of satellites dropped for a non-finite elevation or azimuth. */
  droppedSatellites: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function isParseableIso(v: unknown): v is string {
  return typeof v === "string" && Number.isFinite(Date.parse(v));
}

/**
 * FR-RE-13: a feed with any non-finite numeric input is treated as missing (null).
 */
export function sanitizeFeeds(input: RiskAssessmentInput): RiskAssessmentInput {
  const sw = input.solarWind;
  const swOk =
    sw !== null &&
    sw !== undefined &&
    [sw.speedKmS, sw.densityCm3, sw.btNt, sw.byNt, sw.bzNt].every(isFiniteNumber);
  const g = input.glotec;
  const gOk =
    g !== null &&
    g !== undefined &&
    isFiniteNumber(g.latStepDeg) &&
    isFiniteNumber(g.lonStepDeg) &&
    Array.isArray(g.cells) &&
    g.cells.every(
      (c) =>
        isFiniteNumber(c.latDeg) &&
        isFiniteNumber(c.lonDeg) &&
        isFiniteNumber(c.vTec) &&
        isFiniteNumber(c.anomaly)
    );
  const kpOk = isFiniteNumber(input.kpIndex);
  return {
    ...input,
    solarWind: swOk ? sw : null,
    glotec: gOk ? g : null,
    kpIndex: kpOk ? input.kpIndex : null,
  };
}

/**
 * FR-RE-14: drop satellites with non-finite elevation or azimuth and report
 * non-finite observer coordinates or an unparseable timestamp. Never throws.
 */
export function sanitizeInput(input: RiskAssessmentInput): SanitizeResult {
  const feedsClean = sanitizeFeeds(input);
  const rawSats: SatelliteObservation[] = Array.isArray(input.satellites) ? input.satellites : [];
  const satellites = rawSats.filter(
    (s) => s !== null && typeof s === "object" && isFiniteNumber(s.elevationDeg) && isFiniteNumber(s.azimuthDeg)
  );
  const invalidFields: InvalidInputField[] = [];
  if (!isFiniteNumber(input.latDeg)) invalidFields.push("latDeg");
  if (!isFiniteNumber(input.lonDeg)) invalidFields.push("lonDeg");
  if (!isParseableIso(input.timestampIso)) invalidFields.push("timestampIso");
  return {
    clean: { ...feedsClean, satellites },
    invalidFields,
    droppedSatellites: rawSats.length - satellites.length,
  };
}

/** Max length of any user-supplied string echoed in engine or explainer text (FR-RE-32). */
export const MAX_ECHO_CHARS = 80;

const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g;

/** Remove C0 and C1 control characters (U+0000–U+001F, U+007F–U+009F). */
export function stripControlChars(value: string): string {
  return value.replace(CONTROL_CHARS, "");
}

/** Cap a string at `max` UTF-16 units without leaving a dangling high surrogate. */
export function capText(value: string, max: number = MAX_ECHO_CHARS): string {
  if (value.length <= max) return value;
  let out = value.slice(0, max);
  const last = out.charCodeAt(out.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1);
  return out;
}

/**
 * FR-RE-32: make a user-supplied value safe to echo. Non-strings are stringified,
 * control characters are removed, and the result is capped at 80 characters.
 */
export function safeText(value: unknown, max: number = MAX_ECHO_CHARS): string {
  let s: string;
  if (typeof value === "string") s = value;
  else {
    try {
      s = String(value);
    } catch {
      s = typeof value;
    }
  }
  return capText(stripControlChars(s), max);
}
