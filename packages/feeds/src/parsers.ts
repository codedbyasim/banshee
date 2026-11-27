import type { GloTecCell, GnssOmmElement, SolarWindSample } from "@banshee/engine";

export interface ParseResult<T> {
  valid: T[];
  invalidCount: number;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) >= 9999) return null;
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (!Number.isFinite(n) || Math.abs(n) >= 9999) return null;
    return n;
  }
  return null;
}

/**
 * Defensive parser for NOAA SWPC RTSW solar wind JSON rows.
 * Never throws on null, NaN, missing fields, or 99999.9 fill values.
 */
export function parseRtswSolarWind(raw: unknown): ParseResult<SolarWindSample> {
  if (!Array.isArray(raw)) {
    return { valid: [], invalidCount: 1 };
  }

  const valid: SolarWindSample[] = [];
  let invalidCount = 0;

  for (const row of raw) {
    if (!row || typeof row !== "object") {
      invalidCount++;
      continue;
    }
    const r = row as Record<string, unknown>;
    // GSM components only; GSE fields (by_gse, bz_gse) are never read.
    const speed = toFiniteNumber(r.proton_speed ?? r.speed ?? r.speedKmS);
    const density = toFiniteNumber(r.proton_density ?? r.density ?? r.densityCm3);
    const bt = toFiniteNumber(r.bt ?? r.btNt);
    const by = toFiniteNumber(r.by_gsm ?? r.byNt);
    const bz = toFiniteNumber(r.bz_gsm ?? r.bzNt);
    const ts = normalizeSwpcTime(r.time_tag ?? r.timestampIso);

    // No invented defaults: a row missing any required value is invalid.
    if (
      speed === null || speed < 150 || speed > 3500 ||
      density === null || density < 0 ||
      bt === null || bt < 0 ||
      by === null || bz === null || ts === null
    ) {
      invalidCount++;
      continue;
    }

    valid.push({
      timestampIso: ts,
      speedKmS: speed,
      densityCm3: density,
      btNt: bt,
      byNt: by,
      bzNt: bz,
      source: mapSolarWindSource(r.source),
    });
  }

  return { valid, invalidCount };
}

function mapSolarWindSource(raw: unknown): SolarWindSample["source"] {
  const srcRaw = String(raw ?? "SOLAR-1").toUpperCase();
  return srcRaw.includes("ACE")
    ? "ACE"
    : srcRaw.includes("IMAP")
      ? "IMAP"
      : srcRaw.includes("OMNI")
        ? "OMNI_ARCHIVE"
        : "SOLAR-1";
}

/**
 * Normalize an SWPC time tag ("2026-11-27 10:15:00", "2026-11-27T10:15:00", with or without Z;
 * SWPC tags are UTC) to a canonical ISO string. Returns null when unparseable.
 */
export function normalizeSwpcTime(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  let s = raw.trim().replace(" ", "T");
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(s)) s = `${s}Z`;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Maximum allowed gap between the joined RTSW wind and mag rows. */
export const RTSW_MAX_JOIN_GAP_MS = 5 * 60_000;

interface RtswRow {
  ms: number;
  iso: string;
  r: Record<string, unknown>;
}

/** Newest row with `active: true` and a parseable time_tag, regardless of array order. */
function newestActiveRow(raw: unknown): RtswRow | null {
  if (!Array.isArray(raw)) return null;
  let best: RtswRow | null = null;
  for (const row of raw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const r = row as Record<string, unknown>;
    if (r.active !== true) continue;
    const iso = normalizeSwpcTime(r.time_tag);
    if (iso === null) continue;
    const ms = Date.parse(iso);
    if (best === null || ms > best.ms) best = { ms, iso, r };
  }
  return best;
}

/**
 * Join NOAA RTSW 1-minute wind (`rtsw_wind_1m.json`) and mag (`rtsw_mag_1m.json`) files.
 * Takes the newest active row of each, requires their time tags within 5 minutes, and builds
 * a sample stamped with the OLDER of the two. Speed/density come from wind; bt, by_gsm and
 * bz_gsm from mag (GSM only, never GSE). Returns null if any required value is missing.
 */
