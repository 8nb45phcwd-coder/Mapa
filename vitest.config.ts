import { defineConfig } from "vitest/config";
import path from "path";

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
    ],
    typecheck: {
      tsconfig: "tsconfig.vitest.json",
    },
  },
});
