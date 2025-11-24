# Refactor Notes

This refactor separates responsibilities into three packages:

- `engine/`: core world-map engine (geometry decoding, anchors, transforms, layouts, clipping, layers). No dataset-specific ingestion.
- `ingestion/`: real-world infrastructure ingestion (phase 2) with CRS-aware reprojection, densification, clipping, and country assignment. Behaviour preserved.
- `world_model/`: scaffold for future country/world-system metadata; no logic yet.

Tests, public API shapes, and ingestion behaviour remain unchanged aside from module boundaries.
