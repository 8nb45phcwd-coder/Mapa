import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "world-map-engine": path.resolve(__dirname, "../engine/src"),
      "world-map-ingestion": path.resolve(__dirname, "../ingestion/src"),
      "world-map-world-model": path.resolve(__dirname, "../world_model/src"),
      "@map/engine": path.resolve(__dirname, "../engine/src"),
      "@map/ingestion": path.resolve(__dirname, "../ingestion/src"),
      "@map/world_model": path.resolve(__dirname, "../world_model/src"),
    },
  },
});
