# Implementation Plan: Mission Planner UI

## Overview

Implementation is TypeScript throughout (the design uses TypeScript). Order of work: pure engine modules and their property tests, then `apps/web` helpers, API routes, components, `page.tsx` integration, the Playwright smoke test, the `docs/data-sources.md` entry, and a final checkpoint.

Spec history:
- Tasks 1 and 3 are complete and remain valid.
- Task 2 is partly complete. The Field Mode toggle is kept. The Urdu/RTL i18n part is **superseded**: the product steering and Requirement 9 make the UI English-only, and no Urdu or `dir="rtl"` code exists to remove.
- The old MapLibre GL polygon drawer task is **superseded** by the Leaflet point-pin map (tasks 9.2 and 10). The Playwright smoke test from that task is carried into task 11.

## Tasks

- [x] 1. Build `BansheeDial`, `HauntedSkyPlot`, `OmensTimeline`, `StormGraveyard`, and `WailAudio`

- [x] 2. Add Sunlight Field Mode toggle (English-only)
  - Field Mode toggle: done.
  - ~~English + Urdu (`ur`, RTL) i18n dictionary~~ **Superseded** by Requirement 9 (English only, no language switch, no RTL). Do not implement.

- [x] 3. Wire `/api/assess` and `/api/explain` Next.js route handlers

- [x] 4. Engine pure modules and property tests (`packages/engine`)
  - [x] 4.1 Create `packages/engine/src/decision.ts`
    - Export `Decision` type and `levelToDecision(level: RiskLevel): Decision` (Safe→GO, Uneasy→CAUTION, Haunted→HOLD)
    - Export from `packages/engine/src/index.ts`
    - No DOM, `window`, `document` or Leaflet references
    - _Requirements: 6.1, 10.4_

  - [x] 4.2 Create `packages/engine/src/forecast.ts`
    - Export `SafeWindow`, `ForecastInput`, `ForecastHourResult`, `ForecastResult`
    - Implement `bestSafeWindow(hours)`: longest consecutive `Safe` run, ties broken by lower mean score then earlier start, `null` if none
    - Implement `projectForecastHours(input)`: for hourOffset 0..11, hold solar wind, GloTEC and Kp constant, add `hourOffset * 60` minutes to each feed age, re-propagate GNSS with SGP4 for that hour, call `assessFieldRisk()` once per hour, set `postSunsetActive` from `assessment.lowLatPostSunsetActive`, then compute `bestSafeWindow`
    - Export from `packages/engine/src/index.ts`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.8, 4.9, 4.13, 4.14, 4.16, 10.4, 10.5_

  - [x]* 4.3 Write property test for `wrapLongitudeDeg`
    - File: `packages/engine/tests/wrap-longitude.pbt.test.ts`
    - **Property 1: Longitude wrap is always in range and idempotent**
    - **Validates: Requirements 2.13, 7.3**

  - [x]* 4.4 Write property test for `levelToDecision`
    - File: `packages/engine/tests/decision.pbt.test.ts`
    - **Property 4: `levelToDecision` is total and order-preserving**
    - **Validates: Requirements 6.1**

  - [x]* 4.5 Write property test for stale data never yielding GO
    - File: `packages/engine/tests/decision.pbt.test.ts` (same file as 4.4, add a second test)
    - **Property 5: Stale data never yields a GO decision**
    - **Validates: Requirements 6.14**

  - [x]* 4.6 Write property test for `bestSafeWindow`
    - File: `packages/engine/tests/forecast-window.pbt.test.ts`
    - **Property 3: `bestSafeWindow` returns the longest Safe run with deterministic tie-breaking, or none**
    - **Validates: Requirements 4.13, 4.14, 4.16**

  - [x]* 4.7 Write property test for hourly projection shape and base staleness
    - File: `packages/engine/tests/forecast-projection.pbt.test.ts`
    - **Property 6: Hourly projection always returns 12 engine-produced assessments, and base staleness floors every hour**
    - **Validates: Requirements 4.1, 4.2, 4.8, 10.5**

  - [x]* 4.8 Write property test for per-hour feed aging
    - File: `packages/engine/tests/forecast-aging.pbt.test.ts`
    - **Property 7: A feed aging past its limit by a given hour marks exactly that hour Stale**
    - **Validates: Requirements 4.9, 10.5**

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. `apps/web` library helpers
  - [x] 6.1 Create `apps/web/src/lib/validateLatLon.ts`
    - Export `LatLonValidation` and `validateLatLon(latRaw: unknown, lonRaw: unknown)`
    - Latitude must be a finite number in [-90, 90]; longitude must be a finite number; messages name the valid range; on success wrap longitude with `wrapLongitudeDeg` from `@banshee/engine`
    - Add `fast-check` as an `apps/web` devDependency and confirm a vitest setup exists for `apps/web` (add one if missing)
    - _Requirements: 2.11, 2.12, 2.13, 7.2, 7.3_

  - [x]* 6.2 Write property test for `validateLatLon`
    - File: `apps/web/src/lib/validateLatLon.pbt.test.ts`
    - **Property 2: `validateLatLon` accepts exactly the valid domain**
    - **Validates: Requirements 2.11, 2.12, 2.13**

  - [x] 6.3 Create `apps/web/src/lib/sources.ts`
    - Export `COST_FIGURE_SOURCED = true` (the $69.6M–$1.7B figure is sourced in `docs/data-sources.md`)
    - Export tile provider constants: Carto dark URL and attribution, OSM light URL and attribution
    - Export Nominatim `User-Agent` string and the "© OpenStreetMap contributors" attribution text
    - _Requirements: 1.9, 1.10, 2.3, 2.4, 2.5, 3.4, 3.11_

