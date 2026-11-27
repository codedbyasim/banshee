---
inclusion: always
---

# Scientific Honesty & Fail-Safe Steering

1. **Heuristic Transparency:** Banshee's 0–100 risk score is a physically motivated heuristic, NOT a trained ML model and NOT certified for aviation or safety-of-life navigation. Always label it clearly in the UI and API responses.
2. **Fail-Safe Staleness Rule:** If ANY required live feed (solar wind, GloTEC, or GNSS orbits) is missing or older than its max age (`solarWind: 30 min`, `glotec: 45 min`, `kp: 180 min`, `gnss: 48 h`), the engine MUST NEVER output level `Safe`. Minimum level on stale data is `Uneasy` with an explicit staleness reason.
3. **Regional Resolution Disclosure:** NOAA GloTEC has ~5° × 2.5° spatial resolution. Label TEC risk as "regional ionosphere estimate", never "exact point over your tractor".
4. **Replay Labelling:** Any archived historical storm (Gannon May 2024, Halloween Oct 2003, Nov 2025, Jan 2026) MUST display a prominent `REPLAY` badge and archive timestamp so it is never confused with live conditions.
5. **Zero Hallucinated Numbers:** The Banshee Voice AI explainer may ONLY cite numbers present in the deterministic engine JSON output.
