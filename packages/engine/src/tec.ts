import type { GloTecCell, GloTecGrid } from "./types.js";
import { clampLatitudeDeg, wrapLongitudeDeg } from "./physics.js";

export interface SampledTec {
  status: "ok";
  vTec: number;          // TECU
  anomaly: number;       // TECU
  neighbourMinVtec: number;
  neighbourMaxVtec: number;
}

/** GloTEC missing or empty: no TECU number is produced (FR-RE-16). */
export interface UnavailableTec {
  status: "unavailable";
}

export type TecSample = SampledTec | UnavailableTec;

function positiveMod(x: number, m: number): number {
  return ((x % m) + m) % m;
}

/** Round to 1e-6° so computed node coordinates match grid keys despite float error. */
function snap(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

/**
 * Bilinearly interpolate vTEC and anomaly on a regular lat/lon GloTEC grid.
 * The node origin is derived from the grid's cells, so both half-step-offset NOAA grids
 * (-88.75 / -177.5 origin) and grids on step multiples are aligned. Latitudes outside the
 * grid's rows clamp to the edge row. Handles ±180° longitude wraparound and guarantees interpolated vTEC stays
 * within [min, max] of its four surrounding grid cells.
 * Returns `{ status: "unavailable" }` for a null or empty grid.
 */
export function sampleGloTecAt(
  grid: GloTecGrid | null,
  latDeg: number,
  lonDeg: number
): TecSample {
  if (!grid || !Array.isArray(grid.cells) || grid.cells.length === 0) {
    return { status: "unavailable" };
  }

  const lat = clampLatitudeDeg(latDeg);
  const lon = wrapLongitudeDeg(lonDeg);
  const latStep = Math.max(0.5, grid.latStepDeg);
  const lonStep = Math.max(0.5, grid.lonStepDeg);

  // Node origin comes from the grid itself. NOAA GloTEC nodes sit at half-step offsets
  // (lat -88.75 + 2.5k, lon -177.5 + 5k); replay grids sit on multiples of the step.
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  for (const c of grid.cells) {
    if (c.latDeg < minLat) minLat = c.latDeg;
    if (c.latDeg > maxLat) maxLat = c.latDeg;
    const w = wrapLongitudeDeg(c.lonDeg);
    if (w < minLon) minLon = w;
  }
  const lonOrigin = positiveMod(minLon, lonStep);
  const EPS = 1e-9;

  // Latitude rows: clamp to the edge row outside [minLat, maxLat] (ty = 0 there).
  let lat0: number;
  let lat1: number;
  if (lat <= minLat) {
    lat0 = minLat;
    lat1 = minLat;
  } else if (lat >= maxLat) {
    lat0 = maxLat;
    lat1 = maxLat;
  } else {
    lat0 = snap(minLat + Math.floor((lat - minLat) / latStep + EPS) * latStep);
    lat1 = snap(Math.min(maxLat, lat0 + latStep));
  }
  const lon0 = snap(wrapLongitudeDeg(lonOrigin + Math.floor((lon - lonOrigin) / lonStep + EPS) * lonStep));
  const lon1 = snap(wrapLongitudeDeg(lon0 + lonStep));

  const keyOf = (la: number, lo: number): string =>
    `${Math.round(la * 1000)}:${Math.round(wrapLongitudeDeg(lo) * 1000)}`;
  const lookup = new Map<string, GloTecCell>();
  for (const c of grid.cells) {
    lookup.set(keyOf(c.latDeg, c.lonDeg), c);
  }

  const findNearest = (tLat: number, tLon: number): GloTecCell => {
    const exact = lookup.get(keyOf(tLat, tLon));
    if (exact) return exact;
    let best = grid.cells[0]!;
    let bestDist = Infinity;
    for (const c of grid.cells) {
      const dLat = c.latDeg - tLat;
      let dLon = Math.abs(wrapLongitudeDeg(c.lonDeg) - wrapLongitudeDeg(tLon));
      if (dLon > 180) dLon = 360 - dLon;
      const d2 = dLat * dLat + dLon * dLon;
      if (d2 < bestDist) {
        bestDist = d2;
        best = c;
      }
    }
    return best;
  };

  const q11 = findNearest(lat0, lon0);
  const q21 = findNearest(lat0, lon1);
  const q12 = findNearest(lat1, lon0);
  const q22 = findNearest(lat1, lon1);

  const tx = lonStep > 0 ? Math.max(0, Math.min(1, (((lon - lon0 + 540) % 360) - 180) / lonStep)) : 0;
  const ty = lat1 !== lat0 ? Math.max(0, Math.min(1, (lat - lat0) / (lat1 - lat0))) : 0;

  const bilerp = (v11: number, v21: number, v12: number, v22: number): number =>
    (1 - tx) * (1 - ty) * v11 +
    tx * (1 - ty) * v21 +
    (1 - tx) * ty * v12 +
    tx * ty * v22;

  const vVals = [q11.vTec, q21.vTec, q12.vTec, q22.vTec];
  const minV = Math.min(...vVals);
  const maxV = Math.max(...vVals);
  const rawV = bilerp(q11.vTec, q21.vTec, q12.vTec, q22.vTec);
  const vTec = Math.max(minV, Math.min(maxV, rawV));

  const anomaly = bilerp(q11.anomaly, q21.anomaly, q12.anomaly, q22.anomaly);

  return {
    status: "ok",
    vTec,
    anomaly,
    neighbourMinVtec: minV,
    neighbourMaxVtec: maxV,
  };
}