- [x] 7. API routes
  - [x] 7.1 Implement `/api/forecast`
    - Create `apps/web/src/lib/forecast.ts` reusing `parseCoord` and `presetOptions` from `apps/web/src/lib/assess.ts`
    - Create `apps/web/src/app/api/forecast/route.ts` as a thin adapter: validate with `validateLatLon` (HTTP 400 with `{ error }` before any fetch), wrap longitude, fetch the four live feeds via the same `fetchLive*` functions and `settle()` handling as `/api/assess` (failed feed becomes `null`, result marked Stale), resolve `replay` from `STORM_REPLAYS`, call `projectForecastHours()`
    - Response: `hours`, `disclaimer`, `feeds` (age and source), `bestSafeWindow`, `isReplay`, `replayLabel`, `replayArchiveIso`
    - _Requirements: 4.1, 4.5, 4.7, 4.19, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 7.2 Write unit tests for `/api/forecast`
    - HTTP 400 for bad lat/lon, replay branch, live branch with mocked feeds, failed feed yields Stale and never `Safe`, disclaimer present
    - _Requirements: 7.2, 7.3, 7.4, 7.5_

  - [x] 7.3 Implement `/api/geocode`
    - Create `apps/web/src/app/api/geocode/route.ts`: `GET ?q=`, reject trimmed queries under 3 characters, proxy to Nominatim `search?format=json&limit=5`, send the explicit `User-Agent` from `sources.ts`, enforce a module-level 1 request/second gate, 8 s timeout, map HTTP 429 and failures to `{ error }`, map rows to `{ label, latDeg, lonDeg }` through `validateLatLon`
    - _Requirements: 3.1, 3.3, 3.4, 3.7, 3.9_

  - [ ]* 7.4 Write unit tests for `/api/geocode`
    - Rate gate, `User-Agent` header set, 429 and timeout mapping, short query rejected, malformed upstream coordinates dropped
    - _Requirements: 3.3, 3.4, 3.7, 3.9_

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. UI components (`apps/web/src/components/`)
  - [x] 9.1 Create `Hero.tsx`
    - Header "Solar storms silently break RTK GPS — May 2024 cost Midwest farms $69.6M–$1.7B", buttons "Check My Field (Live)" and "Replay May 2024 Disaster", "unsourced estimate" marker only if `COST_FIGURE_SOURCED` is false (i.e. the source is ever removed)
    - Do not pass the cost figure to the explainer
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.9, 1.10_

  - [x] 9.2 Create `FieldMap.tsx` (Leaflet, client-only)
    - Add `leaflet`, `react-leaflet` and `@types/leaflet` to `apps/web/package.json`; import Leaflet CSS
    - Default export for `next/dynamic` with `ssr: false`; single `Marker` replaced on click; Carto dark tiles in Haunted Mode, OSM light tiles in Field Mode; Leaflet attribution control always visible; `onPick` receives coordinates normalized through `validateLatLon`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.9, 8.7_

  - [ ]* 9.3 Write test for `FieldMap` tile selection
    - Correct tile URL and attribution for `fieldMode` true and false; one marker after two clicks
    - _Requirements: 2.3, 2.4, 2.5, 2.6_

  - [x] 9.4 Create `PlaceSearch.tsx`
    - 800 ms debounce, immediate on Enter or search button, minimum 3 trimmed characters, session cache keyed by lower-cased trimmed text, abort the earlier request on a new search, call `/api/geocode`, show up to 5 results, "no places found" and error messages, previous Location kept on error, OSM attribution beside results
    - _Requirements: 3.1, 3.2, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11_

  - [ ]* 9.5 Write unit tests for `PlaceSearch`
    - Fake-timer debounce, cache hit skips fetch, abort on second search, under-3-character no request, empty and error states
    - _Requirements: 3.2, 3.5, 3.6, 3.7, 3.8, 3.9_

  - [x] 9.6 Create `UseMyLocation.tsx`, `Presets.tsx` and `AdvancedCoordinates.tsx`
    - `UseMyLocation`: `navigator.geolocation`, distinct messages for permission denied (offer click, search, presets), unavailable, timeout and error; keep previous Location on failure
    - `Presets`: "Multan Farm" (30.1575, 71.5249), "Iowa Corn Belt" (41.878, -93.0977), "Islamabad Drone Pad" (33.6844, 73.0479)
    - `AdvancedCoordinates`: `<details>` collapsed by default, validates with `validateLatLon` and shows range messages
    - _Requirements: 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.14, 2.15, 2.16_

  - [x] 9.7 Create `MissionTypeSelector.tsx` and `DecisionCard.tsx`
    - Selector: `Tractor RTK` and `Survey Drone` only, default Tractor RTK
    - Card: `levelToDecision` for the mapping; headlines "GO — Clear for RTK / Flight", "CAUTION — Watch for Drift", "HOLD — High Risk of RTK Loss"; distinct color, icon and text per Decision; one action sentence from `ACTION_COPY[missionType][decision]`; preset line (elevation mask degrees and gain) from `assessment.preset`; top 3 reasons via `formatReason`; feed ages and sources; heuristic disclaimer; "regional ionosphere estimate" wording; staleness warning naming each Stale feed and age; never `GO` when Stale; `requestFailed` or null assessment shows only "Status unknown — do not rely on this tool"
    - Display numbers exactly as returned by the engine
    - _Requirements: 5.1, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.8, 6.9, 6.10, 6.11, 6.12, 6.13, 6.14, 6.15_

  - [ ]* 9.8 Write unit tests for `DecisionCard`
    - One case per (level, mission type), exact headline strings, staleness warning, request-failed fallback with no `GO`
    - _Requirements: 6.2, 6.3, 6.4, 6.13, 6.14, 6.15_

  - [x] 9.9 Create `SafeWindowTimeline.tsx`
    - 12 `<button>` bars, height proportional to score, color plus text Engine_Level label, `aria-label` with hour, score and level, keyboard activation
    - Local clock time per bar at the Location, post-sunset marker, best-window highlight with start, end and duration, "No safe window in the next 12 hours" with "Lowest-risk hour (not safe)" marker, caption "Heuristic projection from current conditions, not a measured prediction"
    - Use `bestSafeWindow` from `@banshee/engine`
    - _Requirements: 4.6, 4.10, 4.11, 4.12, 4.13, 4.14, 4.15, 4.16, 4.17, 4.18, 4.19_

  - [ ]* 9.10 Write unit tests for `SafeWindowTimeline`
    - 12 bars rendered, bar click and Enter/Space call `onSelectHour`, best-window banner, no-safe-window message and lowest-risk marker
    - _Requirements: 4.10, 4.15, 4.16, 4.17, 4.18_

