# World Map Engine

Core rendering and layout kernel for the world-map stack. Responsibilities:

- load and decode world geometries (TopoJSON/GeoJSON) and compute anchors (centroid, bbox, bounding circle, primary city);
- expose helpers to load higher-fidelity country datasets (world-atlas 50m) for classification/masking while still permitting lower-LOD render geometries;
- build `RenderCountryShape` objects and apply geographic, conceptual, hybrid transforms;
- compute bounding volumes and resolve collisions;
- project and clip infrastructure supplied by external providers (ingestion module);
- extract deterministic border segments (land + coastline) from high-res world geometry, expose per-country/pair lookup, and surface render-ready geometry across LODs;
- apply paint rules, border segment styling, and manage layer ordering;
- remain ID-driven with no dataset-specific knowledge.

## Border LODs

- High-resolution border polylines are extracted from the 50m world-atlas topology and retain full fidelity for zoomed-in views.
- Low-resolution border polylines are derived from the 110m world-atlas topology and mapped onto the canonical `(country_a, country_b, index)` segment IDs used by the hi-res graph; when multiple hi-res segments share a coarser low-res edge, the coarse polyline is reused.
- `getBorderSegmentGeometryForLOD` delegates to the shared `selectLOD` zoom thresholds (low < 1.5, medium/high ≥ 1.5) and returns low-res geometry when available, falling back to hi-res otherwise. Every segment always returns non-empty hi-res coordinates.

The engine consumes infrastructure and future world-model metadata provided by sibling packages; it does **not** fetch or parse provider datasets itself.
