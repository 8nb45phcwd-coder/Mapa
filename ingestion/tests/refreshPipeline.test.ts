import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { refreshStrategicInfrastructure } from "../src/refreshInfra.js";
import sample from "./fixtures/refresh-sample.json" assert { type: "json" };

const outputDir = mkdtempSync(join(tmpdir(), "infra-refresh-"));

const sourceData = {
  global_pipelines_gas_strategic: sample.gasPipelines,
  global_pipelines_oil_strategic: sample.oilPipelines,
  global_ports_container_major: sample.nodes,
  global_offshore_platforms_major: sample.nodes,
  global_mines_critical_major: sample.nodes,
  global_airports_hub_major: sample.nodes,
};

describe("refreshStrategicInfrastructure", () => {
  it("writes deterministic, rounded fixtures without network access", async () => {
    const fetcher = vi.fn();
    await refreshStrategicInfrastructure({
      overwrite: true,
      outputDir,
      sourceData,
      fetcher,
    });

    expect(fetcher).not.toHaveBeenCalled();

    const linesPath = resolve(outputDir, "strategic-lines.geojson");
    const nodesPath = resolve(outputDir, "strategic-nodes.geojson");
    const lines = JSON.parse(readFileSync(linesPath, "utf-8"));
    const nodes = JSON.parse(readFileSync(nodesPath, "utf-8"));

    expect(lines.features.length).toBeGreaterThan(0);
    expect(nodes.features.length).toBeGreaterThan(0);

    const featureNames = lines.features.map((f: any) => f.properties.name);
    expect(featureNames[0]).toBe("Alpha Gas Backbone");
    expect(featureNames[featureNames.length - 1]).toBe("Zulu Oil Spine");

    const rounded = lines.features[0].geometry.coordinates[0][0];
    expect(rounded).toBeCloseTo(10.12346, 5);

    const types = new Set([
      ...lines.features.map((f: any) => f.properties.infraType),
      ...nodes.features.map((f: any) => f.properties.infraType),
    ]);

    [
      "pipeline_gas_strategic",
      "pipeline_oil_strategic",
      "port_container_major",
      "oil_gas_platform_offshore_major",
      "mine_critical_major",
      "airport_hub_major",
    ].forEach((t) => expect(types.has(t)).toBe(true));

    const withOwnership = nodes.features.find((f: any) => f.properties.name === "Delta Container Port");
    expect(withOwnership?.properties.owner).toBe("Delta Port Authority");
    expect(withOwnership?.properties.operator).toBe("Delta Logistics");
  });

  it("enforces overwrite guard", async () => {
    await expect(
      refreshStrategicInfrastructure({ outputDir, sourceData })
    ).rejects.toThrow(/Refusing to overwrite/);
  });
});

afterAll(() => {
  rmSync(outputDir, { recursive: true, force: true });
});
