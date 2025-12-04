import { describe, expect, it } from "vitest";
import { feature } from "topojson-client";
import world50 from "world-atlas/countries-50m.json";
import { createCameraState, screenToGeo } from "../src/view/camera.js";
import { tilesInView, buildTileIndex } from "../src/view/tiles.js";
import { buildCountryMaskIndex } from "../src/geometry.js";
import type { Country } from "../src/types.js";

// Identity projection used for deterministic lon/lat mapping in tests.
const identityProjection = ((coord: [number, number]) => coord) as any;
identityProjection.invert = (pt: [number, number]) => pt;

const fc50: any = feature(world50 as any, (world50 as any).objects.countries);
const countries: Country[] = fc50.features.map((f: any) => ({
  country_id: f.properties?.name ?? f.id?.toString(),
  name: f.properties?.name ?? f.id?.toString(),
  geometry_ref: f.id?.toString() ?? f.properties?.name ?? "",
}));

const decoder = (src: any, ref: string) => {
  const fc = feature(src as any, (src as any).objects.countries);
  return fc.features.find((f: any) => f.id?.toString() === ref || f.properties?.name === ref);
};

const mask = buildCountryMaskIndex(countries, world50 as any, decoder);

const polyToMulti = (maskEntry: any) => maskEntry.multipolygon as [number, number][][][];

const worldTileIndex = buildTileIndex(
  countries.reduce<{ country_id: string; geometry: [number, number][][][] }[]>((acc, c) => {
    const entry = mask.get(c.country_id);
    if (entry) acc.push({ country_id: c.country_id, geometry: polyToMulti(entry) });
    return acc;
  }, []),
  [],
  [],
  4
);

function bboxFromCoords(coords: [number, number][]): [number, number, number, number] {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  coords.forEach(([lon, lat]) => {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  });
  return [minLon, minLat, maxLon, maxLat];
}

function bboxesIntersect(a: [number, number, number, number], b: [number, number, number, number]) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function pointInBBox(pt: [number, number], bbox: [number, number, number, number]) {
  return pt[0] >= bbox[0] && pt[0] <= bbox[2] && pt[1] >= bbox[1] && pt[1] <= bbox[3];
}

function tileIdFromEntry(entry: { key: { x: number; y: number; z: number } }) {
  const { x, y, z } = entry.key;
  return `${z}/${x}/${y}`;
}

function lonLatToTile(lon: number, lat: number, z: number) {
  const scale = 1 << z;
  const x = Math.min(scale - 1, Math.max(0, Math.floor(((lon + 180) / 360) * scale)));
  const y = Math.min(scale - 1, Math.max(0, Math.floor(((lat + 90) / 180) * scale)));
  return { x, y, z };
}

function viewportGeoBBox(camera: any) {
  const corners: [number, number][] = [
    [0, 0],
    [camera.viewportWidth, 0],
    [camera.viewportWidth, camera.viewportHeight],
    [0, camera.viewportHeight],
  ];
  const geos = corners.map((c) => screenToGeo(c as [number, number], camera, identityProjection));
  return bboxFromCoords(geos);
}

