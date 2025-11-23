import { describe, expect, it, beforeAll } from "vitest";
import { feature } from "topojson-client";
import world from "world-atlas/countries-110m.json";
import polygonClipping from "polygon-clipping";
import { geoMercator } from "d3-geo";
import {
  buildCountryAnchor,
  decodeGeometryByRef,
  prepareRenderCountryShape,
  ProjectedGeometryCache,
} from "../src/geometry.js";
import { applyConceptLayout } from "../src/render.js";
import { generateSubdivisions, projectSubdivisionCells } from "../src/subdivision.js";
import {
  clipInternalInfrastructure,
  buildTransnationalHybridPath,
  projectInfrastructureLine,
} from "../src/infrastructure.js";
import { registerLayer, unregisterLayer, getLayers } from "../src/layers.js";
import type {
  Country,
  GeoMultiPolygon,
  InfrastructureLine,
  TransnationalInfrastructureLine,
  MapLayer,
  MapLayerContext,
} from "../src/types.js";
import { conceptToScreen } from "../src/render.js";

const countriesFeatureCollection: any = feature(world as any, (world as any).objects.countries);
const countries: Country[] = countriesFeatureCollection.features.map((f: any) => ({
  country_id: f.id?.toString() ?? f.properties?.name ?? "unknown",
  name: f.properties?.name ?? f.id?.toString() ?? "unknown",
  geometry_ref: f.id?.toString() ?? f.properties?.name ?? "unknown",
}));

const findCountry = (name: string): Country => {
  const match = countries.find((c) => c.name === name);
  if (!match) throw new Error(`Country ${name} not found in fixture dataset`);
  return match;
};

function toMultiPolygon(decoded: any): GeoMultiPolygon {
  if (decoded.type === "MultiPolygon") return decoded.coordinates as GeoMultiPolygon;
  if (decoded.type === "Polygon") return [decoded.coordinates];
  if (decoded.geometry?.type === "MultiPolygon") return decoded.geometry.coordinates as GeoMultiPolygon;
  if (decoded.geometry?.type === "Polygon") return [decoded.geometry.coordinates];
  return [];
}

const viewport = { width: 800, height: 400, padding: 0.05 };

let portugal: Country;
let germany: Country;
let usa: Country;

beforeAll(() => {
  portugal = findCountry("Portugal");
  germany = findCountry("Germany");
  usa = findCountry("United States of America");
});

