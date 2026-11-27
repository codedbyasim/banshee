# Bugfix Spec: Antimeridian Longitude Wrap (±180°)

## Bug Description
During property-based testing of `computePiercePoint()` in `packages/engine/src/physics.ts`, `fast-check` generated a shrunk counter-example near `lon = 179.5°`, `azimuth = 90°`, `elevation = 15°` where naive `lon0 + dLon` produced `183.4°` (outside `[-180, 180)`), breaking GloTEC grid cell lookup.

## Requirements (EARS)
- **FR-BF-1:** WHEN computing any Ionospheric Pierce Point near the ±180° antimeridian, THE System SHALL normalize `lonDeg` strictly into `[-180, 180)` using modular wrap `((((lon + 180) % 360) + 360) % 360) - 180`.
- **FR-BF-2:** WHEN sampling GloTEC near `lon = 179.9°` or `lon = -179.9°`, THE System SHALL wrap East/West neighbour indices cleanly across the dateline.
