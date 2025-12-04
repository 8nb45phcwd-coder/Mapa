import { existsSync, mkdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { resolve } from "path";
import { DEFAULT_FIXTURE_DIR, adapterRegistry, filterStrategicSubset, type InfraSourceConfig } from "./infrastructureIngest.js";
import { refreshInfraConfig, type RefreshInfraConfig } from "./refreshConfig.js";
import type { InfrastructureNodeType, InfrastructureSegmentType } from "world-map-engine";

export interface RefreshOptions {
  overwrite?: boolean;
  includeTypes?: (InfrastructureSegmentType | InfrastructureNodeType)[];
  outputDir?: string;
  fetcher?: typeof fetch;
  sourceData?: Record<string, any>;
}

interface NormalizedFeature {
  type: "Feature";
  geometry: any;
  properties: Record<string, any>;
}

function resolveOutputDir(outputDir?: string) {
  return outputDir ? resolve(outputDir) : fileURLToPath(DEFAULT_FIXTURE_DIR);
}

function roundCoord(value: number, precision = 5) {
  return Number(value.toFixed(precision));
}

function roundGeometryCoords(geometry: any, precision = 5): any {
  if (!geometry) return geometry;
  if (geometry.type === "Point") {
    const [lon, lat] = geometry.coordinates as [number, number];
    return { type: "Point", coordinates: [roundCoord(lon, precision), roundCoord(lat, precision)] };
  }
  const roundCoords = (coords: any): any => {
    if (typeof coords[0] === "number") {
      const [lon, lat] = coords as [number, number];
      return [roundCoord(lon, precision), roundCoord(lat, precision)];
    }
    return (coords as any[]).map(roundCoords);
  };
  return { ...geometry, coordinates: roundCoords(geometry.coordinates) };
}

function stableSortFeatures(features: NormalizedFeature[]): NormalizedFeature[] {
  return [...features].sort((a, b) => {
    const nameA = a.properties?.name ?? "";
    const nameB = b.properties?.name ?? "";
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
    const idA = a.properties?.id ?? "";
    const idB = b.properties?.id ?? "";
    return idA.localeCompare(idB);
  });
}

function sortKeys(value: any): any {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc: Record<string, any>, key) => {
        acc[key] = sortKeys(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function stableStringify(value: any) {
  return JSON.stringify(sortKeys(value), null, 2) + "\n";
}

async function fetchDataset(config: InfraSourceConfig, options: RefreshOptions): Promise<any> {
  if (options.sourceData && options.sourceData[config.sourceId]) {
    return options.sourceData[config.sourceId];
  }
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(config.url);
  if (!response.ok) throw new Error(`Failed to fetch ${config.url}: ${response.status}`);
  return response.json();
}

function rawToNormalized(raw: any, config: InfraSourceConfig): NormalizedFeature | null {
  if (raw.kind === "node") {
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: [raw.node.lon, raw.node.lat] },
      properties: {
        id: raw.node.id,
        infraType: raw.node.type,
        name: raw.node.name,
        owner: raw.node.owner_raw,
        operator: raw.node.operator_raw,
        ...raw.properties,
      },
    };
  }
  if (raw.kind === "segment") {
    return {
      type: "Feature",
      geometry: { type: "LineString", coordinates: raw.segment.geometry_geo },
      properties: {
        id: raw.segment.id,
        infraType: raw.segment.type,
        name: raw.segment.name,
        owner: raw.segment.owner_raw,
        operator: raw.segment.operator_raw,
        ...raw.properties,
      },
    };
  }
  return null;
}

function groupByFixture(
  configs: RefreshInfraConfig[],
  includeTypes?: (InfrastructureSegmentType | InfrastructureNodeType)[]
): RefreshInfraConfig[] {
  if (!includeTypes || includeTypes.length === 0) return configs;
  const allowed = new Set(includeTypes);
  return configs.filter((c) => allowed.has(c.infraType));
}

export async function refreshStrategicInfrastructure(options: RefreshOptions = {}): Promise<void> {
  const outputDir = resolveOutputDir(options.outputDir);
  mkdirSync(outputDir, { recursive: true });
  const grouped = new Map<string, NormalizedFeature[]>();
  const targets = groupByFixture(refreshInfraConfig, options.includeTypes);

  for (const config of targets) {
    const adapter = adapterRegistry[config.adapter];
    if (!adapter) throw new Error(`Adapter ${config.adapter} not registered`);
    const rawData = await fetchDataset(config, options);
    const preprocessed = config.preprocess ? config.preprocess(rawData) : rawData;
    const adapted = adapter(preprocessed, config);
    const strategic = filterStrategicSubset(adapted, config)
      .map((raw) => rawToNormalized(raw, config))
      .filter((f): f is NormalizedFeature => Boolean(f));

    const fixtureName = config.outputFixtureName;
    const existing = grouped.get(fixtureName) ?? [];
    grouped.set(fixtureName, existing.concat(strategic));
  }

  for (const [fixtureName, features] of grouped.entries()) {
    const sorted = stableSortFeatures(features).map((f) => ({
      ...f,
      geometry: roundGeometryCoords(f.geometry),
    }));
    const fc = { type: "FeatureCollection", features: sorted };
    const outPath = resolve(outputDir, fixtureName);
    if (!options.overwrite && existsSync(outPath)) {
      throw new Error(`Refusing to overwrite existing fixture at ${outPath}; pass overwrite: true to replace`);
    }
    writeFileSync(outPath, stableStringify(fc), "utf-8");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  refreshStrategicInfrastructure({ overwrite: true }).catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  });
}
