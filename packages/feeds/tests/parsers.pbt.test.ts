import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { parseGloTecCells, parseRtswSolarWind } from "../src/parsers.js";

describe("Banshee Feeds — PBT-7 Parser Robustness (fast-check)", () => {
  it("PBT-7: malformed RTSW rows (null, NaN, 99999.9 fill values) never crash ingestion", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.constant(null),
            fc.constant(undefined),
            fc.record({
              time_tag: fc.oneof(fc.constant("2026-11-26 12:00:00"), fc.constant(null)),
              proton_speed: fc.oneof(
                fc.double({ min: 250, max: 2000, noNaN: true }),
                fc.constant(99999.9),
                fc.constant(-99999.9),
                fc.constant(NaN),
                fc.constant(null)
              ),
              bz_gsm: fc.oneof(
                fc.double({ min: -60, max: 60, noNaN: true }),
                fc.constant(99999.9),
                fc.constant(null)
              ),
            })
          ),
          { maxLength: 25 }
        ),
        (rows) => {
          const res = parseRtswSolarWind(rows);
          expect(res.valid.length + res.invalidCount).toBe(rows.length);
          for (const item of res.valid) {
            expect(Number.isFinite(item.speedKmS)).toBe(true);
            expect(Math.abs(item.speedKmS)).toBeLessThan(9999);
            expect(Number.isFinite(item.bzNt)).toBe(true);
          }
        }
      )
    );
  });

  it("PBT-7b: malformed GloTEC payloads never crash ingestion", () => {
    fc.assert(
      fc.property(fc.anything(), (payload) => {
        const res = parseGloTecCells(payload);
        expect(Array.isArray(res.valid)).toBe(true);
        expect(res.invalidCount).toBeGreaterThanOrEqual(0);
      })
    );
  });
});
