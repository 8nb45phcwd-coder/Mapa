import { defineConfig } from "vitest/config";
import path from "path";

const isCI = process.env.CI === "1" || process.env.CI === "true";
const pool = process.env.VITEST_POOL ?? (isCI ? "forks" : "threads");

export default defineConfig({
  resolve: {
    alias: {
      "@map/engine": path.resolve(__dirname, "engine/src"),
      "@map/ingestion": path.resolve(__dirname, "ingestion/src"),
      "@map/world_model": path.resolve(__dirname, "world_model/src"),
      "world-map-engine": path.resolve(__dirname, "engine/src"),
      "world-map-ingestion": path.resolve(__dirname, "ingestion/src"),
      "world-map-world-model": path.resolve(__dirname, "world_model/src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: [
      "engine/tests/**/*.test.ts",
      "ingestion/tests/**/*.test.ts",
      "world_model/tests/**/*.test.ts",
      "app/src/**/*.test.{ts,tsx}",
    ],
    environmentMatchGlobs: [
      ["app/src/**/*.test.tsx", "jsdom"],
      ["app/src/**/*.test.ts", "jsdom"],
    ],
    pool,
    poolOptions: {
      threads: {
        singleThread: isCI,
      },
      forks: {
        singleFork: true,
      },
    },
    minThreads: 1,
    maxThreads: isCI ? 2 : undefined,
    watch: false,
    testTimeout: isCI ? 30000 : 10000,
    hookTimeout: isCI ? 30000 : 10000,
    slowTestThreshold: isCI ? 2000 : 1000,
    typecheck: {
      tsconfig: "tsconfig.vitest.json",
    },
  },
});
