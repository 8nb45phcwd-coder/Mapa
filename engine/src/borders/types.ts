import type { BorderSegment, BorderSegmentId } from "../types.js";

/** Serialize a BorderSegmentId into a stable string key. */
export function formatBorderSegmentId(id: BorderSegmentId): string {
  return `${id.country_a}-${id.country_b}-${id.index}`;
}

/** Canonicalize a country pair to (a,b) sorted lexicographically and a pair key. */
export function canonicalPair(a: string, b: string | "SEA"): { a: string; b: string | "SEA"; key: string } {
  if (b === "SEA") return { a, b, key: `${a}-SEA` };
  const [ca, cb] = [a, b].sort();
  return { a: ca, b: cb, key: `${ca}-${cb}` };
}

/** Convenience guard to attach a string id to a segment if missing. */
export function ensureSegmentKey(segment: BorderSegment): BorderSegment {
  if (!segment.segment_id) {
    segment.segment_id = formatBorderSegmentId(segment.id);
  }
  return segment;
}

export type { BorderSegment, BorderSegmentGeometry, BorderSegmentId } from "../types.js";
