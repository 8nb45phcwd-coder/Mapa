import { describe, expect, it } from "vitest";
import { feature } from "topojson-client";
import world from "world-atlas/countries-50m.json";
import { geoMercator } from "d3-geo";
import {
  buildCountryAnchor,
  decodeGeometryByRef,
  prepareRenderCountryShape,
  ProjectedGeometryCache,
} from "../src/geometry.js";
import type { Country } from "../src/types.js";

const countriesFeatureCollection: any = feature(world as any, (world as any).objects.countries);
const countries: Country[] = countriesFeatureCollection.features.map((f: any) => ({
  country_id: f.id?.toString() ?? f.properties?.name ?? "unknown",
  name: f.properties?.name ?? f.id?.toString() ?? "unknown",
  geometry_ref: f.id?.toString() ?? f.properties?.name ?? "unknown",
}));

const portugal = countries.find((c) => c.name === "Portugal" || c.country_id === "620");

// Integration test to ensure the real world TopoJSON passes through the engine end-to-end.
describe("real world topojson integration", () => {
  it("loads many countries and finds Portugal", () => {
    expect(countries.length).toBeGreaterThan(150);
    expect(portugal).toBeTruthy();
  });

  it("decodes geometry and computes anchors for a known country", () => {
    expect(portugal).toBeTruthy();
    const decoded = decodeGeometryByRef(world as any, portugal!.geometry_ref);
    expect(decoded).toBeTruthy();
    const geom = (decoded as any).geometry ?? decoded;
    // ensure geometry has coordinates and is non-empty
    expect(Array.isArray(geom.coordinates)).toBe(true);
    expect(geom.coordinates.length).toBeGreaterThan(0);

    const anchors = buildCountryAnchor(geom, portugal!);
    expect(Number.isFinite(anchors.centroid_geo[0])).toBe(true);
    expect(Number.isFinite(anchors.centroid_geo[1])).toBe(true);
    expect(anchors.bbox_geo.maxLat).toBeGreaterThan(anchors.bbox_geo.minLat);
    expect(anchors.bbox_geo.maxLon).toBeGreaterThan(anchors.bbox_geo.minLon);
    expect(anchors.bounding_circle_geo.radius_deg).toBeGreaterThan(0);
    expect(anchors.primary_city_anchor).toBeTruthy();
  });

  it("prepares a render shape end-to-end with projection and caching", () => {
    expect(portugal).toBeTruthy();
    const projection = geoMercator();
    const cache = new ProjectedGeometryCache();
    const shape = prepareRenderCountryShape(world as any, portugal!, projection, {
      cache,
      projectionName: "merc-int",
    });

    expect(shape.country_id).toBe(portugal!.country_id);
    expect(shape.polygon.coordinates.length).toBeGreaterThan(0);
    expect(Number.isFinite(shape.screen_pos[0])).toBe(true);
    expect(Number.isFinite(shape.screen_pos[1])).toBe(true);

    // confirm cache reuse on second run
    const shape2 = prepareRenderCountryShape(world as any, portugal!, projection, {
      cache,
      projectionName: "merc-int",
    });
    expect(shape2.polygon).toBe(shape.polygon);
  });
});
