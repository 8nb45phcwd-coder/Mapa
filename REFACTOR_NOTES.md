# Refactor Notes

This refactor separates responsibilities into three packages:

- `engine/`: core world-map engine (geometry decoding, anchors, transforms, layouts, clipping, layers). No dataset-specific ingestion.
- `ingestion/`: real-world infrastructure ingestion (phase 2) with CRS-aware reprojection, densification, clipping, and country assignment. Behaviour preserved.
- `world_model/`: scaffold for future country/world-system metadata; no logic yet.

Tests, public API shapes, and ingestion behaviour remain unchanged aside from module boundaries.

## Follow-up changes

- Re-exported `applyCameraToPoint` from the engine entry point and added a regression test to lock the public surface.
- Excluded the `world_model/base/fetch/refresh.js` script from TypeScript builds while documenting its manual/CI-only usage.
- Removed the unused `world-map-engine` dependency from `world_model` to decouple build graph expectations.
- Documented network fetch fallbacks for engine loaders and added an opt-out guard via `WORLD_MAP_NO_NET=1` for offline/CI runs.
- Verified `npm test` and `npm run build` at the repository root.
