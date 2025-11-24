import type { MapLayer } from "./types.js";

const layers: MapLayer[] = [];

export function registerLayer(layer: MapLayer): void {
  if (layers.find((l) => l.id === layer.id)) return;
  layers.push(layer);
  layers.sort((a, b) => a.zIndex - b.zIndex);
}

export function unregisterLayer(id: string): void {
  const idx = layers.findIndex((l) => l.id === id);
  if (idx >= 0) layers.splice(idx, 1);
}

export function getLayers(): MapLayer[] {
  return [...layers];
}
