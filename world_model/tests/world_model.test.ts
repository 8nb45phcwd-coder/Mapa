import { describe, expect, it } from "vitest";
import { feature } from "topojson-client";
import world from "world-atlas/countries-50m.json";
import countriesData from "../data/countries.json" assert { type: "json" };
import schemesData from "../data/schemes.json" assert { type: "json" };
import baseTags from "../data/tags/base.json" assert { type: "json" };
import languagesData from "../data/languages.json" assert { type: "json" };
import borderSemanticsData from "../data/border_semantics.json" assert { type: "json" };
import {
  getAllCountries,
  getCountryMeta,
  loadCountries,
  getAllSchemes,
  loadSchemes,
  getAllCountryTags,
  getCountryTagSnapshot,
  getCountriesByTag,
  loadCountryTags,
  getAllLanguages,
  getLanguageByCode,
  getCountriesByLanguage,
  getSharedLanguageNeighbours,
  getBorderSemantics,
  getBorderSemanticsBySegmentId,
  getSegmentsBySemanticTag,
} from "../src/index.js";

const expectedSchemes = [
  "world_system_position",
  "global_north_south",
  "geo_political_blocs",
  "economic_blocs",
  "financial_structures",
  "regional_organizations",
  "currency_systems",
  "language_primary",
];

describe("world model data scaffolding", () => {
  it("contains country metadata matching engine world-atlas coverage", () => {
    const countries: any[] = (countriesData as any).countries as any[];
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

  it("ensures each country entry has required neutral fields", () => {
    ((countriesData as any).countries as any[]).forEach((c) => {
      expect(typeof c.id).toBe("string");
      expect(c.id.length).toBe(3);
      expect(c.name_en.length).toBeGreaterThan(0);
      expect(c.name_native.length).toBeGreaterThan(0);
      expect(c.un_region.length).toBeGreaterThan(0);
      expect(c.un_subregion.length).toBeGreaterThan(0);
      expect(c.iso_numeric.length).toBeGreaterThan(0);
    });
  });

  it("exposes the declared scheme catalogue including language_primary", () => {
    const schemeIds = (schemesData as any).schemes.map((s: any) => s.id);
    expect(schemeIds).toEqual(expectedSchemes);
    (schemesData as any).schemes.forEach((s: any) => {
      expect(typeof s.label).toBe("string");
      expect(Array.isArray(s.groups)).toBe(true);
      expect(s.groups.length).toBeGreaterThan(0);
    });
  });

  it("provides base tags with all scheme keys for every country", () => {
    const tags = baseTags as Record<string, any>;
    const countryIds = ((countriesData as any).countries as any[]).map((c) => c.id);
    expect(Object.keys(tags).sort()).toEqual(countryIds.sort());
    countryIds.forEach((id) => {
      const entry = tags[id];
      expect(entry).toBeTruthy();
      expectedSchemes.forEach((schemeId) => {
        expect(entry).toHaveProperty(schemeId);
      });
    });
  });
});

describe("world model API", () => {
  it("loads countries and exposes metadata for a known id", async () => {
    const countries = await loadCountries();
    expect(countries.length).toBe(((countriesData as any).countries as any[]).length);
    const portugal = getCountryMeta("PRT");
    expect(portugal).toBeTruthy();
    expect(portugal?.name_en).toBe("Portugal");
  });

  it("loads scheme catalogue and tag snapshots with curated overrides", async () => {
    const schemeCatalog = await loadSchemes();
    expect(schemeCatalog.schemes.map((s) => s.id)).toEqual(expectedSchemes);

    const tags = await loadCountryTags();
    const snapshot = getCountryTagSnapshot("PRT");
    expect(snapshot?.language_primary).toBe("pt");
    const examples = getCountriesByTag("geo_political_blocs", "nato");
    expect(examples).toContain("PRT");
    expect(Object.keys(tags)).toContain("BRA");
    expect(getCountryTagSnapshot("BRA")?.world_system_position).toBe("semi_periphery");
  });
});

describe("language metadata", () => {
  it("exposes language catalog and country membership", () => {
    const languages = getAllLanguages();
    expect(languages.length).toBe((languagesData as any).languages.length);
    const portuguese = getLanguageByCode("pt");
    expect(portuguese?.country_ids).toContain("PRT");
    const portugueseCountries = getCountriesByLanguage("pt");
    expect(portugueseCountries).toContain("BRA");
    const neighbourPairs = getSharedLanguageNeighbours("pt");
    expect(neighbourPairs.some((p) => p.country_a === "BRA" || p.country_b === "BRA")).toBe(true);
  });
});

describe("border semantics", () => {
  it("returns semantic tags for configured segments", () => {
    const semantics = getBorderSemantics();
    expect(semantics.length).toBe((borderSemanticsData as any).segments.length);
    const prtEsp = getBorderSemanticsBySegmentId("ESP-PRT-0");
    expect(prtEsp?.tags).toContain("schengen_internal");
    const coastline = getSegmentsBySemanticTag("coastline");
    expect(coastline.some((s) => s.segment_id === "PRT-SEA-0")).toBe(true);
  });
});
