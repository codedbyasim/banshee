# Requirements Document

## Introduction

This spec redesigns `apps/web` from a developer test panel into a Farmer & Drone Pilot Mission Planner. A user states a problem-first message, picks a field on a free map, and receives a plain-language Go / Caution / Hold decision for a Tractor RTK or Survey Drone mission, plus a heuristic 12-hour safe-window timeline. The existing Banshee Dial, Haunted Sky Plot, Storm Graveyard, Field Mode and Wail Audio remain and follow the selected location and hour.

All risk numbers come from `@banshee/engine` (`assessFieldRisk()`). The score is a heuristic, not certified for safety-of-life navigation (honesty rules 1-5 apply). The spec is scoped to `apps/web`; `packages/engine` stays DOM-free and the `@banshee/engine` and `@banshee/feeds` test suites stay green.

### Change log against the previous version of this spec

- **FR-UI-1** (dial, score, lead time, top 3 reasons): kept, reworded as Requirement 5 and extended to the selected hour.
- **FR-UI-2** (Haunted Sky Plot): kept as Requirement 9.
- **FR-UI-3** (Field Mode, WCAG 2.1 AA): kept as Requirement 9, extended to the map tiles.
- **FR-UI-4** (Urdu / RTL): **removed and superseded.** The product steering (`product.md`, "Tone & Localization") states English only plus Field Mode. The Urdu dictionary and `dir="rtl"` layout are no longer required. Requirement 10 makes English the only language.
- **FR-UI-5** (Wail Audio): kept as Requirement 9.
- **Old task 4** (MapLibre GL polygon field drawer): **superseded** by the Leaflet point-pin map in Requirement 2. Polygon drawing is out of scope. The Playwright smoke test from that task is carried into the new task list.

### Open items flagged for the user

- The headline figure "$69.6M–$1.7B" is a static marketing/economic-impact claim, not an engine or AI explainer number. It is sourced in `docs/data-sources.md` (Kansas State University / UCAR CPAESS). The UI flags it as unsourced only if that source entry is ever removed.
- Future-hour values are a heuristic projection built from current telemetry (Requirement 4). No NOAA feed used here supplies hourly future solar wind or GloTEC.

## Glossary

- **Mission_Planner**: The Next.js application in `apps/web`.
- **Hero**: The top section of `apps/web/src/app/page.tsx` stating the problem and offering two primary actions.
- **Field_Map**: The interactive Leaflet map component used to choose a location.
- **Geocoder**: The component that queries OpenStreetMap Nominatim for place search.
- **Location**: A latitude/longitude pair (degrees) the user selected, with an optional label.
- **Mission_Type**: One of `Tractor RTK` or `Survey Drone`.
- **Assessment_Engine**: `assessFieldRisk()` in `@banshee/engine`.
- **Engine_Level**: `Safe` (score 0-34), `Uneasy` (35-64) or `Haunted` (65-100).
- **Decision**: The mapped result: `GO`, `CAUTION` or `HOLD`.
- **Decision_Card**: The UI card showing the Decision, action recommendation, reasons, data age, sources and disclaimers.
- **Stale**: A required feed missing or older than its limit (solarWind 30 min, glotec 45 min, kp 180 min, gnss 48 h).
- **Forecast_API**: The `/api/forecast` route handler (or an extension of `/api/assess`) that returns the 12 hourly assessments.
- **Forecast_Hour**: One of the 12 hourly offsets +0h to +11h from the base time.
- **Projection**: A heuristic estimate for a Forecast_Hour built by persisting current telemetry, not a measured prediction.
- **Timeline_Chart**: The interactive 12-bar chart of Forecast_Hour risk.
- **Safe_Window**: A run of consecutive Forecast_Hours, each with Engine_Level `Safe`.
- **Best_Safe_Window**: The Safe_Window chosen by the rules in Requirement 4.
- **Post_Sunset_Window**: The period from local sunset to 02:00 local solar time at the Location, when equatorial plasma bubbles can cause scintillation at low latitudes (absolute geomagnetic or geographic latitude below 30 degrees).
- **Replay_Mode**: Display of an archived storm from `@banshee/feeds` instead of live data.
- **Live_Mode**: Display of current feed data.
- **Field_Mode**: The high-contrast sunlight theme.
- **Haunted_Mode**: The default dark theme.
- **Technical_Preset**: The engine preset for the Mission_Type, showing elevation mask (degrees) and gain.
- **Data_Sources_Doc**: `docs/data-sources.md`.

