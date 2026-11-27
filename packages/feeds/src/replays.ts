import type {
  GloTecGrid,
  SatelliteObservation,
  SolarWindSample,
} from "@banshee/engine";

export interface StormReplayScenario {
  id: "gannon-2024" | "halloween-2003" | "nov-2025" | "jan-2026" | "multan-sunset";
  name: string;
  dateLabel: string;
  summary: string;
  defaultLatDeg: number;
  defaultLonDeg: number;
  timestampIso: string;
  solarWind: SolarWindSample;
  kpIndex: number;
  glotec: GloTecGrid;
  satellites: SatelliteObservation[];
}

export function generateDemoConstellation(seedOffsetDeg = 0): SatelliteObservation[] {
  const specs: Array<[string, string, SatelliteObservation["constellation"], number, number]> = [
    ["G01", "GPS BIIR-2 (PRN 01)", "GPS", 72, 25],
    ["G06", "GPS III SV04 (PRN 06)", "GPS", 58, 110],
    ["G11", "GPS III SV05 (PRN 11)", "GPS", 44, 195],
    ["G17", "GPS IIR-M (PRN 17)", "GPS", 24, 240],
    ["G24", "GPS IIF-1 (PRN 24)", "GPS", 16, 305],
    ["E03", "Galileo FOC FM12", "GALILEO", 64, 340],
    ["E15", "Galileo FOC FM18", "GALILEO", 36, 75],
    ["E26", "Galileo FOC FM08", "GALILEO", 19, 155],
    ["R04", "GLONASS-M 744", "GLONASS", 51, 275],
    ["R19", "GLONASS-M 754", "GLONASS", 22, 45],
    ["C12", "BeiDou-3 M12", "BEIDOU", 61, 140],
    ["C28", "BeiDou-3 M19", "BEIDOU", 28, 290],
  ];
  return specs.map(([id, name, constellation, elevationDeg, azimuthDeg]) => ({
    id,
    name,
    constellation,
    elevationDeg,
    azimuthDeg: (azimuthDeg + seedOffsetDeg) % 360,
  }));
}

function makeRegionalGrid(
  centerLat: number,
  centerLon: number,
  baseVtec: number,
  peakAnomaly: number,
  timestampIso: string
): GloTecGrid {
  const cells = [];
  for (let dLat = -10; dLat <= 10; dLat += 2.5) {
    for (let dLon = -15; dLon <= 15; dLon += 5) {
      const dist = Math.hypot(dLat / 5, dLon / 10);
      const bump = Math.max(0, 1 - dist * 0.45);
      cells.push({
        latDeg: Math.round((centerLat + dLat) / 2.5) * 2.5,
        lonDeg: Math.round((centerLon + dLon) / 5) * 5,
        vTec: Number((baseVtec + peakAnomaly * bump).toFixed(1)),
        anomaly: Number((peakAnomaly * bump).toFixed(1)),
      });
    }
  }
  return { timestampIso, latStepDeg: 2.5, lonStepDeg: 5, cells };
}

