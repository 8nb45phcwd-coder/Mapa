import { geoDistance } from "d3-geo";
import { feature } from "topojson-client";
import world50 from "world-atlas/countries-50m.json";
import world110 from "world-atlas/countries-110m.json";
import type { Country } from "./engine/src/types.js";
import {
  formatBorderSegmentId,
  getAllBorderSegments,
  getBorderSegmentGeometryForLOD,
  initializeBorderIndex,
} from "./engine/src/index.js";

function buildCountries(): Country[] {
  const fc: any = feature(world50 as any, (world50 as any).objects.countries);
  return fc.features.map((f: any) => ({
    country_id: f.id?.toString() ?? f.properties?.name ?? "unknown",
    name: f.properties?.name ?? f.id?.toString() ?? "unknown",
    geometry_ref: f.id?.toString() ?? f.properties?.name ?? "unknown",
  }));
}

function pickRandom<T>(items: T[], count: number): T[] {
  const pool = [...items];
  const result: T[] = [];
  for (let i = 0; i < count && pool.length > 0; i += 1) {
    const idx = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(idx, 1)[0]);
  }
  return result;
}

function lengthKm(coords: [number, number][]): number {
  if (coords.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < coords.length; i += 1) {
    total += geoDistance(coords[i - 1], coords[i]) * 6371; // Earth radius in km
  }
  return total;
}

function preview(coords: [number, number][]): [number, number][] {
  return coords.slice(0, 5);
}

async function main() {
  const countries = buildCountries();
  initializeBorderIndex({ countries, topojsonHigh: world50 as any, topojsonLow: world110 as any });

  const segments = getAllBorderSegments();
  const samples = pickRandom(segments, 5);

  console.log(`Total segments loaded: ${segments.length}`);
  console.log("Sampled segments:");

  samples.forEach((seg) => {
    const hiCoords = seg.geometry.coords_hi_res;
    const lowCoords = seg.geometry.coords_low_res ?? [];
    const id = seg.segment_id ?? formatBorderSegmentId(seg.id);
    const hiLength = lengthKm(hiCoords);
    const lowLength = lowCoords.length ? lengthKm(lowCoords) : null;
    const lodLow = getBorderSegmentGeometryForLOD(seg, 0.5);
    const lodHigh = getBorderSegmentGeometryForLOD(seg, 3);

    console.log("-------------------------------");
    console.log(`Segment: ${id}`);
    console.log(`Countries: ${seg.id.country_a} - ${seg.id.country_b}`);
    console.log(`Hi-res points: ${hiCoords.length}, length: ${hiLength.toFixed(2)} km`);
    console.log(`Low-res points: ${lowCoords.length}, length: ${lowLength?.toFixed(2) ?? "n/a"} km`);
    console.log(`LOD low zoom points: ${lodLow.length}, high zoom points: ${lodHigh.length}`);
    console.log("Hi-res preview:", preview(hiCoords));
    console.log("Low-res preview:", preview(lowCoords));
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
