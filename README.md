# World Map Engine Core

A TypeScript library for building a **world-scale map engine** that:

- Uses real-world geography (WGS84) as an immutable base.
- Supports **conceptual layouts** (slots, clusters, world-system diagrams).
- Allows **moving, regrouping, scaling and deforming countries** at the view level without breaking geographic coherence.
- Can **style and highlight partial border segments**, not just whole countries.
- Is designed to be **extended** with domain logic (flows, sanctions, markets, mobility, etc.) without changing the core geography.

This repository provides the **core engine**, not a full application.

---

## 1. Design Overview

The engine is built around three key ideas:

1. **Immutable geospatial base**
   - Real-world country geometries (MultiPolygons) in WGS84.
   - No layout, style, or view transforms are ever baked into the raw data.

2. **Transformable render state**
   - Each country is represented at render time by a `RenderCountryShape` object that:
     - Holds a copy of the projected geometry.
     - Has a transform matrix (`TransformMatrix`) for translation/scale/rotation.
     - Has a conceptual position in a normalized `[0,1] × [0,1]` layout space.

3. **Conceptual layouts and clusters**
   - Countries can be assigned to **slots** (`LayoutSlot`) and grouped into **clusters** (`Cluster`).
   - Layouts live in a **concept-space** (normalized coordinates), independent of real geography.
   - The engine can interpolate between geographic and conceptual positions (hybrid mode).

For the full specification of the data model and behavior, see:

- [`MAP_SPEC.md`](./MAP_SPEC.md)

---

## 2. Data Sources

The engine is designed to work with **real world geometry**, not hard-coded samples.

Recommended data source (Natural Earth via world-atlas):

- TopoJSON:  
  `https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json`

You can either:

- Use `fetch` directly with that URL, or  
- Install the npm package `world-atlas` and import from it.

The engine should be written so that it can accept any compatible TopoJSON/GeoJSON object supplied by the caller.

---

## 3. Core Concepts & Types

High-level core types (see `MAP_SPEC.md` for full definitions):

- **IDs**: `CountryID`, `RegionID`, `UnitID`, `ClusterID`, `LayoutID`, `SlotID`, `SnapshotID`, `SegmentID`.
- **Geographic entities**:
  - `Country`: links an ID to a TopoJSON/GeoJSON geometry.
  - `Region`: optional subnational polygons.
  - `Unit`: point entities (cities, ports, mines, border crossings, etc.).
- **Anchors**:
  - `AnchorPoints`: centroid, bounding box, bounding circle for each country.
- **Layouts & clusters**:
  - `LayoutDefinition`, `LayoutSlot`, `CountryLayoutAssignment`.
  - `Cluster` with layout types: `"stack" | "grid" | "ring" | "cloud"`.
  - `ClusterEnvelope`: runtime hull for visual grouping.
- **Render state**:
  - `RenderCountryShape`: projected geometry + conceptual position + transform matrix.
  - `BoundingVolume`: screen-space bounding box and circle for collision/repulsion.
- **Borders**:
  - `BorderPoint`: point features on borders (checkpoints, choke points, etc.).
  - `BorderSegment`: partial border lines between two countries (segments of a boundary).
  - `BorderSegmentStyle`: style for specific segments (color, width, pattern, opacity).
- **Styling**:
  - `PaintRule`: generic style rules for countries, regions, clusters, slots, border segments.
  - `ResolvedStyle`: resolved style object used by renderers.

The engine itself is **UI-agnostic**: it is not tied to Canvas, SVG, WebGL, React, etc.  
It exposes **data and transforms** that any renderer can use.

---

## 4. Target Architecture

A suggested structure (you don’t have to follow this literally, but it’s a good default):

```text
src/
  worldMapEngine.ts         # main exports (public API)
  geometry/
    topoLoader.ts           # fetch & decode TopoJSON, compute anchors
  layout/
    layoutEngine.ts         # slots, clusters, conceptual layouts
  render/
    transforms.ts           # TransformMatrix ops, interpolation
    collision.ts            # bounding volumes & repulsion
    paint.ts                # PaintRule resolution & styles
  borders/
    borderSegments.ts       # BorderSegment & BorderSegmentRenderInfo helpers
MAP_SPEC.md                 # detailed spec of the engine
README.md                   # this file

The engine should be usable like:

import {
  Country,
  LayoutDefinition,
  createRenderCountryShape,
  applyConceptLayout,
  resolvePaintFor,
  // etc...
} from "./src/worldMapEngine";


⸻

5. Features the Engine MUST Implement

The engine must:
	1.	Load & interpret real-world geometries
	•	From TopoJSON/GeoJSON (e.g. world-atlas).
	•	Compute AnchorPoints for each country.
	•	Produce RenderCountryShape instances with projected polygons.
	•	Swap geometry references per level-of-detail via preparation options.
	2.	Support conceptual layouts
	•	Layouts defined by LayoutDefinition + LayoutSlot.
	•	Countries assigned to slots via CountryLayoutAssignment.
	•	Optionally grouped into Clusters with layout types:
	•	"stack", "grid", "ring", "cloud".
	3.	Support transforms
	•	applyConceptLayout: set conceptual positions inside slots/clusters.
	•	detachCountry: screen-space offsets for visual separation.
	•	scaleCountry: scale/deform view-only geometry.
	4.	Handle collisions
	•	Compute BoundingVolume for each RenderCountryShape.
	•	resolveCollisions: simple circle-based repulsion to avoid overlaps.
	5.	Support interpolation & hybrid mode
	•	interpolatePositions and interpolateTransform between layouts.
	•	screenPosHybrid: blend between geographic and conceptual positions.
	6.	Support painting and styling
	•	PaintRule and resolvePaintFor to style:
	•	countries, regions, clusters, slots, border segments.
	•	BorderSegmentStyle and a helper to combine:
	•	BorderSegment + style + PaintRule → BorderSegmentRenderInfo.
	7.	Support partial borders
	•	BorderSegment must allow styling only a section of the border A–B, not the whole boundary.
	•	Geometry for each segment should sit on the real border line.
	8.	Synthetic subdivisions
	•	Generate grid/hex/voronoi cells in geo-space and project them alongside country geometry for styling.

⸻

6. Invariants and Constraints

The following invariants are critical and MUST always be respected:
	1.	Immutable base geometry
	•	Never mutate the original TopoJSON/GeoJSON inputs.
	•	All view transformations happen on render-time copies.
	2.	No layout baked into geometry
	•	Concept-space positions (slots, clusters) and transforms live only in RenderCountryShape and related runtime structures.
	•	The raw geometry stays purely geographic.
	3.	ID-based linkage
	•	All domain data (future flows, sanctions, markets, mobility, etc.) must refer only to:
	•	CountryID, RegionID, UnitID, ClusterID, SlotID.
	•	Never rely on hard-coded screen coordinates.
	4.	Geographic coherence
	•	Even when countries are moved, scaled, or grouped conceptually,
the engine can always map back to real geography via:
	•	country_id → base geometry + AnchorPoints.
	5.	Efficiency
	•	Cache projected geometries.
	•	Avoid unnecessary recomputation of heavy geometry.
	•	Make it straightforward to plug in different geometry resolutions (LODs).

⸻

7. Status
	•	MAP_SPEC.md describes the full desired behavior and data model.
	•	Implementation is expected to follow that spec as closely as possible.
	•	This repository is intended as the core engine that can later be wrapped
by richer applications (UI, domain layers, automation, etc.).
