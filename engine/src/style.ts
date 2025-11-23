import type {
  BorderSegment,
  BorderSegmentRenderInfo,
  BorderSegmentStyle,
  PaintRule,
  PaintTargetType,
  ResolvedStyle,
  SegmentID,
} from "./types.js";
import type { ProjectionFn } from "./geometry.js";
import { decodeGeometryByRef, projectGeometry, ProjectedGeometryCache } from "./geometry.js";

/** Resolve paint rules for a specific target. Last matching rule wins. */
export function resolvePaintFor(targetType: PaintTargetType, targetId: string, rules: PaintRule[]): ResolvedStyle {
  const resolved: ResolvedStyle = {};
  for (const rule of rules) {
    if (rule.target === targetType && rule.id === targetId) {
      if (rule.fill !== undefined) resolved.fill = rule.fill;
      if (rule.stroke !== undefined) resolved.stroke = rule.stroke;
      if (rule.strokeWidth !== undefined) resolved.strokeWidth = rule.strokeWidth;
      if (rule.pattern !== undefined) resolved.pattern = rule.pattern;
      if (rule.opacity !== undefined) resolved.opacity = rule.opacity;
    }
  }
  return resolved;
}

/** Combine explicit segment styles with paint rules. */
export function getBorderSegmentRenderInfo(
  segment_id: SegmentID,
  segments: BorderSegment[],
  styles: BorderSegmentStyle[],
  paintRules: PaintRule[] = [],
  geometrySource?: any,
  projection?: ProjectionFn,
  cache?: ProjectedGeometryCache,
  projectionName?: string
): BorderSegmentRenderInfo | null {
  const segment = segments.find((s) => s.segment_id === segment_id);
  if (!segment) return null;
  const baseStyle: ResolvedStyle = {};
  const style = styles.find((s) => s.segment_id === segment_id);
  if (style) {
    if (style.strokeColor !== undefined) baseStyle.stroke = style.strokeColor;
    if (style.strokeWidth !== undefined) baseStyle.strokeWidth = style.strokeWidth;
    if (style.pattern !== undefined) baseStyle.pattern = style.pattern;
    if (style.opacity !== undefined) baseStyle.opacity = style.opacity;
  }
  const painted = resolvePaintFor("border_segment", segment_id, paintRules);
  const merged: ResolvedStyle = { ...baseStyle, ...painted };
  let geometry: any;
  let projectedGeometry: any;
  if (geometrySource) {
    geometry = decodeGeometryByRef(geometrySource, segment.geometry_ref);
    const geomObj = geometry?.geometry ?? geometry;
    if (geomObj && projection) {
      projectedGeometry = projectGeometry(geomObj, projection, cache, {
        geometryRef: segment.geometry_ref,
        projectionName,
      });
    }
  }
  return { segment, style: merged, geometry, projectedGeometry };
}
