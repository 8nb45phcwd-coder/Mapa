# Testing and CI

## Commands

- `npm test`: runs the full Vitest suite once with the default local pool. App tests automatically run in the `jsdom` environment; engine, ingestion, and world_model tests stay on Node.
- `npm run test:ci`: CI-safe variant that sets `CI=1`, forces forked workers (bounded to two), disables watch mode, and enforces offline fixtures via `WORLD_MAP_NO_NET=1`.

## Environments

- Node-like packages (engine, ingestion, world_model) run with the Node environment.
- App tests under `app/src/**/*.test.{ts,tsx}` run with `jsdom` so DOM APIs are available.

## Offline guarantees

The CI command exports `WORLD_MAP_NO_NET=1` to prevent any network fallback inside geometry or ingestion loaders. Tests must rely on local fixtures only.

## Running locally

1. Install dependencies with `npm ci` from the repo root.
2. Run `npm test` to execute everything once. If you need to mirror CI settings locally, run `npm run test:ci` instead.
3. Builds can be validated with `npm run build` (aggregates package builds and the Vite app).
