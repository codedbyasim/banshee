import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { wrapLongitudeDeg } from "../src/index.js";

describe("wrapLongitudeDeg PBT", () => {
  // Feature: mission-planner-ui, Property 1: Longitude wrap is always in range and idempotent
  // **Validates: Requirements 2.13, 7.3**
  it("Property 1: result is in [-180, 180) and wrapping is idempotent", () => {
    const lonArb = fc.oneof(
      fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: -540, max: 540, noNaN: true, noDefaultInfinity: true }),
      fc.constantFrom(-180, 180, 0, -0, 360, -360, 540, -540, 179.999999, -179.999999),
    );
    fc.assert(
      fc.property(lonArb, (lon) => {
        const w = wrapLongitudeDeg(lon);
        expect(Number.isFinite(w)).toBe(true);
        expect(w).toBeGreaterThanOrEqual(-180);
        expect(w).toBeLessThan(180);
        expect(wrapLongitudeDeg(w)).toBe(w);
      }),
      { numRuns: 100 },
    );
  });
});
