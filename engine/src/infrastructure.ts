import type {
  ClippedInfrastructureLine,
  GeoMultiPolygon,
  InfrastructureLine,
  ProjectedInfrastructureLine,
  RenderCountryShape,
  TransnationalInfrastructureLine,
  Viewport,
} from "./types.js";
import type { ProjectionFn } from "./geometry.js";
import { applyTransform } from "./geometry.js";
import { conceptToScreen } from "./render.js";
import { interpolatePositions, screenPosHybrid } from "./interpolate.js";

function pointInRing(point: [number, number], ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInMultiPolygon(point: [number, number], multi: GeoMultiPolygon): boolean {
  for (const poly of multi) {
    const outer = poly[0];
    const holes = poly.slice(1);
    if (pointInRing(point, outer)) {
      let inHole = false;
      for (const hole of holes) {
        if (pointInRing(point, hole)) {
          inHole = true;
          break;
        }
      }
      if (!inHole) return true;
    }
  }
  return false;
}

function segmentIntersection(
  a1: [number, number],
  a2: [number, number],
  b1: [number, number],
  b2: [number, number]
): { point: [number, number]; t: number } | null {
  const dax = a2[0] - a1[0];
  const day = a2[1] - a1[1];
  const dbx = b2[0] - b1[0];
  const dby = b2[1] - b1[1];
  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) < 1e-9) return null;
  const s = ((a1[0] - b1[0]) * dby - (a1[1] - b1[1]) * dbx) / denom;
  const t = ((a1[0] - b1[0]) * day - (a1[1] - b1[1]) * dax) / denom;
  if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
    return { point: [a1[0] + s * dax, a1[1] + s * day], t: s };
  }
  return null;
}

function edgeIntersections(
  a: [number, number],
  b: [number, number],
  multi: GeoMultiPolygon
): { point: [number, number]; t: number }[] {
  const hits: { point: [number, number]; t: number }[] = [];
  for (const poly of multi) {
    const rings = poly;
    for (const ring of rings) {
      for (let i = 0; i < ring.length - 1; i++) {
        const hit = segmentIntersection(a, b, ring[i], ring[i + 1]);
        if (hit) hits.push(hit);
      }
    }
  }
  return hits.sort((x, y) => x.t - y.t);
}

function clipPolylineAgainstPolygon(polyline: [number, number][], mask: GeoMultiPolygon): [number, number][][] {
  const segments: [number, number][][] = [];
  if (polyline.length < 2) return segments;
  let current: [number, number][] = [];
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const aInside = pointInMultiPolygon(a, mask);
    const bInside = pointInMultiPolygon(b, mask);
    const intersections = edgeIntersections(a, b, mask);
    if (aInside && current.length === 0) current.push(a);

    if (aInside && bInside) {
      current.push(b);
    } else if (aInside && !bInside) {
      const hit = intersections.find((h) => h.t >= 0 && h.t <= 1);
      if (hit) {
        current.push(hit.point);
        segments.push(current);
        current = [];
      }
    } else if (!aInside && bInside) {
      const hit = intersections.find((h) => h.t >= 0 && h.t <= 1);
      if (hit) {
        current = [hit.point, b];
        segments.push(current);
        current = [];
      }
    } else {
      if (intersections.length >= 2) {
        segments.push([intersections[0].point, intersections[intersections.length - 1].point]);
      } else if (intersections.length === 1) {
        // Degenerate case: treat single intersection as a very small segment on the boundary
        segments.push([intersections[0].point, intersections[0].point]);
      }
    }
  }
  if (current.length >= 2) segments.push(current);
  return segments;
}

function bboxFromMultiPolygon(mask: GeoMultiPolygon) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  mask.forEach((poly) => {
    poly.forEach((ring) => {
      ring.forEach(([x, y]) => {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      });
    });
  });
  return { minX, minY, maxX, maxY };
}

function clipPolylineToBBox(polyline: [number, number][], bbox: { minX: number; minY: number; maxX: number; maxY: number }) {
  const clips: [number, number][][] = [];
  for (let i = 0; i < polyline.length - 1; i++) {
    const clipped = clipSegmentToBBox(polyline[i], polyline[i + 1], bbox);
    if (clipped) clips.push(clipped);
  }
  return clips;
}

