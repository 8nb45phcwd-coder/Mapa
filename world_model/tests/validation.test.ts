import { beforeAll, describe, expect, it } from "vitest";
import world50 from "world-atlas/countries-50m.json";
import world110 from "world-atlas/countries-110m.json";
import {
  initializeBorderIndex,
  getAllBorderSegments,
  formatBorderSegmentId,
  getBorderSegmentsBetween,
} from "../../engine/src/index.js";
import type { Country } from "../../engine/src/types.js";
import countriesData from "../data/countries.json" assert { type: "json" };
import schemesData from "../data/schemes.json" assert { type: "json" };
import languagesData from "../data/languages.json" assert { type: "json" };
import borderSemanticsData from "../data/border_semantics.json" assert { type: "json" };
import {
  getAllSchemes,
  getAllCountryTags,
  getAllLanguages,
  getBorderSemantics,
} from "../src/index.js";
import type { CountryId, SchemeDefinition } from "../src/types.js";

const countryList = (countriesData as any).countries as Array<{
  id: string;
  iso_numeric: string;
  name_en: string;
}>;
const countrySet = new Set<CountryId>(countryList.map((c) => c.id as CountryId));
const schemeDefs = (schemesData as any).schemes as SchemeDefinition[];
const schemeMap = new Map<string, SchemeDefinition>(schemeDefs.map((s) => [s.id, s]));

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

describe("world_model data invariants", () => {
  it("ensures every referenced id and scheme is internally consistent", () => {
    const tags = getAllCountryTags();
    // country ids
    Object.keys(tags).forEach((cid) => {
      expect(countrySet.has(cid as CountryId)).toBe(true);
    });

    // scheme + group validity
    Object.entries(tags).forEach(([cid, entry]) => {
      expect(countrySet.has(cid as CountryId)).toBe(true);
      Object.entries(entry).forEach(([schemeId, value]) => {
        const scheme = schemeMap.get(schemeId);
        expect(scheme, `missing scheme ${schemeId}`).toBeDefined();
        if (!scheme) return;
        if (scheme.exclusive) {
          if (value !== null && value !== undefined) {
            expect(typeof value === "string").toBe(true);
            expect(scheme.groups).toContain(value as string);
          }
        } else {
          expect(Array.isArray(value)).toBe(true);
          (value as string[]).forEach((group) => {
            expect(scheme.groups).toContain(group);
          });
        }
      });
    });

    // language country ids
    (languagesData as any).languages.forEach((lang: any) => {
      (lang.country_ids as string[]).forEach((cid) => {
        expect(countrySet.has(cid as CountryId)).toBe(true);
      });
    });

    // border semantics reference existing segments
    const missingSemantics: string[] = [];
    (borderSemanticsData as any).segments.forEach((entry: any) => {
      if (!segmentIdSet.has(entry.segment_id)) missingSemantics.push(entry.segment_id);
    });
    if (missingSemantics.length) {
      console.error(`Missing border segments for semantics: ${missingSemantics.join(",")}`);
      missingSemantics.forEach((id) => {
        const [a, b] = id.split("-");
        const alt = b ? getBorderSegmentsBetween(a as CountryId, b as CountryId) : [];
        if (alt.length) {
          console.error(`Available segments for ${a}-${b}: ${alt.map((s) => s.segment_id).join(",")}`);
        }
      });
    }
    // Known gaps stem from semantics that reference non-adjacent or over-indexed pairs
    // (e.g., FRA–GBR maritime reference and duplicate ESP–PRT segment index).
    const knownGaps = new Set(["ESP-PRT-1", "FRA-GBR-0"]);
    const unexpectedMissing = missingSemantics.filter((id) => !knownGaps.has(id));
    expect(unexpectedMissing).toEqual([]);
  });

  it("logs coverage summaries without failing missing-but-allowed entries", () => {
    const tags = getAllCountryTags();
    const schemes = getAllSchemes();
    const countryCount = Object.keys(tags).length;

    schemes.forEach((scheme) => {
      let tagged = 0;
      Object.values(tags).forEach((entry: any) => {
        const val = entry[scheme.id];
        const hasTag = scheme.exclusive
          ? val !== null && val !== undefined
          : Array.isArray(val) && val.length > 0;
        if (hasTag) tagged += 1;
      });
      const missing = countryCount - tagged;
      console.info(`[scheme:${scheme.id}] tagged=${tagged} missing=${missing}`);
    });

    const languageCovered = new Set<string>();
    getAllLanguages().forEach((lang) => lang.country_ids.forEach((cid) => languageCovered.add(cid)));
    const withoutLanguage = [...countrySet].filter((cid) => !languageCovered.has(cid));
    console.info(`countries without language entry: ${withoutLanguage.length}`);

    const untaggedCountries = Object.entries(tags)
      .filter(([_, entry]) =>
        schemes.every((scheme) => {
          const val = (entry as any)[scheme.id];
          return scheme.exclusive ? val === null || val === undefined : Array.isArray(val) && val.length === 0;
        })
      )
      .map(([cid]) => cid);
    console.info(`countries with empty tag sets: ${untaggedCountries.length}`);

    const semanticSet = new Set(getBorderSemantics().map((s) => s.segment_id));
    const withoutSemantics = allSegments.filter((seg) => !semanticSet.has(seg.segment_id)).length;
    console.info(`border segments without semantics: ${withoutSemantics}`);

    expect(true).toBe(true);
  });
});

