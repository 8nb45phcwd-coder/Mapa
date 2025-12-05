import { feature } from "topojson-client";
import { geoContains, geoDistance } from "d3-geo";
import proj4 from "proj4";
import type {
  ClippedInfrastructureLine,
  Country,
  CountryID,
  GeoPolygon,
  GeoMultiPolygon,
  InfrastructureLine,
  InfrastructureNode,
  InfrastructureNodeType,
  InfrastructureSegmentType,
  TransnationalInfrastructureLine,
} from "world-map-engine";
import { decodeGeometryByRef } from "world-map-engine";
import { clipInternalInfrastructure } from "world-map-engine";

export type InfraReliability = "authoritative" | "partial" | "approximate" | "noisy" | "osm_derived";

export interface InfraSourceConfig {
  infraType: InfrastructureSegmentType | InfrastructureNodeType;
  sourceId: string;
  url: string;
  adapter: string;
  crs?: string; // EPSG code if not WGS84
  reliability?: InfraReliability;
  preprocess?: (data: any) => any;
  notes?: string;
  fixture?: string;
}

export interface InfraIngestOptions {
  fetcher?: typeof fetch;
  decoder?: (source: any, ref: string) => any;
  sourceData?: Record<string, any>;
  classificationSource?: any;
  classificationDecoder?: (source: any, ref: string) => any;
  coastalToleranceKm?: number;
  countryIndex?: Map<CountryID, CountryGeometry>;
  useFixturesOnly?: boolean;
  fixtureOverrideDir?: string;
}

export interface IngestedInfrastructure {
  internalSegments: ClippedInfrastructureLine[];
  transnationalSegments: TransnationalInfrastructureLine[];
  nodes: InfrastructureNode[];
  errors?: string[];
}

// Default sources target authoritative or semi-authoritative global datasets; callers can override via `configs`
// or supply pre-fetched `sourceData` during tests for determinism.
export const defaultInfraSources: InfraSourceConfig[] = [
  {
    infraType: "pipeline_gas_strategic",
    sourceId: "global_pipelines_gas_strategic",
    url: "https://datasets.globalenergymonitor.org/pipelines/latest/gas-pipelines.geojson",
    adapter: "geojson_line",
    reliability: "authoritative",
    notes: "GEM gas trunklines",
    fixture: "strategic-lines.geojson",
  },
  {
    infraType: "pipeline_oil_strategic",
    sourceId: "global_pipelines_oil_strategic",
    url: "https://datasets.globalenergymonitor.org/pipelines/latest/oil-pipelines.geojson",
    adapter: "geojson_line",
    reliability: "authoritative",
    notes: "GEM oil trunklines",
    fixture: "strategic-lines.geojson",
  },
  {
    infraType: "port_container_major",
    sourceId: "global_ports_container_major",
    url: "https://msi.nga.mil/api/publications/world-port-index.geojson",
    adapter: "geojson_point",
    reliability: "authoritative",
    notes: "World Port Index (container capacity rankings)",
    fixture: "strategic-nodes.geojson",
  },
  {
    infraType: "oil_gas_platform_offshore_major",
    sourceId: "global_offshore_platforms_major",
    url: "https://example.com/offshore-platforms.geojson",
    adapter: "geojson_point",
    reliability: "partial",
    notes: "Offshore platforms (placeholder source)",
    fixture: "strategic-nodes.geojson",
  },
  {
    infraType: "mine_critical_major",
    sourceId: "global_mines_critical_major",
    url: "https://datasets.globalenergymonitor.org/mines/latest/mines.geojson",
    adapter: "geojson_point",
    reliability: "partial",
    notes: "GEM mines filtered to critical minerals",
    fixture: "strategic-nodes.geojson",
  },
  {
    infraType: "airport_hub_major",
    sourceId: "global_airports_hub_major",
    url: "https://ourairports.com/data/airports.geojson",
    adapter: "geojson_point",
    reliability: "approximate",
    notes: "Major hub airports",
    fixture: "strategic-nodes.geojson",
  },
];

export interface CountryGeometry {
  id: CountryID;
  geojson: any;
  multipolygon: GeoMultiPolygon;
  bbox?: [number, number, number, number];
}

