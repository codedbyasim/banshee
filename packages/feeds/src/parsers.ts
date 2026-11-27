import type { GloTecCell, SolarWindSample } from "@banshee/engine";

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
    const speed = toFiniteNumber(r.proton_speed ?? r.speed ?? r.speedKmS);
    const density = toFiniteNumber(r.proton_density ?? r.density ?? r.densityCm3) ?? 5;
    const bt = toFiniteNumber(r.bt ?? r.btNt) ?? 5;
    const by = toFiniteNumber(r.by_gsm ?? r.by ?? r.byNt) ?? 0;
    const bz = toFiniteNumber(r.bz_gsm ?? r.bz ?? r.bzNt);
    const ts = typeof (r.time_tag ?? r.timestampIso) === "string"
      ? String(r.time_tag ?? r.timestampIso)
      : null;

    if (speed === null || speed < 150 || speed > 3500 || bz === null || !ts) {
      invalidCount++;
      continue;
    }

    const srcRaw = String(r.source ?? "SOLAR-1").toUpperCase();
    const source: SolarWindSample["source"] =
      srcRaw.includes("ACE")
        ? "ACE"
        : srcRaw.includes("IMAP")
          ? "IMAP"
          : srcRaw.includes("OMNI")
            ? "OMNI_ARCHIVE"
            : "SOLAR-1";

    valid.push({
      timestampIso: ts.endsWith("Z") ? ts : `${ts.replace(" ", "T")}Z`,
      speedKmS: speed,
      densityCm3: Math.max(0, density),
      btNt: Math.max(0, bt),
      byNt: by,
      bzNt: bz,
      source,
    });
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
