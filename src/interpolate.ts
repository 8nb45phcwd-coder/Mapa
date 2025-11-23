import type { TransformMatrix } from "./types.js";

/** Linear interpolation between two 2D points. */
export function interpolatePositions(
  posA: [number, number],
  posB: [number, number],
  t: number
): [number, number] {
  return [posA[0] + (posB[0] - posA[0]) * t, posA[1] + (posB[1] - posA[1]) * t];
}

/** Linear interpolation between two transform matrices. */
export function interpolateTransform(ta: TransformMatrix, tb: TransformMatrix, t: number): TransformMatrix {
  return {
    a: ta.a + (tb.a - ta.a) * t,
    b: ta.b + (tb.b - ta.b) * t,
    c: ta.c + (tb.c - ta.c) * t,
    d: ta.d + (tb.d - ta.d) * t,
    e: ta.e + (tb.e - ta.e) * t,
    f: ta.f + (tb.f - ta.f) * t,
  };
}

/** Mix geographic and conceptual positions. */
export function screenPosHybrid(
  geoPos: [number, number],
  conceptPos: [number, number],
  alpha: number
): [number, number] {
  return interpolatePositions(geoPos, conceptPos, alpha);
}
