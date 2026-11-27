# Spec: Risk Engine (`packages/engine`)

## Glossary
- **System**: The `@banshee/engine` package. It is pure, DOM-free, side-effect-free and deterministic.
- **Score**: Integer risk score in `[0, 100]`. A physically motivated heuristic, not a trained ML model, not certified for aviation or safety-of-life navigation.
- **Level**: `Safe` (`0–34`), `Uneasy` (`35–64`) or `Haunted` (`65–100`). The bands are fixed and are never changed by a preset.
- **Required feeds / max ages**: `solarWind` 30 min, `glotec` 45 min, `kp` 180 min, `gnss` 48 h (2880 min). A feed is stale when its age exceeds its max age (age equal to max age is fresh) or when the feed is missing (`null`).
- **Raw score**: The unrounded sum of the driver points, before the preset gain, rounding and clamping.
- **Preset**: A named operator sensitivity profile (`TRACTOR_RTK`, `SURVEY_DRONE`, `CUSTOM`) defining an elevation mask and a sensitivity gain. Only `CUSTOM` takes its mask from the caller.
- **CUSTOM**: Preset with gain 1.00 whose elevation mask is the caller-supplied `elevationMaskDeg`, clamped to `[0, 90]` degrees.
- **Default mask**: 15 degrees, used by `CUSTOM` when the caller mask is missing or non-finite.
- **Gain (`k`)**: Positive finite multiplier applied to the raw score. Defined only by the preset.
- **Elevation mask**: Minimum satellite elevation in degrees. Satellites below it are not visible.
- **vTEC / sTEC**: Vertical / slant Total Electron Content in TECU. `sTEC = vTEC * M(el)`.
- **IPP**: Ionospheric Pierce Point on a thin shell at `H_IONO = 350.0 km`, with `R_E = 6371.0 km`.
- **GSM**: Geocentric Solar Magnetospheric frame. All `By`, `Bz`, `Bt` inputs are GSM nT. GSE input is not accepted.
- **Replay**: An archived historical storm (Gannon May 2024, Halloween Oct 2003, Nov 2025, Jan 2026) evaluated instead of live data.
- **Post-sunset window**: Local solar time `18:30` to `00:30` (wraps midnight), applied when `|magneticLat| <= 25°`.

