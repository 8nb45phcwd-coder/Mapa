import baseTags from "../data/tags/base.json" assert { type: "json" };
import coreExamples from "../data/tags/core_examples.json" assert { type: "json" };
import schemesData from "../data/schemes.json" assert { type: "json" };
import countriesData from "../data/countries.json" assert { type: "json" };
import type { CountryId, CountryTags, CountryTagEntry, SchemeDefinition } from "./types.js";

const schemeDefs: SchemeDefinition[] = (schemesData as any).schemes as SchemeDefinition[];
const schemeMap = new Map<string, SchemeDefinition>(schemeDefs.map((s) => [s.id, s]));
const countryIds: CountryId[] = ((countriesData as any).countries as any[]).map((c) => c.id);

function normalizeEntry(entry: Record<string, any>): CountryTagEntry {
  const normalized: CountryTagEntry = {};
  schemeDefs.forEach((scheme) => {
    const val = entry[scheme.id];
    if (scheme.exclusive) {
      normalized[scheme.id] = val ?? null;
    } else {
      normalized[scheme.id] = Array.isArray(val) ? val : [];
    }
  });
  return normalized;
}

const merged: CountryTags = {};
const base = baseTags as Record<string, any>;
Object.entries(base).forEach(([id, entry]) => {
  merged[id] = normalizeEntry(entry as Record<string, any>);
});

Object.entries(coreExamples as Record<string, any>).forEach(([id, override]) => {
  const baseEntry = merged[id] ?? {};
  merged[id] = { ...baseEntry, ...normalizeEntry(override as Record<string, any>) };
});

countryIds.forEach((id) => {
  if (!merged[id]) {
    merged[id] = normalizeEntry({});
  }
});

export function getAllCountryTags(): CountryTags {
  return merged;
}

export function getCountryTags(id: CountryId): CountryTagEntry | undefined {
  return merged[id];
}

export function getCountriesByTag(schemeId: string, groupId: string): CountryId[] {
  const scheme = schemeMap.get(schemeId);
  if (!scheme) return [];
  return Object.entries(merged)
    .filter(([_, tags]) => {
      const value = tags[schemeId];
      if (scheme.exclusive) {
        return value === groupId;
      }
      return Array.isArray(value) && value.includes(groupId);
    })
    .map(([id]) => id as CountryId);
}