- [x] 10. Integrate into `page.tsx`
  - [x] 10.1 Wire planner state and data fetching
    - Render `Hero` first, then `FieldMap` (loaded with `next/dynamic` and `{ ssr: false }`), `PlaceSearch`, `Presets`, `UseMyLocation`, `AdvancedCoordinates`, `MissionTypeSelector`, `DecisionCard`, `SafeWindowTimeline`, plus existing `BansheeDial`, `HauntedSkyPlot`, `StormGraveyard`, `WailAudio`
    - State: `location`, `missionType` (default Tractor RTK), `mode`, `replayId`, `selectedHour`, `theme`
    - Re-run `/api/assess` and `/api/forecast` on Location or mission type change; reset `selectedHour` to 0; fetch failure sets `requestFailed`
    - Remove the always-visible latitude/longitude inputs (moved into `AdvancedCoordinates`)
    - Confirm no language switch and no `dir="rtl"` code is introduced
    - _Requirements: 1.1, 1.4, 2.2, 2.7, 2.9, 6.7, 6.15, 7.6, 9.1, 9.2, 9.3_

  - [x] 10.2 Wire replay mode, selected hour and Field Mode
    - "Replay May 2024 Disaster" and Storm Graveyard entries enter Replay_Mode with the `REPLAY` badge and UTC archive timestamp next to the Decision_Card and Timeline_Chart; no value labelled live or current in replay; badge removed on leaving
    - Timeline bar selection updates Decision_Card, Banshee Dial and Haunted Sky Plot to that hour (fetch `/api/assess` pinned to the hour's timestamp)
    - Wail button uses Web Audio only; honor mute and `prefers-reduced-motion`
    - Field Mode toggle switches all panels and map tiles; keep WCAG 2.1 AA contrast
    - If the explainer is enabled, pass only engine numbers and run `verifyGroundedNumbers()`
    - _Requirements: 1.5, 1.6, 1.7, 1.8, 4.17, 4.19, 5.1, 5.2, 8.1, 8.3, 8.4, 8.5, 8.6, 8.7, 7.6_

- [x] 11. Playwright smoke test
  - [x] 11.1 Create `apps/web/e2e/mission-planner.spec.ts`
    - Covers: Hero buttons render; Replay shows the `REPLAY` badge; selecting a preset updates the Decision_Card; clicking a timeline bar changes the selected hour
    - Add or update the Playwright config and an npm script if missing
    - _Requirements: 10.7_

- [x] 12. Documentation
  - [x] 12.1 Update `docs/data-sources.md`
    - Add a citation entry for the "$69.6M–$1.7B" May 2024 Gannon storm farm-loss figure (Kansas State University / UCAR CPAESS), marked as a static marketing/economic-impact figure not used by the AI explainer
    - Add attribution entries for Leaflet, Carto basemaps, OpenStreetMap tiles and Nominatim, including the Nominatim usage policy (1 request/second, identifying `User-Agent`, caching)
    - _Requirements: 1.9, 2.5, 3.4, 3.11_

- [x] 13. Final checkpoint - Quality gates
  - Run `npm run typecheck && npm test` and confirm the existing `@banshee/engine` and `@banshee/feeds` suites pass
  - Run `npm --workspace=@banshee/web run build`
  - Confirm `packages/engine` has no DOM, `window`, `document` or Leaflet references and that no keys or secrets were committed
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP.
- Each task references specific requirements for traceability.
- Property tests validate the universal properties in the design (Properties 1-7); unit tests cover examples and edge cases.
- Polygon field drawing and MapLibre are out of scope.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["4.1", "6.1", "6.3", "12.1"] },
    { "id": 1, "tasks": ["4.2", "4.3", "4.4", "6.2"] },
    { "id": 2, "tasks": ["4.5", "4.6", "4.7", "4.8", "7.1", "7.3", "9.1", "9.2", "9.4", "9.6", "9.7", "9.9"] },
    { "id": 3, "tasks": ["7.2", "7.4", "9.3", "9.5", "9.8", "9.10", "10.1"] },
    { "id": 4, "tasks": ["10.2"] },
    { "id": 5, "tasks": ["11.1"] }
  ]
}
```