## Requirements

### Requirement 1: Ten-Second Problem Hero

**User Story:** As a farmer or drone pilot, I want to understand the problem and my next step within ten seconds, so that I can check my field without reading documentation.

#### Acceptance Criteria

1. THE Hero SHALL render at the top of `apps/web/src/app/page.tsx` before any map, chart or technical panel.
2. THE Hero SHALL display the single-line header "Solar storms silently break RTK GPS — May 2024 cost Midwest farms $69.6M–$1.7B".
3. THE Hero SHALL display two primary buttons labelled "Check My Field (Live)" and "Replay May 2024 Disaster".
4. WHEN the user activates "Check My Field (Live)", THE Mission_Planner SHALL enter Live_Mode and run an assessment for the current Location.
5. WHEN the user activates "Replay May 2024 Disaster", THE Mission_Planner SHALL enter Replay_Mode using the archived Gannon May 2024 data.
6. WHILE Replay_Mode is active, THE Mission_Planner SHALL display a prominent `REPLAY` badge and the archive timestamp in UTC adjacent to the Decision_Card and the Timeline_Chart.
7. WHILE Replay_Mode is active, THE Mission_Planner SHALL NOT label any displayed value as live or current.
8. WHEN the user leaves Replay_Mode, THE Mission_Planner SHALL remove the `REPLAY` badge and archive timestamp.
9. IF the header cost figure has no source entry in the Data_Sources_Doc, THEN THE Hero SHALL display an "unsourced estimate" marker (applies only if the existing source entry is removed) beside the figure.
10. THE Mission_Planner SHALL treat the header cost figure as static marketing text and SHALL NOT pass the figure to the Banshee Voice AI explainer as an engine-derived number.

### Requirement 2: Interactive Field Map

**User Story:** As a farmer, I want to pick my field on a map or by searching a place name, so that I do not need to know latitude and longitude.

#### Acceptance Criteria

1. THE Field_Map SHALL render using Leaflet with no API key.
2. THE Mission_Planner SHALL load Leaflet only on the client through a dynamic import with `ssr: false`.
3. WHILE Haunted_Mode is active, THE Field_Map SHALL use dark Carto tiles.
4. WHILE Field_Mode is active, THE Field_Map SHALL use light OpenStreetMap tiles.
5. THE Field_Map SHALL display the tile provider attribution required by the OpenStreetMap and Carto licences at all times.
6. WHEN the user clicks the Field_Map, THE Field_Map SHALL place one pin at the clicked point and set the Location to that point, replacing any earlier pin.
7. WHEN the Location changes, THE Mission_Planner SHALL re-run the assessment and the forecast for the new Location.
8. THE Field_Map SHALL offer three presets: "Multan Farm", "Iowa Corn Belt" and "Islamabad Drone Pad".
9. WHEN the user selects a preset, THE Mission_Planner SHALL set the Location to the preset coordinates and center the Field_Map on them.
10. THE Mission_Planner SHALL show latitude and longitude inputs only inside a collapsible "Advanced Coordinates" section that is collapsed by default.
11. IF a latitude input is outside -90 to 90 degrees or is not a finite number, THEN THE Mission_Planner SHALL reject the value and show a message naming the valid range.
12. IF a longitude input is not a finite number, THEN THE Mission_Planner SHALL reject the value and show a message naming the valid range.
13. WHEN a finite longitude outside -180 to 180 degrees is entered or clicked, THE Mission_Planner SHALL wrap the longitude into the range -180 to 180 degrees.
14. WHEN the user activates "Use My Location", THE Mission_Planner SHALL request the position through `navigator.geolocation` and set the Location to the returned coordinates.
15. IF the user denies geolocation permission, THEN THE Mission_Planner SHALL show a message that permission was denied and offer map click, search and presets as alternatives.
16. IF geolocation is unavailable, times out or returns an error, THEN THE Mission_Planner SHALL show a message stating the reason and keep the previous Location.

