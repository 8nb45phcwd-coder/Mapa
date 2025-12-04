import tagsData from "../../marxist/data/tags.json";
import type { CountryId, MarxistTagEntry, MarxistTagMap } from "../types.js";
import { getMarxistSchemeById } from "./schemes.js";

const tagMap: MarxistTagMap = tagsData as MarxistTagMap;

export function getMarxistTags(countryId: CountryId): MarxistTagEntry | undefined {
  return tagMap[countryId];
}

export function getAllMarxistTags(): MarxistTagMap {
  return tagMap;
}

export function getCountriesWithMarxistGroup(schemeId: string, groupId: string): CountryId[] {
  return Object.entries(tagMap)
    .filter(([, tags]) => {
      const val = tags?.[schemeId];
      if (val === undefined || val === null) return false;
      if (Array.isArray(val)) return val.includes(groupId);
      return val === groupId;
    })
    .map(([cid]) => cid as CountryId);
}

export function validateMarxistTagEntry(countryId: CountryId): boolean {
  const entry = tagMap[countryId];
  if (!entry) return false;
  for (const [schemeId, value] of Object.entries(entry)) {
    const scheme = getMarxistSchemeById(schemeId);
    if (!scheme) return false;
    if (value === null || value === undefined) continue;
    if (typeof value === "string") {
      if (!scheme.groups.includes(value)) return false;
    } else if (Array.isArray(value)) {
      if (value.some((v) => !scheme.groups.includes(v))) return false;
    }
  }
  return true;
}
