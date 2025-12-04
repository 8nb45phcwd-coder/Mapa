import { describe, expect, it } from "vitest";
import { computeWorldModelCoverage } from "../src/coverage.js";
import countriesData from "../base/data/countries.json" assert { type: "json" };

describe("world model coverage", () => {
  const coverage = computeWorldModelCoverage();
  const totalCountries = (countriesData as any).countries.length as number;

  it("matches country count", () => {
    expect(coverage.totalCountries).toBe(totalCountries);
  });

  it("has primary language coverage", () => {
    expect(coverage.countriesWithPrimaryLanguage).toBeGreaterThan(0);
  });

  it("has scheme tags present", () => {
    const schemesWithTags = coverage.schemeCoverage.filter((s) => s.countriesTagged > 0);
    expect(schemesWithTags.length).toBeGreaterThan(0);
  });

  it("covers border semantics", () => {
    expect(coverage.borderCoverage.totalTaggedSegments).toBeGreaterThan(0);
  });
});
