---
inclusion: always
---

# Banshee — Product Steering

**One-line pitch:** Banshee wails before solar storms break your GPS, warning farmers and drone pilots.

## Who We Serve
- **Primary users:** Precision-agriculture farmers and contractors using RTK auto-steer, agricultural and survey drone pilots, land surveyors, and construction GNSS crews.
- **Secondary users:** Ag-drone service operators in low-latitude regions (Pakistan, India) where post-sunset equatorial plasma bubbles cause scintillation even during globally calm Kp conditions.

## Core Output Contract
Every field/time risk assessment MUST return:
1. A transparent **0–100 risk score**.
2. Exactly one of three plain-language levels:
   - `Safe` (0–34): Signals look clean; normal GNSS/RTK operation expected.
   - `Uneasy` (35–64): Elevated ionospheric or solar-wind risk; expect slower RTK fix or brief drift.
   - `Haunted` (65–100): High risk of GNSS degradation or RTK loss; delay precision operations or verify backup.
3. The **top 3 human-readable reasons** backed strictly by numbers produced by `@banshee/engine`.
4. **Data age and source attribution** for every feed used.

## Tone & Localization
- Plain, direct, practical language usable on a tractor or at a launch site — never raw space-weather jargon without explanation.
- Spooky framing ("Banshee wail", "Haunted sky plot", "Storm graveyard") must always **encode meaning**, never act as pure decoration.
- **English only**, plus a high-contrast sunlight **Field Mode**.
