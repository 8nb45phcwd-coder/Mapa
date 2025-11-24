import type { Country, LodGeometrySet, LodLevel } from "../types.js";

export type LODLevelName = "low" | "medium" | "high";

const LOD_RESOLUTIONS: Record<LODLevelName, string> = {
  low: "110m",
  medium: "50m",
  high: "10m",
};

export interface LoadLODOptions {
  fetcher?: typeof fetch;
  preloaded?: Record<string, any>;
}

function levelName(level: LodLevel): LODLevelName {
  if (typeof level === "number") {
    if (level >= 2) return "high";
    if (level >= 1) return "medium";
    return "low";
  }
  if (level === "high") return "high";
  if (level === "medium") return "medium";
  return "low";
}

export function selectLOD(zoom: number): LODLevelName {
  if (zoom >= 3) return "high";
  if (zoom >= 1.5) return "medium";
  return "low";
}

async function loadLocalAtlas(resolution: string): Promise<any | undefined> {
  try {
    const mod = await import(`world-atlas/countries-${resolution}.json`, { assert: { type: "json" } } as any);
    return (mod as any).default ?? mod;
  } catch (err) {
    return undefined;
  }
}

export async function loadGeometryForLOD(level: LodLevel, options: LoadLODOptions = {}): Promise<LodGeometrySet> {
  const name = levelName(level);
  const resolution = LOD_RESOLUTIONS[name];
  const preloaded = options.preloaded?.[resolution];
  if (preloaded) {
    return { level: name, resolution, topojson: preloaded };
  }
  const local = await loadLocalAtlas(resolution);
  if (local) {
    return { level: name, resolution, topojson: local };
  }
  const fetcher = options.fetcher ?? fetch;
  const url = `https://cdn.jsdelivr.net/npm/world-atlas@2/countries-${resolution}.json`;
  const res = await fetcher(url);
  if (!res.ok) throw new Error(`Failed to load LOD dataset ${resolution}: ${res.statusText}`);
  const topojson = await res.json();
  return { level: name, resolution, topojson };
}

export function mapCountriesToLODGeometry(
  countries: Country[],
  lodGeometry: any,
  decoder: (src: any, ref: string) => any
): Map<string, any> {
  const out = new Map<string, any>();
  countries.forEach((c) => {
    const geom = decoder(lodGeometry, c.geometry_ref);
    if (geom) out.set(c.country_id, geom.geometry ?? geom);
  });
  return out;
}

export { LOD_RESOLUTIONS };