interface CountryAssignment {
  country_id?: CountryID;
  offshore: boolean;
  onshore: boolean;
  distance_km?: number;
}

interface RawFeatureSegment {
  kind: "segment";
  segment: InfrastructureLine;
  properties?: Record<string, any>;
}

interface RawFeatureNode {
  kind: "node";
  node: InfrastructureNode;
  properties?: Record<string, any>;
}

type RawFeature = RawFeatureSegment | RawFeatureNode;

function geometryToMultiPolygon(geometry: any): GeoMultiPolygon {
  if (!geometry || !geometry.type) throw new Error("Invalid geometry for country mask");
  if (geometry.type === "Polygon") {
    return [geometry.coordinates as GeoPolygon];
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates as GeoMultiPolygon;
  }
  throw new Error(`Unsupported geometry type for country: ${geometry.type}`);
}

export function buildCountryGeoIndex(
  countries: Country[],
  source: any,
  decoder: (source: any, ref: string) => any
): Map<CountryID, CountryGeometry> {
  const idx = new Map<CountryID, CountryGeometry>();
  for (const country of countries) {
    const geo = decoder(source, country.geometry_ref);
    if (!geo) continue;
    const geom = geo.geometry ?? geo;
    const bbox = computeBounds(geom) || undefined;
    idx.set(country.country_id, {
      id: country.country_id,
      geojson: geom,
      multipolygon: geometryToMultiPolygon(geom),
      bbox,
    });
  }
  return idx;
}

export function ensureWgs84Coord(coord: [number, number]) {
  const [lon, lat] = coord;
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
    throw new Error(`Coordinate ${coord} not in WGS84 bounds`);
  }
}

function reprojectToWGS84(coord: [number, number], sourceCrs?: string): [number, number] {
  if (!sourceCrs || sourceCrs === "EPSG:4326" || sourceCrs.toLowerCase() === "wgs84") return coord;
  const projected = proj4(sourceCrs, "WGS84", coord);
  return [projected[0], projected[1]];
}

function geometryCrs(data: any, config: InfraSourceConfig): string | undefined {
  if (config.crs) return config.crs;
  const crsName = data?.crs?.properties?.name || data?.crs?.name;
  if (typeof crsName === "string") return crsName;
  return undefined;
}

function collectGeoJSONFeatures(data: any): any[] {
  if (!data) return [];
  if (data.type === "FeatureCollection") return data.features || [];
  if (data.type === "Feature") return [data];
  if (data.type === "Topology" && data.objects) {
    return Object.keys(data.objects).flatMap((key) => {
      const fc: any = feature(data, data.objects[key]);
      return fc.features || [];
    });
  }
  return [];
}

function adaptLineFeatures(data: any, config: InfraSourceConfig): RawFeature[] {
  const features = collectGeoJSONFeatures(data);
  const crs = geometryCrs(data, config);
  const results: RawFeature[] = [];
  features.forEach((f, idx) => {
    if (!f.geometry || (f.geometry.type !== "LineString" && f.geometry.type !== "MultiLineString")) return;
    const properties = f.properties || {};
    const lines: [number, number][][] =
      f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates;
    lines.forEach((coords, lineIdx) => {
      const ring = (coords as [number, number][]).map((pt) => reprojectToWGS84(pt, f.properties?.crs || crs));
      ring.forEach(ensureWgs84Coord);
      const id = (f.id ?? f.properties?.id ?? `${config.sourceId}-${idx}-${lineIdx}`).toString();
      const name = (properties?.name ?? properties?.Name ?? config.sourceId).toString();
      const inferredType = (properties?.infraType || properties?.type || config.infraType) as
        | InfrastructureSegmentType
        | InfrastructureNodeType;
      results.push({
        kind: "segment",
        segment: {
          id,
          country_id: "" as CountryID,
          geometry_geo: ring,
          type: inferredType as InfrastructureSegmentType,
          name,
          owner_raw: properties?.owner ?? properties?.Owner,
          operator_raw: properties?.operator ?? properties?.Operator,
        },
        properties,
      });
    });
  });
  return results;
}

