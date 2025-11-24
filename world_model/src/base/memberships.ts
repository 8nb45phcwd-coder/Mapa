import membershipsData from "../../base/data/memberships.json" assert { type: "json" };
import type {
  CountryId,
  CountryTags,
  MembershipCatalog,
  MembershipEntry,
  SchemeDefinition,
  CountryTagMap,
} from "../types.js";
import { getBaseCountries } from "./countries.js";
import { getBaseLanguages } from "./languages.js";
import { getBaseSchemes, getBaseSchemeById } from "./schemes.js";

const membershipCatalog: MembershipCatalog = membershipsData as MembershipCatalog;
const membershipEntries: MembershipEntry[] = membershipCatalog.memberships;
const membershipBySchemeAndGroup = new Map<string, MembershipEntry>();
for (const m of membershipEntries) {
  membershipBySchemeAndGroup.set(`${m.scheme}:${m.group}`, m);
}

let countryTagCache: CountryTagMap | null = null;

function initCountryTags(): CountryTagMap {
  if (countryTagCache) return countryTagCache;
  const schemes = getBaseSchemes();
  const tagMap: CountryTagMap = {};
  for (const country of getBaseCountries()) {
    const tags: CountryTags = {};
    for (const scheme of schemes) {
      tags[scheme.id] = scheme.exclusive ? null : [];
    }
    tagMap[country.id] = tags;
  }

  for (const entry of membershipEntries) {
    const scheme: SchemeDefinition | undefined = getBaseSchemeById(entry.scheme);
    if (!scheme) continue;
    for (const cid of entry.members) {
      const existing = tagMap[cid];
      if (!existing) continue;
      if (scheme.exclusive) {
        existing[scheme.id] = entry.group;
      } else {
        const arr = existing[scheme.id] as string[];
        arr.push(entry.group);
      }
    }
  }

  // language primary derived from language catalog
  const langScheme = getBaseSchemeById("language_primary");
  if (langScheme) {
    for (const lang of getBaseLanguages()) {
      for (const cid of lang.country_ids) {
        const entry = tagMap[cid];
        if (!entry) continue;
        entry[langScheme.id] = lang.code;
      }
    }
  }

  countryTagCache = tagMap;
  return tagMap;
}

export function getBaseMemberships(): MembershipEntry[] {
  return membershipEntries;
}

export function getBaseSchemeMembers(schemeId: string, groupId: string): CountryId[] {
  return membershipBySchemeAndGroup.get(`${schemeId}:${groupId}`)?.members ?? [];
}

export function getCountryBaseTags(countryId: CountryId): CountryTags | undefined {
  const tags = initCountryTags();
  return tags[countryId];
}

export function getAllCountryBaseTags(): CountryTagMap {
  return initCountryTags();
}
