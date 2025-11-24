import borderSemanticData from "../data/border_semantics.json" assert { type: "json" };
import type { BorderSemanticCatalog, BorderSemanticEntry } from "./types.js";

const catalog: BorderSemanticCatalog = borderSemanticData as BorderSemanticCatalog;
const byId = new Map<string, BorderSemanticEntry>(catalog.segments.map((s) => [s.segment_id, s]));

export function getBorderSemantics(): BorderSemanticEntry[] {
  return catalog.segments;
}

export function getBorderSemanticsBySegmentId(segmentId: string): BorderSemanticEntry | undefined {
  return byId.get(segmentId);
}

export function getSegmentsBySemanticTag(tag: string): BorderSemanticEntry[] {
  return catalog.segments.filter((s) => s.tags.includes(tag));
}
