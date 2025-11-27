# World Map Infrastructure Ingestion

Phase-2 ingestion pipeline for strategic infrastructure data (trunk gas/oil pipelines, major ports, offshore platforms, critical mines, and hub airports).

Responsibilities:
- fetch and parse configured global datasets with reliability metadata (or fixture-only deterministic inputs);
- reproject to WGS84 using proj4 when needed;
- densify linear assets for robust country traversal and ordered country sequences;
- clip internal assets to country polygons and assign nodes via robust spatial checks (high-resolution country masks by default);
- return `InfrastructureSegment` and `InfrastructureNode` objects to be consumed by the engine.

Strategic infra types:
- segments: `pipeline_gas_strategic`, `pipeline_oil_strategic`
- nodes: `port_container_major`, `oil_gas_platform_offshore_major`, `mine_critical_major`, `airport_hub_major`

Deterministic mode:
- set `useFixturesOnly: true` in `IngestionOptions` to load checked-in fixtures from `ingestion/tests/fixtures` (or override with `fixtureOverrideDir`)
- owner/operator metadata is preserved via `owner_raw` and `operator_raw` on nodes/segments for downstream semantics

Notes:
- Country masks default to the higher-fidelity world-atlas 50m dataset for assignment/clipping; lower-LOD (110m) can still be supplied explicitly.
- Nodes assigned via coastal tolerance are marked `offshore: true` while coordinates remain unchanged; onshore checks rely on the hi-res masks.

The logic mirrors pre-refactor behaviour; only the module boundary has changed. Use `loadAllInfrastructure` or `ingestInfrastructure` to obtain infrastructure arrays for the engine.
