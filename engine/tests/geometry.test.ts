import { describe, expect, it } from "vitest";
import { geoMercator } from "d3-geo";
import world from "world-atlas/countries-50m.json";
import {
  buildCountryAnchor,
  createRenderCountryShape,
  decodeGeometryByRef,
  prepareRenderCountryShape,
  projectGeometry,
  ProjectedGeometryCache,
  IDENTITY_TRANSFORM,
} from "../src/geometry.js";
import type { Country, AnchorPoints } from "../src/types.js";

const usa: Country = {
  country_id: "USA",
  name: "United States of America",
  geometry_ref: "840",
};

const dummyAnchors: AnchorPoints = {
  centroid_geo: [0, 0],
  bbox_geo: { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 },
  bounding_circle_geo: { center: [0, 0], radius_deg: 1 },
};

const simplePolygon = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [0, 0],
    ],
  ],
};

describe("geometry loading and anchors", () => {
  it("decodes real country geometry and computes anchors", () => {
    const decoded = decodeGeometryByRef(world, usa.geometry_ref);
    expect(decoded).toBeTruthy();
    const anchors = buildCountryAnchor(decoded!.geometry ?? decoded, usa);
    expect(anchors.centroid_geo[0]).toBeGreaterThan(20);
    expect(anchors.centroid_geo[0]).toBeLessThan(50);
    expect(anchors.centroid_geo[1]).toBeLessThan(-60);
    expect(anchors.centroid_geo[1]).toBeGreaterThan(-130);
    expect(anchors.bounding_circle_geo.radius_deg).toBeGreaterThan(5);
    expect(anchors.bbox_geo.maxLat).toBeGreaterThan(anchors.bbox_geo.minLat);
    expect(Math.abs(anchors.bbox_geo.maxLon - anchors.bbox_geo.minLon)).toBeGreaterThan(50);
    expect(anchors.primary_city_anchor).toBeDefined();
    expect(anchors.primary_city_anchor![0]).toBeGreaterThan(-90);
    expect(anchors.primary_city_anchor![0]).toBeLessThan(90);
    expect(anchors.primary_city_anchor![1]).toBeGreaterThan(-180);
    expect(anchors.primary_city_anchor![1]).toBeLessThan(180);
  });

  it("projects geometry with caching and reuses projected objects", () => {
    const projection = geoMercator();
    const cache = new ProjectedGeometryCache();
    const shape1 = prepareRenderCountryShape(world, usa, projection, {
      cache,
      projectionName: "merc",
    });
    const shape2 = prepareRenderCountryShape(world, usa, projection, {
      cache,
      projectionName: "merc",
    });
    expect(shape1.polygon).toBe(shape2.polygon);
    expect(shape1.anchor_geo).toEqual(shape2.anchor_geo);
  });
});

describe("render country shape construction", () => {
  it("creates render shapes with identity transform and centroid-derived screen position", () => {
    const shape = createRenderCountryShape(simplePolygon, dummyAnchors, "X");
    expect(shape.transform).toEqual(IDENTITY_TRANSFORM);
    expect(shape.screen_pos[0]).toBeCloseTo(0.8, 1);
    expect(shape.screen_pos[1]).toBeCloseTo(0.8, 1);
  });

  it("projects geometry correctly using a custom projection", () => {
    const projection = ([lon, lat]: [number, number]) => [lon * 2, lat * -1];
    const projected = projectGeometry(simplePolygon, projection);
    const ring = projected.coordinates[0];
    expect(ring[0][0]).toBeCloseTo(0);
    expect(ring[1][0]).toBeCloseTo(4);
    expect(ring[2][1]).toBeCloseTo(-2);
    expect(ring[3][0]).toBeCloseTo(0);
    expect(ring[4][1]).toBeCloseTo(0);
  });
});
