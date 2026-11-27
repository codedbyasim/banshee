import type {
  GloTecGrid,
  SatelliteObservation,
  SatelliteRiskDetail,
} from "./types.js";
import { computeL1DelayMeters, computePiercePoint } from "./physics.js";
import { sampleGloTecAt } from "./tec.js";

export const GHOST_ANOMALY_THRESHOLD_TECU = 15;
export const GHOST_L1_DELAY_THRESHOLD_M = 12;

export function filterVisibleSatellites(
  satellites: SatelliteObservation[],
  elevationMaskDeg: number
): SatelliteObservation[] {
  const mask = Math.max(0, Math.min(90, elevationMaskDeg));
  return satellites.filter((s) => s.elevationDeg >= mask && s.elevationDeg <= 90);
}

/**
 * Evaluate each visible satellite's line-of-sight through the 350 km ionosphere.
 * Satellites whose signal crosses a disturbed patch become "ghosts".
 */
export function evaluateSatelliteSky(
  latDeg: number,
  lonDeg: number,
  elevationMaskDeg: number,
  satellites: SatelliteObservation[],
  glotec: GloTecGrid | null,
  lowLatPostSunsetActive: boolean
): {
  details: SatelliteRiskDetail[];
  cleanCount: number;
  ghostCount: number;
  cleanPdopEstimate: number;
  meanVtec: number | null;
  maxL1DelayMeters: number | null;
  tecAvailable: boolean;
} {
  const visible = filterVisibleSatellites(satellites, elevationMaskDeg);
  const details: SatelliteRiskDetail[] = [];
  let tecAvailable = true;

  for (const sat of visible) {
    const ipp = computePiercePoint(latDeg, lonDeg, sat.elevationDeg, sat.azimuthDeg);
    const sampled = sampleGloTecAt(glotec, ipp.latDeg, ipp.lonDeg);
    if (sampled.status === "unavailable") {
      // FR-RE-16: no TEC number is invented; ghost status cannot be judged from TEC.
      tecAvailable = false;
      details.push({
        id: sat.id,
        name: sat.name,
        constellation: sat.constellation,
        elevationDeg: sat.elevationDeg,
        azimuthDeg: sat.azimuthDeg,
        ipp,
        vTec: null,
        sTec: null,
        l1DelayMeters: null,
        anomaly: null,
        isGhost: false,
      });
      continue;
    }
    const sTec = sampled.vTec * ipp.slantFactor;
    const l1DelayMeters = computeL1DelayMeters(sTec);

    // Lower-elevation signals near the magnetic equator post-sunset scintillate first
    const postSunsetGhost =
      lowLatPostSunsetActive &&
      (sampled.anomaly >= 8 || (sat.elevationDeg < 30 && sampled.vTec >= 25));

    const isGhost =
      sampled.anomaly >= GHOST_ANOMALY_THRESHOLD_TECU ||
      l1DelayMeters >= GHOST_L1_DELAY_THRESHOLD_M ||
      postSunsetGhost;

    details.push({
      id: sat.id,
      name: sat.name,
      constellation: sat.constellation,
      elevationDeg: sat.elevationDeg,
      azimuthDeg: sat.azimuthDeg,
      ipp,
      vTec: Number(sampled.vTec.toFixed(2)),
      sTec: Number(sTec.toFixed(2)),
      l1DelayMeters: Number(l1DelayMeters.toFixed(2)),
      anomaly: Number(sampled.anomaly.toFixed(2)),
      isGhost,
    });
  }

  const clean = details.filter((d) => !d.isGhost);
  const cleanCount = clean.length;
  const ghostCount = details.length - cleanCount;

  // Simplified PDOP estimate for clean satellites only (lower is better; 99.9 = no fix)
  let cleanPdopEstimate = 99.9;
  if (cleanCount >= 4) {
    const meanSinEl =
      clean.reduce((acc, s) => acc + Math.sin((s.elevationDeg * Math.PI) / 180), 0) /
      cleanCount;
    cleanPdopEstimate = Number(
      Math.max(1.1, Math.min(25, 12 / (Math.sqrt(cleanCount) * Math.max(0.2, meanSinEl)))).toFixed(2)
    );
  }

  if (glotec === null || !Array.isArray(glotec.cells) || glotec.cells.length === 0) {
    tecAvailable = false;
  }
  const vTecs = details.map((d) => d.vTec).filter((v): v is number => v !== null);
  const delays = details.map((d) => d.l1DelayMeters).filter((v): v is number => v !== null);

  const meanVtec =
    tecAvailable && vTecs.length > 0
      ? Number((vTecs.reduce((acc, v) => acc + v, 0) / vTecs.length).toFixed(2))
      : null;

  const maxL1DelayMeters =
    tecAvailable && delays.length > 0 ? Number(Math.max(...delays).toFixed(2)) : null;

  return {
    details,
    cleanCount,
    ghostCount,
    cleanPdopEstimate,
    meanVtec,
    maxL1DelayMeters,
    tecAvailable,
  };
}
