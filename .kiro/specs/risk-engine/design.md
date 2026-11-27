# Design: Risk Engine

`packages/engine` stays DOM-free and side-effect-free: no `window`, `document`, `fetch`, `Date.now()`, `Math.random()`, or module-level mutable state. Time and feed ages are inputs.

- `src/physics.ts`: Newell coupling (GSM By/Bz), L1 lead time (null outside `[250, 3000]` km/s), IPP spherical trigonometry with `wrapLongitude()`, slant mapping `M(el)`, L1 delay `0.162 m/TECU`, geomagnetic latitude + post-sunset window (`|magLat| <= 25°`, 18:30 to 00:30 local solar time).
- `src/tec.ts`: Bilinear grid sampler handling ±180° wraparound and clamping to neighbour `[min, max]`.
- `src/geometry.ts`: Elevation/azimuth + clean vs ghost satellite classification + simplified PDOP estimate. Uses the mask from the resolved preset.
- `src/presets.ts` (new): pure constant table and resolver.
  ```ts
  export type PresetId = "TRACTOR_RTK" | "SURVEY_DRONE" | "CUSTOM";
  export interface SensitivityPreset { id: PresetId; label: string; elevationMaskDeg: number; gain: number }
  export const SENSITIVITY_PRESETS: Readonly<Record<PresetId, SensitivityPreset>> = {
    TRACTOR_RTK:  { id: "TRACTOR_RTK",  label: "Tractor RTK",  elevationMaskDeg: 15, gain: 1.0  }, // default, tunable
    SURVEY_DRONE: { id: "SURVEY_DRONE", label: "Survey Drone", elevationMaskDeg: 10, gain: 1.15 }, // default, tunable
    CUSTOM:       { id: "CUSTOM",       label: "Custom",       elevationMaskDeg: 15, gain: 1.0  }, // mask here is the default only
  };
  export const DEFAULT_PRESET_ID: PresetId = "TRACTOR_RTK";
  export const DEFAULT_CUSTOM_MASK_DEG = 15;
  export function resolvePreset(
    id: unknown,
    callerMaskDeg?: unknown,
  ): { preset: SensitivityPreset; unknownRequested: string | null; customMaskDefaulted: boolean };
  ```
  `resolvePreset` returns `TRACTOR_RTK` for `undefined`, and `TRACTOR_RTK` plus `unknownRequested` for any unknown value. For `TRACTOR_RTK` and `SURVEY_DRONE` the caller mask is ignored. For `CUSTOM` the returned preset has `elevationMaskDeg = clamp(callerMaskDeg, 0, 90)` when it is a finite number; otherwise 15 and `customMaskDefaulted = true`. The table is frozen and `resolvePreset` returns a new object for `CUSTOM` instead of mutating the table. Validation (mask in `[0, 90]`, gain in `[1, 1.5]`) is covered by a test over the table and over resolver output.
- `src/risk.ts`: Weighted monotonic combiner + fail-safe staleness guard + alert hysteresis. Flow:
  1. Call `resolvePreset(input.presetId, input.elevationMaskDeg)` to get the preset and effective mask. Add a reason when `unknownRequested` is set or `customMaskDefaulted` is true (mask missing or invalid, 15° applied).
  2. Compute staleness (per-feed names collected for the `STALE_DATA` reason). Replay is exempt only when label and archive timestamp are present, with ages measured against the archive timestamp.
  3. `raw` = sum of driver points (unchanged weights).
  4. `scaled = min(100, max(0, round(raw * gain)))`.
  5. If stale, `score = max(35, scaled)`. Level from fixed bands via `scoreToLevel`.
  6. Output adds `preset: { id, label, elevationMaskDeg, gain }`, per-feed age and source, and an unknown-preset reason when applicable.
  Driver `contribution` values stay as unscaled points and are labelled so; the explainer cites only values present in the output JSON.
- `src/types.ts`: add `presetId?: string` to `RiskAssessmentInput` (the caller-supplied `elevationMaskDeg` is kept, read only when the preset is `CUSTOM` and ignored otherwise) and `preset` to `RiskAssessment`. The default preset stays `TRACTOR_RTK`.
- `src/explainer.ts`: may cite preset id, mask and gain only from the output JSON; includes the heuristic and regional-estimate wording and the REPLAY badge text when `isReplay`.
- `tests/engine.pbt.test.ts`: existing 9 `fast-check` suites tracing FR-RE-1..FR-RE-7, plus the new properties below.

