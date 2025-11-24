import { describe, expect, it } from "vitest";
import { feature } from "topojson-client";
import world from "world-atlas/countries-50m.json";
import countriesData from "../base/data/countries.json" assert { type: "json" };
import baseSchemesData from "../base/data/schemes.json" assert { type: "json" };
import membershipsData from "../base/data/memberships.json" assert { type: "json" };
import languagesData from "../base/data/languages.json" assert { type: "json" };
import borderSemanticsData from "../base/data/border_semantics.json" assert { type: "json" };
import marxistSchemesData from "../marxist/data/schemes.json" assert { type: "json" };
import marxistTagsData from "../marxist/data/tags.json" assert { type: "json" };
import {
  getBaseCountries,
  getCountryMeta,
  loadCountries,
  loadSchemes,
  getBaseSchemeMembers,
  getCountryBaseTags,
  getAllCountryBaseTags,
  getBaseLanguages,
  getCountryLanguages,
  getBorderSemanticsBySegmentId,
  getBaseBorderSemantics,
  getMarxistTags,
} from "../src/index.js";

const expectedBaseSchemes = [
  "geo_political_blocs",
  "economic_blocs",
  "financial_structures",
  "regional_organizations",
  "currency_systems",
  "language_primary",
];

const countries = (countriesData as any).countries as any[];
const baseSchemes = (baseSchemesData as any).schemes as any[];
const memberships = (membershipsData as any).memberships as any[];

describe("world_model base scaffolding", () => {
  it("contains country metadata matching world-atlas coverage", () => {
    expect(countries.length).toBeGreaterThan(0);
    const numericToIso3 = new Map<string | undefined, string>();
    countries.forEach((c) => numericToIso3.set(c.iso_numeric?.padStart(3, "0"), c.id));
    const fc: any = feature(world as any, (world as any).objects.countries);
    fc.features.forEach((f: any) => {
      const id = f.id?.toString();
      if (!id) return;
      expect(numericToIso3.has(id)).toBe(true);
    });
  });

  it("exposes the base scheme catalogue and membership fixtures", () => {
    const schemeIds = baseSchemes.map((s) => s.id);
    expect(schemeIds).toEqual(expectedBaseSchemes);
    baseSchemes.forEach((s) => {
      expect(typeof s.label).toBe("string");
      expect(Array.isArray(s.groups)).toBe(true);
      expect(s.groups.length).toBeGreaterThan(0);
    });
    expect(memberships.length).toBeGreaterThan(0);
  });

  it("computes base tags for every country with language coverage", async () => {
    const tags = getAllCountryBaseTags();
    const countryIds = countries.map((c) => c.id);
    expect(Object.keys(tags).sort()).toEqual(countryIds.sort());
    countryIds.forEach((id) => {
      const entry = tags[id];
      expectedBaseSchemes.forEach((schemeId) => {
        expect(entry).toHaveProperty(schemeId);
      });
    });
    const portugal = getCountryBaseTags("PRT");
    expect(portugal?.language_primary).toBe("pt");
  });
});

describe("world_model API behaviour", () => {
  it("loads countries and metadata for known ids", async () => {
    const loaded = await loadCountries();
    expect(loaded.length).toBe(countries.length);
    const portugal = getCountryMeta("PRT");
    expect(portugal?.name_en).toBe("Portugal");
    expect(getCountryLanguages("PRT")).toContain("pt");
  });

  it("provides scheme memberships and base semantics", async () => {
    const schemeCatalog = await loadSchemes();
    expect(schemeCatalog.schemes.map((s) => s.id)).toEqual(expectedBaseSchemes);
    const natoMembers = getBaseSchemeMembers("geo_political_blocs", "nato");
    expect(natoMembers).toContain("PRT");
    const semantics = getBaseBorderSemantics();
    expect(semantics.length).toBe((borderSemanticsData as any).segments.length);
    const prtEsp = getBorderSemanticsBySegmentId("ESP-PRT-0");
    expect(prtEsp?.tags).toContain("schengen_internal");
  });

  it("retains marxist tags but keeps them separate from base facts", () => {
    const marxistSchemes = (marxistSchemesData as any).schemes as any[];
    expect(marxistSchemes.map((s) => s.id)).toContain("world_system_position");
    const marxistTags = marxistTagsData as Record<string, any>;
    expect(Object.keys(marxistTags)).toContain("PRT");
    const prt = getMarxistTags("PRT");
    expect(prt?.world_system_position).toBe("core_dependent");
  });
});

describe("language metadata", () => {
  it("exposes language catalog and country membership", () => {
    const languages = getBaseLanguages();
    expect(languages.length).toBe((languagesData as any).languages.length);
    const portuguese = languages.find((l) => l.code === "pt");
    expect(portuguese?.country_ids).toContain("PRT");
  });
});