export function joinRtswWindMag(windRaw: unknown, magRaw: unknown): SolarWindSample | null {
  const wind = newestActiveRow(windRaw);
  const mag = newestActiveRow(magRaw);
  if (!wind || !mag) return null;
  if (Math.abs(wind.ms - mag.ms) > RTSW_MAX_JOIN_GAP_MS) return null;

  const speed = toFiniteNumber(wind.r.proton_speed);
  const density = toFiniteNumber(wind.r.proton_density);
  const bt = toFiniteNumber(mag.r.bt);
  const by = toFiniteNumber(mag.r.by_gsm);
  const bz = toFiniteNumber(mag.r.bz_gsm);
  if (
    speed === null || speed < 150 || speed > 3500 ||
    density === null || density < 0 ||
    bt === null || bt < 0 ||
    by === null || bz === null
  ) {
    return null;
  }
  return {
    timestampIso: wind.ms <= mag.ms ? wind.iso : mag.iso,
    speedKmS: speed,
    densityCm3: density,
    btNt: bt,
    byNt: by,
    bzNt: bz,
    source: mapSolarWindSource(wind.r.source),
  };
}

/** NOAA planetary Kp sample. `timestampIso` is the END of the 3-hour interval. */
export interface KpSample {
  kpIndex: number;
  timestampIso: string;
}

export const KP_INTERVAL_MS = 3 * 3_600_000;

/**
 * Parse `noaa-planetary-k-index.json` (array of `{ time_tag, Kp, ... }` objects; time_tag is the
 * START of a 3-hour interval, UTC without Z). Returns samples stamped with the interval END
 * (time_tag + 3 h), sorted oldest first. Kp outside [0, 9] or unparseable rows are dropped.
 */
export function parseKpRows(raw: unknown): KpSample[] {
  if (!Array.isArray(raw)) return [];
  const out: Array<KpSample & { ms: number }> = [];
  for (const row of raw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const r = row as Record<string, unknown>;
    const startIso = normalizeSwpcTime(r.time_tag);
    const kp = toFiniteNumber(r.Kp);
    if (startIso === null || kp === null || kp < 0 || kp > 9) continue;
    const ms = Date.parse(startIso) + KP_INTERVAL_MS;
    out.push({ kpIndex: kp, timestampIso: new Date(ms).toISOString(), ms });
  }
  out.sort((a, b) => a.ms - b.ms);
  return out.map(({ kpIndex, timestampIso }) => ({ kpIndex, timestampIso }));
}

export interface GloTecGeoJsonParse {
  cells: GloTecCell[];
  invalidCount: number;
  /** Normalized file `time_tag`, or null when absent/unparseable. */
  timestampIso: string | null;
}

/**
 * Defensive parser for a NOAA GloTEC GeoJSON file (`geojson_2d_urt/*.geojson`).
 * Point features with coordinates [lon, lat] and properties.tec / properties.anomaly.
 * Negative anomaly is kept; non-finite, fill or out-of-range values drop the cell.
 */
export function parseGloTecGeoJson(raw: unknown): GloTecGeoJsonParse {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { cells: [], invalidCount: 1, timestampIso: null };
  }
  const obj = raw as Record<string, unknown>;
  const timestampIso = normalizeSwpcTime(obj.time_tag);
  if (!Array.isArray(obj.features)) return { cells: [], invalidCount: 1, timestampIso };

  const cells: GloTecCell[] = [];
  let invalidCount = 0;
  for (const f of obj.features) {
    const feat = f as { geometry?: { type?: unknown; coordinates?: unknown }; properties?: Record<string, unknown> } | null;
    const coords = feat && typeof feat === "object" ? feat.geometry?.coordinates : undefined;
    const props = feat && typeof feat === "object" ? feat.properties : undefined;
    if (!Array.isArray(coords) || coords.length < 2 || !props || typeof props !== "object") {
      invalidCount++;
      continue;
    }
    const lonDeg = typeof coords[0] === "number" && Number.isFinite(coords[0]) ? coords[0] : null;
    const latDeg = typeof coords[1] === "number" && Number.isFinite(coords[1]) ? coords[1] : null;
    const vTec = toFiniteNumber(props.tec);
    const anomaly = toFiniteNumber(props.anomaly);
    if (
      lonDeg === null || lonDeg < -180 || lonDeg > 180 ||
      latDeg === null || latDeg < -90 || latDeg > 90 ||
      vTec === null || vTec < 0 ||
      anomaly === null
    ) {
      invalidCount++;
      continue;
    }
    cells.push({ latDeg, lonDeg, vTec, anomaly });
  }
  return { cells, invalidCount, timestampIso };
}

