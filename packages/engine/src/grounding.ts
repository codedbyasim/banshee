import type { RiskAssessment } from "./types.js";
import { safeText } from "./sanitize.js";

/**
 * Grounding and number verification for the Banshee explainer (FR-RE-24..27).
 *
 * `verifyGroundedNumbers` rejects any numeric claim in a text that is not backed by a
 * structured engine field. It normalizes Unicode digits and signs, ignores digits that
 * belong to identifiers (PRN 12, G05, SGP4, L1), does not treat compound/range hyphens as
 * signs, and binds every cited number to the unit or metric name adjacent to it.
 */

/** A single allowed metric: its numeric value and the unit it is reported in. */
export interface GroundedMetric {
  value: number;
  unit: string;
}

/** Allowlist map from a metric key to its grounded value and unit (FR-RE-26). */
export type GroundedMap = Record<string, GroundedMetric>;

export interface GroundingResult {
  ok: boolean;
  /** Numbers that could not be bound to an allowed metric at their cited unit. */
  ungrounded: number[];
  /** Set when the text was rejected outright (for example an unmapped digit). */
  reason?: string;
}

// --- Unicode normalization (FR-RE-24) --------------------------------------

const ARABIC_INDIC_0 = 0x0660; // U+0660..U+0669
const PERSIAN_0 = 0x06f0; // U+06F0..U+06F9
const FULLWIDTH_0 = 0xff10; // ０..９

/** Sign characters that must fold to ASCII hyphen-minus before extraction. */
const SIGN_CHARS = new Set(["\u2212", "\u2013", "\u2012", "\uFE63"]);

/**
 * Map Arabic-Indic (U+0660–U+0669), Persian (U+06F0–U+06F9) and fullwidth
 * (U+FF10–U+FF19) digits to ASCII, and U+2212/2013/2012/FE63 to `-`.
 * Other characters pass through unchanged.
 */
export function normalizeText(text: string): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp >= ARABIC_INDIC_0 && cp <= ARABIC_INDIC_0 + 9) {
      out += String.fromCharCode(0x30 + (cp - ARABIC_INDIC_0));
    } else if (cp >= PERSIAN_0 && cp <= PERSIAN_0 + 9) {
      out += String.fromCharCode(0x30 + (cp - PERSIAN_0));
    } else if (cp >= FULLWIDTH_0 && cp <= FULLWIDTH_0 + 9) {
      out += String.fromCharCode(0x30 + (cp - FULLWIDTH_0));
    } else if (SIGN_CHARS.has(ch)) {
      out += "-";
    } else {
      out += ch;
    }
  }
  return out;
}

const NON_ASCII_DIGIT = /\p{Nd}/u;

// --- Identifier stripping (FR-RE-25) ---------------------------------------

/**
 * Replace alphanumeric identifiers (a letter run with embedded/trailing digits such as
 * `G05`, `SGP4`, `L1`) and `PRN 12` style tokens with spaces so their digits are never
 * read as numbers. Length is preserved so index-based lookups stay valid.
 */
function blankIdentifiers(text: string): string {
  let out = text;
  // PRN 12 / PRN12 (keep the "PRN", blank the trailing number)
  out = out.replace(/\bPRN\s*\d+\b/gi, (m) => "PRN".padEnd(m.length, " "));
  // Letter-led alphanumerics containing at least one digit: G05, SGP4, L1, B2a
  out = out.replace(/\b[A-Za-z]+\d[A-Za-z0-9]*\b/g, (m) => " ".repeat(m.length));
  return out;
}

// --- Number extraction (FR-RE-25 hyphen handling) --------------------------

interface CitedNumber {
  value: number;
  /** Displayed decimal places (0 for an integer literal). */
  decimals: number;
  /** Index into the normalized text where the numeric literal starts. */
  start: number;
  /** Index just past the numeric literal. */
  end: number;
}

/**
 * Extract numeric literals. A leading `-` is a sign only at the start of the text or when
 * preceded by whitespace or `(`; a hyphen between digits or after a letter (ranges like
 * `5-15`, compounds like `10-minute`) is not a sign.
 */
