import { describe, expect, it, vi, afterEach } from "vitest";
import type { Country } from "world-map-engine";
import { ingestInfrastructure, type InfraSourceConfig } from "../src/infrastructureIngest.js";

afterEach(() => {
  delete (global as any).window;
});

describe("infrastructure ingestion fixtures", () => {
  it("returns an error result when fixture fetch fails", async () => {
    (global as any).window = { location: { href: "https://example.test/" } };
    const fetcher = vi.fn(async () => ({ ok: false, status: 404 } as any));
    const configs: InfraSourceConfig[] = [
      { infraType: "pipeline_gas_strategic", sourceId: "test", url: "https://example.com", adapter: "geojson_line", fixture: "missing.geojson" },
    ];
    const countries: Country[] = [
      { country_id: "TST", name: "Testland", geometry_ref: "TST" } as Country,
    ];
    const countryIndex = new Map([
      [
        "TST",
        {
          id: "TST",
          geojson: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
          multipolygon: [[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]],
        },
      ],
    ]);

    const result = await ingestInfrastructure(configs, {}, countries, {
      useFixturesOnly: true,
      fetcher: fetcher as any,
      countryIndex,
      fixtureOverrideDir: "./fixtures/",
    });

    expect(result.errors?.length).toBe(1);
    expect(result.internalSegments).toHaveLength(0);
  });
});
