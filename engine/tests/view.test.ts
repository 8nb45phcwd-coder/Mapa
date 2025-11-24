import { describe, expect, it } from "vitest";
import { feature } from "topojson-client";
import world50 from "world-atlas/countries-50m.json";
import world110 from "world-atlas/countries-110m.json";
import {
  createCameraState,
  applyZoom,
  applyPan,
  geoToScreen,
  screenToGeo,
  screenPosHybridWithCamera,
} from "../src/view/camera.js";
import { selectLOD, loadGeometryForLOD, mapCountriesToLODGeometry } from "../src/view/lod.js";
import { buildTileIndex, tilesInView } from "../src/view/tiles.js";
import { buildCountryMaskIndex } from "../src/geometry.js";
import type { Country } from "../src/types.js";

const identityProjection = ((coord: [number, number]) => coord) as any;
identityProjection.invert = (pt: [number, number]) => pt;

const fc50: any = feature(world50 as any, (world50 as any).objects.countries);
const fc110: any = feature(world110 as any, (world110 as any).objects.countries);
const countries: Country[] = fc50.features.map((f: any) => ({
  country_id: f.properties?.name ?? f.id?.toString(),
  name: f.properties?.name ?? f.id?.toString(),
  geometry_ref: f.id?.toString() ?? f.properties?.name ?? "",
}));

const portugal = countries.find((c) => c.name === "Portugal");
const spain = countries.find((c) => c.name === "Spain");

describe("camera zoom and pan", () => {
  it("scales around anchor and preserves inverse mapping", () => {
    const camera = createCameraState(800, 400);
    camera.center = [0, 0];
    const geo: [number, number] = [10, 5];
    const before = geoToScreen(geo, camera, identityProjection);
    applyZoom(camera, 2, [0, 0]);
    const after = geoToScreen(geo, camera, identityProjection);
    expect(after[0]).toBeCloseTo(before[0] * 2);
    expect(after[1]).toBeCloseTo(before[1] * 2);

    const back = screenToGeo(after as [number, number], camera, identityProjection);
    expect(back[0]).toBeCloseTo(geo[0]);
    expect(back[1]).toBeCloseTo(geo[1]);

    applyPan(camera, 10, -5);
    const afterPan = geoToScreen(geo, camera, identityProjection);
    expect(afterPan[0]).toBeCloseTo(after[0] + 10);
    expect(afterPan[1]).toBeCloseTo(after[1] - 5);
  });

  it("blends conceptual positions with camera transform", () => {
    const camera = createCameraState(200, 200);
    camera.center = [0, 0];
    applyZoom(camera, 2, [0, 0]);
    const blended = screenPosHybridWithCamera([10, 0], [0, 10], 0.5, camera);
    expect(blended[0]).toBeCloseTo(10 * 0.5 * 2);
    expect(blended[1]).toBeCloseTo(10 * 0.5 * 2);
  });
});

describe("LOD switching", () => {
  it("selects expected tiers from zoom", () => {
    expect(selectLOD(1)).toBe("low");
    expect(selectLOD(1.6)).toBe("medium");
    expect(selectLOD(3.5)).toBe("high");
  });

  it("loads LOD geometry without changing IDs", async () => {
    const lod = await loadGeometryForLOD("high", { preloaded: { "10m": world50 } });
    const map = mapCountriesToLODGeometry(countries, lod.topojson, (src, ref) => {
      const fc = feature(src as any, (src as any).objects.countries);
      return fc.features.find((f: any) => f.id?.toString() === ref || f.properties?.name === ref);
    });
    expect(map.has(portugal!.country_id)).toBe(true);
  }, 15000);

  it("keeps mask integrity across resolutions", () => {
    const maskHigh = buildCountryMaskIndex(countries, world50 as any);
    const maskLow = buildCountryMaskIndex(countries, world110 as any);
    const portugalHigh = maskHigh.get(portugal!.country_id);
    const portugalLow = maskLow.get(portugal!.country_id);
    expect(portugalHigh?.multipolygon.length).toBeGreaterThan(0);
    expect(portugalLow?.multipolygon.length).toBeGreaterThan(0);
  }, 15000);
});

describe("tile culling", () => {
  const mask = buildCountryMaskIndex(
    [portugal!, spain!],
    world50 as any,
    (src: any, ref: string) => {
      const fc = feature(src as any, (src as any).objects.countries);
      return fc.features.find((f: any) => f.id?.toString() === ref || f.properties?.name === ref);
    }
  );

  const polyToMulti = (maskEntry: any) => maskEntry.multipolygon as [number, number][][][];

  const tileIndex = buildTileIndex(
    [
      { country_id: portugal!.country_id, geometry: polyToMulti(mask.get(portugal!.country_id)!) },
      { country_id: spain!.country_id, geometry: polyToMulti(mask.get(spain!.country_id)!) },
    ],
    [
      {
        id: "iberia-cable",
        country_id: portugal!.country_id,
        geometry_geo: [
          [-9.2, 38.7],
          [-9.0, 40],
          [-3.7, 40.4],
        ],
      },
    ],
    [
      { id: "lisbon-off", lon: -9.4, lat: 38.7 },
      { id: "madrid", lon: -3.7, lat: 40.4 },
    ],
    4
  );

  it("returns visible tiles in viewport and merges at low zoom", () => {
    const camera = createCameraState(360, 180);
    camera.center = [0, 0];
    camera.panOffsetX = 180;
    camera.panOffsetY = 90;
    const tilesHigh = tilesInView(camera, identityProjection, tileIndex);
    expect(tilesHigh.length).toBeGreaterThan(0);
    const countrySets = new Set<string>();
    tilesHigh.forEach((t) => t.countries.forEach((c) => countrySets.add(c)));
    expect(countrySets.has(portugal!.country_id)).toBe(true);

    applyZoom(camera, 0.5, [0, 0]);
    const tilesMerged = tilesInView(camera, identityProjection, tileIndex);
    expect(tilesMerged.length).toBeLessThanOrEqual(tilesHigh.length);
  });
});
