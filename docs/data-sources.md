# Banshee Data Sources & Licenses

| Source | Endpoint | Cadence | License / Terms |
| :--- | :--- | :--- | :--- |
| NOAA SWPC Real-Time Solar Wind (SOLAR-1, ACE, IMAP) | `https://services.swpc.noaa.gov/json/rtsw/` | 1 min | US Public Domain (NOAA) |
| NOAA GloTEC Global Ionosphere Map | `https://services.swpc.noaa.gov/products/glotec/` | 10 min | US Public Domain (NOAA) |
| NOAA SWPC Kp Forecast & Scales | `https://services.swpc.noaa.gov/products/` | 3 hours / live | US Public Domain (NOAA) |
| CelesTrak GNSS GP Orbital Elements | `https://celestrak.org/NORAD/elements/gp.php?GROUP=gnss&FORMAT=json` | Daily | Public catalog; respect CelesTrak rate limits |
| NASA OMNI 1-min (Storm Replays) | `https://cdaweb.gsfc.nasa.gov/hapi` (`OMNI_HRO_1MIN`) | Archived | NASA Open Data |
| GFZ Potsdam Kp History | `https://kp.gfz.de` | Archived | CC BY 4.0 |

## Static Economic-Impact Figure (Marketing Copy)

| Figure | Source | Links | Use |
| :--- | :--- | :--- | :--- |
| "$69.6M–$1.7B" estimated farm losses from the May 2024 Gannon storm (corn) | Kansas State University / UCAR CPAESS | [Gannon_Corn_03-05-25.pdf](https://www.agmanager.info/sites/default/files/pdf/Gannon_Corn_03-05-25.pdf), [CPAESS abstract](https://cpaess.ucar.edu/abstract-sww-2025/impact-gannon-storm-corn-economic-assessment-agricultural-production-and-revenue) | Static marketing / economic-impact figure shown in the mission planner Hero. Not engine output and never passed to the AI explainer. If this entry is removed, the Hero must show the "unsourced estimate" marker (`COST_FIGURE_SOURCED = false`). |

## Mission Planner Map, Search and Tile Attributions

| Component | Provider | Terms / Attribution |
| :--- | :--- | :--- |
| Map library | Leaflet (`leaflet`, `react-leaflet`) | BSD-2-Clause. Leaflet attribution control stays visible. |
| Dark basemap (Haunted Mode) | Carto basemaps (Dark Matter) | Attribution "© OpenStreetMap contributors © CARTO" must remain visible. Subject to CARTO basemap terms. |
| Light basemap (Field Mode) | OpenStreetMap standard tiles | "© OpenStreetMap contributors" (ODbL). Subject to the OSM Tile Usage Policy: no heavy or bulk use, valid attribution. |
| Place search | Nominatim (OpenStreetMap) | "© OpenStreetMap contributors" (ODbL). Usage policy: at most 1 request per second, an identifying `User-Agent` on every request, cache results, no autocomplete-style bulk queries. Banshee proxies via `/api/geocode` with a 1 req/s gate, 800 ms client debounce, and a session cache. |
