import { beforeAll, describe, expect, it } from "vitest";
import world from "world-atlas/countries-50m.json";
import { feature } from "topojson-client";
import { geoMercator } from "d3-geo";
import { readFileSync } from "fs";
const lines = JSON.parse(
  readFileSync(new URL("./fixtures/infra-lines-phase2.geojson", import.meta.url), "utf-8")
);
const nodesFixture = JSON.parse(
  readFileSync(new URL("./fixtures/infra-nodes-phase2.geojson", import.meta.url), "utf-8")
);
import {
  ingestInfrastructure,
  ensureNodeWithinCountry,
  ensureSegmentWithinCountry,
  buildCountryGeoIndex,
} from "world-map-ingestion";
import { decodeGeometryByRef, prepareRenderCountryShape } from "world-map-engine/geometry.js";
import { projectInfrastructureLine } from "world-map-engine/infrastructure.js";
import { detachCountry } from "world-map-engine/render.js";
import type {
  Country,
  InfraSourceConfig,
  ClippedInfrastructureLine,
  InfrastructureNode,
} from "world-map-engine";

const worldFeatures: any = feature(world as any, (world as any).objects.countries);
const countries: Country[] = worldFeatures.features.map((f: any) => ({
  country_id: f.properties?.name ?? f.id?.toString(),
  name: f.properties?.name ?? f.id?.toString(),
  geometry_ref: f.id?.toString() ?? f.properties?.name ?? "",
}));

const countryIndex = buildCountryGeoIndex(countries, world as any, decodeGeometryByRef);

let ingestionResult: Awaited<ReturnType<typeof ingestInfrastructure>>;
let ingestDurationMs = 0;

beforeAll(async () => {
  const start = Date.now();
  ingestionResult = await ingestInfrastructure(configs, world as any, countries, {
    sourceData,
    coastalToleranceKm: 30,
    countryIndex,
  });
  ingestDurationMs = Date.now() - start;
}, 30000);

const configs: InfraSourceConfig[] = [
  { infraType: "pipeline_gas", sourceId: "pipelines", url: "", adapter: "geojson_line" },
  { infraType: "pipeline_oil", sourceId: "pipelines_oil", url: "", adapter: "geojson_line" },
  { infraType: "power_interconnector", sourceId: "interconnectors", url: "", adapter: "geojson_line", crs: "EPSG:3857" },
  { infraType: "subsea_cable", sourceId: "cables", url: "", adapter: "geojson_line" },
  { infraType: "cable_landing", sourceId: "landings", url: "", adapter: "geojson_point" },
  { infraType: "port_container", sourceId: "ports", url: "", adapter: "geojson_point" },
  { infraType: "power_plant_strategic", sourceId: "plants", url: "", adapter: "geojson_point" },
  { infraType: "mine_critical", sourceId: "mines", url: "", adapter: "geojson_point" },
  { infraType: "cargo_airport", sourceId: "airports", url: "", adapter: "geojson_point", crs: "EPSG:3857" },
];

const sourceData = {
  pipelines: lines,
  pipelines_oil: lines,
  interconnectors: lines,
  cables: lines,
  landings: nodesFixture,
  ports: nodesFixture,
  plants: nodesFixture,
  mines: nodesFixture,
  airports: nodesFixture,
};

function findInternal(name: string, segments: ClippedInfrastructureLine[]) {
  return segments.find((s) => s.name === name || s.id === name);
}

function findNode(name: string, nodes: InfrastructureNode[]) {
  return nodes.find((n) => n.name === name || n.id === name);
}

function findTransnational(name: string, segments: any[]) {
  return segments.find((s) => s.name === name || s.id === name);
}