function extractCited(text: string): CitedNumber[] {
  const re = /(-?)(\d+)(?:\.(\d+))?/g;
  const out: CitedNumber[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const signStart = m.index;
    const hasSign = m[1] === "-";
    let numStart = signStart;
    let signed = false;
    if (hasSign) {
      const before = signStart === 0 ? "" : text[signStart - 1] ?? "";
      if (before === "" || /\s/.test(before) || before === "(") {
        signed = true;
      } else {
        // Hyphen is a separator (range/compound), not a sign: skip it.
        numStart = signStart + 1;
      }
    }
    const intPart = m[2] ?? "";
    const fracPart = m[3];
    const literal = (signed ? "-" : "") + intPart + (fracPart !== undefined ? `.${fracPart}` : "");
    const value = Number(literal);
    if (!Number.isFinite(value)) continue;
    out.push({
      value,
      decimals: fracPart !== undefined ? fracPart.length : 0,
      start: numStart,
      end: m.index + m[0].length,
    });
  }
  return out;
}

// --- Unit / metric binding (FR-RE-26) --------------------------------------

/**
 * Canonical unit aliases. The key is the canonical unit stored in the grounded map; the
 * values are lowercased surface forms that may appear right after a number in the text.
 */
const UNIT_ALIASES: Record<string, string[]> = {
  "km/s": ["km/s"],
  nT: ["nt"],
  TECU: ["tecu"],
  Kp: ["kp"],
  min: ["min", "mins", "minute", "minutes"],
  m: ["m", "meter", "meters", "metre", "metres"],
  degrees: ["degree", "degrees", "deg", "\u00b0"],
  satellites: ["satellite", "satellites", "sat", "sats"],
  watch: ["watch"],
  fields: ["fields", "field"],
  replay: ["replay"],
  "": [],
};

/** Every lowercased surface form that counts as a unit token after a number. */
const KNOWN_UNIT_SURFACES = new Set<string>(
  Object.values(UNIT_ALIASES).flat().map((s) => s.toLowerCase())
);

/** Lowercased metric-name hints that may appear just before a number. */
const NAME_HINTS: Array<{ hint: string; unit: string }> = [
  { hint: "score", unit: "" },
  { hint: "gain", unit: "" },
  { hint: "multiplier", unit: "" },
  { hint: "kp", unit: "Kp" },
];

function unitMatches(canonical: string, surface: string): boolean {
  const aliases = UNIT_ALIASES[canonical];
  if (!aliases) return false;
  return aliases.includes(surface.toLowerCase());
}

/**
 * Read the unit token immediately following a number (skipping one space), but only when it
 * is a recognized unit surface form. An unrelated following word (such as "of" or "visible")
 * is not a unit, so the number is treated as bare.
 */
function unitAfter(text: string, end: number): string {
  const rest = text.slice(end);
  const m = /^\s*([A-Za-z\u00b0/%]+)/.exec(rest);
  if (!m) return "";
  const surface = (m[1] ?? "").toLowerCase();
  return KNOWN_UNIT_SURFACES.has(surface) ? (m[1] ?? "") : "";
}

/** Read the last word before a number (skipping one space), lowercased. */
function wordBefore(text: string, start: number): string {
  const before = text.slice(0, start);
  const m = /([A-Za-z]+)\W*$/.exec(before);
  return m ? (m[1] ?? "").toLowerCase() : "";
}

function withinTolerance(cited: number, decimals: number, allowed: number): boolean {
  if (decimals === 0) {
    // Integers compare exactly (FR-RE-27).
    return Number.isInteger(allowed) ? cited === allowed : Math.abs(cited - allowed) < 0.5;
  }
  const tol = 0.5 * Math.pow(10, -decimals);
  return Math.abs(cited - allowed) <= tol + 1e-9;
}

/** Options for `verifyGroundedNumbers`. */
export interface VerifyGroundedOptions {
  /**
   * Exact structured strings the text may echo verbatim (replay label, archive timestamp,
   * reason texts). Only exact occurrences of these strings, after the same normalization,
   * are blanked before number extraction. Their digits are never added to the allowlist
   * (FR-RE-27); a number outside an exact echo is still checked against `allowed`.
   */
  verbatim?: readonly string[];
}

const ALNUM = /[A-Za-z0-9]/;
/** Fill character for blanked echoes: not a digit, letter, space, or unit-surface character. */
const ECHO_FILL = "#";

