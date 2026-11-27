import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { wrapLongitudeDeg } from "@banshee/engine";
import { validateLatLon } from "./validateLatLon";

// Values that are never valid coordinates: non-finite numbers, non-numeric strings, other types.
const nonNumeric = fc.oneof(
  fc.constantFrom(NaN, Infinity, -Infinity),
  fc.string().map((s) => `x${s}`), // leading letter => Number() is NaN
  fc.constantFrom(undefined, null, {}, [], true, false),
);
const anyFiniteNumber = fc.double({ noNaN: true, noDefaultInfinity: true });
const anyValue = fc.oneof(anyFiniteNumber, anyFiniteNumber, nonNumeric);

function isFinNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

describe("validateLatLon properties", () => {
  // Feature: mission-planner-ui, Property 2: validateLatLon accepts exactly the valid domain
  it("PBT (validateLatLon): ok iff lat finite in [-90,90] and lon finite; lon wrapped; message on failure", () => {
    fc.assert(
      fc.property(anyValue, anyValue, (latRaw, lonRaw) => {
        const r = validateLatLon(latRaw, lonRaw);
        const expectedOk =
          isFinNum(latRaw) && latRaw >= -90 && latRaw <= 90 && isFinNum(lonRaw);
        expect(r.ok).toBe(expectedOk);
        if (r.ok) {
          expect(r.latDeg).toBe(latRaw);
          expect(r.lonDeg).toBe(wrapLongitudeDeg(lonRaw as number));
          expect(r.message).toBeNull();
        } else {
          expect(r.latDeg).toBeNull();
          expect(r.lonDeg).toBeNull();
          expect(r.message).toMatch(/-90 and 90|finite number/);
        }
      }),
      { numRuns: 200 },
    );
  });
});