### Requirement 3: Place Search via Nominatim

**User Story:** As a farmer, I want to type a town or farm name, so that the map moves to my field.

#### Acceptance Criteria

1. WHEN the user submits a search text, THE Geocoder SHALL query OpenStreetMap Nominatim and list up to 5 matching places.
2. THE Geocoder SHALL send a query only after the user pauses typing for 800 ms or presses Enter or the search button, and SHALL NOT send queries for partial-text autocomplete.
3. THE Geocoder SHALL send no more than 1 request per second to Nominatim.
4. THE Geocoder SHALL send an identifying `User-Agent` or `Referer` for the application on each Nominatim request, set according to the Nominatim usage policy.
5. WHEN a query repeats a search text already answered in the current session, THE Geocoder SHALL return the cached result without a new request.
6. WHEN a new search is submitted while an earlier request is pending, THE Geocoder SHALL cancel the earlier request.
7. IF the search text has fewer than 3 characters after trimming, THEN THE Geocoder SHALL not send a request.
8. IF Nominatim returns no results, THEN THE Geocoder SHALL show a "no places found" message.
9. IF the Nominatim request fails, times out after 8 seconds, or returns HTTP 429, THEN THE Geocoder SHALL show an error message and keep the previous Location.
10. WHEN the user selects a search result, THE Mission_Planner SHALL set the Location to the result coordinates, wrapped and validated per Requirement 2, and set the Location label to the result name.
11. THE Geocoder SHALL display the OpenStreetMap data attribution beside search results.

### Requirement 4: 12-Hour Safe-Window Timeline

**User Story:** As a drone pilot, I want to see which hours in the next 12 are safest, so that I can schedule a flight or field pass.

#### Acceptance Criteria

1. WHEN a Location and Mission_Type are set, THE Forecast_API SHALL return 12 assessments for Forecast_Hours +0h to +11h, each produced by calling the Assessment_Engine.
2. THE Forecast_API SHALL build each Forecast_Hour input by holding the latest solar wind, GloTEC and Kp telemetry constant (persistence) and varying only the evaluation time.
3. THE Forecast_API SHALL recompute GNSS satellite geometry for each Forecast_Hour by propagating current GNSS orbital elements with SGP4 to that hour.
4. THE Forecast_API SHALL apply to each Forecast_Hour a local-time scintillation factor that raises risk during the Post_Sunset_Window at the Location when the Location is at low latitude.
5. THE Forecast_API SHALL return, for each Forecast_Hour, the score, Engine_Level, top 3 reasons and a flag stating whether the Post_Sunset_Window applies.
6. THE Mission_Planner SHALL label the Timeline_Chart "Heuristic projection from current conditions, not a measured prediction".
7. WHEN the Forecast_API is called, THE Forecast_API SHALL return the age and source of each feed used.
8. IF any required feed is Stale at the base time, THEN THE Forecast_API SHALL mark all 12 Forecast_Hours with a staleness reason and an Engine_Level of at least `Uneasy`.
9. IF a feed would exceed its maximum age at a Forecast_Hour's time, THEN THE Forecast_API SHALL mark that Forecast_Hour as Stale and assign an Engine_Level of at least `Uneasy`.
10. THE Timeline_Chart SHALL render 12 bars, one per Forecast_Hour, with bar height proportional to score and color and text label showing the Engine_Level.
11. THE Timeline_Chart SHALL identify each Forecast_Hour by local clock time at the Location.
12. THE Timeline_Chart SHALL mark Forecast_Hours inside the Post_Sunset_Window.
13. THE Mission_Planner SHALL select the Best_Safe_Window as the longest Safe_Window among the 12 Forecast_Hours.
14. IF two Safe_Windows have equal length, THEN THE Mission_Planner SHALL select the one with the lower mean score, and if still equal, the one that starts earlier.
15. WHEN a Best_Safe_Window exists, THE Timeline_Chart SHALL highlight its bars and state its start time, end time and duration in hours.
16. IF no Forecast_Hour has Engine_Level `Safe`, THEN THE Timeline_Chart SHALL show the message "No safe window in the next 12 hours" and SHALL highlight the Forecast_Hour with the lowest score as "Lowest-risk hour (not safe)".
17. WHEN the user clicks or keyboard-activates a bar, THE Mission_Planner SHALL set the selected hour to that Forecast_Hour and update the Decision_Card, Banshee Dial and Haunted Sky Plot to that hour's assessment.
18. THE Timeline_Chart SHALL make every bar reachable by keyboard and expose its hour, score and Engine_Level to assistive technology.
19. WHILE Replay_Mode is active, THE Mission_Planner SHALL show the replayed storm timeline in place of the live projection and keep the `REPLAY` badge visible.

