/**
 * Static source constants for the Mission Planner UI: cost figure citation,
 * map tile providers and Nominatim usage details.
 */

/** The May 2024 cost figure is now sourced (Kansas State University). */
export const COST_FIGURE_SOURCED = true;

/** Hero cost figure for the May 2024 (Gannon) storm. Static copy, never sent to the explainer. */
export const COST_FIGURE = "$69.6M\u2013$1.7B";

export interface CostFigureCitation {
  readonly label: string;
  readonly url: string;
}

/** Citations for COST_FIGURE (Kansas State University). */
export const COST_FIGURE_CITATIONS: readonly CostFigureCitation[] = [
  {
    label: "Kansas State University, Gannon storm corn economic assessment (AgManager)",
    url: "https://www.agmanager.info/sites/default/files/pdf/Gannon_Corn_03-05-25.pdf",
  },
  {
    label: "Impact of the Gannon storm on corn: economic assessment of agricultural production and revenue (UCAR CPAESS)",
    url: "https://cpaess.ucar.edu/abstract-sww-2025/impact-gannon-storm-corn-economic-assessment-agricultural-production-and-revenue",
  },
];

export const COST_FIGURE_CITATION_URLS: readonly string[] = COST_FIGURE_CITATIONS.map((c) => c.url);

/** Haunted Mode tiles: CARTO dark basemap. */
export const CARTO_DARK_TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
export const CARTO_DARK_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

/** Field Mode tiles: standard OpenStreetMap. */
export const OSM_LIGHT_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_LIGHT_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Nominatim usage policy: identifying User-Agent, max 1 request/second. */
export const NOMINATIM_USER_AGENT = "BansheeMissionPlanner/1.0 (contact: see docs/data-sources.md)";
export const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";

/** Attribution text shown beside geocoder results. */
export const OSM_CONTRIBUTORS_ATTRIBUTION = "\u00a9 OpenStreetMap contributors";
