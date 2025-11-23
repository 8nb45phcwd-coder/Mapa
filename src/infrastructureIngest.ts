import { feature } from "topojson-client";
import { geoContains, geoDistance } from "d3-geo";
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
} from "./types.js";
import { decodeGeometryByRef } from "./geometry.js";
import { clipInternalInfrastructure } from "./infrastructure.js";

export interface InfraSourceConfig {
  infraType: InfrastructureSegmentType | InfrastructureNodeType;
  sourceId: string;
  url: string;
  adapter: string;
}

export interface InfraIngestOptions {
  fetcher?: typeof fetch;
  decoder?: (source: any, ref: string) => any;
  sourceData?: Record<string, any>;
}

export interface IngestedInfrastructure {
  internalSegments: ClippedInfrastructureLine[];
  transnationalSegments: TransnationalInfrastructureLine[];
  nodes: InfrastructureNode[];
}

// Phase 1 sources use bundled GeoJSON samples derived from open/public datasets (pipelines, cables, ports, landings, mines,
// airports). Callers can override these URLs with richer datasets via the `configs` parameter.
export const defaultInfraSources: InfraSourceConfig[] = [
  {
    infraType: "pipeline_gas",
    sourceId: "global_pipelines_gas",
    url: new URL("./data/infra-phase1-lines.geojson", import.meta.url).href,
    adapter: "geojson_line",
  },
  {
    infraType: "pipeline_oil",
    sourceId: "global_pipelines_oil",
    url: new URL("./data/infra-phase1-lines.geojson", import.meta.url).href,
    adapter: "geojson_line",
  },
  {
    infraType: "subsea_cable",
    sourceId: "global_subsea_cables",
    url: new URL("./data/infra-phase1-lines.geojson", import.meta.url).href,
    adapter: "geojson_line",
  },
  {
    infraType: "cable_landing",
    sourceId: "global_cable_landings",
    url: new URL("./data/infra-phase1-nodes.geojson", import.meta.url).href,
    adapter: "geojson_point",
  },
  {
    infraType: "port_container",
    sourceId: "global_ports",
    url: new URL("./data/infra-phase1-nodes.geojson", import.meta.url).href,
    adapter: "geojson_point",
  },
  {
    infraType: "power_plant_strategic",
    sourceId: "global_power_plants",
    url: new URL("./data/infra-phase1-nodes.geojson", import.meta.url).href,
    adapter: "geojson_point",
  },
  {
    infraType: "mine_critical",
    sourceId: "global_mines",
    url: new URL("./data/infra-phase1-nodes.geojson", import.meta.url).href,
    adapter: "geojson_point",
  },
  {
    infraType: "cargo_airport",
    sourceId: "global_airports",
    url: new URL("./data/infra-phase1-nodes.geojson", import.meta.url).href,
    adapter: "geojson_point",
  },
];

export interface CountryGeometry {
  id: CountryID;
  geojson: any;
  multipolygon: GeoMultiPolygon;
}

interface RawFeatureSegment {
  kind: "segment";
  segment: InfrastructureLine;
}

interface RawFeatureNode {
  kind: "node";
  node: InfrastructureNode;
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
    idx.set(country.country_id, {
      id: country.country_id,
      geojson: geom,
      multipolygon: geometryToMultiPolygon(geom),
    });
  }
  return idx;
}

function ensureWgs84Coord(coord: [number, number]) {
  const [lon, lat] = coord;
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
    throw new Error(`Coordinate ${coord} not in WGS84 bounds`);
  }
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
  const results: RawFeature[] = [];
  features.forEach((f, idx) => {
    if (!f.geometry || (f.geometry.type !== "LineString" && f.geometry.type !== "MultiLineString")) return;
    const lines: [number, number][][] =
      f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates;
    lines.forEach((coords, lineIdx) => {
      const ring = coords as [number, number][];
      ring.forEach(ensureWgs84Coord);
      const id = (f.id ?? f.properties?.id ?? `${config.sourceId}-${idx}-${lineIdx}`).toString();
      const name = (f.properties?.name ?? f.properties?.Name ?? config.sourceId).toString();
      const inferredType = (f.properties?.infraType || f.properties?.type || config.infraType) as
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
        },
      });
    });
  });
  return results;
}