### Requirement 5: Banshee Dial and Top Reasons

**User Story:** As a user, I want the score, the lead time and the reasons behind it, so that I can judge how much to trust the recommendation.

#### Acceptance Criteria

1. WHEN an assessment for the selected Location and hour loads, THE Mission_Planner SHALL display the Banshee Dial with the Engine_Level and numeric 0-100 score.
2. WHEN an assessment loads, THE Mission_Planner SHALL display the L1 upstream lead-time countdown.
3. WHEN an assessment loads, THE Mission_Planner SHALL display the top 3 reasons returned by the Assessment_Engine.
4. IF the Assessment_Engine returns fewer than 3 reasons, THEN THE Mission_Planner SHALL display the reasons returned.
5. THE Mission_Planner SHALL display every score and reason number exactly as returned by the Assessment_Engine, without recomputing them in the UI.

### Requirement 6: Go / Caution / Hold Decision Card

**User Story:** As a tractor operator or drone pilot, I want a plain-language go or hold decision for my kind of work, so that I can act without reading space-weather jargon.

#### Acceptance Criteria

1. THE Decision_Card SHALL map Engine_Level to Decision deterministically: `Safe` to `GO`, `Uneasy` to `CAUTION`, `Haunted` to `HOLD`.
2. WHEN the Decision is `GO`, THE Decision_Card SHALL display the headline "GO — Clear for RTK / Flight".
3. WHEN the Decision is `CAUTION`, THE Decision_Card SHALL display the headline "CAUTION — Watch for Drift".
4. WHEN the Decision is `HOLD`, THE Decision_Card SHALL display the headline "HOLD — High Risk of RTK Loss".
5. THE Decision_Card SHALL display each Decision with a distinct color, icon and text, so the Decision is readable without color perception.
6. THE Mission_Planner SHALL offer a Mission_Type selector with `Tractor RTK` and `Survey Drone`, defaulting to `Tractor RTK`.
7. WHEN the user changes the Mission_Type, THE Mission_Planner SHALL re-run the assessment with that Mission_Type's preset.
8. THE Decision_Card SHALL display exactly one plain-English action recommendation written for the selected Mission_Type and Decision.
9. THE Decision_Card SHALL display the Technical_Preset details (elevation mask in degrees and gain) in a compact line below the recommendation.
10. THE Decision_Card SHALL display the top 3 reasons, the data age and the source attribution for every feed used.
11. THE Decision_Card SHALL display the notice "Heuristic risk score, not certified for safety-of-life navigation".
12. THE Decision_Card SHALL describe ionosphere data as a "regional ionosphere estimate" and SHALL NOT describe it as an exact reading at the Location.
13. IF any required feed is Stale, THEN THE Decision_Card SHALL display a staleness warning naming each Stale feed and its age.
14. IF any required feed is Stale, THEN THE Decision_Card SHALL display `CAUTION` or `HOLD` and SHALL NOT display `GO`.
15. IF the assessment request fails, THEN THE Decision_Card SHALL display "Status unknown — do not rely on this tool" and SHALL NOT display `GO`.