// Extreme latitude tile coverage and zoom behaviour.
describe("view tiles at extreme latitudes", () => {
  // Validates that low-zoom coverage spans the world extent and tiles remain unique.
  it("covers the world at low zoom with unique tiles", () => {
    const globalIndex = buildTileIndex(
      [
        {
          country_id: "world",
          geometry: [[
            [
              [-180, -90],
              [-180, 90],
              [180, 90],
              [180, -90],
              [-180, -90],
            ],
          ]],
        },
      ],
      [],
      [],
      1
    );

    const camera = createCameraState(360, 180);
    camera.center = [0, 0];
    camera.panOffsetX = 180;
    camera.panOffsetY = 90;
    camera.zoom = 0.8;

    const tiles = tilesInView(camera, identityProjection, globalIndex);
    const ids = new Set(tiles.map(tileIdFromEntry));
    expect(ids.size).toBe(tiles.length);

    const union = tiles.reduce(
      (acc, t) => [
        Math.min(acc[0], t.bbox[0]),
        Math.min(acc[1], t.bbox[1]),
        Math.max(acc[2], t.bbox[2]),
        Math.max(acc[3], t.bbox[3]),
      ],
      [Infinity, Infinity, -Infinity, -Infinity] as [number, number, number, number]
    );

    expect(union[0]).toBeLessThanOrEqual(-180);
    expect(union[1]).toBeLessThanOrEqual(-90);
    expect(union[2]).toBeGreaterThanOrEqual(180);
    expect(union[3]).toBeGreaterThanOrEqual(90);
  });

  // Validates tile visibility around high northern/southern latitudes and ensures intersections are correct.
  it("returns valid tiles for high-latitude viewports", () => {
    const cameraNorth = createCameraState(360, 180);
    cameraNorth.center = [0, 0];
    cameraNorth.panOffsetX = 180;
    cameraNorth.panOffsetY = 15; // centers around ~+75 degrees latitude
    cameraNorth.zoom = 2;

    const northTiles = tilesInView(cameraNorth, identityProjection, worldTileIndex);
    expect(northTiles.length).toBeGreaterThan(0);
    const northBBox = viewportGeoBBox(cameraNorth);
    northTiles.forEach((t) => {
      expect(bboxesIntersect(t.bbox, northBBox)).toBe(true);
      expect(t.key.x).toBeGreaterThanOrEqual(0);
      expect(t.key.y).toBeGreaterThanOrEqual(0);
    });

    const cameraSouth = createCameraState(360, 180);
    cameraSouth.center = [0, 0];
    cameraSouth.panOffsetX = 180;
    cameraSouth.panOffsetY = 165; // centers around ~-75 degrees latitude
    cameraSouth.zoom = 2;

    const southTiles = tilesInView(cameraSouth, identityProjection, worldTileIndex);
    expect(southTiles.length).toBeGreaterThan(0);
    const southBBox = viewportGeoBBox(cameraSouth);
    southTiles.forEach((t) => {
      expect(bboxesIntersect(t.bbox, southBBox)).toBe(true);
      expect(t.key.x).toBeGreaterThanOrEqual(0);
      expect(t.key.y).toBeGreaterThanOrEqual(0);
    });
  });

  // Validates tile set growth and focus consistency as zoom increases over the same center.
  it("scales tile coverage with zoom while keeping center inside returned tiles", () => {
    const camera = createCameraState(360, 180);
    camera.center = [0, 0];
    camera.panOffsetX = 180 - 2; // ~2E longitude
    camera.panOffsetY = 90 - 48; // ~48N latitude

    const zooms = [1, 1.5, 2.5];
    const tileSets = zooms.map((z) => {
      camera.zoom = z;
      return tilesInView(camera, identityProjection, worldTileIndex);
    });

    expect(tileSets[1].length).toBeGreaterThanOrEqual(tileSets[0].length);
    expect(tileSets[2].length).toBeGreaterThanOrEqual(tileSets[1].length);

    const targetPoint: [number, number] = [2, 48];
    tileSets.forEach((set, idx) => {
      const containsCenter = set.some((t) => pointInBBox(targetPoint, t.bbox));
      expect(containsCenter).toBe(true);
      if (idx > 0) {
        const prevCenterTiles = tileSets[idx - 1]
          .filter((t) => pointInBBox(targetPoint, t.bbox))
          .map((t) => t.key);
        const currentCenterTiles = set.filter((t) => pointInBBox(targetPoint, t.bbox)).map((t) => t.key);
        expect(currentCenterTiles.length).toBeGreaterThanOrEqual(prevCenterTiles.length);
      }
    });
  });

  // Validates that point-to-tile mapping stays consistent with projection-derived tile indices.
  it("includes the tile containing a projected point", () => {
    const camera = createCameraState(360, 180);
    camera.center = [0, 0];
    camera.panOffsetX = 180 - (-3.7038);
    camera.panOffsetY = 90 - 40.4168;
    camera.zoom = 2.5;

    const tiles = tilesInView(camera, identityProjection, worldTileIndex);
    expect(tiles.length).toBeGreaterThan(0);

    const point: [number, number] = [-3.7038, 40.4168];
    const tileKey = lonLatToTile(point[0], point[1], 4);
    const matchingTile = tiles.find((t) => t.key.x === tileKey.x && t.key.y === tileKey.y && t.key.z === tileKey.z);
    expect(matchingTile).toBeDefined();
    expect(pointInBBox(point, matchingTile!.bbox)).toBe(true);
  });
});
