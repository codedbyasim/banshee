import {
  degreesToRadians,
  ecfToLookAngles,
  eciToEcf,
  gstime,
  json2satrec,
  propagate,
  radiansToDegrees,
  type OMMJsonObject,
} from "satellite.js";
import type { GnssOmmElement, SatelliteObservation } from "./types.js";

export interface PropagatedConstellation {
  /** Every satellite with a finite look angle, including those below the horizon. */
  satellites: SatelliteObservation[];
  /** Elements that failed to propagate or belong to an unsupported system (QZSS, IRNSS, ...). */
  skipped: number;
}

/**
 * Map a CelesTrak GNSS OBJECT_NAME to a supported constellation, or null for other
 * systems. Examples: "GPS BIIR-2  (PRN 13)", "GSAT0101 (GALILEO-PFM)",
 * "COSMOS 2433 (720)" (GLONASS), "BEIDOU-3 M1 (C19)".
 */
export function constellationFromObjectName(name: string): SatelliteObservation["constellation"] | null {
  const n = name.trim().toUpperCase();
  if (/^(GPS|NAVSTAR)\b/.test(n)) return "GPS";
  if (/^GSAT\d/.test(n) || n.includes("GALILEO")) return "GALILEO";
  if (/^COSMOS\b/.test(n) || n.includes("GLONASS")) return "GLONASS";
  if (/^BEIDOU\b/.test(n) || /^BEIDOU-/.test(n)) return "BEIDOU";
  return null;
}

const NUMERIC_FIELDS = [
  "MEAN_MOTION",
  "ECCENTRICITY",
  "INCLINATION",
  "RA_OF_ASC_NODE",
  "ARG_OF_PERICENTER",
  "MEAN_ANOMALY",
  "NORAD_CAT_ID",
  "BSTAR",
  "MEAN_MOTION_DOT",
  "MEAN_MOTION_DDOT",
] as const;

function hasUsableElements(el: GnssOmmElement): boolean {
  if (!el || typeof el !== "object") return false;
  if (typeof el.OBJECT_NAME !== "string" || typeof el.EPOCH !== "string") return false;
  for (const f of NUMERIC_FIELDS) {
    if (typeof el[f] !== "number" || !Number.isFinite(el[f])) return false;
  }
  return el.MEAN_MOTION > 0 && el.ECCENTRICITY >= 0 && el.ECCENTRICITY < 1;
}

/**
 * Propagate CelesTrak OMM elements with SGP4 (satellite.js `json2satrec`) to `timestampIso`
 * and compute look angles from a geodetic observer. Pure: the instant comes only from the
 * argument. Never throws; failing or unsupported elements are counted in `skipped`.
 */
export function propagateGnssElements(
  elements: readonly GnssOmmElement[],
  latDeg: number,
  lonDeg: number,
  timestampIso: string,
  heightKm = 0
): PropagatedConstellation {
  const total = Array.isArray(elements) ? elements.length : 0;
  const ms = typeof timestampIso === "string" ? Date.parse(timestampIso) : Number.NaN;
  if (
    !Array.isArray(elements) ||
    !Number.isFinite(ms) ||
    !Number.isFinite(latDeg) ||
    latDeg < -90 ||
    latDeg > 90 ||
    !Number.isFinite(lonDeg) ||
    lonDeg < -180 ||
    lonDeg > 180 ||
    !Number.isFinite(heightKm)
  ) {
    return { satellites: [], skipped: total };
  }

  const date = new Date(ms);
  const gmst = gstime(date);
  const observer = {
    latitude: degreesToRadians(latDeg),
    longitude: degreesToRadians(lonDeg),
    height: heightKm,
  };

  const satellites: SatelliteObservation[] = [];
  let skipped = 0;
  for (const el of elements) {
    try {
      const constellation = hasUsableElements(el) ? constellationFromObjectName(el.OBJECT_NAME) : null;
      if (constellation === null) {
        skipped++;
        continue;
      }
      const satrec = json2satrec(el as unknown as OMMJsonObject);
      const pv = propagate(satrec, date);
      const pos = pv?.position;
      if (
        satrec.error !== 0 ||
        !pos ||
        typeof pos !== "object" ||
        !Number.isFinite(pos.x) ||
        !Number.isFinite(pos.y) ||
        !Number.isFinite(pos.z)
      ) {
        skipped++;
        continue;
      }
      const look = ecfToLookAngles(observer, eciToEcf(pos, gmst));
      const elevationDeg = radiansToDegrees(look.elevation);
      const azRaw = radiansToDegrees(look.azimuth);
      if (!Number.isFinite(elevationDeg) || !Number.isFinite(azRaw)) {
        skipped++;
        continue;
      }
      const azimuthDeg = ((azRaw % 360) + 360) % 360;
      satellites.push({
        id: String(el.NORAD_CAT_ID),
        name: el.OBJECT_NAME.trim(),
        constellation,
        elevationDeg: Math.max(-90, Math.min(90, elevationDeg)),
        azimuthDeg: azimuthDeg >= 360 ? 0 : azimuthDeg,
      });
    } catch {
      skipped++;
    }
  }
  return { satellites, skipped };
}