## Preset correctness properties (fast-check)
- P10 Bounds under presets: for any input and any preset id, `score` is an integer in `[0, 100]` (FR-RE-8.7).
- P11 Fixed bands: for any score and preset, `level` matches `0–34/35–64/65–100`, or is not `Safe` when stale (FR-RE-8.6).
- P12 Stale never Safe under any preset: for any preset and any stale or missing feed, `level !== "Safe"` and a `STALE_DATA` reason exists (FR-RE-8.10, FR-RE-3).
- P13 Gain monotonicity: with identical inputs, a higher-gain preset never yields a lower score (FR-RE-8.8).
- P14 Driver monotonicity per preset: worsening one driver never lowers the score for each preset (FR-RE-8.9).
- P15 Determinism: two calls with the same input return deeply equal output (FR-RE-8.11).
- P16 Unknown or missing preset resolves to `TRACTOR_RTK` with the reason present for unknown ids; the output preset id is always a known id (FR-RE-8.3-8.5), using arbitrary strings and non-string values.
- P17 Mask effect: the Survey Drone mask (10°) never yields fewer visible satellites than the Tractor RTK mask (15°) for the same sky (FR-RE-5, FR-RE-8.2).
- P18 CUSTOM mask clamp: for any finite caller mask, `CUSTOM` yields an effective mask equal to `clamp(mask, 0, 90)`, always in `[0, 90]`, with gain 1.00 (FR-RE-8.12).
- P19 Caller mask ignored by non-CUSTOM presets: for any caller mask and any of `TRACTOR_RTK`, `SURVEY_DRONE`, or an unknown id, the effective mask equals the preset mask (FR-RE-8.12).
- P20 CUSTOM invalid mask fallback: for any missing or non-finite caller mask (`undefined`, `NaN`, `±Infinity`, non-number), `CUSTOM` uses 15° and the output contains the defaulted-mask reason (FR-RE-8.13).
- P10-P17 are run over all three presets, including `CUSTOM` with arbitrary caller masks (finite, out of range, and non-finite). P13 uses gain 1.00 for `CUSTOM`; P17 generalizes to "a lower effective mask never yields fewer visible satellites".
- Example tests: preset table validity, lead-time null outside `[250, 3000]`, replay without label treated as live, staleness boundary at exactly max age.

# Design Addendum: Review Fixes (FR-RE-14..33)

Engine purity rules above still hold. All additions are pure functions with time passed in.

## Architecture changes
- `src/sanitize.ts` (new): `sanitizeInput(input) -> { clean, invalidFields: string[], droppedSatellites: number }`. Drops satellites with non-finite elevation or azimuth. Reports non-finite `lat`, `lon` or unparseable `timestampIso` in `invalidFields`. `risk.ts` calls it first. A non-empty `invalidFields` adds an `INVALID_INPUT` reason and forces the stale floor (FR-RE-14).
- `src/risk.ts`:
  - `isFreshAge(age, max)` is true only for finite `0 <= age <= max`. `listStaleFeeds(feeds, opts)` is the single implementation; `isAnyFeedStale = (...) => listStaleFeeds(...).length > 0` (FR-RE-21).
  - Empty `satellites` adds `gnss` to the stale list; empty `glotec.cells` adds `glotec` (FR-RE-20).
  - `combineRiskDrivers` replaces non-finite contributions with 0 and returns `nonFinite: true`; `scoreToLevel(NaN)` returns `Uneasy`; the final score is forced to an integer in `[0, 100]` and the stale floor applies when `nonFinite` (FR-RE-15).
  - `STALE_DATA.metricValue = max(age of stale feeds that have a finite age)`, else `null` (FR-RE-18).
  - Zero visible satellites after the mask adds reason `NO_VISIBLE_SATELLITES` and applies the stale floor (FR-RE-20).