## Requirements (EARS)
- **FR-RE-1 (Bounds):** THE System SHALL compute an integer risk score in `[0, 100]` and map it deterministically to `Safe` (`0–34`), `Uneasy` (`35–64`), or `Haunted` (`65–100`), for every input including missing or out-of-range feed values.
- **FR-RE-2 (Monotonicity):** WHEN any single risk driver worsens (higher solar wind Newell coupling, higher TEC anomaly in TECU, higher Kp, a higher ghost-satellite fraction, or a higher post-sunset scintillation factor) and all other inputs including the active preset remain unchanged, THE System SHALL NOT lower the risk score.
- **FR-RE-3 (Fail-Safe Staleness):** IF any required feed (solar wind, GloTEC, Kp, or GNSS orbits) is missing or its age exceeds its max age (`solarWind` 30 min, `glotec` 45 min, `kp` 180 min, `gnss` 2880 min), THEN THE System SHALL output a level of `Uneasy` or `Haunted`, never `Safe`, and SHALL include a `STALE_DATA` reason naming each stale or missing feed. This applies to every preset.
- **FR-RE-4 (Lead Time Physics):** WHEN solar wind speed is in `[250, 3000]` km/s, THE System SHALL compute a positive finite L1 lead time in minutes as `(1_500_000 / speedKmPerSec) / 60` that strictly decreases as speed rises. IF solar wind speed is missing, non-finite, or outside `[250, 3000]` km/s, THEN THE System SHALL return a null lead time and SHALL NOT report a lead time number.
- **FR-RE-5 (Geometry & IPP):** WHEN computing visible GNSS satellites above an elevation mask, raising the elevation mask SHALL NEVER increase the visible satellite count. THE System SHALL compute each IPP at `H_IONO = 350 km` using the steering IPP formulas, with latitude in `[-90, 90]` and longitude wrapped to `[-180, 180)`, in degrees at the API boundary and radians internally.
- **FR-RE-6 (TEC Interpolation):** WHEN sampling GloTEC between surrounding grid cells, THE System SHALL return a bilinearly interpolated TEC value in TECU that lies between the minimum and maximum of its four neighbouring cells, including across the ±180° longitude wrap.
- **FR-RE-7 (Transparent Reasons):** THE System SHALL return the top 3 plain-language risk drivers, ordered by descending contribution, each with the exact numeric value and unit used by the engine. WHEN a driver concerns TEC, THE System SHALL label it a "regional ionosphere estimate".
- **FR-RE-8 (Operator Sensitivity Preset):** see the dedicated section below.
- **FR-RE-9 (Output Labelling):** THE System SHALL include in every assessment (a) a disclaimer stating the score is an advisory heuristic, not a trained ML model and not certified for aviation or safety-of-life navigation, (b) the age in minutes and source of each feed used, (c) `isReplay`, and (d) the active preset id. WHERE the input is a Replay, THE System SHALL set `isReplay` to true and SHALL include the replay label and archive timestamp. THE System SHALL NOT describe TEC risk as "exact point over your tractor".
- **FR-RE-10 (Replay Staleness):** WHERE the input is a Replay, THE System SHALL evaluate feed age against the archive timestamp instead of wall-clock time and SHALL report `isReplay` true. IF a Replay input lacks a replay label or archive timestamp, THEN THE System SHALL treat the input as live for staleness purposes.
- **FR-RE-11 (Slant Mapping):** THE System SHALL compute `M(el) = 1 / sqrt(1 - ((R_E / (R_E + H_IONO)) * cos(el))^2)` with `el` in radians and `sTEC = vTEC * M(el)`, such that `M(el) >= 1` and `M` does not increase as elevation rises over `[0, 90]` degrees.
- **FR-RE-12 (Post-Sunset Scintillation):** WHILE `|magneticLat| <= 25°` and local solar time is within `18:30` to `00:30`, THE System SHALL set the post-sunset scintillation factor to a value in `[0, 1]` that is non-decreasing in TEC anomaly and greater than the factor outside the window, independent of Kp. WHILE outside that latitude or time window, THE System SHALL set the factor to 0.
- **FR-RE-13 (Units and Frames):** THE System SHALL accept solar wind speed in km/s, magnetic field in nT in GSM, TEC in TECU, distances in km, and SHALL compute Newell coupling `v^(4/3) * Bt^(2/3) * |sin(theta_c / 2)|^(8/3)` with `theta_c = atan2(By, Bz)` and `Bt = sqrt(By^2 + Bz^2)`. IF any numeric input is non-finite, THEN THE System SHALL treat the corresponding feed as missing, which triggers FR-RE-3.

## FR-RE-8 Operator Sensitivity Preset (detail)

**User Story:** As a farmer or drone pilot, I want to choose "Tractor RTK", "Survey Drone" or "Custom", so that the elevation mask and sensitivity match my equipment.

Default values below are proposed by this spec, since steering gives none. They are marked **(default, tunable)** and may be changed by editing the preset table only.

| Preset id | Label | Elevation mask | Gain `k` |
|---|---|---|---|
| `TRACTOR_RTK` (default) | Tractor RTK | 15° **(default, tunable)** | 1.00 **(default, tunable)** |
| `SURVEY_DRONE` | Survey Drone | 10° **(default, tunable)** | 1.15 **(default, tunable)** |
| `CUSTOM` | Custom | caller-supplied `elevationMaskDeg`, clamped to `[0, 90]`; 15° when missing or non-finite | 1.00 |

Constraints on any preset table: mask in `[0, 90]` degrees, `k` finite and in `[1.00, 1.50]`. For `CUSTOM` the table holds only the gain and the default mask; the effective mask is resolved per assessment. Sensitivity is applied only as `score = clamp(round(rawScore * k), 0, 100)`. Level bands stay fixed at `0–34` / `35–64` / `65–100`.

