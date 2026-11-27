import type { SolarWindSample } from "@banshee/engine";
import { parseRtswSolarWind } from "./parsers.js";

const SWPC_RTSW_WIND_URL = "https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json";
const SWPC_KP_URL = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";

export async function fetchLiveSolarWind(timeoutMs = 8000): Promise<SolarWindSample | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(SWPC_RTSW_WIND_URL, { signal: controller.signal });
    if (!res.ok) return null;
    const json = await res.json();
    const parsed = parseRtswSolarWind(json);
    return parsed.valid.length > 0 ? parsed.valid[parsed.valid.length - 1]! : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchLiveKpIndex(timeoutMs = 8000): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(SWPC_KP_URL, { signal: controller.signal });
    if (!res.ok) return null;
    const rows = (await res.json()) as unknown[];
    if (!Array.isArray(rows) || rows.length < 2) return null;
    const last = rows[rows.length - 1];
    if (Array.isArray(last) && last.length >= 2) {
      const val = Number(last[1]);
      return Number.isFinite(val) ? val : null;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
