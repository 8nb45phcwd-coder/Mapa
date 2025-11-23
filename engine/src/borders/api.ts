import type { Country, CountryID } from "../types.js";
import { extractBorderSegments } from "./extract.js";
import { canonicalPair } from "./types.js";
import type { BorderSegment } from "./types.js";

export interface BorderIndex {
  byCountry: Map<CountryID, BorderSegment[]>;
  byPair: Map<string, BorderSegment[]>;
  segments: BorderSegment[];
}

let BORDER_CACHE: BorderIndex | null = null;

function buildIndex(segments: BorderSegment[]): BorderIndex {
  const byCountry = new Map<CountryID, BorderSegment[]>();
  const byPair = new Map<string, BorderSegment[]>();
  segments.forEach((seg) => {
    const push = (map: Map<string, BorderSegment[]>, key: string) => {
      const list = map.get(key);
      if (list) list.push(seg);
      else map.set(key, [seg]);
    };
    push(byCountry, seg.country_a);
    if (seg.country_b !== "SEA") push(byCountry, seg.country_b);
    push(byPair, `${seg.country_a}-${seg.country_b}`);
  });
  return { byCountry, byPair, segments };
}

export interface InitializeBorderOptions {
  countries: Country[];
  topojsonHigh: any;
  topojsonLow?: any;
}

export function initializeBorderIndex(options: InitializeBorderOptions): BorderIndex {
  const { countries, topojsonHigh, topojsonLow } = options;
  const { segments } = extractBorderSegments(countries, topojsonHigh, topojsonLow);
  BORDER_CACHE = buildIndex(segments);
  return BORDER_CACHE;
}

function assertCache(): BorderIndex {
  if (!BORDER_CACHE) {
    throw new Error("Border index not initialized. Call initializeBorderIndex first.");
  }
  return BORDER_CACHE;
}

export function getBorderIndex(): BorderIndex {
  return assertCache();
}

export function getAllBorderSegments(): BorderSegment[] {
  return assertCache().segments;
}

export function getBorderSegmentsForCountry(country: CountryID): BorderSegment[] {
  const cache = assertCache();
  return cache.byCountry.get(country) ?? [];
}

export function getBorderSegmentsBetween(a: CountryID, b: CountryID): BorderSegment[] {
  const { key, a: ca, b: cb } = canonicalPair(a, b);
  const cache = assertCache();
  return cache.byPair.get(`${ca}-${cb}`) ?? cache.byPair.get(key) ?? [];
}

