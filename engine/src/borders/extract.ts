import { feature, mesh, neighbors } from "topojson-client";
import { geoDistance } from "d3-geo";
import type { Country, CountryID } from "../types.js";
import type { BorderSegment, BorderSegmentGeometry, BorderSegmentId } from "./types.js";
import { canonicalPair, ensureSegmentKey, formatBorderSegmentId } from "./types.js";

function geometryLines(geom: any): [number, number][][] {
  if (!geom) return [];
  if (geom.type === "LineString") return [geom.coordinates as [number, number][]];
  if (geom.type === "MultiLineString") return geom.coordinates as [number, number][][];
  return [];
}

function lineLengthKm(coords: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += geoDistance([coords[i - 1][0], coords[i - 1][1]], [coords[i][0], coords[i][1]]) * 6371;
  }
  return total;
}

// simple Douglas–Peucker simplifier for optional low-res output
function simplifyLine(coords: [number, number][], tolerance = 0.05): [number, number][] {
  if (coords.length <= 2) return coords.slice();
  const sqTol = tolerance * tolerance;
  const keep = new Array<boolean>(coords.length).fill(false);
  keep[0] = keep[coords.length - 1] = true;

  const stack: [number, number][] = [[0, coords.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let maxSqDist = 0;
    let idx = -1;
    const [sx, sy] = coords[start];
    const [ex, ey] = coords[end];
    const dx = ex - sx;
    const dy = ey - sy;
    const lenSq = dx * dx + dy * dy || 1e-12;
    for (let i = start + 1; i < end; i++) {
      const [px, py] = coords[i];
      const t = ((px - sx) * dx + (py - sy) * dy) / lenSq;
      const projx = sx + t * dx;
      const projy = sy + t * dy;
      const ddx = px - projx;
      const ddy = py - projy;
      const distSq = ddx * ddx + ddy * ddy;
      if (distSq > maxSqDist) {
        idx = i;
        maxSqDist = distSq;
      }
    }
    if (maxSqDist > sqTol && idx !== -1) {
      keep[idx] = true;
      stack.push([start, idx], [idx, end]);
    }
  }
  const out: [number, number][] = [];
  keep.forEach((k, i) => {
    if (k) out.push(coords[i]);
  });
  return out;
}

function assignCountryLookup(countries: Country[], fc: any, geometries: any[]): Map<any, Country> {
  const geomToCountry = new Map<any, Country>();
  geometries.forEach((geom, idx) => {
    const feat = fc.features[idx];
    const ref = feat.id?.toString() ?? feat.properties?.name;
    const match = countries.find(
      (c) => c.geometry_ref === ref || c.country_id === ref || c.name === feat.properties?.name
    );
    if (match) geomToCountry.set(geom, match);
  });
  return geomToCountry;
}

function createSegment(
  countryA: CountryID,
  countryB: CountryID | "SEA",
  coords: [number, number][],
  pairCounters: Map<string, number>
): BorderSegment {
  const { a, b, key } = canonicalPair(countryA, countryB);
  const idx = pairCounters.get(key) ?? 0;
  pairCounters.set(key, idx + 1);
  const id: BorderSegmentId = { country_a: a, country_b: b, index: idx };
  const geometry: BorderSegmentGeometry = {
    coords_hi_res: coords,
    coords_low_res: simplifyLine(coords),
  };
  const segment: BorderSegment = {
    id,
    country_a: a,
    country_b: b,
    geometry,
    length_km: lineLengthKm(coords),
    is_maritime: b === "SEA" ? true : undefined,
    segment_id: formatBorderSegmentId(id),
  };
  return segment;
}

function coastlineMesh(topology: any, obj: any, targetGeom: any): any {
  return mesh(
    topology,
    obj,
    (a, b) => (a === targetGeom && !b) || (b === targetGeom && !a)
  );
}

function sharedMesh(topology: any, obj: any, geomA: any, geomB: any): any {
  return mesh(topology, obj, (a, b) => (a === geomA && b === geomB) || (a === geomB && b === geomA));
}

export interface BorderExtractionResult {
  segments: BorderSegment[];
}

export function extractBorderSegments(
  countries: Country[],
  topoHigh: any,
  topoLow?: any
): BorderExtractionResult {
  const objKey = Object.keys(topoHigh.objects).find((k) => k.toLowerCase().includes("country")) ||
    Object.keys(topoHigh.objects)[0];
  const countryObj = topoHigh.objects[objKey];
  const fc: any = feature(topoHigh, countryObj);
  const geometries = countryObj.geometries as any[];
  const geomToCountry = assignCountryLookup(countries, fc, geometries);
  const geomIndex = new Map<any, number>();
  geometries.forEach((g, i) => geomIndex.set(g, i));

  const segments: BorderSegment[] = [];
  const pairCounters = new Map<string, number>();

  const neighborList = neighbors(geometries);
  neighborList.forEach((adj, i) => {
    const geomA = geometries[i];
    const countryA = geomToCountry.get(geomA);
    if (!countryA) return;
    adj.forEach((j) => {
      if (j < i) return; // handle each pair once
      const geomB = geometries[j];
      const countryB = geomToCountry.get(geomB);
      if (!countryB) return;
      const shared = sharedMesh(topoHigh, countryObj, geomA, geomB);
      geometryLines(shared).forEach((coords) => {
        if (coords.length < 2) return;
        segments.push(createSegment(countryA.country_id, countryB.country_id, coords, pairCounters));
      });
    });
  });

  // coastlines
  geometries.forEach((geom, idx) => {
    const country = geomToCountry.get(geom);
    if (!country) return;
    const coast = coastlineMesh(topoHigh, countryObj, geom);
    const coastLines = geometryLines(coast);
    if (coastLines.length > 0) {
      coastLines.forEach((coords) => {
        if (coords.length < 2) return;
        segments.push(createSegment(country.country_id, "SEA", coords, pairCounters));
      });
    } else {
      // Fallback: use exterior rings from the country's own geometry to avoid dropping islands.
      const featureForGeom = fc.features[idx];
      const geomGeo = featureForGeom.geometry ?? featureForGeom;
      const multipoly = geomGeo.type === "Polygon" ? [geomGeo.coordinates] : geomGeo.coordinates;
      multipoly.forEach((poly: [number, number][][]) => {
        if (!poly?.length) return;
        const ring = poly[0];
        if (ring.length >= 2) segments.push(createSegment(country.country_id, "SEA", ring, pairCounters));
      });
    }
  });

  return { segments: segments.map(ensureSegmentKey) };
}

