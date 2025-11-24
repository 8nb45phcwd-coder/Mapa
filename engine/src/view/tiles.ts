import type {
  CameraState,
  CountryID,
  GeoMultiPolygon,
  InfrastructureNode,
  InfrastructureLine,
} from "../types.js";
import { screenToGeo } from "./camera.js";

export interface TileKey {
  x: number;
  y: number;
  z: number;
}

export interface TileIndexEntry {
  key: TileKey;
  bbox: [number, number, number, number];
  countries: Set<CountryID>;
  segments: Set<string>;
  nodes: Set<string>;
}

export interface TileIndex {
  depth: number;
  tiles: Map<string, TileIndexEntry>;
}

function tileId(key: TileKey): string {
  return `${key.z}/${key.x}/${key.y}`;
}

function lonLatToTile(lon: number, lat: number, z: number): TileKey {
  const scale = 1 << z;
  const x = Math.min(scale - 1, Math.max(0, Math.floor(((lon + 180) / 360) * scale)));
  const y = Math.min(scale - 1, Math.max(0, Math.floor(((lat + 90) / 180) * scale)));
  return { x, y, z };
}

function bboxForCoords(coords: [number, number][]): [number, number, number, number] {
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

function tileRangeForBBox(bbox: [number, number, number, number], z: number) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const min = lonLatToTile(minLon, minLat, z);
  const max = lonLatToTile(maxLon, maxLat, z);
  return { min, max };
}

function addToTiles(
  bbox: [number, number, number, number],
  z: number,
  target: Map<string, TileIndexEntry>,
  mutator: (entry: TileIndexEntry) => void
) {
  const { min, max } = tileRangeForBBox(bbox, z);
  for (let x = min.x; x <= max.x; x++) {
    for (let y = min.y; y <= max.y; y++) {
      const key: TileKey = { x, y, z };
      const id = tileId(key);
      let entry = target.get(id);
      if (!entry) {
        entry = { key, bbox: tileBBox(key), countries: new Set(), segments: new Set(), nodes: new Set() };
        target.set(id, entry);
      }
      mutator(entry);
    }
  }
}

function tileBBox(key: TileKey): [number, number, number, number] {
  const scale = 1 << key.z;
  const minLon = (key.x / scale) * 360 - 180;
  const maxLon = ((key.x + 1) / scale) * 360 - 180;
  const minLat = (key.y / scale) * 180 - 90;
  const maxLat = ((key.y + 1) / scale) * 180 - 90;
  return [minLon, minLat, maxLon, maxLat];
}

function bboxFromMultiPolygon(poly: GeoMultiPolygon): [number, number, number, number] {
  let minLon = Infinity,
    minLat = Infinity,
    maxLon = -Infinity,
    maxLat = -Infinity;
  poly.forEach((ringSet) => {
    ringSet.forEach((ring) => {
      ring.forEach(([lon, lat]) => {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      });
    });
  });
  return [minLon, minLat, maxLon, maxLat];
}

export interface TileSourceCountry {
  country_id: CountryID;
  geometry: GeoMultiPolygon;
}

export function buildTileIndex(
  countries: TileSourceCountry[],
  segments: InfrastructureLine[],
  nodes: InfrastructureNode[],
  depth = 4
): TileIndex {
  const tiles = new Map<string, TileIndexEntry>();
  countries.forEach((c) => {
    const bbox = bboxFromMultiPolygon(c.geometry);
    addToTiles(bbox, depth, tiles, (entry) => entry.countries.add(c.country_id));
  });
  segments.forEach((s) => {
    const bbox = bboxForCoords(s.geometry_geo);
    addToTiles(bbox, depth, tiles, (entry) => entry.segments.add(s.id));
  });
  nodes.forEach((n) => {
    const bbox: [number, number, number, number] = [n.lon, n.lat, n.lon, n.lat];
    addToTiles(bbox, depth, tiles, (entry) => entry.nodes.add(n.id));
  });
  return { depth, tiles };
}

function parentKey(key: TileKey): TileKey {
  return { x: Math.floor(key.x / 2), y: Math.floor(key.y / 2), z: Math.max(0, key.z - 1) };
}

export function mergeTiles(entries: TileIndexEntry[], targetLevel: number): TileIndexEntry[] {
  if (entries.length === 0) return entries;
  const merged = new Map<string, TileIndexEntry>();
  entries.forEach((e) => {
    let key = e.key;
    while (key.z > targetLevel) key = parentKey(key);
    const id = tileId(key);
    let target = merged.get(id);
    if (!target) {
      target = {
        key,
        bbox: tileBBox(key),
        countries: new Set(),
        segments: new Set(),
        nodes: new Set(),
      };
      merged.set(id, target);
    }
    e.countries.forEach((c) => target!.countries.add(c));
    e.segments.forEach((s) => target!.segments.add(s));
    e.nodes.forEach((n) => target!.nodes.add(n));
  });
  return Array.from(merged.values());
}

export function tilesInView(
  camera: CameraState,
  projection: ((coords: [number, number]) => [number, number]) & { invert?: (pt: [number, number]) => [number, number] },
  index: TileIndex
): TileIndexEntry[] {
  const corners: [number, number][] = [
    [0, 0],
    [camera.viewportWidth, 0],
    [camera.viewportWidth, camera.viewportHeight],
    [0, camera.viewportHeight],
  ];
  const geos = corners.map((c) => screenToGeo(c as [number, number], camera, projection));
  const bbox = bboxForCoords(geos);
  const entries: TileIndexEntry[] = [];
  const { min, max } = tileRangeForBBox(bbox, index.depth);
  for (let x = min.x; x <= max.x; x++) {
    for (let y = min.y; y <= max.y; y++) {
      const id = tileId({ x, y, z: index.depth });
      const entry = index.tiles.get(id);
      if (entry) entries.push(entry);
    }
  }
  const targetLevel = camera.zoom < 1.2 ? Math.max(0, index.depth - 2) : camera.zoom < 1.8 ? Math.max(0, index.depth - 1) : index.depth;
  return targetLevel === index.depth ? entries : mergeTiles(entries, targetLevel);
}
