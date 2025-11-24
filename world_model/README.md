# World Model (Semantic Layer)

This package provides neutral, ID-driven metadata for countries, classification schemes, language relationships, and border-level semantic tags. All assignments are deterministic and curated; no inference or automatic classification is performed here.

## Data files
- `data/countries.json`: ISO-aligned country metadata (ISO3 id, ISO2, ISO numeric, English/native names, UN region/subregion).
- `data/schemes.json`: Catalogue of supported schemes (world-system, geopolitical and economic blocs, financial/legal flags, regional orgs, currency systems, primary language) with exclusivity and allowed groups.
- `data/tags/`: Per-country scheme assignments. `base.json` carries neutral defaults; `core_examples.json` adds a small set of curated examples.
- `data/languages.json`: Language metadata (code, family, regions, participating country ids) for language-aware queries.
- `data/border_semantics.json`: Example semantic tags for specific border segments (e.g., Schengen internal borders, coastlines).

## API (src)
- Countries: `getAllCountries`, `getCountryMeta`, `loadCountries`
- Schemes: `getAllSchemes`, `getSchemeById`, `loadSchemes`
- Tags: `getAllCountryTags`, `getCountryTagSnapshot`, `getCountriesByTag`, `loadCountryTags`
- Languages: `getAllLanguages`, `getLanguageByCode`, `getCountriesByLanguage`, `getSharedLanguageNeighbours`
- Border semantics: `getBorderSemantics`, `getBorderSemanticsBySegmentId`, `getSegmentsBySemanticTag`

Assignments are intentionally limited to a handful of examples; future work will expand `data/tags` and `data/border_semantics` via explicit, curated sources.
