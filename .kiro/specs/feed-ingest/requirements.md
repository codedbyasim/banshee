# Spec: Feed Ingest (`packages/feeds`)

## Requirements (EARS)
- **FR-FI-1:** WHEN a NOAA SWPC RTSW solar wind payload is received, THE System SHALL parse speed (`km/s`), density (`p/cm^3`), `Bt` (`nT`), `By` (`nT`), and `Bz` (`nT` GSM) and discard records containing `null`, `NaN`, or sentinel fill values (`>= 9999` or `<= -9999`).
- **FR-FI-2:** WHEN a NOAA GloTEC GeoJSON/grid payload is received, THE System SHALL extract `(lat, lon, vTec, anomaly)` grid cells and compute dataset age in minutes.
- **FR-FI-3:** WHEN CelesTrak GNSS GP JSON elements are received, THE System SHALL validate NORAD ID, name, and orbital elements without throwing on malformed rows.
- **FR-FI-4:** WHEN any upstream feed contains malformed JSON, missing fields, `null`, `NaN`, or `99999.9` fill values, THE System SHALL flag the record as invalid and SHALL NOT crash ingestion.
- **FR-FI-5:** WHEN live feeds are unavailable or when replay mode is requested, THE System SHALL serve verified archived storm snapshots (May 2024 Gannon, Oct 2003 Halloween, Nov 2025, Jan 2026) marked `isReplay: true`.