function adaptPointFeatures(data: any, config: InfraSourceConfig): RawFeature[] {
  const features = collectGeoJSONFeatures(data);
  const results: RawFeature[] = [];
  features.forEach((f, idx) => {
    if (!f.geometry || f.geometry.type !== "Point") return;
    const coords = f.geometry.coordinates as [number, number];
    ensureWgs84Coord([coords[0], coords[1]]);
    const id = (f.id ?? f.properties?.id ?? `${config.sourceId}-${idx}`).toString();
    const name = (f.properties?.name ?? f.properties?.Name ?? config.sourceId).toString();
    const inferredType = (f.properties?.infraType || f.properties?.type || config.infraType) as InfrastructureNodeType;
    results.push({
      kind: "node",
      node: {
        id,
        country_id: undefined,
        type: inferredType,
        name,
        lon: coords[0],
        lat: coords[1],
        properties: f.properties,
      },
    });
  });
  return results;
}

const adapterRegistry: Record<string, (data: any, config: InfraSourceConfig) => RawFeature[]> = {
  geojson_line: adaptLineFeatures,
  geojson_point: adaptPointFeatures,
};

function findCountryForPoint(
  point: [number, number],
  countryIndex: Map<CountryID, CountryGeometry>,
  toleranceDeg = 0.25
): CountryID | undefined {
  for (const entry of countryIndex.values()) {
    if (geoContains(entry.geojson, point)) return entry.id;
  }
  // tolerance: choose nearest centroid within tolerance if not strictly inside
  let best: { id: CountryID; distance: number } | null = null;
  for (const entry of countryIndex.values()) {
    const bounds = entry.geojson.bbox || computeBounds(entry.geojson);
    const centroid =
      entry.geojson.centroid || (bounds ? [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2] : null);
    const candidate = centroid;
    if (!candidate) continue;
    const d = geoDistance([candidate[0], candidate[1]], point);
    if (!best || d < best.distance) {
      best = { id: entry.id, distance: d };
    }
  }
  if (best && best.distance * (180 / Math.PI) <= toleranceDeg) return best.id;
  return undefined;
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

function countrySequenceForLine(
  line: InfrastructureLine,
  countryIndex: Map<CountryID, CountryGeometry>
): CountryID[] {
  const seq: CountryID[] = [];
  line.geometry_geo.forEach((pt) => {
    const country = findCountryForPoint(pt, countryIndex);
    if (country && seq[seq.length - 1] !== country) seq.push(country);
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

function fetchDataset(config: InfraSourceConfig, options: InfraIngestOptions): Promise<any> {
  if (options.sourceData && options.sourceData[config.sourceId]) {
    return Promise.resolve(options.sourceData[config.sourceId]);
  }
  const fetcher = options.fetcher ?? fetch;
  return fetcher(config.url).then((r: any) => {
    if (!r.ok) throw new Error(`Failed to fetch ${config.url}: ${r.status}`);
    return r.json();
  });
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
  const countryIndex = buildCountryGeoIndex(countries, source, decoder);
  const internalSegments: ClippedInfrastructureLine[] = [];
  const transnationalSegments: TransnationalInfrastructureLine[] = [];
  const nodes: InfrastructureNode[] = [];

  for (const config of configs) {
    const adapter = adapterRegistry[config.adapter];
    if (!adapter) throw new Error(`Adapter ${config.adapter} not registered`);
    const data = await fetchDataset(config, options);
    const rawFeatures = adapter(data, config);
    rawFeatures.forEach((raw) => {
      if (raw.kind === "node") {
        const country = findCountryForPoint([raw.node.lon, raw.node.lat], countryIndex);
        if (country) raw.node.country_id = country;
        nodes.push(raw.node);
      } else {
        const sequence = countrySequenceForLine(raw.segment, countryIndex);
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
          });
        }
      }
    });
  }

  return { internalSegments, transnationalSegments, nodes };
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
