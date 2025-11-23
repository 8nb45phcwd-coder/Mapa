# World Model (Data Scaffold)

This package provides neutral, ID-driven metadata scaffolding for country-level classifications. It purposely avoids any inferred or subjective assignments while offering consistent data shapes and a typed API for future layers.

## Data files
- `data/countries.json`: ISO-driven country metadata (ISO3 id, ISO2, common name, UN region and subregion, ISO numeric) aligned with the engine country set.
- `data/schemes.json`: Declared classification schemes and groups (world-system, geopolitical blocs, economic blocs, etc.) with no country assignments.
- `data/tags.json`: Per-country tag skeletons with `null` (exclusive schemes) or empty arrays (non-exclusive schemes) for every scheme.

## API
Exposed via `world_map_world_model` (see `src/index.ts`):
- `loadCountries`, `loadSchemes`, `loadCountryTags`
- `getCountryMeta`, `getCountryTagSnapshot`

All scheme assignments are intentionally empty; future phases will populate them using curated sources.