function adaptPointFeatures(data: any, config: InfraSourceConfig): RawFeature[] {
  const features = collectGeoJSONFeatures(data);
  const crs = geometryCrs(data, config);
  const results: RawFeature[] = [];
  features.forEach((f, idx) => {
    if (!f.geometry || f.geometry.type !== "Point") return;
    const properties = f.properties || {};
    const coords = reprojectToWGS84(f.geometry.coordinates as [number, number], properties?.crs || crs);
    ensureWgs84Coord([coords[0], coords[1]]);
    const id = (f.id ?? f.properties?.id ?? `${config.sourceId}-${idx}`).toString();
    const name = (properties?.name ?? properties?.Name ?? config.sourceId).toString();
    const inferredType = (properties?.infraType || properties?.type || config.infraType) as InfrastructureNodeType;
    results.push({
      kind: "node",
      node: {
        id,
        country_id: undefined,
        type: inferredType,
        name,
        lon: coords[0],
        lat: coords[1],
        properties,
        owner_raw: properties?.owner ?? properties?.Owner,
        operator_raw: properties?.operator ?? properties?.Operator,
      },
      properties,
    });
  });
  return results;
}

export const adapterRegistry: Record<string, (data: any, config: InfraSourceConfig) => RawFeature[]> = {
  geojson_line: adaptLineFeatures,
  geojson_point: adaptPointFeatures,
};

export const DEFAULT_FIXTURE_DIR = new URL("../fixtures/", import.meta.url);

