# World Map Engine

Core rendering and layout kernel for the world-map stack. Responsibilities:

- load and decode world geometries (TopoJSON/GeoJSON) and compute anchors (centroid, bbox, bounding circle, primary city);
- build `RenderCountryShape` objects and apply geographic, conceptual, hybrid transforms;
- compute bounding volumes and resolve collisions;
- project and clip infrastructure supplied by external providers (ingestion module);
- apply paint rules, border segment styling, and manage layer ordering;
- remain ID-driven with no dataset-specific knowledge.

The engine consumes infrastructure and future world-model metadata provided by sibling packages; it does **not** fetch or parse provider datasets itself.