/**
 * Replace every exact occurrence of each echo string with filler of the same length. An
 * occurrence is only blanked when it is not glued to a letter or digit on a side where the
 * echo itself starts or ends with one, so "2024" in "20245" is never blanked.
 */
function blankVerbatimEchoes(text: string, echoes: readonly string[]): string {
  // Only spans that contain a digit are blanked: a digit-free echo (for example a label of
  // a single space) has nothing to hide and must not erase unit adjacency elsewhere.
  const spans = Array.from(
    new Set(echoes.map((e) => normalizeText(e)).filter((e) => e.length > 0 && /\p{Nd}/u.test(e)))
  );
  // Longest first so an echo that contains another is blanked whole.
  spans.sort((a, b) => b.length - a.length);
  let out = text;
  for (const span of spans) {
    const startsAlnum = ALNUM.test(span[0] ?? "");
    const endsAlnum = ALNUM.test(span[span.length - 1] ?? "");
    let from = 0;
    for (;;) {
      const idx = out.indexOf(span, from);
      if (idx < 0) break;
      const before = idx === 0 ? "" : out[idx - 1] ?? "";
      const after = out[idx + span.length] ?? "";
      const leftOk = !startsAlnum || before === "" || !ALNUM.test(before);
      const rightOk = !endsAlnum || after === "" || !ALNUM.test(after);
      if (leftOk && rightOk) {
        out = out.slice(0, idx) + ECHO_FILL.repeat(span.length) + out.slice(idx + span.length);
        from = idx + span.length;
      } else {
        from = idx + 1;
      }
    }
  }
  return out;
}

/**
 * FR-RE-24..27. Verify that every number cited in `text` is grounded in `allowed`,
 * matched by the unit or metric name adjacent to it. Exact echoes listed in
 * `options.verbatim` are blanked first (see `buildGroundedEchoes`).
 */
export function verifyGroundedNumbers(
  text: string,
  allowed: GroundedMap,
  options: VerifyGroundedOptions = {}
): GroundingResult {
  const normalized = blankVerbatimEchoes(normalizeText(text), options.verbatim ?? []);
  // FR-RE-24: any non-ASCII decimal digit left after normalization is unsupported.
  const residual = normalized.replace(/[0-9]/g, "");
  if (NON_ASCII_DIGIT.test(residual)) {
    return { ok: false, ungrounded: [], reason: "UNSUPPORTED_DIGIT" };
  }

  const scrubbed = blankIdentifiers(normalized);
  const cited = extractCited(scrubbed);
  const metrics = Object.values(allowed);
  const ungrounded: number[] = [];

  for (const c of cited) {
    const afterUnit = unitAfter(scrubbed, c.end);
    const beforeWord = wordBefore(scrubbed, c.start);

    const candidateUnits = new Set<string>();
    if (afterUnit) candidateUnits.add(afterUnit);
    for (const h of NAME_HINTS) {
      if (beforeWord === h.hint) candidateUnits.add(h.unit || "\u0000none");
    }
    // A bare number (no adjacent unit token and no recognized name hint) is permissive:
    // it may match any allowed metric value. FR-RE-26 only rejects a number cited with the
    // *wrong* unit, which requires an adjacent unit to be present.
    const bare = candidateUnits.size === 0;

    let bound = false;
    for (const metric of metrics) {
      let unitOk = false;
      if (bare) {
        unitOk = true;
      } else {
        for (const cu of candidateUnits) {
          if (cu === "\u0000none") {
            if (metric.unit === "") unitOk = true;
          } else if (unitMatches(metric.unit, cu)) {
            unitOk = true;
          }
        }
      }
      if (unitOk && withinTolerance(c.value, c.decimals, metric.value)) {
        bound = true;
        break;
      }
    }
    if (!bound) ungrounded.push(c.value);
  }

  return { ok: ungrounded.length === 0, ungrounded };
}

// --- Allowlist construction (FR-RE-27) -------------------------------------

/**
 * Build the grounded allowlist from structured output fields only. It never parses numbers
 * from `replayLabel`, `replayArchiveIso` or driver labels (FR-RE-27).
 *
 * Driver metric values are included under both their driver code and their unit so a number
 * can be cited with the unit the engine assigned to it.
 */
