import { NextRequest, NextResponse } from "next/server";
import { fetchLiveGloTec, fetchLiveGnssElements, fetchLiveKp, fetchLiveSolarWind } from "@banshee/feeds";
import { buildForecastResponse } from "@/lib/forecast";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const result = await buildForecastResponse(searchParams, {
    fetchLiveSolarWind: () => fetchLiveSolarWind({ timeoutMs: 5000 }),
    fetchLiveGloTec: () => fetchLiveGloTec({ timeoutMs: 5000 }),
    fetchLiveKp: () => fetchLiveKp({ timeoutMs: 5000 }),
    fetchLiveGnssElements: () => fetchLiveGnssElements({ timeoutMs: 5000 }),
    nowIso: () => new Date().toISOString(),
  });
  return NextResponse.json(result.body, { status: result.status });
}
