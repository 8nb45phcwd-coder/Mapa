import { describe, expect, it } from "vitest";
import membershipsData from "../base/data/memberships.json" assert { type: "json" };
import schemesData from "../base/data/schemes.json" assert { type: "json" };
import { getBaseSchemeMembers } from "../src/index.js";

const memberships = (membershipsData as any).memberships as Array<{ scheme: string; group: string; members: string[] }>;
const baseSchemeMap = new Map((schemesData as any).schemes.map((s: any) => [s.id, s]));

const MUST_BE_NATO = ["USA", "PRT", "DEU", "FRA", "GBR"];
const MUST_BE_EU_CUSTOMS = ["PRT", "DEU", "FRA", "ESP", "ITA"];
const MUST_BE_SCHENGEN = ["PRT", "ESP", "DEU", "FRA", "NLD"];
const MUST_BE_WTO = ["USA", "PRT", "BRA", "CHN", "IND"];
const MUST_NOT_SCHENGEN = ["USA", "BRA"];

function hasMembership(schemeId: string, groupId: string, countryId: string): boolean {
  return memberships.some((m) => m.scheme === schemeId && m.group === groupId && m.members.includes(countryId));
}

describe("base factual memberships", () => {
  it("ensures scheme/group pairs exist before validation", () => {
    memberships.forEach((m) => {
      const scheme = baseSchemeMap.get(m.scheme);
      expect(scheme, `missing scheme ${m.scheme}`).toBeDefined();
      expect(scheme?.groups).toContain(m.group);
    });
  });

  it("validates NATO membership", () => {
    MUST_BE_NATO.forEach((cid) => {
      expect(hasMembership("geo_political_blocs", "nato", cid)).toBe(true);
    });
  });

  it("validates EU customs union membership", () => {
    MUST_BE_EU_CUSTOMS.forEach((cid) => {
      expect(hasMembership("economic_blocs", "eu_customs_union", cid)).toBe(true);
    });
  });

  it("validates Schengen membership and exclusions", () => {
    MUST_BE_SCHENGEN.forEach((cid) => {
      expect(hasMembership("regional_organizations", "schengen_area", cid)).toBe(true);
    });
    MUST_NOT_SCHENGEN.forEach((cid) => {
      expect(hasMembership("regional_organizations", "schengen_area", cid)).toBe(false);
    });
  });

  it("validates WTO membership coverage for key economies", () => {
    MUST_BE_WTO.forEach((cid) => {
      expect(hasMembership("financial_structures", "wto_member", cid)).toBe(true);
    });
  });

  it("mirrors membership lookups through the public API", () => {
    expect(getBaseSchemeMembers("geo_political_blocs", "nato")).toEqual(
      memberships.find((m) => m.scheme === "geo_political_blocs" && m.group === "nato")?.members ?? []
    );
  });
});
