import { beforeAll, describe, expect, it } from "vitest";
import { feature } from "topojson-client";
import { geoDistance } from "d3-geo";
import world50 from "world-atlas/countries-50m.json";
import world110 from "world-atlas/countries-110m.json";

import type { Country } from "../src/types.js";
import {
  getAllBorderSegments,
  getBorderSegmentGeometryForLOD,
  getBorderSegmentsBetween,
  initializeBorderIndex,
} from "../src/index.js";
import { formatBorderSegmentId } from "../src/borders/types.js";

const countriesFeatureCollection: any = feature(world50 as any, (world50 as any).objects.countries);
const countries: Country[] = countriesFeatureCollection.features.map((f: any) => ({
  country_id: f.id?.toString() ?? f.properties?.name ?? "unknown",
  name: f.properties?.name ?? f.id?.toString() ?? "unknown",
  geometry_ref: f.id?.toString() ?? f.properties?.name ?? "unknown",
}));

const rng = (() => {
  let seed = 123456789;
  return () => {
    seed = (seed ^ (seed << 13)) ^ (seed >>> 17) ^ (seed << 5);
    return Math.abs(seed) / 0x7fffffff;
  };
})();

function sampleUnique<T>(arr: T[], count: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(count, copy.length));
}

function lineLengthKm(coords: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += geoDistance(coords[i - 1], coords[i]) * 6371;
  }
  return total;
}

const getId = (name: string) => countries.find((c) => c.name === name)?.country_id ?? "";

let segments = [] as ReturnType<typeof getAllBorderSegments>;

beforeAll(() => {
  initializeBorderIndex({ countries, topojsonHigh: world50 as any, topojsonLow: world110 as any });
  segments = getAllBorderSegments();
});

describe("deterministic border LOD report", () => {
  it("summarizes border segment coverage", () => {
    const total = segments.length;
    const lowCount = segments.filter((s) => s.geometry.coords_low_res?.length).length;
    const missingLow = segments.filter((s) => !s.geometry.coords_low_res?.length).map((s) => formatBorderSegmentId(s.id));

    console.info("BORDER_LOD_COUNTS", { total, lowCount, missingLowCount: missingLow.length });

    expect(total).toBeGreaterThan(0);
    expect(lowCount).toBeGreaterThan(0);
    expect(missingLow.length).toBe(0);
  });

  it("validates random country pairs across LODs", () => {
    const pairKeys = Array.from(
      new Set(
        segments
          .filter((s) => s.country_b !== "SEA")
          .map((s) => `${s.country_a}-${s.country_b}`)
      )
    ).sort();

    const sampledPairs = sampleUnique(pairKeys, 10);
    const report = sampledPairs.map((key) => {
      const [a, b] = key.split("-");
      const pairSegments = getBorderSegmentsBetween(a, b);
      const ids = pairSegments.map((s) => formatBorderSegmentId(s.id));
      const missingLow = pairSegments.filter((s) => !s.geometry.coords_low_res?.length).map((s) => formatBorderSegmentId(s.id));
      const verticesOk = pairSegments.every((s) => (s.geometry.coords_low_res?.length ?? s.geometry.coords_hi_res.length) <= s.geometry.coords_hi_res.length);
      return { pair: key, segmentCount: pairSegments.length, ids, missingLow, verticesOk };
    });

    console.info("BORDER_LOD_PAIR_SAMPLE", report);

    expect(report.every((r) => r.segmentCount > 0)).toBe(true);
    expect(report.every((r) => r.missingLow.length === 0)).toBe(true);
    expect(report.every((r) => r.verticesOk)).toBe(true);
  });

  it("switches geometry at zoom thresholds", () => {
    const segWithLow = segments.find((s) => s.geometry.coords_low_res?.length);
    expect(segWithLow).toBeDefined();
    if (!segWithLow) return;
    const lowGeom = getBorderSegmentGeometryForLOD(segWithLow, 0.4);
    const hiGeom = getBorderSegmentGeometryForLOD(segWithLow, 3);
    expect(lowGeom).toEqual(segWithLow.geometry.coords_low_res);
    expect(hiGeom).toEqual(segWithLow.geometry.coords_hi_res);
  });

  it("compares lengths for sampled segments", () => {
    const withLow = segments.filter((s) => s.geometry.coords_low_res?.length);
    const sampled = sampleUnique(withLow, 10);
    const tolerance = 0.1;
    const comparison = sampled.map((s) => {
      const lenHi = lineLengthKm(s.geometry.coords_hi_res);
      const lenLow = lineLengthKm(s.geometry.coords_low_res ?? s.geometry.coords_hi_res);
      const delta = Math.abs(lenHi - lenLow) / lenHi;
      return { id: formatBorderSegmentId(s.id), lenHi, lenLow, delta };
    });

    console.info("BORDER_LOD_LENGTH_SAMPLE", comparison);
    expect(comparison.every((c) => c.delta <= tolerance)).toBe(true);
  });

  it("keeps coastline segments stable", () => {
    const seaPairs = Array.from(new Set(segments.filter((s) => s.country_b === "SEA").map((s) => s.country_a))).sort();
    const sampled = sampleUnique(seaPairs, 10);
    const report = sampled.map((country) => {
      const segs = getBorderSegmentsBetween(country, "SEA");
      return {
        country,
        count: segs.length,
        missingLow: segs.filter((s) => !s.geometry.coords_low_res?.length).map((s) => formatBorderSegmentId(s.id)),
      };
    });

    console.info("BORDER_LOD_COAST_SAMPLE", report);
    expect(report.every((r) => r.count > 0)).toBe(true);
    expect(report.every((r) => r.missingLow.length === 0)).toBe(true);
  });

  it("re-validates border graph invariants", () => {
    const ids = new Set<string>();
    segments.forEach((s) => {
      expect(s.geometry.coords_hi_res.length).toBeGreaterThanOrEqual(2);
      if (s.geometry.coords_low_res) {
        expect(s.geometry.coords_low_res.length).toBeGreaterThanOrEqual(2);
      }
      const idStr = formatBorderSegmentId(s.id);
      expect(ids.has(idStr)).toBe(false);
      ids.add(idStr);
    });
  });
});