describe("full pipeline integration", () => {
  it("runs through anchors, layout, subdivisions, infrastructure, and layer registry", () => {
    const projection = geoMercator();
    const cache = new ProjectedGeometryCache();

    // anchors
    const decodedPortugal = decodeGeometryByRef(world as any, portugal.geometry_ref);
    const decodedGermany = decodeGeometryByRef(world as any, germany.geometry_ref);
    const decodedUSA = decodeGeometryByRef(world as any, usa.geometry_ref);
    const anchorsPortugal = buildCountryAnchor((decodedPortugal as any).geometry ?? decodedPortugal, portugal);
    const anchorsGermany = buildCountryAnchor((decodedGermany as any).geometry ?? decodedGermany, germany);
    const anchorsUSA = buildCountryAnchor((decodedUSA as any).geometry ?? decodedUSA, usa);

    [anchorsPortugal, anchorsGermany, anchorsUSA].forEach((anchor) => {
      expect(anchor.primary_city_anchor).toBeTruthy();
      const [lat, lon] = anchor.primary_city_anchor!;
      expect(lat).toBeGreaterThanOrEqual(-90);
      expect(lat).toBeLessThanOrEqual(90);
      expect(lon).toBeGreaterThanOrEqual(-180);
      expect(lon).toBeLessThanOrEqual(180);
    });

    // shapes + layout
    const shapePT = prepareRenderCountryShape(world as any, portugal, projection, { cache, projectionName: "merc" });
    const shapeDE = prepareRenderCountryShape(world as any, germany, projection, { cache, projectionName: "merc" });
    const shapeUS = prepareRenderCountryShape(world as any, usa, projection, { cache, projectionName: "merc" });

    const layout = {
      layout_id: "default",
      label: "test layout",
      slots: [
        { slot_id: "s1", x: 0.1, y: 0.1, w: 0.2, h: 0.3 },
        { slot_id: "s2", x: 0.4, y: 0.2, w: 0.2, h: 0.3 },
        { slot_id: "s3", x: 0.7, y: 0.1, w: 0.2, h: 0.3 },
      ],
    } as const;

    const assignments = [
      { layout_id: "default", country_id: shapePT.country_id, slot_id: "s1" },
      { layout_id: "default", country_id: shapeDE.country_id, slot_id: "s2" },
      { layout_id: "default", country_id: shapeUS.country_id, slot_id: "s3" },
    ];

    applyConceptLayout(shapePT, layout, assignments[0], undefined, viewport);
    applyConceptLayout(shapeDE, layout, assignments[1], undefined, viewport);
    applyConceptLayout(shapeUS, layout, assignments[2], undefined, viewport);

    const screenS1 = conceptToScreen([layout.slots[0].x + layout.slots[0].w / 2, layout.slots[0].y + layout.slots[0].h / 2], viewport);
    expect(Math.abs(shapePT.screen_pos[0] - screenS1[0])).toBeLessThanOrEqual(2);
    expect(Math.abs(shapePT.screen_pos[1] - screenS1[1])).toBeLessThanOrEqual(2);

    // subdivisions for Portugal clipped to real polygon
    const subdivisions = generateSubdivisions(shapePT.country_id, anchorsPortugal, { method: "grid", cells: 4 }, (decodedPortugal as any).geometry ?? decodedPortugal);
    expect(subdivisions.length).toBeGreaterThan(0);
    const portugalPoly = toMultiPolygon((decodedPortugal as any).geometry ?? decodedPortugal);
    subdivisions.forEach((cell) => {
      const clipped = polygonClipping.intersection(portugalPoly as any, cell.polygon_geo as any);
      expect(clipped && clipped.length).toBeGreaterThan(0);
    });
    const projectedCells = projectSubdivisionCells(subdivisions, projection, shapePT.transform);
    expect(projectedCells[0].polygon_projected).toBeTruthy();

    // infrastructure internal + transnational
    const internalLine: InfrastructureLine = {
      id: "pt-internal-1",
      country_id: shapePT.country_id,
      geometry_geo: [
        [anchorsPortugal.bbox_geo.minLon, anchorsPortugal.bbox_geo.minLat],
        [anchorsPortugal.centroid_geo[1], anchorsPortugal.centroid_geo[0]],
      ],
    };
    const clippedInternal = clipInternalInfrastructure(internalLine, portugalPoly);
    expect(clippedInternal.clipped_segments.length).toBeGreaterThan(0);
    const projectedInternal = projectInfrastructureLine(internalLine, projection, shapePT.transform);
    expect(projectedInternal.geometry_projected.length).toBeGreaterThan(0);

    const transnational: TransnationalInfrastructureLine = {
      id: "pt-deu-link",
      countries: [shapePT.country_id, shapeDE.country_id],
      geometry_geo: [
        [anchorsPortugal.centroid_geo[1], anchorsPortugal.centroid_geo[0]],
        [anchorsGermany.centroid_geo[1], anchorsGermany.centroid_geo[0]],
      ],
    };
    const countryMap = new Map<string, any>([
      [shapePT.country_id, shapePT],
      [shapeDE.country_id, shapeDE],
      [shapeUS.country_id, shapeUS],
    ]);
    const hybridPath = buildTransnationalHybridPath(transnational, countryMap, projection, viewport, 0.5);
    expect(hybridPath.geo.length).toBe(transnational.geometry_geo.length);
    expect(hybridPath.hybrid.length).toBe(transnational.geometry_geo.length);
    expect(hybridPath.conceptual[0][0]).not.toBeNaN();

    // layer registry interoperability
    const layer: MapLayer = {
      id: "dummy",
      zIndex: 1,
      render(ctx: MapLayerContext) {
        expect(ctx.getCountryShape(shapePT.country_id)).toBeDefined();
      },
    };
    registerLayer(layer);
    const registered = getLayers();
    expect(registered[0].id).toBe("dummy");
    registered[0].render({
      getCountryShape: (id) => countryMap.get(id),
      viewport,
    });
    unregisterLayer("dummy");
  });
});
