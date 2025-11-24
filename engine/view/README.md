# View subsystem

This folder contains camera, level-of-detail, and tile-view helpers that keep geographic and conceptual rendering coherent under zoom and pan.

- `camera.ts` – viewport-aware camera state, zoom and pan helpers, and geo/screen conversions while preserving hybrid conceptual positions.
- `lod.ts` – three-tier LOD selector (110m, 50m, 10m) with loaders that keep country IDs stable while swapping resolution.
- `tiles.ts` – lightweight quadtree-style tiling for culling countries, infrastructure, and nodes based on viewport.

These helpers do not alter ingestion behaviour; they simply provide rendering-time tools to keep performance and geographic fidelity aligned with zoom and viewport changes.