describe("infrastructure ingestion", () => {
  it("ingests lines and nodes with country coherence and clipping", async () => {
    const result = ingestionResult;
    expect(result.internalSegments.length).toBeGreaterThan(0);
    expect(result.transnationalSegments.length).toBeGreaterThan(0);
    expect(result.nodes.length).toBeGreaterThan(0);

    const italyLine = findInternal("Italy Internal", result.internalSegments)!;
    expect(italyLine).toBeTruthy();
    expect(ensureSegmentWithinCountry(italyLine, countryIndex)).toBe(true);

    const lisbonPort = findNode("Lisbon Port", result.nodes)!;
    expect(lisbonPort.country_id).toBe("Portugal");
    expect(ensureNodeWithinCountry(lisbonPort, countryIndex)).toBe(true);

    const leipzig = findNode("Leipzig Cargo", result.nodes)!;
    expect(leipzig.country_id).toBe("Germany");
  });

  it("derives transnational sequences and keeps CRS in WGS84", async () => {
    const result = ingestionResult;
    const transmed = result.transnationalSegments.find((s) => s.name === "TransMed Gas");
    expect(transmed).toBeTruthy();
    expect(transmed!.countries?.[0]).toBe("Algeria");
    expect(transmed!.countries?.includes("Tunisia")).toBe(true);
    expect(transmed!.countries?.includes("Italy")).toBe(true);
    transmed!.geometry_geo.forEach(([lon, lat]) => {
      expect(Math.abs(lon)).toBeLessThanOrEqual(180);
      expect(Math.abs(lat)).toBeLessThanOrEqual(90);
    });
  });

  it("moves internal infrastructure together with country transforms", async () => {
    const projection = geoMercator();
    const result = ingestionResult;
    const italy = countries.find((c) => c.name === "Italy");
    const italyLine = findInternal("Italy Internal", result.internalSegments)!;
    const italyPlant = findNode("Taranto Plant", result.nodes)!;
    const shape = prepareRenderCountryShape(world as any, italy!, projection);

    const baseLine = projectInfrastructureLine(italyLine, projection);
    const baseNode = projection([italyPlant.lon, italyPlant.lat]);

    detachCountry(shape, [30, -20]);

    const movedLine = projectInfrastructureLine(italyLine, projection, shape.transform);
    const movedNode = [shape.transform.a * baseNode[0] + shape.transform.c * baseNode[1] + shape.transform.e,
      shape.transform.b * baseNode[0] + shape.transform.d * baseNode[1] + shape.transform.f];

    expect(movedLine.geometry_projected[0][0] - baseLine.geometry_projected[0][0]).toBeCloseTo(30, 2);
    expect(movedLine.geometry_projected[0][1] - baseLine.geometry_projected[0][1]).toBeCloseTo(-20, 2);
    expect(movedNode[0] - baseNode[0]).toBeCloseTo(30, 2);
    expect(movedNode[1] - baseNode[1]).toBeCloseTo(-20, 2);
  });

  it("reprojects and densifies infrastructure for correct country traversal", async () => {
    const result = ingestionResult;
    const midmed = result.transnationalSegments.find((s) => s.name === "MidMed Gas");
    expect(midmed).toBeTruthy();
    expect(midmed!.countries).toContain("Spain");
    expect(midmed!.countries).toContain("France");
    expect(midmed!.countries?.includes("Italy")).toBe(true);

    const interconnector = result.transnationalSegments.find((s) => s.name === "DE-PL Interconnector");
    expect(interconnector).toBeTruthy();
    interconnector!.geometry_geo.forEach(([lon, lat]) => {
      expect(Math.abs(lon)).toBeLessThanOrEqual(180);
      expect(Math.abs(lat)).toBeLessThanOrEqual(90);
    });
  });

  it("classifies island nodes using high-resolution country masks", async () => {
    const result = ingestionResult;
    const funchal = findNode("Funchal Anchorage", result.nodes)!;
    expect(funchal.country_id).toBe("Portugal");
    expect(funchal.offshore).toBe(false);
    expect(ensureNodeWithinCountry(funchal, countryIndex)).toBe(true);
  });

  it("assigns near-coast offshore nodes without snapping coordinates", async () => {
    const result = ingestionResult;
    const lng = findNode("Lisbon Offshore LNG", result.nodes)!;
    expect(lng.country_id).toBe("Portugal");
    expect(lng.offshore).toBe(true);
    expect(lng.offshore_distance_km).toBeLessThanOrEqual(30);
    expect(ensureNodeWithinCountry(lng, countryIndex)).toBe(false);
    expect(lng.lon).toBeCloseTo(-9.4, 2);
    expect(lng.lat).toBeCloseTo(38.7, 2);
  });

  it("keeps fully offshore nodes stable while assigning to the nearest coast", async () => {
    const result = ingestionResult;
    const relay = findNode("Mid Atlantic Relay", result.nodes)!;
    expect(relay.offshore).toBe(true);
    expect(relay.lon).toBeCloseTo(-30.0, 2);
    expect(relay.lat).toBeCloseTo(0.5, 2);
    expect(relay.country_id).toBeTruthy();
    expect(relay.offshore_distance_km).toBeGreaterThan(30);
  });

  it("detects coastal traversal with densification near islands", async () => {
    const result = ingestionResult;
    const aegean = findTransnational("Aegean Coastal Cable", result.transnationalSegments)!;
    expect(aegean).toBeTruthy();
    expect(aegean.countries?.[0]).toBe("Greece");
    expect(aegean.countries).toContain("Turkey");
    const idxTurkey = aegean.countries?.indexOf("Turkey") ?? -1;
    expect(idxTurkey).toBeGreaterThan(0);
  });

  it("ingests high-res classification data within a reasonable time budget", () => {
    expect(ingestDurationMs).toBeLessThan(30000);
  });
});
