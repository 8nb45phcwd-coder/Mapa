import {
  getAllCountryBaseTags,
  getBaseBorderSemantics,
  getBaseCountries,
  getBaseMemberships,
  getBaseSchemes,
} from "./base/index.js";
import type {
  BorderSemanticEntry,
  CountryId,
  CountryTags,
  SchemeDefinition,
} from "./types.js";

export interface SchemeCoverage {
  schemeId: string;
  totalGroups: number;
  countriesTagged: number;
  emptyGroups: string[];
}

export interface BorderSemanticsCoverage {
  totalTaggedSegments: number;
  uniquePairs: number;
  examplePairs: Array<{ pair: string; tags: string[] }>;
}

export interface CountryCoverage {
  countryId: CountryId;
  hasPrimaryLanguage: boolean;
  taggedSchemes: number;
}

export interface WorldModelCoverage {
  totalCountries: number;
  countriesWithPrimaryLanguage: number;
  countriesWithAnyTag: number;
  schemeCoverage: SchemeCoverage[];
  borderCoverage: BorderSemanticsCoverage;
  countries: CountryCoverage[];
}

const PRIMARY_LANGUAGE_SCHEME = "language_primary";

function hasTag(value: CountryTags[string]): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return value !== null && value !== undefined;
}

function computeSchemeCoverage(
  schemes: SchemeDefinition[],
  countryTags: Record<CountryId, CountryTags>,
  membershipsByGroup: Map<string, string[]>,
  countryIds: CountryId[]
): SchemeCoverage[] {
  return schemes.map((scheme) => {
    const taggedCountries = new Set<CountryId>();
    const groupsWithTags = new Set<string>();
    for (const cid of countryIds) {
      const tagValue = countryTags[cid]?.[scheme.id];
      if (!hasTag(tagValue)) continue;
      taggedCountries.add(cid);
      if (Array.isArray(tagValue)) {
        tagValue.forEach((g) => groupsWithTags.add(g));
      } else if (typeof tagValue === "string") {
        groupsWithTags.add(tagValue);
      }
    }

    const emptyGroups = scheme.groups.filter((group) => {
      const members = membershipsByGroup.get(`${scheme.id}:${group}`) ?? [];
      if (members.length > 0) {
        groupsWithTags.add(group);
        return false;
      }
      return !groupsWithTags.has(group);
    });

    return {
      schemeId: scheme.id,
      totalGroups: scheme.groups.length,
      countriesTagged: taggedCountries.size,
      emptyGroups,
    };
  });
}

function computeBorderCoverage(segments: BorderSemanticEntry[]): BorderSemanticsCoverage {
  const pairTags = new Map<string, Set<string>>();

  for (const segment of segments) {
    const tokens = segment.segment_id.split("-");
    if (tokens.length < 2) continue;
    const [a, b] = tokens;
    const sortedPair = [a, b].sort().join("-");
    const existing = pairTags.get(sortedPair) ?? new Set<string>();
    segment.tags.forEach((t) => existing.add(t));
    pairTags.set(sortedPair, existing);
  }

  const preferredPairs = ["ESP-PRT", "FRA-GBR"];
  const examplePairs: Array<{ pair: string; tags: string[] }> = [];

  for (const pair of preferredPairs) {
    const tags = pairTags.get(pair);
    if (tags) {
      examplePairs.push({ pair, tags: Array.from(tags).sort() });
    }
  }

  if (examplePairs.length < 3) {
    for (const [pair, tags] of pairTags.entries()) {
      if (examplePairs.find((p) => p.pair === pair)) continue;
      examplePairs.push({ pair, tags: Array.from(tags).sort() });
      if (examplePairs.length >= 3) break;
    }
  }

  return {
    totalTaggedSegments: segments.length,
    uniquePairs: pairTags.size,
    examplePairs,
  };
}

export function computeWorldModelCoverage(): WorldModelCoverage {
  const countries = getBaseCountries();
  const schemes = getBaseSchemes();
  const memberships = getBaseMemberships();
  const countryTags = getAllCountryBaseTags();
  const borderSegments = getBaseBorderSemantics();

  const membershipsByGroup = new Map<string, string[]>();
  for (const entry of memberships) {
    membershipsByGroup.set(`${entry.scheme}:${entry.group}`, entry.members);
  }

  const countryIds = countries.map((c) => c.id);
  const schemeCoverage = computeSchemeCoverage(schemes, countryTags, membershipsByGroup, countryIds);

  const countriesCoverage: CountryCoverage[] = countryIds.map((cid) => {
    const tags = countryTags[cid] ?? {};
    const taggedSchemes = schemes.reduce((count, scheme) => count + (hasTag(tags[scheme.id]) ? 1 : 0), 0);
    const hasPrimaryLanguage = hasTag(tags[PRIMARY_LANGUAGE_SCHEME]);
    return { countryId: cid, hasPrimaryLanguage, taggedSchemes };
  });

  const countriesWithPrimaryLanguage = countriesCoverage.filter((c) => c.hasPrimaryLanguage).length;
  const countriesWithAnyTag = countriesCoverage.filter((c) => c.taggedSchemes > 0).length;

  const borderCoverage = computeBorderCoverage(borderSegments);

  return {
    totalCountries: countries.length,
    countriesWithPrimaryLanguage,
    countriesWithAnyTag,
    schemeCoverage,
    borderCoverage,
    countries: countriesCoverage,
  };
}
