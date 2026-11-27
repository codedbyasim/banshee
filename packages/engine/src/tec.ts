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

/**
 * Bilinearly interpolate vTEC and anomaly on a regular lat/lon GloTEC grid.
 * Handles ±180° longitude wraparound and guarantees interpolated vTEC stays
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

  const lat0 = Math.floor(lat / latStep) * latStep;
  const lat1 = Math.min(90, lat0 + latStep);
  const lon0 = wrapLongitudeDeg(Math.floor(lon / lonStep) * lonStep);
  const lon1 = wrapLongitudeDeg(lon0 + lonStep);

  const lookup = new Map<string, GloTecCell>();
  for (const c of grid.cells) {
    const key = `${Math.round(c.latDeg * 10)}:${Math.round(wrapLongitudeDeg(c.lonDeg) * 10)}`;
    lookup.set(key, c);
  }

  const findNearest = (tLat: number, tLon: number): GloTecCell => {
    const exact = lookup.get(`${Math.round(tLat * 10)}:${Math.round(wrapLongitudeDeg(tLon) * 10)}`);
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
