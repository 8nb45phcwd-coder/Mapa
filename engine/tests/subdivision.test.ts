import { describe, expect, it } from "vitest";
import world from "world-atlas/countries-110m.json";
import { feature } from "topojson-client";
import { geoMercator } from "d3-geo";
import {
  buildCountryAnchor,
  decodeGeometryByRef,
  prepareRenderCountryShape,
} from "../src/geometry.js";
import { generateSubdivisions, projectSubdivisionCells } from "../src/subdivision.js";
import type { Country } from "../src/types.js";
import { detachCountry } from "../src/render.js";

const countries: Country[] = feature(world as any, (world as any).objects.countries).features.map((f: any) => ({
  country_id: f.id?.toString() ?? f.properties?.name ?? "unknown",
  name: f.properties?.name ?? f.id?.toString() ?? "unknown",
  geometry_ref: f.id?.toString() ?? f.properties?.name ?? "unknown",
}));

const portugal = countries.find((c) => c.name === "Portugal" || c.country_id === "620")!;

function pointInRing(point: [number, number], ring: [number, number][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const onSegment =
      Math.abs((yj - yi) * (point[0] - xi) - (xj - xi) * (point[1] - yi)) < 1e-9 &&
      point[0] >= Math.min(xi, xj) - 1e-9 &&
      point[0] <= Math.max(xi, xj) + 1e-9 &&
      point[1] >= Math.min(yi, yj) - 1e-9 &&
      point[1] <= Math.max(yi, yj) + 1e-9;
    if (onSegment) return true;
    const intersect = yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point: [number, number], polygon: [number, number][][]) {
  if (!polygon.length) return false;
  const [outer, ...holes] = polygon;
  if (!pointInRing(point, outer)) return false;
  for (const hole of holes) {
    if (pointInRing(point, hole)) return false;
  }
  return true;
}

function pointInMultiPolygon(point: [number, number], multi: [number, number][][][]) {
  return multi.some((poly) => pointInPolygon(point, poly));
}

describe("subdivision clipping", () => {
  it("clips synthetic cells to the real polygon and projects with transforms", () => {
    const decoded = decodeGeometryByRef(world as any, portugal.geometry_ref)!;
    const geom = (decoded as any).geometry ?? decoded;
    const anchor = buildCountryAnchor(geom, portugal);
    const subdivisions = generateSubdivisions(portugal.country_id, anchor, { method: "grid", cells: 6 }, geom);
    expect(subdivisions.length).toBeGreaterThan(0);
    expect(subdivisions.length).toBeLessThanOrEqual(6);
    const countryCoords = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
    for (const cell of subdivisions) {
      const coords = Array.isArray((cell.polygon_geo as any)[0][0][0])
        ? (cell.polygon_geo as [number, number][][][])
        : ([cell.polygon_geo] as unknown as [number, number][][][]);
      const allVertices: [number, number][] = [];
      coords.forEach((poly) => poly.forEach((ring) => ring.forEach((pt) => allVertices.push(pt as [number, number]))));
      allVertices.forEach((pt) => {
        expect(pointInMultiPolygon(pt, countryCoords)).toBe(true);
      });
    }
    const projection = geoMercator();
    const shape = prepareRenderCountryShape(world as any, portugal, projection);
    detachCountry(shape, [10, -5]);
    const projected = projectSubdivisionCells(subdivisions, projection, shape.transform);
    expect(projected[0].centroid_projected[0]).toBeGreaterThan(-200);
    // ensure transform applied
    const withoutOffset = projectSubdivisionCells(subdivisions, projection);
    expect(projected[0].centroid_projected[0]).not.toBeCloseTo(withoutOffset[0].centroid_projected[0]);
  });
});
