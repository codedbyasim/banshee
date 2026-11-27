#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { computeL1LeadTimeMinutes, sampleGloTecAt } from "@banshee/engine";
import {
  fetchLiveKpIndex,
  fetchLiveSolarWind,
  STORM_REPLAYS,
} from "@banshee/feeds";

const server = new Server(
  { name: "swpc-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_solar_wind",
      description: "Fetch latest L1 solar wind (speed, density, Bt, By, Bz GSM) and upstream lead time from NOAA SWPC RTSW.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_glotec_at",
      description: "Sample NOAA GloTEC vertical TEC and anomaly at a given (lat, lon).",
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
      description: "Fetch latest planetary geomagnetic Kp index from NOAA SWPC.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_gnss_elements",
      description: "Return active GNSS satellite observation summary for sky-plot analysis.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === "get_solar_wind") {
    const live = await fetchLiveSolarWind();
    const sample = live ?? STORM_REPLAYS["multan-sunset"].solarWind;
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              live: Boolean(live),
              ...sample,
              leadTimeMinutes: (() => {
                const lead = computeL1LeadTimeMinutes(sample.speedKmS);
                return lead === null ? null : Number(lead.toFixed(1));
              })(),
            },
            null,
            2
          ),
        },
      ],
    };
  }

  if (name === "get_glotec_at") {
    const lat = Number((args as Record<string, unknown>)?.lat ?? 30.1575);
    const lon = Number((args as Record<string, unknown>)?.lon ?? 71.5249);
    const sampled = sampleGloTecAt(STORM_REPLAYS["multan-sunset"].glotec, lat, lon);
    return {
      content: [{ type: "text", text: JSON.stringify({ lat, lon, ...sampled }, null, 2) }],
    };
  }

  if (name === "get_kp_forecast") {
    const kp = await fetchLiveKpIndex();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ live: kp !== null, kpIndex: kp ?? 2.3 }, null, 2),
        },
      ],
    };
  }

  if (name === "get_gnss_elements") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { count: STORM_REPLAYS["multan-sunset"].satellites.length, satellites: STORM_REPLAYS["multan-sunset"].satellites },
            null,
            2
          ),
        },
      ],
    };
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
