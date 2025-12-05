import type { Country, LodGeometrySet, LodLevel } from "../types.js";

export type LODLevelName = "low" | "medium" | "high";

const LOD_RESOLUTIONS: Record<LODLevelName, string> = {
  low: "110m",
  medium: "50m",
  high: "10m",
};

function isNetworkDisabled(): boolean {
  return typeof process !== "undefined" && process.env?.WORLD_MAP_NO_NET === "1";
}

function getBaseUrl(): string {
  const metaBase = typeof import.meta !== "undefined" ? (import.meta as any)?.env?.BASE_URL : undefined;
  if (metaBase) return metaBase;
  if (typeof process !== "undefined" && process.env?.VITE_BASE_URL) return process.env.VITE_BASE_URL;
  return "/";
}

function normaliseBase(base: string): string {
  if (!base.endsWith("/")) return `${base}/`;
  return base;
}

function bundledTopologyUrl(resolution: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  const base = normaliseBase(getBaseUrl());
  return new URL(`${base}topology/countries-${resolution}.json`, window.location.href).toString();
}

async function loadBundledAtlas(
  resolution: string,
  fetcher: typeof fetch
): Promise<{ topojson?: any; error?: string }> {
  const url = bundledTopologyUrl(resolution);
  if (!url) return {};
  try {
    const res = await fetcher(url);
    if (!res.ok) {
      return { error: `Bundled topology fetch failed: ${res.status}` };
    }
    return { topojson: await res.json() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

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
    const mod = await import(`world-atlas/countries-${resolution}.json`);
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

  const fetcher = options.fetcher ?? fetch;
  const bundled = await loadBundledAtlas(resolution, fetcher);
  if (bundled.topojson) {
    return { level: name, resolution, topojson: bundled.topojson };
  }

  const local = await loadLocalAtlas(resolution);
  if (local) {
    return { level: name, resolution, topojson: local };
  }

  if (isNetworkDisabled()) {
    const bundledErr = bundled.error ? ` Bundled fetch failed: ${bundled.error}.` : "";
    throw new Error(`Network fetches are disabled (WORLD_MAP_NO_NET=1).${bundledErr}`);
  }

  const url = `https://cdn.jsdelivr.net/npm/world-atlas@2/countries-${resolution}.json`;
  try {
    const res = await fetcher(url);
    if (!res.ok) throw new Error(`Failed to load LOD dataset ${resolution}: ${res.statusText}`);
    const topojson = await res.json();
    return { level: name, resolution, topojson };
  } catch (err) {
    const bundledErr = bundled.error ? ` Bundled fetch failed: ${bundled.error}.` : "";
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to load LOD dataset ${resolution}. ${message}.${bundledErr}`);
  }
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
