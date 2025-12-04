import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Configure the base path so assets resolve when hosted on GitHub Pages under
// https://<user>.github.io/<repo-name>/. We fall back to the repo folder name
// if GITHUB_REPOSITORY is not available (e.g. local builds).
const repoName = process.env.GITHUB_REPOSITORY?.split("/").pop() ?? "Mapa";

export default defineConfig({
  base: `/${repoName}/`,
  plugins: [react()],
  resolve: {
    alias: {
      "world-map-engine": path.resolve(__dirname, "../engine/src"),
      "world-map-ingestion": path.resolve(__dirname, "./src/ingestion-browser.ts"),
      "world-map-world-model": path.resolve(__dirname, "../world_model/src"),
      "@map/engine": path.resolve(__dirname, "../engine/src"),
      "@map/ingestion": path.resolve(__dirname, "../ingestion/src"),
      "@map/world_model": path.resolve(__dirname, "../world_model/src"),
    },
  },
});