### Acceptance Criteria
1. THE System SHALL accept a preset id of `TRACTOR_RTK`, `SURVEY_DRONE` or `CUSTOM` in the assessment input.
2. WHEN a valid preset id is given, THE System SHALL use the effective elevation mask of that preset for satellite visibility and the preset gain `k` as the score multiplier.
3. IF the preset id is missing, THEN THE System SHALL use `TRACTOR_RTK`.
4. IF the preset id is not one of the known ids, THEN THE System SHALL use `TRACTOR_RTK`, and SHALL include a reason stating the requested id was unknown and the default was applied.
5. THE System SHALL include the effective preset id, elevation mask in degrees, and gain `k` in every assessment output, including when the default was applied.
6. THE System SHALL keep the level bands `Safe` `0–34`, `Uneasy` `35–64`, `Haunted` `65–100` identical for every preset.
7. THE System SHALL compute `score = min(100, max(0, round(rawScore * k)))`, so the score stays within `[0, 100]` for every preset.
8. WHEN all inputs other than the preset are identical and `k_a <= k_b`, THE System SHALL return a score under preset b that is greater than or equal to the score under preset a. (Gain monotonicity.)
9. WHEN any risk driver worsens under a fixed preset, THE System SHALL NOT lower the score (FR-RE-2 holds for every preset).
10. IF any required feed is stale or missing, THEN THE System SHALL return a level other than `Safe` under every preset, with the stale floor `max(35, score)` applied after the gain.
11. WHEN the same input and preset are given twice, THE System SHALL return identical output. The preset SHALL NOT depend on time, randomness, or global mutable state.
12. WHEN the preset id is `CUSTOM` and the caller-supplied `elevationMaskDeg` is finite, THE System SHALL use that value clamped to `[0, 90]` degrees as the effective elevation mask, with gain 1.00. WHEN the preset id is `TRACTOR_RTK` or `SURVEY_DRONE` (including after the default fallback), THE System SHALL ignore the caller-supplied `elevationMaskDeg` and use the preset mask.
13. IF the preset id is `CUSTOM` and the caller-supplied `elevationMaskDeg` is missing or non-finite, THEN THE System SHALL use the default mask of 15 degrees and SHALL include a reason stating the custom mask was missing or invalid and 15 degrees was applied.

## Ambiguities and conflicts resolved
- Staleness boundary (equal to max age) now defined as fresh; `gnss` max age stated in minutes (2880) matching code.
- Stale floor: Safe is blocked; Uneasy is the minimum, with a named stale-feed reason (FR-RE-3).
- Lead-time behavior outside `[250, 3000]` km/s was undefined; now null (FR-RE-4).
- Replay handling was undefined for staleness and output; FR-RE-9 and FR-RE-10 define it. The current code skips staleness for any replay flag, which FR-RE-10 narrows (see tasks).
- Regional resolution disclosure and heuristic label were absent; added to FR-RE-7 and FR-RE-9.
- Units, frames (GSM), Newell, slant mapping and post-sunset rule were only in steering; now explicit (FR-RE-11..13).
- FR-RE-2 listed "fewer clean satellites"; this is expressed as a higher ghost fraction to match the scorer.
- FR-RE-5 said "SHALL NEVER" and FR-RE-2 "SHALL NOT"; reworded to testable forms.

## Review Fixes (physicist + skeptic review) — FR-RE-14 onward

Existing FR-RE-1..13 keep their IDs. Where a new requirement narrows an older one, the older ID is cited. FR-RE-10's fallback "treat as live" is superseded by FR-RE-21.

