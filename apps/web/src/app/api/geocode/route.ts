import { NextRequest, NextResponse } from "next/server";
import { NOMINATIM_SEARCH_URL, NOMINATIM_USER_AGENT } from "@/lib/sources";
import { validateLatLon } from "@/lib/validateLatLon";

export const dynamic = "force-dynamic";

const MIN_QUERY_CHARS = 3;
const MIN_INTERVAL_MS = 1000;
const MAX_QUEUE_WAIT_MS = 3000;
const TIMEOUT_MS = 8000;

/** Module-level gate: next slot at which an upstream request may leave (Nominatim: max 1 req/s). */
let nextSlotMs = 0;

/** Reserves the next 1 req/s slot. Returns ms to wait, or null if the queue is too long. */
function reserveSlot(nowMs: number): number | null {
  const slot = Math.max(nowMs, nextSlotMs);
  const wait = slot - nowMs;
  if (wait > MAX_QUEUE_WAIT_MS) return null;
  nextSlotMs = slot + MIN_INTERVAL_MS;
  return wait;
}

export interface GeocodeResult {
  label: string;
  latDeg: number;
  lonDeg: number;
}

function mapRows(rows: unknown): GeocodeResult[] {
  if (!Array.isArray(rows)) return [];
  const out: GeocodeResult[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as Record<string, unknown>;
    if (typeof r.display_name !== "string" || r.display_name.length === 0) continue;
    const v = validateLatLon(r.lat, r.lon);
    if (!v.ok || v.latDeg === null || v.lonDeg === null) continue;
    out.push({ label: r.display_name, latDeg: v.latDeg, lonDeg: v.lonDeg });
    if (out.length >= 5) break;
  }
  return out;
}

export async function GET(request: NextRequest) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < MIN_QUERY_CHARS) {
    return NextResponse.json(
      { error: `Search text must be at least ${MIN_QUERY_CHARS} characters.` },
      { status: 400 },
    );
  }

  const wait = reserveSlot(Date.now());
  if (wait === null) {
    return NextResponse.json({ error: "Place search is busy. Try again in a moment." }, { status: 429 });
  }
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));

  const url = new URL(NOMINATIM_SEARCH_URL);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");
  url.searchParams.set("q", q);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": NOMINATIM_USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status === 429) {
      return NextResponse.json({ error: "Place search is rate limited. Try again shortly." }, { status: 429 });
    }
    if (!res.ok) {
      return NextResponse.json({ error: "Place search is unavailable right now." }, { status: 502 });
    }
    return NextResponse.json(mapRows(await res.json()));
  } catch {
    return NextResponse.json({ error: "Place search failed or timed out." }, { status: 502 });
  }
}
