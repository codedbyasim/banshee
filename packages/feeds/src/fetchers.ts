import type { GloTecGrid, GnssOmmElement, SolarWindSample } from "@banshee/engine";
import {
  joinRtswWindMag,
  normalizeSwpcTime,
  parseGloTecGeoJson,
  parseGnssOmm,
  parseKpRows,
  type KpSample,
} from "./parsers.js";

const SWPC_BASE = "https://services.swpc.noaa.gov";
const SWPC_RTSW_WIND_URL = `${SWPC_BASE}/json/rtsw/rtsw_wind_1m.json`;
const SWPC_RTSW_MAG_URL = `${SWPC_BASE}/json/rtsw/rtsw_mag_1m.json`;
const SWPC_KP_URL = `${SWPC_BASE}/products/noaa-planetary-k-index.json`;
const SWPC_GLOTEC_INDEX_URL = `${SWPC_BASE}/products/glotec/geojson_2d_urt.json`;
const CELESTRAK_GNSS_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=gnss&FORMAT=json";

export const GLOTEC_CACHE_TTL_MS = 10 * 60_000;
export const GNSS_CACHE_TTL_MS = 6 * 3_600_000;
const DEFAULT_TIMEOUT_MS = 8000;

/** Injectable clock and transport so tests never touch the network. */
export interface FeedFetchOptions {
  /** Current time in epoch milliseconds. Defaults to Date.now. */
  now?: () => number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface GnssElementSet {
  /** When the element set was downloaded from CelesTrak. */
  fetchedAtIso: string;
  elements: GnssOmmElement[];
}

export type { KpSample };

interface ResolvedOptions {
  now: () => number;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}

function resolve(opts?: FeedFetchOptions | number): ResolvedOptions {
  const o: FeedFetchOptions = typeof opts === "number" ? { timeoutMs: opts } : (opts ?? {});
  return {
    now: o.now ?? (() => Date.now()),
    fetchImpl: o.fetchImpl ?? ((input, init) => fetch(input, init)),
    timeoutMs: o.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
}

/** GET a JSON document; null on timeout, network error, non-2xx status or bad JSON. */
async function fetchJson(url: string, o: ResolvedOptions): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), o.timeoutMs);
  try {
    const res = await o.fetchImpl(url, { signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// In-memory caches. Only successful results are stored; expired entries are never served.
interface CacheEntry<T> {
  value: T;
  expiresAtMs: number;
}
const cache: { glotec: CacheEntry<GloTecGrid> | null; gnss: CacheEntry<GnssElementSet> | null } = {
  glotec: null,
  gnss: null,
};

/** Test helper: clear the GloTEC and GNSS caches. */
export function __resetFeedCaches(): void {
  cache.glotec = null;
  cache.gnss = null;
}

/**
 * Latest L1 solar wind from NOAA SWPC RTSW: newest active rows of the 1-minute wind and mag
 * files joined within 5 minutes (see {@link joinRtswWindMag}). Null on any failure.
 * Accepts a timeout in ms (legacy) or {@link FeedFetchOptions}.
 */
export async function fetchLiveSolarWind(opts?: FeedFetchOptions | number): Promise<SolarWindSample | null> {
  const o = resolve(opts);
  const [wind, mag] = await Promise.all([fetchJson(SWPC_RTSW_WIND_URL, o), fetchJson(SWPC_RTSW_MAG_URL, o)]);
  if (wind === null || mag === null) return null;
  try {
    return joinRtswWindMag(wind, mag);
  } catch {
    return null;
  }
}

/**
 * Latest COMPLETED NOAA planetary Kp interval. `timestampIso` is the interval end
 * (time_tag + 3 h). Intervals ending after `now` are still in progress and are skipped,
 * so the computed feed age is never negative. Null on any failure.
 */
export async function fetchLiveKp(opts?: FeedFetchOptions | number): Promise<KpSample | null> {
  const o = resolve(opts);
  const raw = await fetchJson(SWPC_KP_URL, o);
  if (raw === null) return null;
  const nowMs = o.now();
  const completed = parseKpRows(raw).filter((s) => Date.parse(s.timestampIso) <= nowMs);
  return completed.length > 0 ? completed[completed.length - 1]! : null;
}

/** Compatibility wrapper: Kp value of {@link fetchLiveKp}, or null. */
export async function fetchLiveKpIndex(opts?: FeedFetchOptions | number): Promise<number | null> {
  const kp = await fetchLiveKp(opts);
  return kp === null ? null : kp.kpIndex;
}

/**
 * Latest NOAA GloTEC 2-D grid: reads the product index (oldest first), takes the newest entry
 * and fetches its GeoJSON. Cached for 10 minutes. Null on any failure or an empty grid.
 */
export async function fetchLiveGloTec(opts?: FeedFetchOptions): Promise<GloTecGrid | null> {
  const o = resolve(opts);
  const nowMs = o.now();
  if (cache.glotec && nowMs < cache.glotec.expiresAtMs) return cache.glotec.value;

  const index = await fetchJson(SWPC_GLOTEC_INDEX_URL, o);
  if (!Array.isArray(index)) return null;
  let latest: { url: string; ms: number; iso: string } | null = null;
  for (const e of index) {
    if (!e || typeof e !== "object") continue;
    const entry = e as Record<string, unknown>;
    const iso = normalizeSwpcTime(entry.time_tag);
    if (typeof entry.url !== "string" || iso === null) continue;
    const ms = Date.parse(iso);
    if (latest === null || ms >= latest.ms) latest = { url: entry.url, ms, iso };
  }
  if (latest === null) return null;

  let fileUrl: URL;
  try {
    fileUrl = new URL(latest.url, SWPC_BASE);
  } catch {
    return null;
  }
  // Only follow links back to the SWPC host.
  if (fileUrl.protocol !== "https:" || fileUrl.host !== new URL(SWPC_BASE).host) return null;

  const file = await fetchJson(fileUrl.toString(), o);
  if (file === null) return null;
  const parsed = parseGloTecGeoJson(file);
  if (parsed.cells.length === 0) return null;

  const grid: GloTecGrid = {
    timestampIso: parsed.timestampIso ?? latest.iso,
    latStepDeg: 2.5,
    lonStepDeg: 5,
    cells: parsed.cells,
  };
  cache.glotec = { value: grid, expiresAtMs: nowMs + GLOTEC_CACHE_TTL_MS };
  return grid;
}

/**
 * CelesTrak GNSS GP elements (OMM JSON). Cached for 6 hours. Null on timeout, network
 * failure, or when no record validates.
 */
export async function fetchLiveGnssElements(opts?: FeedFetchOptions): Promise<GnssElementSet | null> {
  const o = resolve(opts);
  const nowMs = o.now();
  if (cache.gnss && nowMs < cache.gnss.expiresAtMs) return cache.gnss.value;

  const raw = await fetchJson(CELESTRAK_GNSS_URL, o);
  if (raw === null) return null;
  const parsed = parseGnssOmm(raw);
  if (parsed.valid.length === 0) return null;

  const set: GnssElementSet = { fetchedAtIso: new Date(nowMs).toISOString(), elements: parsed.valid };
  cache.gnss = { value: set, expiresAtMs: nowMs + GNSS_CACHE_TTL_MS };
  return set;
}