### Additional glossary
- **INVALID_INPUT**: Reason code attached when observer latitude, observer longitude or `timestampIso` is non-finite or unparseable.
- **Unavailable**: State of a driver or sample whose source feed is missing or empty. It carries `metricValue = null` and no invented number.
- **Grounded metric**: An entry of the allowlist map, keyed by metric key (for example `leadTimeMin`, `kp`, `tecuAnomaly`, `ageMin.solarWind`), holding a `value` and a `unit`.
- **Displayed precision**: The number of decimal places in the cited text of a number (0 for an integer).
- **Archive timestamp**: A strictly valid ISO-8601 instant (`YYYY-MM-DDTHH:mm:ss[.sss]Z` or with numeric offset) naming when a Replay was recorded.
- **replayInvalidReason**: Output string naming why a Replay input was rejected.
- **Explainer**: `explainer.ts`, English only, no `lang` parameter.

### Requirements

- **FR-RE-14 (Input Sanitization):** WHEN an assessment input contains a satellite whose elevation or azimuth is non-finite, THE System SHALL drop that satellite before visibility, ghost and PDOP computation. IF observer latitude, observer longitude or `timestampIso` is non-finite or unparseable, THEN THE System SHALL return a level of `Uneasy` or `Haunted`, never `Safe`, and SHALL include a reason with code `INVALID_INPUT` naming each invalid field.
- **FR-RE-15 (Non-finite Score Guard):** IF a raw score, a scaled score or a driver contribution is non-finite, THEN THE System SHALL treat the assessment as stale, SHALL map the score to a level of at least `Uneasy`, and SHALL output an integer score in `[0, 100]`. THE `scoreToLevel` function SHALL return `Uneasy` for a non-finite score, and THE `combineRiskDrivers` function SHALL replace a non-finite contribution with 0 and flag the assessment as stale.
- **FR-RE-16 (Unavailable GloTEC):** IF the GloTEC feed is missing or contains zero cells, THEN THE TEC sampler SHALL return an `unavailable` result carrying no TECU number, AND THE TEC driver SHALL state that the regional ionosphere estimate is unavailable with `metricValue = null`.
- **FR-RE-17 (Unavailable Kp):** IF the Kp feed is missing, THEN THE Kp driver SHALL state that Kp is unavailable with `metricValue = null` and SHALL NOT report a Kp value of 0.0.
- **FR-RE-18 (STALE_DATA Metric):** WHEN a `STALE_DATA` reason is produced, THE System SHALL set its `metricValue` to the maximum age in minutes among the feeds that are present and stale. IF every stale feed is absent, THEN THE System SHALL set `metricValue` to null. THE System SHALL NOT use a sentinel age such as 999.
- **FR-RE-19 (Nullable Metric Value):** THE `RiskDriver.metricValue` field SHALL have type `number | null`. WHEN `metricValue` is null, THE Explainer and THE web UI SHALL render the text "unavailable" in place of a number.
- **FR-RE-20 (Empty Feeds Are Missing):** IF the `satellites` array is empty, THEN THE System SHALL treat the `gnss` feed as stale. IF `glotec.cells` is empty, THEN THE System SHALL treat the `glotec` feed as stale. IF zero satellites remain visible after the elevation mask, THEN THE System SHALL return a level of at least `Uneasy` with a reason stating that no satellites are visible above the effective mask.
- **FR-RE-21 (Feed Age Validity):** THE System SHALL treat a feed as fresh only WHEN its age in minutes is a finite number, is greater than or equal to 0, and is less than or equal to its max age. A negative, `NaN`, infinite, `null` or missing age SHALL be stale. THE function `isAnyFeedStale` SHALL delegate to `listStaleFeeds`, and no second staleness implementation SHALL exist.
- **FR-RE-22 (Invalid Replay):** IF `isReplay` is true AND the replay label is empty, or the archive timestamp is not a strictly valid ISO-8601 instant, or the archive timestamp is later than `timestampIso`, THEN THE System SHALL mark the assessment stale, SHALL set `replayInvalidReason`, SHALL return a level other than `Safe`, and SHALL show the state "unverified archive". This supersedes the FR-RE-10 statement that such input is treated as live.
- **FR-RE-23 (Valid Replay Ages):** WHERE the input is a valid Replay and feed samples carry timestamps, THE System SHALL compute each feed age as the archive timestamp minus the sample timestamp. WHERE the input is a valid Replay, THE System SHALL use the archive timestamp in place of `timestampIso` for the post-sunset window and the local solar time.
- **FR-RE-24 (Unicode Normalization):** BEFORE extracting numbers, THE `verifyGroundedNumbers` function SHALL map Arabic-Indic digits (U+0660–U+0669), Persian digits (U+06F0–U+06F9) and fullwidth digits (U+FF10–U+FF19) to ASCII digits, and SHALL map the sign characters U+2212, U+2013, U+2012 and U+FE63 to `-`. IF any `\p{Nd}` character remains after normalization, THEN THE function SHALL reject the text.
- **FR-RE-25 (Identifier and Hyphen Handling):** THE `verifyGroundedNumbers` function SHALL ignore digits that belong to alphanumeric identifiers (such as `PRN 12`, `G05`, `SGP4`) and SHALL accept the literal `L1`. THE function SHALL NOT treat a hyphen between two numbers or inside a compound (for example `10-minute`, `5-15`) as a sign.
- **FR-RE-26 (Metric and Unit Binding):** THE `verifyGroundedNumbers` function SHALL build its allowlist as a map from metric key to `{ value, unit }`. A cited number SHALL pass only WHEN it equals the value of the metric whose unit or metric name is adjacent to it in the text. A number that equals some other allowed metric but is cited with the wrong unit SHALL be rejected.
- **FR-RE-27 (Tolerance and Allowlist Source):** THE `verifyGroundedNumbers` function SHALL compare a cited number to the allowed value at the displayed precision (half a unit of the last displayed decimal), and SHALL compare integers exactly. THE allowlist SHALL be built only from structured output fields, including `feeds.*.ageMin`, and SHALL NOT include numbers parsed from `replayLabel`, `replayArchiveIso` or driver labels.
- **FR-RE-28 (Self-Grounded Explainer):** FOR ALL presets, including `SURVEY_DRONE`, THE deterministic English Explainer output SHALL pass `verifyGroundedNumbers` against the assessment it explains.
- **FR-RE-29 (Explainer Staleness Notice):** WHEN any feed is stale, THE Explainer SHALL name each stale feed with its age (or "missing"), and SHALL state that lead time and TEC are not current.
- **FR-RE-30 (Explainer Replay Wording):** WHERE the assessment is a Replay, THE Explainer SHALL use the word "archive" in place of "live" and SHALL include the text `REPLAY` and the archive timestamp.
- **FR-RE-31 (Explainer Reason Notices):** WHEN `unknownPresetReason` or `customMaskDefaultedReason` is present, THE Explainer SHALL include that reason text. THE Explainer SHALL describe the preset gain as a sensitivity multiplier.
- **FR-RE-32 (Explainer String Safety):** THE Explainer SHALL cap every user-supplied string it echoes at 80 characters and SHALL remove control characters (U+0000–U+001F, U+007F–U+009F) from it.
- **FR-RE-33 (English-Only Scope):** THE Explainer API SHALL have no `lang` parameter and SHALL produce English text only. THE web app, `.kiro/steering/*.md` and `.kiro/agents/haunt-designer.md` SHALL contain no Urdu text, RTL layout rule or language toggle. Field Mode SHALL remain.

### Scope change
The project is now English-only. This replaces the earlier product steering statement "English and Urdu (RTL)". Field Mode is kept. FR-RE-33 and the matching task remove Urdu from the explainer API, `apps/web`, steering and the haunt-designer agent.

### Ambiguities resolved in this revision
- "Stale" now covers invalid ages and empty collections (FR-RE-20, FR-RE-21).
- The 15 TECU invented fallback and "Kp 0.0" fallback are removed in favour of an unavailable state (FR-RE-16, FR-RE-17).
- Replay without label or timestamp is stale, not live (FR-RE-22).
