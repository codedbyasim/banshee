---
name: space-weather-analysis
description: Use when analyzing solar wind, Kp index, NOAA GloTEC TEC maps, or GNSS/RTK GPS outage risk for a field or drone flight plan.
---

# Space Weather & GNSS Risk Analysis Skill

1. Always pull live data using `swpc-mcp` (`get_solar_wind`, `get_glotec_at`, `get_kp_forecast`, `get_gnss_elements`).
2. Check **data staleness first**: if solar wind is >30 min old or GloTEC is >45 min old, never classify conditions as `Safe`.
3. Compute L1 upstream lead time as `1_500_000 / speed_km_s / 60` minutes.
4. For locations within `±25°` geomagnetic latitude (such as Pakistan or India), explicitly evaluate post-sunset (`18:30–00:30` local solar time) equatorial plasma bubble scintillation risk even if global Kp is `< 4`.
5. Never invent numbers — cite exact `speed`, `Bz (GSM)`, `vTEC`, `leadTimeMinutes`, and `cleanSatellites` returned by tools.
