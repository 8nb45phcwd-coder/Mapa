# World Map Infrastructure Ingestion

Phase-2 ingestion pipeline for real-world infrastructure data (pipelines, subsea cables, ports, landings, strategic plants/mines, cargo airports).

Responsibilities:
- fetch and parse configured global datasets with reliability metadata;
- reproject to WGS84 using proj4 when needed;
- densify linear assets for robust country traversal and ordered country sequences;
- clip internal assets to country polygons and assign nodes via robust spatial checks (high-resolution country masks by default);
- return `InfrastructureSegment` and `InfrastructureNode` objects to be consumed by the engine.

Notes:
- Country masks default to the higher-fidelity world-atlas 50m dataset for assignment/clipping; lower-LOD (110m) can still be supplied explicitly.
- Nodes assigned via coastal tolerance are marked `offshore: true` while coordinates remain unchanged; onshore checks rely on the hi-res masks.

The logic mirrors pre-refactor behaviour; only the module boundary has changed. Use `loadAllInfrastructure` or `ingestInfrastructure` to obtain infrastructure arrays for the engine.