- `src/tec.ts`: `sampleGloTEC(...)` returns a discriminated union `{ status: "ok"; tecu: number } | { status: "unavailable" }`. No 15 TECU fallback. The TEC driver for `unavailable` has `metricValue: null`, zero contribution and text "regional ionosphere estimate unavailable" (FR-RE-16). Kp missing yields a Kp driver with `metricValue: null`, text "Kp unavailable" (FR-RE-17).
- `src/types.ts`: `RiskDriver.metricValue: number | null`. Add `replayInvalidReason?: string`, `replayState: "none" | "verified" | "unverified"`, `invalidInput?: string[]` (FR-RE-19, FR-RE-22). Each feed record may carry `sampleIso?: string`.
- Replay (`src/replay.ts`, new, pure):
  ```ts
  export function validateReplay(input): { valid: boolean; archiveMs: number | null; reason: string | null }
  ```
  Uses a strict ISO-8601 regex plus a round-trip check on `Date.parse` (rejects `2024-02-31`). Invalid when `isReplay` and label empty, timestamp invalid, or archive later than `timestampIso`. Invalid: stale, `replayState = "unverified"`, `replayInvalidReason` set. Valid: feed age = `(archiveMs - sampleMs)/60000` when `sampleIso` exists, else the supplied `ageMin`; the post-sunset window uses `archiveMs` (FR-RE-22, FR-RE-23).
- `src/explainer.ts`: English only; signature `explainAssessment(a: RiskAssessment): string` with no `lang`. Sections: level and score, drivers (`null` → "unavailable"), staleness notice (each stale feed, age or "missing", "lead time and TEC are not current"), replay (`REPLAY`, archive timestamp, "archive" not "live", unverified state), preset (gain called a "sensitivity multiplier"), `unknownPresetReason` and `customMaskDefaultedReason` text. `safeText(s)` strips control characters and caps at 80 characters before any echo (FR-RE-28..32).
- `verifyGroundedNumbers(text, allowed: GroundedMap)`, where `GroundedMap = Record<string, { value: number; unit: string }>` (FR-RE-24..27):
  1. `normalizeText`: NFKC would fold fullwidth digits and some signs, but Arabic-Indic and Persian digits are mapped explicitly via code-point tables, signs U+2212/2013/2012/FE63 map to `-`.
  2. If `/\p{Nd}/u` still matches a non-ASCII digit, return `{ ok: false, reason: "UNSUPPORTED_DIGIT" }`.
  3. Strip identifiers with `/\b[A-Za-z]+\d+[A-Za-z0-9]*\b/` (`L1`, `G05`, `SGP4`) and `PRN\s*\d+`; the literal `L1` stays allowed.
  4. Extract `(?<![\w.])(-?)(\d+(?:\.\d+)?)` where `-` counts as a sign only at the start or after whitespace or `(`, never between digits or letters (so `5-15` yields 5 and 15, `10-minute` yields 10).
  5. For each number, read the adjacent token (unit after the number, or metric name just before it). Look up the metric by unit/name aliases (`min`/`minutes` → lead time or age by name, `km/s`, `nT`, `TECU`, `Kp`, `%`, `°`). Pass when `|cited - value| <= 0.5 * 10^-decimals`, with integers (0 decimals) exact. A number matching a different metric's value but with the wrong unit fails.
  6. `buildGroundedMap(assessment)` reads only structured fields (`score`, `leadTimeMin`, driver `metricValue` and `unit`, `preset.elevationMaskDeg`, `preset.gain`, `feeds.*.ageMin`, visible satellite count). It never parses `replayLabel`, `replayArchiveIso` or driver labels. The archive timestamp is printed in a separate segment that the verifier strips by exact match of the structured `replayArchiveIso`.

## Design decisions
- Unavailable is a distinct state, not a value, so no downstream consumer can chart or cite a made-up number.
- A single `isFreshAge` predicate decides freshness. A negative age (clock skew) is stale because it cannot be trusted.
- Grounding is bound to metric and unit because "any allowed number" lets `5 min` pass when only `5 TECU` exists.
- The `lang` parameter is removed instead of defaulted, so no hidden Urdu path remains.

