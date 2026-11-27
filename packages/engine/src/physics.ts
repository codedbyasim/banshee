import type { PiercePoint } from "./types.js";

export const EARTH_RADIUS_KM = 6371.0;
export const IONO_SHELL_KM = 350.0;
export const L1_DISTANCE_KM = 1_500_000.0;
export const L1_DELAY_METERS_PER_TECU = 0.162;

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Normalize longitude strictly into [-180, 180).
 * Fixes antimeridian wraparound bug caught by PBT (Bugfix Spec: bugfix-longitude-wrap).
 */
export function wrapLongitudeDeg(lonDeg: number): number {
  const wrapped = ((((lonDeg + 180) % 360) + 360) % 360) - 180;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

export function clampLatitudeDeg(latDeg: number): number {
  return Math.max(-90, Math.min(90, latDeg));
}

/**
 * Upstream L1 solar wind propagation lead time in minutes.
 * Strictly positive, finite, and decreasing for speed in [250, 3000] km/s.
 */
export function computeL1LeadTimeMinutes(speedKmS: number): number | null {
  if (!Number.isFinite(speedKmS) || speedKmS < 250 || speedKmS > 3000) return null;
  return L1_DISTANCE_KM / speedKmS / 60;
}

/**
 * Newell et al. (2007) magnetospheric coupling function (doi:10.1029/2006JA012015).
 * Uses GSM By, Bz (nT) and solar wind speed v (km/s).
 */
export function computeNewellCoupling(
  speedKmS: number,
  byNt: number,
  bzNt: number
): number {
  const v = Math.max(0, speedKmS);
  const bt = Math.hypot(byNt, bzNt);
  if (v === 0 || bt === 0) return 0;
  const clockAngle = Math.atan2(byNt, bzNt);
  const sinHalf = Math.abs(Math.sin(clockAngle / 2));
  return Math.pow(v, 4 / 3) * Math.pow(bt, 2 / 3) * Math.pow(sinHalf, 8 / 3);
}

/**
 * Slant-to-vertical TEC mapping factor M(elevation) for a 350 km thin ionospheric shell.
 */
export function computeSlantFactor(elevationDeg: number): number {
  const elRad = Math.max(0, Math.min(90, elevationDeg)) * DEG_TO_RAD;
  const ratio = EARTH_RADIUS_KM / (EARTH_RADIUS_KM + IONO_SHELL_KM);
  const term = ratio * Math.cos(elRad);
  return 1 / Math.sqrt(Math.max(1e-6, 1 - term * term));
}

/**
 * Compute 350 km Ionospheric Pierce Point (IPP) from observer geodetic coordinates
 * and satellite elevation/azimuth.
 */
export function computePiercePoint(
  observerLatDeg: number,
  observerLonDeg: number,
  elevationDeg: number,
  azimuthDeg: number
): PiercePoint {
  const lat0 = clampLatitudeDeg(observerLatDeg) * DEG_TO_RAD;
  const lon0 = wrapLongitudeDeg(observerLonDeg) * DEG_TO_RAD;
  const el = Math.max(0, Math.min(90, elevationDeg)) * DEG_TO_RAD;
  const az = azimuthDeg * DEG_TO_RAD;

  const ratio = EARTH_RADIUS_KM / (EARTH_RADIUS_KM + IONO_SHELL_KM);
  const psi = Math.PI / 2 - el - Math.asin(Math.min(1, ratio * Math.cos(el)));

  const sinLatIpp =
    Math.sin(lat0) * Math.cos(psi) +
    Math.cos(lat0) * Math.sin(psi) * Math.cos(az);
  const latIppRad = Math.asin(Math.max(-1, Math.min(1, sinLatIpp)));

  const y = Math.sin(psi) * Math.sin(az) * Math.cos(lat0);
  const x = Math.cos(psi) - Math.sin(lat0) * Math.sin(latIppRad);
  const lonIppRad = lon0 + Math.atan2(y, x);

  return {
    latDeg: clampLatitudeDeg(latIppRad * RAD_TO_DEG),
    lonDeg: wrapLongitudeDeg(lonIppRad * RAD_TO_DEG),
    slantFactor: computeSlantFactor(elevationDeg),
  };
}

export function computeL1DelayMeters(sTec: number): number {
  return Math.max(0, sTec) * L1_DELAY_METERS_PER_TECU;
}

/**
 * Dipole geomagnetic latitude approximation (North magnetic pole ~80.65N, -72.68E).
 */
export function approxGeomagneticLatDeg(latDeg: number, lonDeg: number): number {
  const poleLat = 80.65 * DEG_TO_RAD;
  const poleLon = -72.68 * DEG_TO_RAD;
  const lat = clampLatitudeDeg(latDeg) * DEG_TO_RAD;
  const lon = wrapLongitudeDeg(lonDeg) * DEG_TO_RAD;
  const sinMag =
    Math.sin(lat) * Math.sin(poleLat) +
    Math.cos(lat) * Math.cos(poleLat) * Math.cos(lon - poleLon);
  return Math.asin(Math.max(-1, Math.min(1, sinMag))) * RAD_TO_DEG;
}

/**
 * Approximate local solar hour in [0, 24) from UTC timestamp and longitude.
 */
export function localSolarHour(timestampIso: string, lonDeg: number): number {
  const date = new Date(timestampIso);
  const utcHours =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600;
  const offset = wrapLongitudeDeg(lonDeg) / 15;
  return (((utcHours + offset) % 24) + 24) % 24;
}

/**
 * Low-latitude post-sunset scintillation window: |magLat| <= 25 deg and
 * local solar time between 18:30 and 00:30 (when equatorial plasma bubbles form).
 */
export function isLowLatPostSunsetWindow(
  latDeg: number,
  lonDeg: number,
  timestampIso: string
): boolean {
  const magLat = Math.abs(approxGeomagneticLatDeg(latDeg, lonDeg));
  if (magLat > 25) return false;
  const hour = localSolarHour(timestampIso, lonDeg);
  return hour >= 18.5 || hour <= 0.5;
}
