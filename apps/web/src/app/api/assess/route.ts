import { NextRequest, NextResponse } from "next/server";
import { fetchLiveKpIndex, fetchLiveSolarWind } from "@banshee/feeds";
import { buildAssessResponse } from "@/lib/assess";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const body = await buildAssessResponse(searchParams, {
    fetchLiveSolarWind: () => fetchLiveSolarWind(5000),
    fetchLiveKpIndex: () => fetchLiveKpIndex(5000),
    nowIso: () => new Date().toISOString(),
  });
  return NextResponse.json(body);
}
