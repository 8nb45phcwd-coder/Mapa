import { geoBounds, geoCentroid, geoDistance, GeoPermissibleObjects } from "d3-geo";
import { feature } from "topojson-client";
import type {
  AnchorPoints,
  Country,
  CountryID,
  LodLevel,
  RenderCountryShape,
  TransformMatrix,
} from "./types.js";

export type ProjectionFn = (coords: [number, number]) => [number, number];

/** Default world dataset loader (countries 110m). */
export async function loadDefaultWorld(): Promise<any> {
  const res = await fetch(
    "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"
  );
  if (!res.ok) {
    throw new Error(`Failed to load world dataset: ${res.statusText}`);
  }
  return res.json();
}

/** Load TopoJSON from an arbitrary URL. */
export async function loadTopoJSON(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load TopoJSON from ${url}: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Decode a geometry reference into a GeoJSON MultiPolygon/Polygon feature.
 * The input may already be GeoJSON; the reference is resolved against id/name
 * fields or TopoJSON object names.
 */
export function decodeGeometryByRef(source: any, geometryRef: string): any | null {
  if (!source) return null;
  // If GeoJSON FeatureCollection or Feature
  if (source.type && source.type !== "Topology") {
    const features = source.type === "FeatureCollection" ? source.features : [source];
    const found = features.find(
      (f: any) => f.id?.toString() === geometryRef || f.properties?.name === geometryRef
    );
    return found ? found : null;
  }

  if (source.type === "Topology" && source.objects) {
    // if geometryRef matches an object key, use it directly
    if (source.objects[geometryRef]) {
      return feature(source, source.objects[geometryRef]);
    }

    // otherwise search features inside all objects
    for (const key of Object.keys(source.objects)) {
      const fc: any = feature(source, source.objects[key]);
      if (fc.type === "FeatureCollection") {
        const match = fc.features.find(
          (f: any) => f.id?.toString() === geometryRef || f.properties?.name === geometryRef
        );
        if (match) return match;
      }
    }
  }
  return null;
}

/**
 * Compute anchor points for a country's geometry.
 */
export function buildCountryAnchor(geometry: any, country: Country): AnchorPoints {
  const geoObj = geometry as GeoPermissibleObjects;
  const centroid = geoCentroid(geoObj); // [lon, lat]
  const bounds = geoBounds(geoObj); // [[minLon,minLat],[maxLon,maxLat]]
  const centerLatLon: [number, number] = [centroid[1], centroid[0]];

  const bbox = {
    minLat: bounds[0][1],
    maxLat: bounds[1][1],
    minLon: bounds[0][0],
    maxLon: bounds[1][0],
  };

  // compute maximum angular distance from centroid to any coordinate
  let maxDistanceRad = 0;
  const coordsIterator = iterateCoordinates(geometry);
  for (const coord of coordsIterator) {
    const d = geoDistance([centroid[0], centroid[1]], [coord[0], coord[1]]);
    if (d > maxDistanceRad) maxDistanceRad = d;
  }
  const radiusDeg = (maxDistanceRad * 180) / Math.PI;

  return {
    centroid_geo: centerLatLon,
    bbox_geo: bbox,
    bounding_circle_geo: {
      center: centerLatLon,
      radius_deg: radiusDeg,
    },
  };
}

/**
 * Helper iterator over all coordinates in GeoJSON geometry.
 */
function* iterateCoordinates(geometry: any): Generator<[number, number]> {
  function* traverse(coords: any): Generator<[number, number]> {
    if (typeof coords[0] === "number") {
      yield coords as [number, number];
      return;
    }
    for (const c of coords) {
      yield* traverse(c);
    }
  }
  yield* traverse(geometry.coordinates);
}

/** Simple identity transform matrix. */
export const IDENTITY_TRANSFORM: TransformMatrix = {
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: 0,
  f: 0,
};

export interface ProjectedGeometryCacheKey {
  geometryRef: string;
  projectionName?: string;
}

export class ProjectedGeometryCache {
  private cache = new Map<string, any>();

  private key(k: ProjectedGeometryCacheKey) {
    return `${k.projectionName || "default"}::${k.geometryRef}`;
  }

  get(k: ProjectedGeometryCacheKey) {
    return this.cache.get(this.key(k));
  }

  set(k: ProjectedGeometryCacheKey, value: any) {
    this.cache.set(this.key(k), value);
  }
}

/**
 * Project GeoJSON coordinates using a supplied projection, with optional caching.
 * The projection function expects [lon,lat] input and returns [x,y].
 */
export function projectGeometry(
  geometry: any,
  projection: ProjectionFn,
  cache?: ProjectedGeometryCache,
  cacheKey?: ProjectedGeometryCacheKey
): any {
  if (cache && cacheKey) {
    const cached = cache.get(cacheKey);
    if (cached) return cached;
  }
  const projected = deepProjectGeometry(geometry, projection);
  if (cache && cacheKey) {
    cache.set(cacheKey, projected);
  }
  return projected;
}

function deepProjectGeometry(geometry: any, projection: ProjectionFn): any {
  const projectedCoords = (coords: any): any => {
    if (typeof coords[0] === "number") {
      const [lon, lat] = coords as [number, number];
      const [x, y] = projection([lon, lat]);
      return [x, y];
    }
    return coords.map((c: any) => projectedCoords(c));
  };
  return {
    ...geometry,
    coordinates: projectedCoords(geometry.coordinates),
  };
}

/**
 * Create a RenderCountryShape from projected geometry and anchors.
 */
export function createRenderCountryShape(
  projectedPolygon: any,
  anchors: AnchorPoints,
  country_id: CountryID
): RenderCountryShape {
  const centroid = computeProjectedCentroid(projectedPolygon);
  return {
    country_id,
    polygon: projectedPolygon,
    anchor_geo: anchors,
    conceptual_pos: [0.5, 0.5],
    transform: { ...IDENTITY_TRANSFORM },
    screen_pos: centroid,
  };
}

export interface PrepareRenderShapeOptions {
  cache?: ProjectedGeometryCache;
  projectionName?: string;
  geometryRef?: string;
  anchorCache?: Map<string, AnchorPoints>;
  geometryDecoder?: (source: any, ref: string) => any;
  lod?: LodLevel;
  lodGeometryRefs?: Record<string, string> | Map<string | number, string>;
}

/**
 * Full preparation pipeline: decode geometry, compute anchors, project, and build RenderCountryShape.
 */
export function prepareRenderCountryShape(
  source: any,
  country: Country,
  projection: ProjectionFn,
  options: PrepareRenderShapeOptions = {}
): RenderCountryShape {
  const geometryRef = resolveGeometryRef(
    options.geometryRef ?? country.geometry_ref,
    options.lod,
    options.lodGeometryRefs
  );
  const decoder = options.geometryDecoder ?? decodeGeometryByRef;
  const geo = decoder(source, geometryRef);
  if (!geo) throw new Error(`Geometry ${geometryRef} not found for ${country.name}`);
  const geomObj = geo.geometry ?? geo;

  let anchors: AnchorPoints | undefined = options.anchorCache?.get(geometryRef);
  if (!anchors) {
    anchors = buildCountryAnchor(geomObj, country);
    if (options.anchorCache) options.anchorCache.set(geometryRef, anchors);
  }

  const projected = projectGeometry(geomObj, projection, options.cache, {
    geometryRef,
    projectionName: options.projectionName,
  });
  return createRenderCountryShape(projected, anchors, country.country_id);
}

function computeProjectedCentroid(geometry: any): [number, number] {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  const recur = (coords: any) => {
    if (typeof coords[0] === "number") {
      sumX += coords[0];
      sumY += coords[1];
      count += 1;
      return;
    }
    for (const c of coords) recur(c);
  };
  recur(geometry.coordinates);
  return count === 0 ? [0, 0] : [sumX / count, sumY / count];
}

function resolveGeometryRef(
  baseRef: string,
  lod?: LodLevel,
  lodGeometryRefs?: Record<string, string> | Map<string | number, string>
): string {
  if (!lodGeometryRefs || lod === undefined || lod === null) return baseRef;
  const lookup =
    lodGeometryRefs instanceof Map
      ? lodGeometryRefs.get(lod)
      : lodGeometryRefs[String(lod)] ?? lodGeometryRefs[lod as any];
  return lookup || baseRef;
}

/** Apply transform matrix to a single [x,y] point. */
export function applyTransform(matrix: TransformMatrix, point: [number, number]): [number, number] {
  const [x, y] = point;
  return [matrix.a * x + matrix.c * y + matrix.e, matrix.b * x + matrix.d * y + matrix.f];
}