export async function loadFixtureData(
  config: InfraSourceConfig,
  options: InfraIngestOptions
): Promise<any> {
  const file = config.fixture ?? `${config.sourceId}.geojson`;

  // Node.js branch: preserve existing filesystem-based fixture loading.
  if (typeof window === "undefined") {
    const [{ readFileSync }, { resolve }, { fileURLToPath }] = await Promise.all([
      import("fs"),
      import("path"),
      import("url"),
    ]);
    const base = options.fixtureOverrideDir
      ? resolve(options.fixtureOverrideDir)
      : fileURLToPath(DEFAULT_FIXTURE_DIR);
    const path = resolve(base, file);
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw);
  }

  // Browser branch: fetch fixtures as static assets bundled by Vite.
  const baseFromEnv =
    (typeof import.meta !== "undefined" ? (import.meta as any)?.env?.BASE_URL : undefined) ??
    process.env?.VITE_BASE_URL ??
    "/";
  const base = baseFromEnv.endsWith("/") ? baseFromEnv : `${baseFromEnv}/`;
  const baseUrl = options.fixtureOverrideDir
    ? new URL(options.fixtureOverrideDir, DEFAULT_FIXTURE_DIR)
    : new URL(`${base}fixtures/`, typeof window !== "undefined" ? window.location.href : DEFAULT_FIXTURE_DIR);
  const url = new URL(file, baseUrl);
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Failed to load fixture ${url.toString()}: ${response.status}`);
  }
  return response.json();
}

function pipelineCapacityScore(props: Record<string, any>): number {
  const capacityFields = ["capacity_mmcfd", "capacity_bcm_per_year", "throughput_bpd", "capacity"];
  for (const key of capacityFields) {
    if (props[key]) {
      const val = Number(props[key]);
      if (!Number.isNaN(val)) return val;
    }
  }
  return 0;
}

function isStrategicPipeline(raw: RawFeatureSegment): boolean {
  const props = raw.properties || {};
  if (props.strategic === true || props.tier === "strategic" || props.category === "trunk") return true;
  if (props.status && typeof props.status === "string" && props.status.toLowerCase().includes("trunk")) return true;
  const capacity = pipelineCapacityScore(props);
  if (capacity >= 500) return true;
  return false;
}

const criticalMinerals = [
  "lithium",
  "cobalt",
  "nickel",
  "copper",
  "graphite",
  "rare earth",
  "rare-earth",
  "manganese",
];

function isCriticalMineralMine(raw: RawFeatureNode): boolean {
  const props = raw.properties || {};
  if (props.strategic === true || props.tier === "strategic") return true;
  const commodity = (props.commodity || props.commodities || "").toString().toLowerCase();
  if (criticalMinerals.some((c) => commodity.includes(c))) return true;
  const output = Number(props.output_tonnes || props.production_tonnes || props.capacity_tonnes);
  if (!Number.isNaN(output) && output >= 100000) return true;
  return false;
}

function isMajorPort(raw: RawFeatureNode): boolean {
  const props = raw.properties || {};
  if (props.strategic === true || props.tier === "strategic" || props.rank === 1) return true;
  const teu = Number(props.teu || props.throughput_teu || props.annual_teu);
  if (!Number.isNaN(teu) && teu >= 2000000) return true;
  return false;
}

function isMajorAirport(raw: RawFeatureNode): boolean {
  const props = raw.properties || {};
  if (props.strategic === true || props.tier === "strategic" || props.category === "hub") return true;
  const pax = Number(props.passengers || props.passengers_millions);
  const cargo = Number(props.cargo_tonnes || props.cargo_tons || props.cargo_mt);
  if (!Number.isNaN(pax) && pax >= 10000000) return true;
  if (!Number.isNaN(cargo) && cargo >= 500000) return true;
  return false;
}

function isMajorOffshorePlatform(raw: RawFeatureNode): boolean {
  const props = raw.properties || {};
  if (props.strategic === true || props.tier === "strategic") return true;
  if (props.offshore === true) return true;
  const production = Number(props.production_bpd || props.production_boe || props.capacity_bpd);
  if (!Number.isNaN(production) && production >= 100000) return true;
  return false;
}

export function filterStrategicSubset(rawFeatures: RawFeature[], config: InfraSourceConfig): RawFeature[] {
  switch (config.infraType) {
    case "pipeline_gas_strategic":
    case "pipeline_oil_strategic":
      return rawFeatures.filter((f): f is RawFeatureSegment => f.kind === "segment").filter(isStrategicPipeline);
    case "port_container_major":
      return rawFeatures.filter((f): f is RawFeatureNode => f.kind === "node").filter(isMajorPort);
    case "airport_hub_major":
      return rawFeatures.filter((f): f is RawFeatureNode => f.kind === "node").filter(isMajorAirport);
    case "mine_critical_major":
      return rawFeatures.filter((f): f is RawFeatureNode => f.kind === "node").filter(isCriticalMineralMine);
    case "oil_gas_platform_offshore_major":
      return rawFeatures.filter((f): f is RawFeatureNode => f.kind === "node").filter(isMajorOffshorePlatform);
    default:
      return rawFeatures;
  }
}

function segmentDistanceKm(point: [number, number], a: [number, number], b: [number, number]): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const ax = toRad(a[0]);
  const ay = toRad(a[1]);
  const bx = toRad(b[0]);
  const by = toRad(b[1]);
  const px = toRad(point[0]);
  const py = toRad(point[1]);
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const c1 = vx * wx + vy * wy;
  const c2 = vx * vx + vy * vy;
  const t = c2 === 0 ? 0 : Math.max(0, Math.min(1, c1 / c2));
  const projX = ax + t * vx;
  const projY = ay + t * vy;
  const distRad = Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
  return distRad * 6371;
}

function polygonEdgeDistanceKm(point: [number, number], entry: CountryGeometry): number {
  let min = Infinity;
  for (const poly of entry.multipolygon) {
    for (const ring of poly) {
      for (let i = 0; i < ring.length - 1; i++) {
        const d = segmentDistanceKm(point, ring[i], ring[i + 1]);
        if (d < min) min = d;
      }
    }
  }
  return min;
}

function bboxDistanceKm(point: [number, number], bbox: [number, number, number, number]): number {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const clamped: [number, number] = [
    Math.min(Math.max(point[0], minLon), maxLon),
    Math.min(Math.max(point[1], minLat), maxLat),
  ];
  return haversineKm(point, clamped);
}

function findCountryForPoint(
  point: [number, number],
  countryIndex: Map<CountryID, CountryGeometry>,
  toleranceKm = 30
): CountryAssignment {
  for (const entry of countryIndex.values()) {
    if (geoContains(entry.geojson, point)) return { country_id: entry.id, offshore: false, onshore: true, distance_km: 0 };
  }
  let bestEdge: { id: CountryID; distance: number } | null = null;
  for (const entry of countryIndex.values()) {
    const bboxDist = entry.bbox ? bboxDistanceKm(point, entry.bbox) : Infinity;
    if (bboxDist > toleranceKm * 3) continue;
    if (bestEdge && bboxDist > bestEdge.distance && bboxDist > toleranceKm) continue;
    const d = polygonEdgeDistanceKm(point, entry);
    if (!bestEdge || d < bestEdge.distance) bestEdge = { id: entry.id, distance: d };
  }
  if (bestEdge && bestEdge.distance <= toleranceKm) {
    return { country_id: bestEdge.id, offshore: true, onshore: false, distance_km: bestEdge.distance };
  }

  // fallback to nearest centroid if coastal tolerance fails
  let best: { id: CountryID; distance: number } | null = null;
  for (const entry of countryIndex.values()) {
    const bounds = entry.geojson.bbox || computeBounds(entry.geojson);
    const centroid =
      entry.geojson.centroid || (bounds ? [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2] : null);
    if (!centroid) continue;
    const d = geoDistance([centroid[0], centroid[1]], point);
    if (!best || d < best.distance) {
      best = { id: entry.id, distance: d };
    }
  }
  if (best) return { country_id: best.id, offshore: true, onshore: false, distance_km: best.distance * 6371 };
  return { offshore: true, onshore: false };
}

function computeBounds(geometry: any): [number, number, number, number] | null {
  if (!geometry || !geometry.coordinates) return null;
  let minLon = Infinity,
    minLat = Infinity,
    maxLon = -Infinity,
    maxLat = -Infinity;
  const traverse = (coords: any) => {
    if (typeof coords[0] === "number") {
      const [lon, lat] = coords as [number, number];
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      return;
    }
    coords.forEach(traverse);
  };
  traverse(geometry.coordinates);
  if (!Number.isFinite(minLon) || !Number.isFinite(minLat) || !Number.isFinite(maxLon) || !Number.isFinite(maxLat)) {
    return null;
  }
  return [minLon, minLat, maxLon, maxLat];
}

function haversineKm(a: [number, number], b: [number, number]) {
  return geoDistance(a, b) * 6371;
}

function densifyLine(line: [number, number][], maxStepKm = 20): [number, number][] {
  if (line.length < 2) return line.slice();
  const out: [number, number][] = [line[0]];
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const dist = haversineKm(a, b);
    const steps = Math.max(1, Math.ceil(dist / maxStepKm));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

function countrySequenceForLine(
  line: InfrastructureLine,
  countryIndex: Map<CountryID, CountryGeometry>,
  stepKm = 20,
  coastalToleranceKm = 30
): CountryID[] {
  const seq: CountryID[] = [];
  const densified = densifyLine(line.geometry_geo, stepKm);
  let lastCountry: CountryID | undefined;
  densified.forEach((pt) => {
    if (lastCountry) {
      const entry = countryIndex.get(lastCountry);
      if (entry && geoContains(entry.geojson, pt)) {
        if (seq[seq.length - 1] !== lastCountry) seq.push(lastCountry);
        return;
      }
    }
    const assignment = findCountryForPoint(pt, countryIndex, coastalToleranceKm);
    if (assignment.country_id) {
      lastCountry = assignment.country_id;
      if (seq[seq.length - 1] !== assignment.country_id) seq.push(assignment.country_id);
    }
  });
  return seq;
}

function clipInternalLine(
  line: InfrastructureLine,
  countryIndex: Map<CountryID, CountryGeometry>
): ClippedInfrastructureLine | null {
  const country = line.country_id;
  const entry = country ? countryIndex.get(country) : undefined;
  if (!entry) return null;
  const clipped = clipInternalInfrastructure(line, entry.multipolygon);
  return clipped.clipped_segments.length === 0 ? null : clipped;
}

async function fetchDataset(
  config: InfraSourceConfig,
  options: InfraIngestOptions
): Promise<{ data?: any; error?: string }> {
  if (options.sourceData && options.sourceData[config.sourceId]) {
    return Promise.resolve({ data: options.sourceData[config.sourceId] });
  }
  const preferFixtures = options.useFixturesOnly ?? true;
  if (preferFixtures) {
    try {
      const data = await loadFixtureData(config, options);
      return { data };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (options.useFixturesOnly) return { error: message };
    }
  }
  const fetcher = options.fetcher ?? fetch;
  if (options.useFixturesOnly && typeof fetcher === "undefined") {
    return { error: "No fetcher available and fixtures are required" };
  }
  try {
    const response = await fetcher(config.url);
    if (!response?.ok) throw new Error(`Failed to fetch ${config.url}: ${response?.status}`);
    return { data: await response.json() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Ingest external infrastructure datasets into internal nodes and segments with enforced country coherence.
 */
export async function ingestInfrastructure(
  configs: InfraSourceConfig[],
  source: any,
  countries: Country[],
  options: InfraIngestOptions = {}
): Promise<IngestedInfrastructure> {
  const decoder = options.decoder ?? decodeGeometryByRef;
  const classificationSource = options.classificationSource ?? source;
  const classificationDecoder = options.classificationDecoder ?? decoder;
  const countryIndex =
    options.countryIndex ?? buildCountryGeoIndex(countries, classificationSource, classificationDecoder);
  const internalSegments: ClippedInfrastructureLine[] = [];
  const transnationalSegments: TransnationalInfrastructureLine[] = [];
  const nodes: InfrastructureNode[] = [];
  const errors: string[] = [];
  const coastalTolerance = options.coastalToleranceKm ?? 30;

  for (const config of configs) {
    const adapter = adapterRegistry[config.adapter];
    if (!adapter) throw new Error(`Adapter ${config.adapter} not registered`);
    const { data, error } = await fetchDataset(config, options);
    if (error || !data) {
      errors.push(`${config.sourceId}: ${error ?? "No data returned"}`);
      continue;
    }
    const prepared = config.preprocess ? config.preprocess(data) : data;
    const rawFeatures = filterStrategicSubset(adapter(prepared, config), config);
    rawFeatures.forEach((raw) => {
      if (raw.kind === "node") {
        const assignment = findCountryForPoint([raw.node.lon, raw.node.lat], countryIndex, coastalTolerance);
        if (assignment.country_id) raw.node.country_id = assignment.country_id;
        raw.node.offshore = assignment.offshore;
        if (assignment.distance_km !== undefined) raw.node.offshore_distance_km = assignment.distance_km;
        nodes.push(raw.node);
      } else {
        const sequence = countrySequenceForLine(raw.segment, countryIndex, 20, coastalTolerance);
        if (sequence.length === 0) return; // discard incoherent feature
        raw.segment.countries = sequence;
        if (sequence.length === 1) {
          raw.segment.country_id = sequence[0];
          const clipped = clipInternalLine(raw.segment, countryIndex);
          if (clipped) internalSegments.push(clipped);
        } else {
          transnationalSegments.push({
            id: raw.segment.id,
            countries: sequence,
            geometry_geo: raw.segment.geometry_geo,
            type: raw.segment.type,
            name: raw.segment.name,
            kind: raw.segment.kind,
            owner_raw: raw.segment.owner_raw,
            operator_raw: raw.segment.operator_raw,
          });
        }
      }
    });
  }

  return { internalSegments, transnationalSegments, nodes, errors };
}

export function ensureNodeWithinCountry(
  node: InfrastructureNode,
  countryIndex: Map<CountryID, CountryGeometry>
): boolean {
  if (!node.country_id) return false;
  const entry = countryIndex.get(node.country_id);
  if (!entry) return false;
  return geoContains(entry.geojson, [node.lon, node.lat]);
}

export function ensureSegmentWithinCountry(
  line: ClippedInfrastructureLine,
  countryIndex: Map<CountryID, CountryGeometry>
): boolean {
  const entry = countryIndex.get(line.country_id);
  if (!entry) return false;
  return line.clipped_segments.every((seg) => seg.every((pt) => geoContains(entry.geojson, pt)));
}