const OMM_NUMERIC_FIELDS = [
  "MEAN_MOTION",
  "ECCENTRICITY",
  "INCLINATION",
  "RA_OF_ASC_NODE",
  "ARG_OF_PERICENTER",
  "MEAN_ANOMALY",
  "NORAD_CAT_ID",
  "ELEMENT_SET_NO",
  "BSTAR",
  "MEAN_MOTION_DOT",
  "MEAN_MOTION_DDOT",
] as const;

/**
 * Validate a CelesTrak GP JSON array (OMM). Keeps objects with string OBJECT_NAME, OBJECT_ID
 * and a parseable EPOCH, and finite numeric element fields.
 */
export function parseGnssOmm(raw: unknown): ParseResult<GnssOmmElement> {
  if (!Array.isArray(raw)) return { valid: [], invalidCount: 1 };
  const valid: GnssOmmElement[] = [];
  let invalidCount = 0;
  for (const row of raw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      invalidCount++;
      continue;
    }
    const r = row as Record<string, unknown>;
    const epochOk =
      typeof r.EPOCH === "string" && Number.isFinite(Date.parse(r.EPOCH.endsWith("Z") ? r.EPOCH : `${r.EPOCH}Z`));
    const numsOk = OMM_NUMERIC_FIELDS.every((k) => typeof r[k] === "number" && Number.isFinite(r[k]));
    if (typeof r.OBJECT_NAME !== "string" || typeof r.OBJECT_ID !== "string" || !epochOk || !numsOk) {
      invalidCount++;
      continue;
    }
    const el: GnssOmmElement = {
      OBJECT_NAME: r.OBJECT_NAME,
      OBJECT_ID: r.OBJECT_ID,
      EPOCH: r.EPOCH as string,
      MEAN_MOTION: r.MEAN_MOTION as number,
      ECCENTRICITY: r.ECCENTRICITY as number,
      INCLINATION: r.INCLINATION as number,
      RA_OF_ASC_NODE: r.RA_OF_ASC_NODE as number,
      ARG_OF_PERICENTER: r.ARG_OF_PERICENTER as number,
      MEAN_ANOMALY: r.MEAN_ANOMALY as number,
      NORAD_CAT_ID: r.NORAD_CAT_ID as number,
      ELEMENT_SET_NO: r.ELEMENT_SET_NO as number,
      BSTAR: r.BSTAR as number,
      MEAN_MOTION_DOT: r.MEAN_MOTION_DOT as number,
      MEAN_MOTION_DDOT: r.MEAN_MOTION_DDOT as number,
    };
    if (typeof r.EPHEMERIS_TYPE === "number") el.EPHEMERIS_TYPE = r.EPHEMERIS_TYPE;
    if (typeof r.CLASSIFICATION_TYPE === "string") el.CLASSIFICATION_TYPE = r.CLASSIFICATION_TYPE;
    if (typeof r.REV_AT_EPOCH === "number" && Number.isFinite(r.REV_AT_EPOCH)) el.REV_AT_EPOCH = r.REV_AT_EPOCH;
    valid.push(el);
  }
  return { valid, invalidCount };
}

export function parseGloTecCells(raw: unknown): ParseResult<GloTecCell> {
  if (!Array.isArray(raw)) {
    return { valid: [], invalidCount: 1 };
  }
  const valid: GloTecCell[] = [];
  let invalidCount = 0;

  for (const row of raw) {
    if (!row || typeof row !== "object") {
      invalidCount++;
      continue;
    }
    const r = row as Record<string, unknown>;
    const latDeg = toFiniteNumber(r.lat ?? r.latDeg);
    const lonDeg = toFiniteNumber(r.lon ?? r.lonDeg);
    const vTec = toFiniteNumber(r.tec ?? r.vTec);
    const anomaly = toFiniteNumber(r.anomaly) ?? 0;

    if (latDeg === null || lonDeg === null || vTec === null || vTec < 0) {
      invalidCount++;
      continue;
    }
    valid.push({ latDeg, lonDeg, vTec, anomaly });
  }
  return { valid, invalidCount };
}
