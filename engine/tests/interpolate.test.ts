import { describe, expect, it } from "vitest";
import { interpolatePositions, interpolateTransform, screenPosHybrid } from "../src/interpolate.js";
import { IDENTITY_TRANSFORM } from "../src/geometry.js";

const transformB = { a: 2, b: 1, c: 1, d: 2, e: 5, f: -3 };

describe("interpolation utilities", () => {
  it("interpolates positions linearly", () => {
    expect(interpolatePositions([0, 0], [10, 10], 0)).toEqual([0, 0]);
    expect(interpolatePositions([0, 0], [10, 10], 1)).toEqual([10, 10]);
    expect(interpolatePositions([0, 0], [10, 10], 0.5)).toEqual([5, 5]);
  });

  it("interpolates transforms component-wise", () => {
    const mid = interpolateTransform(IDENTITY_TRANSFORM, transformB, 0.5);
    expect(mid).toEqual({ a: 1.5, b: 0.5, c: 0.5, d: 1.5, e: 2.5, f: -1.5 });
  });

  it("mixes geographic and conceptual positions based on alpha", () => {
    expect(screenPosHybrid([1, 1], [9, 9], 0)).toEqual([1, 1]);
    expect(screenPosHybrid([1, 1], [9, 9], 1)).toEqual([9, 9]);
    expect(screenPosHybrid([1, 1], [9, 9], 0.25)).toEqual([3, 3]);
  });
});
