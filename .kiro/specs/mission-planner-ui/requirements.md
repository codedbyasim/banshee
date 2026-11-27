# Spec: Mission Planner UI (`apps/web`)

## Requirements (EARS)
- **FR-UI-1:** WHEN the user selects a field location (preset or custom lat/lon) and time window, THE System SHALL display the Banshee Dial (`Safe` / `Uneasy` / `Haunted`), numeric score, lead-time countdown, and top 3 reasons.
- **FR-UI-2:** WHEN assessment data loads, THE System SHALL render a Haunted Sky Plot showing clean glowing satellites and faded ghost satellites whose signals pierce disturbed ionosphere patches.
- **FR-UI-3:** WHEN the user toggles Field Mode, THE System SHALL switch to high-contrast sunlight styling meeting WCAG 2.1 AA.
- **FR-UI-4:** WHEN the user switches language to Urdu, THE System SHALL render Urdu copy with `dir="rtl"` layout.
- **FR-UI-5:** WHEN the user clicks the wail audio button, THE System SHALL synthesize an alert tone via Web Audio API without copyrighted audio files, honouring mute and `prefers-reduced-motion`.
