#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { computeL1LeadTimeMinutes, propagateGnssElements, sampleGloTecAt } from "@banshee/engine";
import {
  fetchLiveGloTec,
  fetchLiveGnssElements,
  fetchLiveKp,
  fetchLiveSolarWind,
} from "@banshee/feeds";

/** Default observer for get_gnss_elements: Multan, Pakistan. */
const DEFAULT_LAT = 30.1575;
const DEFAULT_LON = 71.5249;

const SOURCES = {
  solarWind: "NOAA SWPC RTSW 1-minute wind + mag (services.swpc.noaa.gov/json/rtsw/)",
  kp: "NOAA SWPC planetary K-index (services.swpc.noaa.gov/products/noaa-planetary-k-index.json)",
  glotec: "NOAA SWPC GloTEC 2-D (services.swpc.noaa.gov/products/glotec/geojson_2d_urt.json)",
  gnss: "CelesTrak GP GROUP=gnss (celestrak.org), propagated with SGP4 (satellite.js)",
} as const;

const server = new Server(
  { name: "swpc-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_solar_wind",
      description:
        "Fetch the latest L1 solar wind (speed, density, Bt, By/Bz GSM) and upstream lead time from NOAA SWPC RTSW. Returns live: false and a null sample when the feed is unavailable.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_glotec_at",
      description:
        "Sample the latest NOAA GloTEC vertical TEC and anomaly grid at (lat, lon). Regional ionosphere estimate (~5 x 2.5 degree grid), not an exact point. Returns live: false and a null sample when the feed is unavailable.",
      inputSchema: {
        type: "object",
        properties: {
          lat: { type: "number", description: "Latitude in degrees (-90..90)" },
          lon: { type: "number", description: "Longitude in degrees (-180..180)" },
        },
        required: ["lat", "lon"],
      },
    },
    {
      name: "get_kp_forecast",
      description:
        "Fetch the latest completed planetary geomagnetic Kp interval from NOAA SWPC. timestampIso is the interval end. Returns live: false and null values when unavailable.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_gnss_elements",
      description:
        `Fetch live CelesTrak GNSS elements and propagate them (SGP4) to look angles for an observer. Defaults: lat ${DEFAULT_LAT}, lon ${DEFAULT_LON} (Multan) and the current time. Satellites are sorted by elevation, highest first, and include those below the horizon. Returns live: false and an empty list when CelesTrak is unavailable.`,
      inputSchema: {
        type: "object",
        properties: {
          lat: { type: "number", description: `Observer latitude in degrees (-90..90), default ${DEFAULT_LAT}` },
          lon: { type: "number", description: `Observer longitude in degrees (-180..180), default ${DEFAULT_LON}` },
          timestampIso: { type: "string", description: "ISO-8601 UTC instant, default now" },
        },
      },
    },
  ],
}));

function textResult(payload: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

function readCoord(args: Record<string, unknown>, key: "lat" | "lon", fallback: number | null): number | null {
  const raw = args[key];
  if (raw === undefined) return fallback;
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : Number.NaN;
  const limit = key === "lat" ? 90 : 180;
  return Number.isFinite(n) && n >= -limit && n <= limit ? n : null;
}

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name } = req.params;
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;

  if (name === "get_solar_wind") {
    const sample = await fetchLiveSolarWind();
    if (!sample) {
      return textResult({ live: false, source: SOURCES.solarWind, sample: null, leadTimeMinutes: null });
    }
    const lead = computeL1LeadTimeMinutes(sample.speedKmS);
    return textResult({
      live: true,
      source: SOURCES.solarWind,
      sample,
      leadTimeMinutes: lead === null ? null : Number(lead.toFixed(1)),
    });
  }

  if (name === "get_glotec_at") {
    const lat = readCoord(args, "lat", null);
    const lon = readCoord(args, "lon", null);
    if (lat === null || lon === null) {
      return textResult(
        { error: "lat must be a finite number in [-90, 90] and lon a finite number in [-180, 180]", source: SOURCES.glotec, live: false },
        true
      );
    }
    const grid = await fetchLiveGloTec();
    const sampled = grid ? sampleGloTecAt(grid, lat, lon) : null;
    return textResult({
      live: grid !== null,
      source: SOURCES.glotec,
      lat,
      lon,
      gridTimestampIso: grid ? grid.timestampIso : null,
      sample: sampled && sampled.status === "ok" ? sampled : null,
      note: "Regional ionosphere estimate (~5 x 2.5 degree grid), not an exact point",
    });
  }

  if (name === "get_kp_forecast") {
    const kp = await fetchLiveKp();
    return textResult({
      live: kp !== null,
      source: SOURCES.kp,
      kpIndex: kp ? kp.kpIndex : null,
      timestampIso: kp ? kp.timestampIso : null,
    });
  }

  if (name === "get_gnss_elements") {
    const lat = readCoord(args, "lat", DEFAULT_LAT);
    const lon = readCoord(args, "lon", DEFAULT_LON);
    const tsRaw = args.timestampIso;
    const timestampIso =
      tsRaw === undefined
        ? new Date().toISOString()
        : typeof tsRaw === "string" && Number.isFinite(Date.parse(tsRaw))
          ? new Date(Date.parse(tsRaw)).toISOString()
          : null;
    if (lat === null || lon === null || timestampIso === null) {
      return textResult(
        { error: "lat/lon must be finite and in range; timestampIso must be an ISO-8601 instant", source: SOURCES.gnss, live: false },
        true
      );
    }
    const location = {
      lat,
      lon,
      latIsDefault: args.lat === undefined,
      lonIsDefault: args.lon === undefined,
      defaultLabel: "Multan (30.1575, 71.5249)",
    };
    const set = await fetchLiveGnssElements();
    if (!set) {
      return textResult({
        live: false,
        source: SOURCES.gnss,
        fetchedAtIso: null,
        location,
        timestampIso,
        count: 0,
        skipped: 0,
        satellites: [],
      });
    }
    const { satellites, skipped } = propagateGnssElements(set.elements, lat, lon, timestampIso);
    satellites.sort((a, b) => b.elevationDeg - a.elevationDeg);
    return textResult({
      live: true,
      source: SOURCES.gnss,
      fetchedAtIso: set.fetchedAtIso,
      location,
      timestampIso,
      timestampIsDefault: tsRaw === undefined,
      count: satellites.length,
      skipped,
      satellites,
    });
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("swpc-mcp fatal error:", err);
  process.exit(1);
});
