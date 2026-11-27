import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { sampleGloTecAt } from "../src/tec.js";
import type { GloTecCell, GloTecGrid } from "../src/types.js";

/** Full NOAA-style grid: 72 lats from -88.75 (2.5° steps) x 72 lons from -177.5 (5° steps). */
function offsetGrid(value: (lat: number, lon: number) => number): GloTecGrid {
  const cells: GloTecCell[] = [];
  for (let i = 0; i < 72; i++) {
    for (let j = 0; j < 72; j++) {
      const latDeg = -88.75 + 2.5 * i;
      const lonDeg = -177.5 + 5 * j;
      const v = value(latDeg, lonDeg);
      cells.push({ latDeg, lonDeg, vTec: v, anomaly: v - 10 });
    }
  }
  return { timestampIso: "2026-11-27T10:15:00Z", latStepDeg: 2.5, lonStepDeg: 5, cells };
}

const linear = offsetGrid((lat, lon) => 20 + lat * 0.1 + lon * 0.01);

function ok(lat: number, lon: number, grid = linear) {
  const s = sampleGloTecAt(grid, lat, lon);
  if (s.status !== "ok") throw new Error("expected ok sample");
  return s;
}

describe("sampleGloTecAt on half-step-offset NOAA grid", () => {
  it("sampling exactly at a node returns that node's value", () => {
    const s = ok(31.25, 72.5);
    expect(s.vTec).toBeCloseTo(20 + 3.125 + 0.725, 9);
    expect(s.anomaly).toBeCloseTo(20 + 3.125 + 0.725 - 10, 9);
  });

  it("midpoint between two longitude nodes returns their average", () => {
    const a = 20 + 3.125 + 0.725;
    const b = 20 + 3.125 + 0.775;
    expect(ok(31.25, 75).vTec).toBeCloseTo((a + b) / 2, 9);
  });

  it("midpoint between two latitude nodes returns their average", () => {
    const a = 20 + 3.125 + 0.725;
    const b = 20 + 3.375 + 0.725;
    expect(ok(32.5, 72.5).vTec).toBeCloseTo((a + b) / 2, 9);
  });

  it("keeps negative anomaly and wraps across the antimeridian", () => {
    const g = offsetGrid((_lat, lon) => (lon === 177.5 ? 10 : lon === -177.5 ? 20 : 5));
    // 180 is halfway between 177.5 and -177.5
    expect(ok(1.25, 180, g).vTec).toBeCloseTo(15, 9);
    expect(ok(1.25, -180, g).vTec).toBeCloseTo(15, 9);
    expect(ok(1.25, 177.5, g).anomaly).toBeCloseTo(0, 9);
    expect(ok(1.25, 0, g).anomaly).toBeCloseTo(-5, 9);
  });

  it("clamps beyond the first and last latitude rows to the edge row", () => {
    const g = offsetGrid((lat) => (lat === 88.75 ? 7 : lat === -88.75 ? 3 : 50));
    expect(ok(90, 2.5, g).vTec).toBeCloseTo(7, 9);
    expect(ok(89.5, 2.5, g).vTec).toBeCloseTo(7, 9);
    expect(ok(-90, 2.5, g).vTec).toBeCloseTo(3, 9);
  });

  it("PBT: sampled value stays within neighbour [min, max] anywhere on the offset grid", () => {
    const g = offsetGrid((lat, lon) => Math.abs(Math.sin(lat * 0.3) * 40 + Math.cos(lon * 0.2) * 20));
    fc.assert(
      fc.property(
        fc.double({ min: -90, max: 90, noNaN: true }),
        fc.double({ min: -180, max: 180, noNaN: true }),
        (lat, lon) => {
          const s = ok(lat, lon, g);
          expect(s.vTec).toBeGreaterThanOrEqual(s.neighbourMinVtec - 1e-9);
          expect(s.vTec).toBeLessThanOrEqual(s.neighbourMaxVtec + 1e-9);
        }
      )
    );
  });
});
