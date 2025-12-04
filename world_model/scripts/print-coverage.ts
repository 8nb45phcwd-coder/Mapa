import { computeWorldModelCoverage } from "../src/coverage.js";

function formatPercent(numerator: number, denominator: number): string {
  if (denominator === 0) return "0%";
  return ((numerator / denominator) * 100).toFixed(1) + "%";
}

function printCoverage() {
  const coverage = computeWorldModelCoverage();

  console.log("World model coverage summary\n");
  console.log(`Total countries: ${coverage.totalCountries}`);
  console.log(
    `Countries with primary language: ${coverage.countriesWithPrimaryLanguage} (${formatPercent(
      coverage.countriesWithPrimaryLanguage,
      coverage.totalCountries
    )})`
  );
  console.log(
    `Countries with any scheme tag: ${coverage.countriesWithAnyTag} (${formatPercent(
      coverage.countriesWithAnyTag,
      coverage.totalCountries
    )})`
  );

  console.log("\nScheme coverage:");
  for (const scheme of coverage.schemeCoverage) {
    console.log(`- ${scheme.schemeId}: ${scheme.countriesTagged} countries (${scheme.totalGroups} groups)`);
    if (scheme.emptyGroups.length > 0) {
      console.log(`  empty groups: ${scheme.emptyGroups.join(", ")}`);
    }
  }

  console.log("\nBorder semantics:");
  console.log(`- tagged segments: ${coverage.borderCoverage.totalTaggedSegments}`);
  console.log(`- unique country pairs: ${coverage.borderCoverage.uniquePairs}`);
  if (coverage.borderCoverage.examplePairs.length > 0) {
    console.log("- example pairs:");
    for (const example of coverage.borderCoverage.examplePairs) {
      console.log(`  * ${example.pair}: ${example.tags.join(", ")}`);
    }
  }
}

printCoverage();
