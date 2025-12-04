import { beforeAll, describe, expect, it, vi } from "vitest";
import world from "world-atlas/countries-50m.json";
import { feature } from "topojson-client";
import { ingestInfrastructure, buildCountryGeoIndex, defaultInfraSources } from "world-map-ingestion";
import { decodeGeometryByRef, type Country } from "world-map-engine";

const worldFeatures: any = feature(world as any, (world as any).objects.countries);
const countries: Country[] = worldFeatures.features.map((f: any) => ({
  country_id: f.properties?.name ?? f.id?.toString(),
  name: f.properties?.name ?? f.id?.toString(),
  geometry_ref: f.id?.toString() ?? f.properties?.name ?? "",
}));

const countryIndex = buildCountryGeoIndex(countries, world as any, decodeGeometryByRef);

let ingestionResult: Awaited<ReturnType<typeof ingestInfrastructure>>;
const fetcher = vi.fn();

beforeAll(async () => {
  ingestionResult = await ingestInfrastructure(defaultInfraSources, world as any, countries, {
    useFixturesOnly: true,
    fetcher,
    countryIndex,
  });
}, 60000);

describe("strategic infrastructure ingestion", () => {
  it("uses fixtures only without hitting the network", () => {
    expect(fetcher).not.toHaveBeenCalled();
    expect(ingestionResult.internalSegments.length + ingestionResult.transnationalSegments.length).toBeGreaterThan(0);
    expect(ingestionResult.nodes.length).toBeGreaterThan(0);
  });

  it("returns only strategic infra types with full coverage", () => {
    const allowedSegments = new Set([
      "pipeline_gas_strategic",
      "pipeline_oil_strategic",
    ]);
    const allowedNodes = new Set([
      "port_container_major",
      "oil_gas_platform_offshore_major",
      "mine_critical_major",
      "airport_hub_major",
    ]);

    ingestionResult.internalSegments.forEach((seg) => {
      expect(allowedSegments.has(seg.type!)).toBe(true);
    });
    ingestionResult.transnationalSegments.forEach((seg) => {
      expect(allowedSegments.has(seg.type!)).toBe(true);
    });
    ingestionResult.nodes.forEach((node) => {
      expect(allowedNodes.has(node.type!)).toBe(true);
    });

    const presentTypes = new Set([
      ...ingestionResult.internalSegments.map((s) => s.type!),
      ...ingestionResult.transnationalSegments.map((s) => s.type!),
      ...ingestionResult.nodes.map((n) => n.type!),
    ]);
    [
      "pipeline_gas_strategic",
      "pipeline_oil_strategic",
      "port_container_major",
      "oil_gas_platform_offshore_major",
      "mine_critical_major",
      "airport_hub_major",
    ].forEach((t) => expect(presentTypes.has(t)).toBe(true));
  });

  it("assigns countries and flags offshore assets consistently", () => {
    ingestionResult.nodes.forEach((node) => {
      expect(node.country_id).toBeTruthy();
    });
    const offshore = ingestionResult.nodes.find((n) => n.name === "Ekofisk Offshore Complex");
    expect(offshore?.offshore).toBe(true);
    expect(offshore?.country_id).toBeTruthy();
  });

  it("passes through owner/operator metadata", () => {
    const pipeline =
      ingestionResult.internalSegments.find((s) => s.name === "TransMed Strategic Gas") ||
      ingestionResult.transnationalSegments.find((s) => s.name === "TransMed Strategic Gas");
    expect(pipeline?.owner_raw || pipeline?.operator_raw).toBeTruthy();

    const port = ingestionResult.nodes.find((n) => n.name === "Rotterdam Container Hub");
    expect(port?.owner_raw).toBe("Port of Rotterdam");
    expect(port?.operator_raw).toBe("Port of Rotterdam");
  });
});