### Requirement 7: Forecast and Assessment API Behavior

**User Story:** As a frontend developer, I want a stable API contract for current and hourly assessments, so that the UI shows the same numbers the engine produced.

#### Acceptance Criteria

1. THE Forecast_API SHALL accept latitude, longitude, Mission_Type and an optional replay identifier.
2. IF latitude is outside -90 to 90 or longitude is not finite, THEN THE Forecast_API SHALL respond with HTTP 400 and a descriptive error.
3. THE Forecast_API SHALL wrap a finite longitude into -180 to 180 degrees before assessment.
4. THE Forecast_API SHALL include in every response a heuristic-score disclaimer field.
5. IF a feed fetch fails, THEN THE Forecast_API SHALL respond with an assessment marked Stale instead of an empty or `Safe` result.
6. WHERE the Banshee Voice AI explainer is enabled, THE Mission_Planner SHALL pass only engine-derived numbers to the explainer and SHALL pass each explanation through `verifyGroundedNumbers()`.

### Requirement 8: Integration with Existing Visuals

**User Story:** As a user, I want the sky plot, dial, graveyard, Field Mode and wail to follow my chosen location and hour, so that every panel tells the same story.

#### Acceptance Criteria

1. WHEN the selected Location or selected hour changes, THE Mission_Planner SHALL update the Haunted Sky Plot, Banshee Dial, Decision_Card and Storm Graveyard to that Location and hour.
2. THE Haunted Sky Plot SHALL render clean satellites as glowing markers and satellites whose signal path crosses a disturbed ionosphere patch as faded ghost markers.
3. THE Storm Graveyard SHALL list archived storms from `@banshee/feeds` and each entry SHALL show the `REPLAY` badge and archive timestamp.
4. WHEN the user selects a Storm Graveyard entry, THE Mission_Planner SHALL enter Replay_Mode for that storm.
5. WHEN the user activates the wail audio button, THE Mission_Planner SHALL synthesize an alert tone with the Web Audio API and use no audio files.
6. WHILE the user has muted audio or `prefers-reduced-motion` is set, THE Mission_Planner SHALL NOT play the wail tone automatically and SHALL suppress non-essential animation.
7. WHEN the user toggles Field Mode, THE Mission_Planner SHALL switch all panels, including the Field_Map tiles, to the high-contrast theme meeting WCAG 2.1 AA contrast.

### Requirement 9: Language

**User Story:** As a product owner, I want the interface to follow the product steering on language, so that the product has one maintained set of copy.

#### Acceptance Criteria

1. THE Mission_Planner SHALL present all interface copy in English.
2. THE Mission_Planner SHALL provide no language switch and no right-to-left layout.
3. THE Mission_Planner SHALL provide Field_Mode as the only alternate presentation mode.

### Requirement 10: Engineering Quality Gates

**User Story:** As a maintainer, I want the redesign to keep the build and tests green, so that the engine's guarantees are not weakened.

#### Acceptance Criteria

1. THE change set SHALL leave all existing `@banshee/engine` and `@banshee/feeds` tests passing.
2. THE change set SHALL pass `npm run typecheck && npm test`.
3. THE change set SHALL pass `npm --workspace=@banshee/web run build`.
4. THE `packages/engine` package SHALL contain no DOM, `window`, `document` or Leaflet references.
5. IF new hourly-projection logic is added to `packages/engine`, THEN THE change set SHALL include `fast-check` property tests for it, including that no Stale input yields `Safe`.
6. THE change set SHALL commit no API keys, credentials or secrets.
7. THE change set SHALL include a Playwright smoke test covering: Hero buttons render, replay shows the `REPLAY` badge, a preset updates the Decision_Card, and a timeline bar click changes the selected hour.
