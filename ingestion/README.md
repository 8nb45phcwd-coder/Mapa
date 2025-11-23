# World Map Infrastructure Ingestion

Phase-2 ingestion pipeline for real-world infrastructure data (pipelines, subsea cables, ports, landings, strategic plants/mines, cargo airports).

Responsibilities:
- fetch and parse configured global datasets with reliability metadata;
- reproject to WGS84 using proj4 when needed;
- densify linear assets for robust country traversal and ordered country sequences;
- clip internal assets to country polygons and assign nodes via robust spatial checks;
- return `InfrastructureSegment` and `InfrastructureNode` objects to be consumed by the engine.

The logic mirrors pre-refactor behaviour; only the module boundary has changed. Use `loadAllInfrastructure` or `ingestInfrastructure` to obtain infrastructure arrays for the engine.
