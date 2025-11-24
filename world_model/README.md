# world_model

The `world_model` workspace is a neutral semantic layer that sits alongside the core engine and ingestion packages.
It now has two distinct layers:

- **base**: authoritative, factual memberships (NATO, EU/Schengen, WTO/IMF/BIS/FATF, currency systems, languages, etc.) sourced via refreshable fetch scripts and stored under `base/data/`.
- **marxist**: manually curated analytical classifications (e.g., world-system position, global north/south) stored under `marxist/data/` without affecting factual data.

## Structure
- `base/data/` – countries, schemes, memberships, languages, border semantics produced by fetchers.
- `base/fetch/` – refresh scripts that pull external lists and write JSON fixtures (`npm run world-model:refresh`).
- `src/base/` – typed loaders and query helpers for base facts.
- `marxist/data/` – analytical scheme definitions and seed tag examples.
- `src/marxist/` – loaders for marxist tags and schemes.
- `src/index.ts` – unified API exposing base and marxist helpers without affecting the engine or ingestion packages.

## Refreshing base facts
Run the refresh pipeline from the repo root (manual/CI only, never in tests):

```bash
npm run world-model:refresh
```

This will fetch external membership lists where URLs are provided, fall back to existing fixtures if offline, and rewrite `base/data/memberships.json`.

## Testing
`npm test` from the repo root covers:
- base data integrity (countries, schemes, memberships, language coverage, border semantics),
- marxist tag structure validity,
- factual sanity checks for NATO/EU/Schengen/WTO, and
- integration with the engine’s border segment index.

All data access is local and deterministic; no network is used during tests.
