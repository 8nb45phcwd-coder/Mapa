import type { BorderSegment } from "./types.js";
import { selectLOD } from "../view/lod.js";

/** Zoom thresholding is delegated to selectLOD; keep the low LOD boundary in one place for borders. */
export const BORDER_LOW_LOD_LEVEL = "low";

export function getBorderSegmentGeometryForLOD(segment: BorderSegment, zoom: number): [number, number][] {
  const level = selectLOD(zoom);
  if (level === BORDER_LOW_LOD_LEVEL && segment.geometry.coords_low_res?.length) {
    return segment.geometry.coords_low_res;
  }
  return segment.geometry.coords_hi_res;
}