export const STORM_REPLAYS: Record<StormReplayScenario["id"], StormReplayScenario> = {
  "gannon-2024": {
    id: "gannon-2024",
    name: "Gannon Storm (May 2024)",
    dateLabel: "10 May 2024 · 17:05 UTC",
    summary:
      "Real NASA OMNI + GFZ archive: L1 shock jumped 447 -> 714 km/s, Bz plunged to -47 nT, Kp hit 9.0. Cost US Midwest corn farms $69.6M–$1.7B.",
    defaultLatDeg: 41.878,
    defaultLonDeg: -93.0977, // Iowa corn belt
    timestampIso: "2024-05-10T18:00:00Z",
    solarWind: {
      timestampIso: "2024-05-10T17:59:00Z",
      speedKmS: 714,
      densityCm3: 28.4,
      btNt: 52.1,
      byNt: -18.0,
      bzNt: -47.0,
      source: "OMNI_ARCHIVE",
    },
    kpIndex: 9.0,
    glotec: makeRegionalGrid(42.5, -95, 58, 34, "2024-05-10T18:00:00Z"),
    satellites: generateDemoConstellation(12),
  },
  "halloween-2003": {
    id: "halloween-2003",
    name: "Halloween Storms (Oct 2003)",
    dateLabel: "29 Oct 2003 · 06:11 UTC",
    summary:
      "Historic extreme storm: FAA WAAS precision approach went offline for 15 hours (29–30 Oct) and 11.3 hours (30–31 Oct).",
    defaultLatDeg: 39.8283,
    defaultLonDeg: -98.5795,
    timestampIso: "2003-10-29T19:00:00Z",
    solarWind: {
      timestampIso: "2003-10-29T18:55:00Z",
      speedKmS: 1850,
      densityCm3: 35.0,
      btNt: 62.0,
      byNt: 12.0,
      bzNt: -50.0,
      source: "OMNI_ARCHIVE",
    },
    kpIndex: 9.0,
    glotec: makeRegionalGrid(40.0, -100, 72, 42, "2003-10-29T19:00:00Z"),
    satellites: generateDemoConstellation(45),
  },
  "nov-2025": {
    id: "nov-2025",
    name: "Nov 2025 Severe Storm",
    dateLabel: "12 Nov 2025 · 02:30 UTC",
    summary: "GFZ Potsdam Kp reached 8.667 (G4 severe storm) with rapid southward IMF coupling.",
    defaultLatDeg: 33.6844,
    defaultLonDeg: 73.0479,
    timestampIso: "2025-11-12T02:30:00Z",
    solarWind: {
      timestampIso: "2025-11-12T02:25:00Z",
      speedKmS: 820,
      densityCm3: 21.0,
      btNt: 34.0,
      byNt: 9.0,
      bzNt: -29.0,
      source: "OMNI_ARCHIVE",
    },
    kpIndex: 8.67,
    glotec: makeRegionalGrid(32.5, 75, 48, 24, "2025-11-12T02:30:00Z"),
    satellites: generateDemoConstellation(90),
  },
  "jan-2026": {
    id: "jan-2026",
    name: "Jan 2026 Severe Storm",
    dateLabel: "19 Jan 2026 · 15:00 UTC",
    summary: "Second Kp 8.667 storm of Solar Cycle 25 peak, driving severe mid- and low-latitude TEC gradients.",
    defaultLatDeg: 31.5204,
    defaultLonDeg: 74.3587,
    timestampIso: "2026-01-19T15:00:00Z",
    solarWind: {
      timestampIso: "2026-01-19T14:55:00Z",
      speedKmS: 780,
      densityCm3: 19.5,
      btNt: 31.0,
      byNt: -8.0,
      bzNt: -26.5,
      source: "OMNI_ARCHIVE",
    },
    kpIndex: 8.67,
    glotec: makeRegionalGrid(32.5, 75, 44, 21, "2026-01-19T15:00:00Z"),
    satellites: generateDemoConstellation(135),
  },
  "multan-sunset": {
    id: "multan-sunset",
    name: "Multan Post-Sunset Scintillation",
    dateLabel: "Low-Lat Watch · 19:30 PKT",
    summary:
      "Even with calm global Kp (2.3), post-sunset equatorial plasma bubbles over Multan (30.16°N, 71.52°E) ghost low-elevation satellites.",
    defaultLatDeg: 30.1575,
    defaultLonDeg: 71.5249,
    timestampIso: "2026-11-26T14:30:00Z", // 19:30 local solar time at 71.5E
    solarWind: {
      timestampIso: "2026-11-26T14:26:00Z",
      speedKmS: 485,
      densityCm3: 6.2,
      btNt: 6.4,
      byNt: 2.1,
      bzNt: -3.2,
      source: "SOLAR-1",
    },
    kpIndex: 2.3,
    glotec: makeRegionalGrid(30.0, 70, 32, 11, "2026-11-26T14:30:00Z"),
    satellites: generateDemoConstellation(180),
  },
};
