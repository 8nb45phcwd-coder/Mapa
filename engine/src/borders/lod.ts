import type { BorderSegment } from "./types.js";
import { selectLOD } from "../view/lod.js";

export function getBorderSegmentGeometryForLOD(segment: BorderSegment, zoom: number): [number, number][] {
  const level = selectLOD(zoom);
  if (level === "low" && segment.geometry.coords_low_res?.length) {
    return segment.geometry.coords_low_res;
  }
  return segment.geometry.coords_hi_res;
}

