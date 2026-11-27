---
inclusion: auto
description: Space-weather physics units, coordinate frames, Newell coupling, IPP geometry, and L1 lead-time formulas for packages/engine and packages/feeds.
---

# Space Physics & Orbital Geometry Rules

## Canonical Internal Units
- **Distance / Altitude:** kilometres (`km`). Earth mean radius `R_E = 6371.0 km`. Ionospheric thin-shell height `H_IONO = 350.0 km`.
- **Solar Wind Speed (`v`):** `km/s` (valid physical range for lead-time formula: `250` to `3000 km/s`).
- **Magnetic Field (`Bt`, `Bz`):** nanotesla (`nT`) in **GSM** (Geocentric Solar Magnetospheric) coordinates. Negative `Bz` (southward IMF) drives geomagnetic coupling. Never confuse GSE with GSM.
- **Total Electron Content (`vTEC`, `sTEC`):** `TECU` (`1 TECU = 10^16 electrons/m^2`).
- **L1 Range Delay:** `1 TECU ≈ 0.162 m` on GPS L1 (`1575.42 MHz`).
- **Angles:** radians internally for trigonometry; degrees (`deg`) at API/UI boundaries. Latitude strictly in `[-90, 90]`, longitude wrapped strictly to `[-180, 180)`.

## Formulas (Never Guess — Cite & Verify)
1. **L1 Upstream Lead Time:**
   `leadTimeMinutes = (1_500_000 / speedKmPerSec) / 60`
   (At 400 km/s ≈ 62.5 min; at 800 km/s ≈ 31.25 min; at 2,000 km/s ≈ 12.5 min.)
2. **Newell Coupling Function** (Newell et al. 2007, `doi:10.1029/2006JA012015`):
   `theta_c = atan2(By, Bz)` (clock angle in radians, using GSM `By`, `Bz`)
   `Bt = sqrt(By^2 + Bz^2)`
   `dPhi_MP / dt = v^(4/3) * Bt^(2/3) * |sin(theta_c / 2)|^(8/3)`
   Normalized into `[0, 100]` for scoring using documented reference thresholds.
3. **Ionospheric Pierce Point (IPP) at 350 km:**
   Given observer geodetic `(lat0, lon0)` and satellite elevation `el`, azimuth `az`:
   - `psi = (pi / 2) - el - asin((R_E / (R_E + H_IONO)) * cos(el))`
   - `lat_ipp = asin(sin(lat0) * cos(psi) + cos(lat0) * sin(psi) * cos(az))`
   - `lon_ipp = wrapLongitude(lon0 + atan2(sin(psi) * sin(az) * cos(lat0), cos(psi) - sin(lat0) * sin(lat_ipp)))`
4. **Slant Mapping Function (`M(el)`):**
   `M(el) = 1 / sqrt(1 - ((R_E / (R_E + H_IONO)) * cos(el))^2)`
   `sTEC = vTEC * M(el)`
5. **Low-Latitude Post-Sunset Scintillation Rule:**
   For `|magneticLat| <= 25°` during local solar time `18:30` to `00:30`, elevate scintillation risk scaled by TEC anomaly because equatorial plasma bubbles form after sunset even when global Kp is low (NOAA SWPC).
