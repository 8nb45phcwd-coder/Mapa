# World Map App

A minimal interactive React/Vite application that consumes the core `world-map-engine`, fixture-backed infrastructure ingestion, and the `world_model` semantic layer. It renders the world map with zoom/pan, layout mode switching, selectable schemes/groups, and optional infrastructure and border semantic overlays.

## Getting started

```bash
npm install
npm run dev --workspace app
```

Other scripts:

- `npm run build --workspace app` – production build
- `npm run preview --workspace app` – preview a production build

## Features

- Zoom and pan camera controls with LOD-aware rendering
- Switch between geographic, conceptual, and hybrid layouts (alpha slider)
- Scheme/group selection from `world_model` to highlight countries
- Toggle layers: countries, borders, border semantics, pipelines, cables, ports, mines, power plants
- Click countries (and border segments when hit) to view metadata, tags, languages, and border semantics

## Notes

- The app is **offline/deterministic by default**: infrastructure is loaded from fixtures on startup for reproducible runs.
- Optional live infrastructure refresh is opt-in only. To enable the toggle, set `VITE_ALLOW_LIVE_INFRA=true` in your environment, then switch it on in the UI (expect slower, non-deterministic, network-dependent behaviour). Fixtures remain the default.
- The engine and ingestion behaviour are unchanged; the app only orchestrates rendering and data wiring.
