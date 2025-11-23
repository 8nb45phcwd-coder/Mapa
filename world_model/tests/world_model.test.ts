import { describe, expect, it } from "vitest";
import { feature } from "topojson-client";
import world from "world-atlas/countries-50m.json";
import countriesData from "../data/countries.json" assert { type: "json" };
import schemesData from "../data/schemes.json" assert { type: "json" };
import tagsData from "../data/tags.json" assert { type: "json" };
import {
  getCountryMeta,
  getCountryTagSnapshot,
  loadCountries,
  loadCountryTags,
  loadSchemes,
} from "../src/index.js";

const expectedSchemes = [
  "world_system_position",
  "global_north_south",
  "geo_political_blocs",
  "economic_blocs",
  "financial_structures",
  "regional_organizations",
  "currency_systems",
];

describe("world model data scaffolding", () => {
  it("contains country metadata matching engine world-atlas coverage", () => {
    const countries: any[] = countriesData as any[];
    expect(countries.length).toBeGreaterThan(0);
    const numericToIso3 = new Map<string | undefined, string>();
    countries.forEach((c) => numericToIso3.set(c.iso_numeric?.padStart(3, "0"), c.id));

    const fc: any = feature(world as any, (world as any).objects.countries);
    fc.features.forEach((f: any) => {
      const id = f.id?.toString();
      if (!id) return; // some disputed/placeholder features have no ISO numeric id
      expect(numericToIso3.has(id)).toBe(true);
    });
  });

  it("ensures each country entry has required neutral fields", () => {
    (countriesData as any[]).forEach((c) => {
      expect(typeof c.id).toBe("string");
      expect(c.id.length).toBe(3);
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.un_region.length).toBeGreaterThan(0);
      expect(c.un_subregion.length).toBeGreaterThan(0);
    });
  });

  it("exposes the declared scheme catalogue without assignments", () => {
    const schemes: any = schemesData;
    const schemeIds = schemes.schemes.map((s: any) => s.id);
    expect(schemeIds).toEqual(expectedSchemes);
    schemes.schemes.forEach((s: any) => {
      expect(typeof s.label).toBe("string");
      expect(Array.isArray(s.groups)).toBe(true);
      expect(s.groups.length).toBeGreaterThan(0);
    });
  });

  it("provides empty/null tags for every scheme per country", () => {
    const tags = tagsData as Record<string, any>;
    const countryIds = (countriesData as any[]).map((c) => c.id);
    expect(Object.keys(tags).sort()).toEqual(countryIds.sort());
    countryIds.forEach((id) => {
      const entry = tags[id];
      expect(entry).toBeTruthy();
      expectedSchemes.forEach((schemeId) => {
        expect(entry).toHaveProperty(schemeId);
        const value = entry[schemeId];
        const schemeDef = (schemesData as any).schemes.find((s: any) => s.id === schemeId);
        if (schemeDef.exclusive) {
          expect(value).toBeNull();
        } else {
          expect(Array.isArray(value)).toBe(true);
          expect((value as any[]).length).toBe(0);
        }
      });
    });
  });
});

describe("world model API", () => {
  it("loads countries and exposes metadata for a known id", async () => {
    const countries = await loadCountries();
    expect(countries.length).toBe((countriesData as any[]).length);
    const portugal = getCountryMeta("PRT");
    expect(portugal).toBeTruthy();
    expect(portugal?.name).toBe("Portugal");
    expect(portugal?.un_region.length).toBeGreaterThan(0);
  });

  it("loads scheme catalogue and tag snapshots without mutation", async () => {
    const schemes = await loadSchemes();
    expect(schemes.schemes.map((s) => s.id)).toEqual(expectedSchemes);

    const tags = await loadCountryTags();
    const snapshot = getCountryTagSnapshot("PRT");
    expect(snapshot).toBeTruthy();
    expectedSchemes.forEach((schemeId) => {
      expect(snapshot).toHaveProperty(schemeId);
      const value = snapshot?.[schemeId];
      const schemeDef = schemes.schemes.find((s) => s.id === schemeId);
      if (schemeDef?.exclusive) {
        expect(value).toBeNull();
      } else {
        expect(Array.isArray(value)).toBe(true);
      }
    });
    expect(Object.keys(tags)).toContain("PRT");
  });
});
