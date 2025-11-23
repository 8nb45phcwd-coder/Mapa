# World Map Engine Core Specification

This document captures the functional and data-model requirements for the world map engine. It mirrors the contract described in the project brief and serves as a reference for integrators.

## 1. Coordinate & Data Foundations
- **Reference ellipsoid:** WGS84. All geographic inputs and anchor calculations assume [lon, lat] degrees.
- **Datasets:** Any TopoJSON/GeoJSON with country/region geometries. Default helper targets `https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json`.
- **Immutability:** Never mutate inbound TopoJSON/GeoJSON; projection and layout operate on copies.

## 2. Core Types (see `src/types.ts`)
- IDs: `CountryID`, `RegionID`, `UnitID`, `ClusterID`, `LayoutID`, `SlotID`, `SnapshotID`, `SegmentID`.
- Geographic primitives: `Country`, `Region`, `Unit`.
- Anchors: `AnchorPoints` with centroid, bbox, and bounding circle in geo-space.
- Layout: `LayoutDefinition`, `LayoutSlot`, `CountryLayoutAssignment`.
- Clusters: `Cluster`, `ClusterEnvelope` with layout types `stack | grid | ring | cloud`.
- Borders: `BorderPoint`, `BorderSegment`, `BorderSegmentStyle`.
- Styling: `PaintRule`, `ResolvedStyle`.
- Rendering: `TransformMatrix`, `RenderCountryShape`, `BoundingVolume`.
- Subdivision: `AutoSubdivisionConfig`, `SubdivisionCell`.

## 3. Geometry & Projection Pipeline
- `loadDefaultWorld` and `loadTopoJSON` fetch datasets.
- `decodeGeometryByRef` resolves polygon/multipolygon or polyline from TopoJSON/GeoJSON using `geometry_ref` (id or name).
- `buildCountryAnchor` computes centroid, bbox, and bounding circle for a geometry.
- `projectGeometry` applies an arbitrary projection (`ProjectionFn` taking `[lon,lat]`) with optional caching via `ProjectedGeometryCache` keyed by geometry reference and projection name. A level-of-detail hook (`lod` + `lodGeometryRefs`) lets callers swap simplified/detailed geometries per projection pass.
- `prepareRenderCountryShape` orchestrates decoding, anchoring, projection, and creation of `RenderCountryShape`, accepting override geometry references, cached anchors, and LOD selection.

## 4. Layout & Clustering
- `applyConceptLayout` places a country at its slot center or inside a cluster envelope. Cluster envelopes carry layout type, member index/count, and radius for positioning.
- Cluster helpers:
  - `buildClusterEnvelope` computes a center/radius from member slot coverage.
  - `buildClusterMemberEnvelopes` produces per-country envelopes for a cluster, embedding member indices to drive layouts.
- Supported cluster layout types:
  - `stack`: vertical offsets.
  - `grid`: normalized grid inside the envelope.
  - `ring`: circular placement around the envelope center.
  - `cloud`: deterministic jitter around the center for organic clusters.

## 5. Transforms & Hybrid Rendering
- `detachCountry` offsets a `RenderCountryShape` in screen space (matrix translate).
- `scaleCountry` applies view-only deformation (matrix scale).
- `updateBoundingVolumes` computes screen-space bbox and circle after transforms.
- `resolveCollisions` performs circle-based repulsion over multiple iterations.
- `interpolatePositions`, `interpolateTransform`, and `screenPosHybrid` enable temporal and geo↔concept blends.

## 6. Styling & Borders
- `resolvePaintFor` applies layered `PaintRule`s (last match wins) for countries, regions, clusters, slots, and border segments.
- `getBorderSegmentRenderInfo` merges explicit `BorderSegmentStyle` with paint rules and optionally decodes/projects segment geometry to deliver render-ready partial-border styling.

## 7. Subdivision
- `generateSubdivisions` creates synthetic cells per country using `AutoSubdivisionConfig` methods: `grid`, `hex`, or `voronoi`. Cells are produced in geographic coordinates based on the country anchor’s bbox/bounding circle, and a projection helper (`projectSubdivisionCells`) maps them into render space.

## 8. Invariants
- Keep source geometry immutable.
- Never bake conceptual layout into raw coordinates; transforms live in render state.
- Downstream data links by IDs only, not screen coordinates.
- Preserve geographic coherence even when offsetting, clustering, or subdividing.
- Cache projections to avoid redundant work and allow pluggable LOD geometry references.