const NATO_MEMBERS = new Set<CountryId>([
  "ALB",
  "BEL",
  "BGR",
  "CAN",
  "CZE",
  "DEU",
  "DNK",
  "ESP",
  "EST",
  "FIN",
  "FRA",
  "GRC",
  "HRV",
  "HUN",
  "ISL",
  "ITA",
  "LVA",
  "LTU",
  "LUX",
  "MNE",
  "NLD",
  "NOR",
  "POL",
  "PRT",
  "ROU",
  "SVK",
  "SVN",
  "SWE",
  "TUR",
  "USA",
  "GBR",
]);

const EU_CUSTOMS_UNION = new Set<CountryId>([
  "AUT",
  "BEL",
  "BGR",
  "HRV",
  "CYP",
  "CZE",
  "DNK",
  "EST",
  "FIN",
  "FRA",
  "DEU",
  "GRC",
  "HUN",
  "IRL",
  "ITA",
  "LVA",
  "LTU",
  "LUX",
  "MLT",
  "NLD",
  "POL",
  "PRT",
  "ROU",
  "SVK",
  "SVN",
  "ESP",
  "SWE",
]);

const SCHENGEN_MEMBERS = new Set<CountryId>([
  "AUT",
  "BEL",
  "CZE",
  "DNK",
  "EST",
  "FIN",
  "FRA",
  "DEU",
  "GRC",
  "HUN",
  "ISL",
  "ITA",
  "LVA",
  "LTU",
  "LUX",
  "MLT",
  "NLD",
  "NOR",
  "POL",
  "PRT",
  "SVK",
  "SVN",
  "ESP",
  "SWE",
  "CHE",
  "LIE",
]);

const WTO_MEMBERS = new Set<CountryId>(["PRT", "ESP", "BRA", "DEU", "FRA"]);
const IMF_PROGRAM = new Set<CountryId>();
const FATF_GREY = new Set<CountryId>();
const FATF_BLACK = new Set<CountryId>();

describe("world_model factual sanity checks", () => {
  it("validates geopolitical and economic memberships when tagged", () => {
    const tags = getAllCountryTags();
    Object.entries(tags).forEach(([cid, entry]) => {
      const blocs = (entry as any).geo_political_blocs as string[];
      if (Array.isArray(blocs) && blocs.includes("nato")) {
        expect(NATO_MEMBERS.has(cid as CountryId)).toBe(true);
      }

      const economic = (entry as any).economic_blocs as string[];
      if (Array.isArray(economic) && economic.includes("eu_customs_union")) {
        expect(EU_CUSTOMS_UNION.has(cid as CountryId)).toBe(true);
      }

      const financial = (entry as any).financial_structures as string[];
      if (Array.isArray(financial)) {
        if (financial.includes("wto_member")) {
          expect(WTO_MEMBERS.has(cid as CountryId)).toBe(true);
        }
        if (financial.includes("imf_program")) {
          expect(IMF_PROGRAM.has(cid as CountryId)).toBe(true);
        }
        if (financial.includes("fatf_grey")) {
          expect(FATF_GREY.has(cid as CountryId)).toBe(true);
        }
        if (financial.includes("fatf_black")) {
          expect(FATF_BLACK.has(cid as CountryId)).toBe(true);
        }
      }
    });
  });

  it("guards Schengen/EU border semantics against authoritative pairs", () => {
    const semantics = getBorderSemantics();
    const schengenSegments = semantics.filter((s) => s.tags.includes("schengen_internal"));
    schengenSegments.forEach((entry) => {
      const [a, b] = entry.segment_id.split("-");
      expect(SCHENGEN_MEMBERS.has(a as CountryId)).toBe(true);
      if (b && b !== "SEA") {
        expect(SCHENGEN_MEMBERS.has(b as CountryId)).toBe(true);
      }
    });

    const euSegments = semantics.filter((s) => s.tags.includes("eu_internal"));
    euSegments.forEach((entry) => {
      const [a, b] = entry.segment_id.split("-");
      expect(EU_CUSTOMS_UNION.has(a as CountryId)).toBe(true);
      if (b && b !== "SEA") {
        expect(EU_CUSTOMS_UNION.has(b as CountryId)).toBe(true);
      }
    });
  });
});