## Correctness Properties (new, fast-check, 100+ runs each)
- P21 Sanitization: for any input with arbitrary `NaN`/`±Infinity` in satellite elevation or azimuth, output never throws, dropped satellites never appear in visible or ghost lists, and score is an integer in `[0, 100]` (FR-RE-14).
- P22 Invalid observer or time: for any input with non-finite lat, lon or unparseable `timestampIso`, `level !== "Safe"` and an `INVALID_INPUT` reason exists, for every preset (FR-RE-14).
- P23 Non-finite score guard: for any score in `{NaN, ±Infinity, finite}`, `scoreToLevel` returns `Safe` only when the score is finite and `<= 34`; `combineRiskDrivers` over drivers containing non-finite contributions returns a finite score and `nonFinite: true` (FR-RE-15).
- P24 Unavailable not numeric: for any assessment with `glotec` null or empty, the TEC driver has `metricValue === null` and the sampler returns `status: "unavailable"`; for any assessment with `kp` null, the Kp driver has `metricValue === null` (FR-RE-16, FR-RE-17).
- P25 STALE_DATA metric: for any set of feed ages, `STALE_DATA.metricValue` equals the max age of stale present feeds, or null when none is present, and is never 999 (FR-RE-18).
- P26 Empty collections: for any input with empty `satellites` or empty `glotec.cells`, the named feed is in the stale list and `level !== "Safe"`; with zero visible satellites after the mask, `level !== "Safe"` with the no-visible reason (FR-RE-20).
- P27 Age validity: for any age that is negative, `NaN`, `±Infinity`, or `null`, the feed is stale; for any finite age in `[0, max]`, it is fresh; `isAnyFeedStale(x) === (listStaleFeeds(x).length > 0)` (FR-RE-21).
- P28 Invalid replay: for any `isReplay: true` input with an empty label, a non-ISO archive string, or an archive later than `timestampIso`, `level !== "Safe"`, `replayInvalidReason` is set, and `replayState === "unverified"` (FR-RE-22).
- P29 Replay age basis: for any valid replay with sample timestamps, each feed age equals `(archive - sample)` in minutes, and the post-sunset factor equals the factor computed with `timestampIso` set to the archive time (FR-RE-23).
- P30 Digit and sign normalization: for any grounded number rendered with ASCII, Arabic-Indic, Persian or fullwidth digits and with `-`, U+2212, U+2013, U+2012 or U+FE63 signs, `verifyGroundedNumbers` gives the same verdict as for the ASCII form; for any text containing an unmapped `\p{Nd}` digit, it rejects (FR-RE-24).
- P31 Identifier and hyphen immunity: for any text where `L1`, `PRN n`, `Gnn`, `SGP4` and hyphenated ranges are inserted around grounded numbers, the verdict is unchanged and no ignored digit is read as a number or sign (FR-RE-25).
- P32 Metric and unit binding: for any grounded map with two metrics of different units, citing metric A's value with metric B's unit is rejected, and citing it with A's unit is accepted (FR-RE-26).
- P33 Tolerance and source: for any value, a cited number within half a unit of its displayed precision passes and one beyond it fails; integers pass only when exactly equal; numbers present only in `replayLabel`, `replayArchiveIso` or driver labels are never in the allowlist (FR-RE-27).
- P34 Explainer self-grounding: for any generated assessment under each preset (`TRACTOR_RTK`, `SURVEY_DRONE`, `CUSTOM`), `verifyGroundedNumbers(explain(a), buildGroundedMap(a))` is ok (FR-RE-28).
- P35 Staleness notice: for any assessment with at least one stale feed, the explainer text contains each stale feed name and its age or "missing", and the phrase "not current" (FR-RE-29).
- P36 Replay wording: for any replay assessment, the text contains `REPLAY` and the archive timestamp and does not contain the word "live" (FR-RE-30).
- P37 String safety: for any user-supplied string containing control characters or longer than 80 characters, the echoed text contains no control characters and is at most 80 characters (FR-RE-32).
- Example and edge tests: `NaN` lat; empty `satellites`; empty `glotec.cells`; ages `-1`, `NaN`, `null`; U+2212 `−5 nT`; Arabic-Indic `٥`; `5-15 min` range; `L1` literal; `5 TECU` cited as `5 min`; replay with `2024-02-31T00:00:00Z`; replay label empty; English staleness text for a stale solar wind feed; unknown preset and defaulted mask text; no `lang` argument accepted.
- PBT does not apply to the Urdu removal (FR-RE-33), steering text edits or UI rendering. Those use grep checks and example tests.

## Error handling
Invalid or missing data never throws. It yields a stale or `INVALID_INPUT` assessment with level at least `Uneasy`.