function clipSegmentToBBox(
  p0: [number, number],
  p1: [number, number],
  bbox: { minX: number; minY: number; maxX: number; maxY: number }
): [number, number][] | null {
  let [x0, y0] = p0;
  let [x1, y1] = p1;
  const INSIDE = 0;
  const LEFT = 1;
  const RIGHT = 2;
  const BOTTOM = 4;
  const TOP = 8;
  const computeCode = (x: number, y: number) => {
    let code = INSIDE;
    if (x < bbox.minX) code |= LEFT;
    else if (x > bbox.maxX) code |= RIGHT;
    if (y < bbox.minY) code |= BOTTOM;
    else if (y > bbox.maxY) code |= TOP;
    return code;
  };
  let code0 = computeCode(x0, y0);
  let code1 = computeCode(x1, y1);
  let accept = false;
  while (true) {
    if (!(code0 | code1)) {
      accept = true;
      break;
    } else if (code0 & code1) {
      break;
    } else {
      const codeOut = code0 || code1;
      let x = 0;
      let y = 0;
      if (codeOut & TOP) {
        x = x0 + ((x1 - x0) * (bbox.maxY - y0)) / (y1 - y0);
        y = bbox.maxY;
      } else if (codeOut & BOTTOM) {
        x = x0 + ((x1 - x0) * (bbox.minY - y0)) / (y1 - y0);
        y = bbox.minY;
      } else if (codeOut & RIGHT) {
        y = y0 + ((y1 - y0) * (bbox.maxX - x0)) / (x1 - x0);
        x = bbox.maxX;
      } else if (codeOut & LEFT) {
        y = y0 + ((y1 - y0) * (bbox.minX - x0)) / (x1 - x0);
        x = bbox.minX;
      }
      if (codeOut === code0) {
        x0 = x;
        y0 = y;
        code0 = computeCode(x0, y0);
      } else {
        x1 = x;
        y1 = y;
        code1 = computeCode(x1, y1);
      }
    }
  }
  return accept ? [[x0, y0], [x1, y1]] : null;
}

export function clipInternalInfrastructure(
  line: InfrastructureLine,
  countryGeometry: GeoMultiPolygon
): ClippedInfrastructureLine {
  let clipped = clipPolylineAgainstPolygon(line.geometry_geo, countryGeometry);
  if (clipped.length === 0) {
    const bbox = bboxFromMultiPolygon(countryGeometry);
    clipped = clipPolylineToBBox(line.geometry_geo, bbox);
  }
  return { ...line, clipped_segments: clipped };
}

export function projectInfrastructureLine(
  line: InfrastructureLine,
  projection: ProjectionFn,
  transform?: { a: number; b: number; c: number; d: number; e: number; f: number },
  camera?: { apply?: (pt: [number, number]) => [number, number] }
): ProjectedInfrastructureLine {
  const projected = line.geometry_geo.map((pt) => projection([pt[0], pt[1]]));
  const transformed = transform
    ? projected.map((pt) => applyTransform(transform, pt as [number, number]))
    : projected;
  const cameraApplied = camera?.apply ? transformed.map((pt) => camera.apply!(pt as [number, number])) : transformed;
  return { ...line, geometry_projected: cameraApplied };
}

export interface TransnationalPathResult {
  geo: [number, number][];
  conceptual: [number, number][];
  hybrid: [number, number][];
}

export function buildTransnationalHybridPath(
  line: TransnationalInfrastructureLine,
  countries: Map<string, RenderCountryShape>,
  projection: ProjectionFn,
  viewport: Viewport,
  alpha: number,
  camera?: { apply?: (pt: [number, number]) => [number, number] }
): TransnationalPathResult {
  const geo = line.geometry_geo.map((pt) => projection([pt[0], pt[1]]));
  const geoCamera = camera?.apply ? geo.map((p) => camera.apply!(p as [number, number])) : geo;
  const anchors = line.countries
    .map((id) => countries.get(id))
    .filter((c): c is RenderCountryShape => Boolean(c));
  const start = anchors[0]?.conceptual_pos || [0.5, 0.5];
  const end = anchors[anchors.length - 1]?.conceptual_pos || [0.5, 0.5];
  const startScreen = conceptToScreen(start, viewport);
  const endScreen = conceptToScreen(end, viewport);
  const conceptual: [number, number][] = geoCamera.map((_, idx) => {
    const t = geo.length <= 1 ? 0 : idx / (geo.length - 1);
    return interpolatePositions(startScreen, endScreen, t);
  }) as [number, number][];
  const hybrid = geoCamera.map((g, idx) => screenPosHybrid(g as [number, number], conceptual[idx], alpha));
  return { geo: geoCamera, conceptual, hybrid };
}
