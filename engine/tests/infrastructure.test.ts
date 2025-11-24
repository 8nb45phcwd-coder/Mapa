import { describe, expect, it } from "vitest";
import { clipInternalInfrastructure, buildTransnationalHybridPath, projectInfrastructureLine } from "../src/infrastructure.js";
import type { GeoMultiPolygon, InfrastructureLine, TransnationalInfrastructureLine, Country, AnchorPoints } from "../src/types.js";
import { applyConceptLayout } from "../src/render.js";
import { createRenderCountryShape } from "../src/geometry.js";
import { geoMercator } from "d3-geo";

const countryPolygon: GeoMultiPolygon = [
  [
    [
      [0, 0],
      [2, 0],
      [2, 1],
      [0, 1],
      [0, 0],
    ],
  ],
];

const infraLine: InfrastructureLine = {
  id: "road1",
  country_id: "X",
  geometry_geo: [
    [-1, 0.5],
    [3, 0.5],
  ],
};

describe("internal infrastructure", () => {
  it("clips polylines to the country polygon and projects with transforms", () => {
    const clipped = clipInternalInfrastructure(infraLine, countryPolygon);
    expect(clipped.clipped_segments.length).toBeGreaterThan(0);
    const segment = clipped.clipped_segments[0];
    expect(segment[0][0]).toBeGreaterThanOrEqual(0);
    expect(segment[1][0]).toBeLessThanOrEqual(2);
    const projection = geoMercator();
    const base = projectInfrastructureLine({ ...infraLine, geometry_geo: segment }, projection);
    const projected = projectInfrastructureLine({ ...infraLine, geometry_geo: segment }, projection, {
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      e: 5,
      f: -5,
    });
    expect(projected.geometry_projected[0][0]).toBeCloseTo(base.geometry_projected[0][0] + 5, 6);
    expect(projected.geometry_projected[0][1]).toBeCloseTo(base.geometry_projected[0][1] - 5, 6);
  });
});

describe("transnational infrastructure", () => {
  const projection = geoMercator();
  const countryA: Country = { country_id: "A", name: "Alpha", geometry_ref: "A" };
  const countryB: Country = { country_id: "B", name: "Beta", geometry_ref: "B" };
  const anchors: AnchorPoints = {
    centroid_geo: [0, 0],
    bbox_geo: { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 },
    bounding_circle_geo: { center: [0, 0], radius_deg: 1 },
    primary_city_anchor: [0, 0],
  };
  const shapeA = createRenderCountryShape({ type: "Polygon", coordinates: [[[0, 0],[1,0],[1,1],[0,1],[0,0]]]}, anchors, "A");
  const shapeB = createRenderCountryShape({ type: "Polygon", coordinates: [[[0, 0],[1,0],[1,1],[0,1],[0,0]]]}, anchors, "B");
  applyConceptLayout(shapeA, { layout_id: "L", label: "", slots: [{ slot_id: "s1", x: 0.1, y: 0.1, w: 0.1, h: 0.1 }] }, { layout_id: "L", country_id: "A", slot_id: "s1" }, undefined, { width: 100, height: 100 });
  applyConceptLayout(shapeB, { layout_id: "L", label: "", slots: [{ slot_id: "s2", x: 0.7, y: 0.7, w: 0.1, h: 0.1 }] }, { layout_id: "L", country_id: "B", slot_id: "s2" }, undefined, { width: 100, height: 100 });
  const shapes = new Map([
    ["A", shapeA],
    ["B", shapeB],
  ]);
  const line: TransnationalInfrastructureLine = {
    id: "tn1",
    countries: ["A", "B"],
    geometry_geo: [
      [-10, 0],
      [10, 0],
    ],
  };
  it("builds hybrid paths respecting geo and conceptual anchors", () => {
    const result = buildTransnationalHybridPath(line, shapes, projection, { width: 100, height: 100 }, 1);
    expect(result.hybrid[0][0]).toBeCloseTo(result.conceptual[0][0]);
    expect(result.hybrid[result.hybrid.length - 1][0]).toBeCloseTo(result.conceptual[result.conceptual.length - 1][0]);
    // alpha=1 means full conceptual alignment
    const geoOnly = buildTransnationalHybridPath(line, shapes, projection, { width: 100, height: 100 }, 0);
    expect(geoOnly.hybrid[0][0]).toBeCloseTo(geoOnly.geo[0][0]);
  });
});