export function buildGroundedMap(assessment: RiskAssessment): GroundedMap {
  const map: GroundedMap = {};
  const put = (key: string, value: number | null | undefined, unit: string): void => {
    if (typeof value === "number" && Number.isFinite(value)) map[key] = { value, unit };
  };

  put("score", assessment.score, "");
  put("visibleSatellites", assessment.visibleSatellites, "satellites");
  put("cleanSatellites", assessment.cleanSatellites, "satellites");
  put("ghostSatellites", assessment.ghostSatellites, "satellites");

  if (assessment.leadTimeMinutes !== null) {
    put("leadTimeMin", assessment.leadTimeMinutes, "min");
  }
  if (assessment.meanVtec !== null) put("meanVtec", assessment.meanVtec, "TECU");
  if (assessment.maxL1DelayMeters !== null) put("maxL1Delay", assessment.maxL1DelayMeters, "m");
  if (assessment.kpIndex !== null) put("kp", assessment.kpIndex, "Kp");
  if (assessment.solarWindSpeedKmS !== null) put("solarWindSpeed", assessment.solarWindSpeedKmS, "km/s");
  if (assessment.bzNt !== null) put("bz", assessment.bzNt, "nT");

  if (assessment.preset) {
    put("preset.mask", assessment.preset.elevationMaskDeg, "degrees");
    put("preset.gain", assessment.preset.gain, "");
  }

  // Per-feed ages (FR-RE-27): feeds.*.ageMin are structured fields.
  if (assessment.feeds) {
    put("ageMin.solarWind", assessment.feeds.solarWind.ageMin, "min");
    put("ageMin.glotec", assessment.feeds.glotec.ageMin, "min");
    put("ageMin.kp", assessment.feeds.kp.ageMin, "min");
    put("ageMin.gnss", assessment.feeds.gnss.ageMin, "min");
  }

  // Driver metric values with their engine-assigned unit (never the label text).
  for (const d of assessment.topReasons) {
    if (d.metricValue !== null) put(`driver.${d.code}`, d.metricValue, d.unit);
  }

  return map;
}

// --- Verbatim echo spans (FR-RE-27, FR-RE-30..32) ---------------------------

/** Cap for engine-built reason sentences; they already embed a safeText-capped user value. */
const REASON_ECHO_CHARS = 240;

/** The exact strings the explainer echoes; the explainer and the verifier both read these. */
export interface ExplainerEchoes {
  replayLabel?: string;
  replayArchiveIso?: string;
  replayInvalidReason?: string;
  unknownPresetReason?: string;
  customMaskDefaultedReason?: string;
}

/**
 * Build the echo strings from structured fields. User-supplied label and timestamp go
 * through `safeText` (FR-RE-32); reason sentences are control-stripped with a wider cap so
 * the full engine sentence is kept. Empty strings are omitted.
 */
export function buildExplainerEchoes(assessment: RiskAssessment): ExplainerEchoes {
  const out: ExplainerEchoes = {};
  const set = (key: keyof ExplainerEchoes, value: unknown, max?: number): void => {
    if (value === undefined || value === null) return;
    const s = safeText(value, max);
    if (s.length > 0) out[key] = s;
  };
  if (assessment.isReplay) {
    set("replayLabel", assessment.replayLabel);
    set("replayArchiveIso", assessment.replayArchiveIso);
    if (assessment.replayState === "unverified") {
      set("replayInvalidReason", assessment.replayInvalidReason, REASON_ECHO_CHARS);
    }
  }
  set("unknownPresetReason", assessment.unknownPresetReason, REASON_ECHO_CHARS);
  set("customMaskDefaultedReason", assessment.customMaskDefaultedReason, REASON_ECHO_CHARS);
  return out;
}

/**
 * Verbatim echo list for `verifyGroundedNumbers(text, map, { verbatim })`. These strings are
 * blanked only where they occur exactly; their digits never enter the numeric allowlist.
 */
export function buildGroundedEchoes(assessment: RiskAssessment): string[] {
  return Object.values(buildExplainerEchoes(assessment)).filter(
    (s): s is string => typeof s === "string" && s.length > 0
  );
}
