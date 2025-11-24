import { beforeAll, describe, expect, it } from "vitest";
import world50 from "world-atlas/countries-50m.json";
import world110 from "world-atlas/countries-110m.json";
import { initializeBorderIndex, getAllBorderSegments, formatBorderSegmentId } from "../../engine/src/index.js";
import type { Country } from "../../engine/src/types.js";
import countriesData from "../base/data/countries.json" assert { type: "json" };
import baseSchemesData from "../base/data/schemes.json" assert { type: "json" };
import membershipsData from "../base/data/memberships.json" assert { type: "json" };
import languagesData from "../base/data/languages.json" assert { type: "json" };
import borderSemanticsData from "../base/data/border_semantics.json" assert { type: "json" };
import marxistSchemesData from "../marxist/data/schemes.json" assert { type: "json" };
import marxistTagsData from "../marxist/data/tags.json" assert { type: "json" };
import {
  getBaseSchemes,
  getAllCountryBaseTags,
  getBaseBorderSemantics,
  getBaseSchemeMembers,
} from "../src/index.js";
import type { CountryId, SchemeDefinition } from "../src/types.js";

const countryList = (countriesData as any).countries as Array<{
  id: string;
  iso_numeric: string;
  name_en: string;
}>;
const countrySet = new Set<CountryId>(countryList.map((c) => c.id as CountryId));
const baseSchemeDefs = (baseSchemesData as any).schemes as SchemeDefinition[];
const baseSchemeMap = new Map<string, SchemeDefinition>(baseSchemeDefs.map((s) => [s.id, s]));
const marxistSchemes = (marxistSchemesData as any).schemes as SchemeDefinition[];
const marxistSchemeMap = new Map<string, SchemeDefinition>(marxistSchemes.map((s) => [s.id, s]));

let allSegments: ReturnType<typeof getAllBorderSegments> = [];
let segmentIdSet: Set<string>;

beforeAll(() => {
  const engineCountries: Country[] = countryList.map((c) => ({
    country_id: c.id,
    name: c.name_en,
    geometry_ref: Number.parseInt(c.iso_numeric, 10).toString(),
  }));
  initializeBorderIndex({ countries: engineCountries, topojsonHigh: world50 as any, topojsonLow: world110 as any });
  allSegments = getAllBorderSegments();
  segmentIdSet = new Set(allSegments.map((seg) => seg.segment_id ?? formatBorderSegmentId(seg.id)));
});

describe("world_model consistency", () => {
  it("ensures ids, schemes, and memberships are internally consistent", () => {
    const memberships = (membershipsData as any).memberships as Array<{ scheme: string; group: string; members: string[] }>;
    memberships.forEach((entry) => {
      const scheme = baseSchemeMap.get(entry.scheme);
      expect(scheme, `missing scheme ${entry.scheme}`).toBeDefined();
      expect(scheme?.groups).toContain(entry.group);
      entry.members.forEach((cid) => expect(countrySet.has(cid as CountryId)).toBe(true));
    });

    // base tags coherence
    const tags = getAllCountryBaseTags();
    const expectedSchemes = getBaseSchemes();
    expect(Object.keys(tags).sort()).toEqual([...countrySet].sort());
    Object.entries(tags).forEach(([cid, entry]) => {
      expect(countrySet.has(cid as CountryId)).toBe(true);
      expectedSchemes.forEach((scheme) => {
        const val = (entry as any)[scheme.id];
        if (scheme.exclusive) {
          if (val !== null && val !== undefined) {
            expect(typeof val === "string").toBe(true);
            expect(scheme.groups).toContain(val as string);
          }
        } else {
          expect(Array.isArray(val)).toBe(true);
          (val as string[]).forEach((group) => expect(scheme.groups).toContain(group));
        }
      });
    });

    // languages reference valid countries
    (languagesData as any).languages.forEach((lang: any) => {
      (lang.country_ids as string[]).forEach((cid) => {
        expect(countrySet.has(cid as CountryId)).toBe(true);
      });
    });

    // marxist tags reference valid schemes + countries
    Object.entries(marxistTagsData as Record<string, Record<string, string | null>>).forEach(([cid, entry]) => {
      expect(countrySet.has(cid as CountryId)).toBe(true);
      Object.entries(entry).forEach(([schemeId, value]) => {
        const scheme = marxistSchemeMap.get(schemeId);
        expect(scheme, `missing marxist scheme ${schemeId}`).toBeDefined();
        if (value !== null && value !== undefined) {
          expect(scheme?.groups).toContain(value as string);
        }
      });
    });
  });

  it("keeps border semantics aligned with extracted segments", () => {
    const semantics = getBaseBorderSemantics();
    const knownGaps = new Set(["ESP-PRT-1", "FRA-GBR-0"]);
    const missing = (borderSemanticsData as any).segments
      .filter((entry: any) => !segmentIdSet.has(entry.segment_id))
      .filter((entry: any) => !knownGaps.has(entry.segment_id));
    if (missing.length) {
      console.warn(`Missing border semantics segments: ${missing.map((m: any) => m.segment_id).join(",")}`);
    }
    expect(missing).toEqual([]);
  });

  it("logs coverage summaries for auditing", () => {
    const tags = getAllCountryBaseTags();
    const totalCountries = Object.keys(tags).length;
    getBaseSchemes().forEach((scheme) => {
      let tagged = 0;
      Object.values(tags).forEach((entry: any) => {
        const val = entry[scheme.id];
        const hasTag = scheme.exclusive ? val !== null && val !== undefined : Array.isArray(val) && val.length > 0;
        if (hasTag) tagged += 1;
      });
      const missing = totalCountries - tagged;
      console.info(`[scheme:${scheme.id}] tagged=${tagged} missing=${missing}`);
    });

    const semanticSet = new Set(getBaseBorderSemantics().map((s) => s.segment_id));
    const withoutSemantics = allSegments.filter((seg) => !semanticSet.has(seg.segment_id)).length;
    console.info(`border segments without semantics: ${withoutSemantics}`);

    expect(true).toBe(true);
  });
});

describe("factual sanity spot-checks", () => {
  const NATO_MEMBERS = ["USA", "PRT", "DEU", "FRA", "GBR"];
  const SCHENGEN_MEMBERS = ["PRT", "ESP", "DEU", "FRA", "NLD"];
  const WTO_MEMBERS = ["USA", "PRT", "BRA", "CHN", "IND"];

  it("validates NATO list for key members", () => {
    const nato = new Set(getBaseSchemeMembers("geo_political_blocs", "nato"));
    NATO_MEMBERS.forEach((cid) => expect(nato.has(cid as CountryId)).toBe(true));
  });

  it("validates Schengen membership for representative set", () => {
    const schengen = new Set(getBaseSchemeMembers("regional_organizations", "schengen_area"));
    SCHENGEN_MEMBERS.forEach((cid) => expect(schengen.has(cid as CountryId)).toBe(true));
    expect(schengen.has("USA" as CountryId)).toBe(false);
  });

  it("validates WTO membership for known economies", () => {
    const wto = new Set(getBaseSchemeMembers("financial_structures", "wto_member"));
    WTO_MEMBERS.forEach((cid) => expect(wto.has(cid as CountryId)).toBe(true));
  });
});
