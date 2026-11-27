import { wrapLongitudeDeg } from "@banshee/engine";

export interface LatLonValidation {
  ok: boolean;
  latDeg: number | null; // set only when ok
  lonDeg: number | null; // wrapped into [-180, 180), set only when ok
  message: string | null; // set only when !ok, names the valid range
}

const LAT_MESSAGE = "Latitude must be a finite number between -90 and 90 degrees.";
const LON_MESSAGE = "Longitude must be a finite number (degrees, east positive).";

function toFinite(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function fail(message: string): LatLonValidation {
  return { ok: false, latDeg: null, lonDeg: null, message };
}

export function validateLatLon(latRaw: unknown, lonRaw: unknown): LatLonValidation {
  const lat = toFinite(latRaw);
  if (lat === null || lat < -90 || lat > 90) return fail(LAT_MESSAGE);
  const lon = toFinite(lonRaw);
  if (lon === null) return fail(LON_MESSAGE);
  return { ok: true, latDeg: lat, lonDeg: wrapLongitudeDeg(lon), message: null };
}
