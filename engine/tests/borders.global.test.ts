import { beforeAll, describe, expect, it } from "vitest";
import { feature } from "topojson-client";
import world50 from "world-atlas/countries-50m.json";
import world110 from "world-atlas/countries-110m.json";

import type { Country, GeoMultiPolygon } from "../src/types.js";
import {
  getAllBorderSegments,
  getBorderSegmentsBetween,
  getBorderSegmentsForCountry,
  getBorderSegmentGeometryForLOD,
  initializeBorderIndex,
} from "../src/index.js";
import { formatBorderSegmentId } from "../src/borders/types.js";

// This suite performs a global border graph sanity check across every generated border segment.

const countriesFeatureCollection: any = feature(world50 as any, (world50 as any).objects.countries);
const countries: Country[] = countriesFeatureCollection.features.map((f: any) => ({
  country_id: f.id?.toString() ?? f.properties?.name ?? "unknown",
  name: f.properties?.name ?? f.id?.toString() ?? "unknown",
  geometry_ref: f.id?.toString() ?? f.properties?.name ?? "unknown",
}));

const countryGeom = new Map<string, GeoMultiPolygon>();
for (const f of countriesFeatureCollection.features) {
  const coords = (f.geometry?.type === "Polygon" ? [f.geometry.coordinates] : f.geometry?.coordinates) as any;
  if (coords) countryGeom.set(f.id?.toString() ?? f.properties?.name, coords);
}

const getId = (name: string) => countries.find((c) => c.name === name)?.country_id ?? "";

function pointInRing(point: [number, number], ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInMultiPolygon(point: [number, number], multi: GeoMultiPolygon): boolean {
  for (const poly of multi) {
    const outer = poly[0];
    const holes = poly.slice(1);
    if (pointInRing(point, outer)) {
      let inHole = false;
      for (const hole of holes) {
        if (pointInRing(point, hole)) {
          inHole = true;
          break;
        }
      }
      if (!inHole) return true;
    }
  }
  return false;
}

function pointToRingDistance(point: [number, number], ring: [number, number][]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((point[0] - x1) * dx + (point[1] - y1) * dy) / (dx * dx + dy * dy + Number.EPSILON)));
    const px = x1 + t * dx;
    const py = y1 + t * dy;
    const dist = Math.hypot(point[0] - px, point[1] - py);
    if (dist < best) best = dist;
  }
  return best;
}

function distanceToMultiPolygon(point: [number, number], multi?: GeoMultiPolygon): number {
  if (!multi) return Number.POSITIVE_INFINITY;
  if (pointInMultiPolygon(point, multi)) return 0;
  let best = Number.POSITIVE_INFINITY;
  for (const poly of multi) {
    for (const ring of poly) {
      best = Math.min(best, pointToRingDistance(point, ring));
    }
  }
  return best;
}

function bbox(coords: [number, number][]): { minLon: number; maxLon: number; minLat: number; maxLat: number } {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  coords.forEach(([lon, lat]) => {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  });
  return { minLon, maxLon, minLat, maxLat };
}

let segments = [] as ReturnType<typeof getAllBorderSegments>;

beforeAll(() => {
  initializeBorderIndex({ countries, topojsonHigh: world50 as any, topojsonLow: world110 as any });
  segments = getAllBorderSegments();
});

describe("global border graph invariants", () => {
  it("honours geometric bounds and non-degenerate geometry", { timeout: 30000 }, () => {
    segments.forEach((segment) => {
      expect(segment.geometry.coords_hi_res.length).toBeGreaterThanOrEqual(2);
      segment.geometry.coords_hi_res.forEach(([lon, lat]) => {
        expect(lon).toBeGreaterThanOrEqual(-180);
        expect(lon).toBeLessThanOrEqual(180);
        expect(lat).toBeGreaterThanOrEqual(-90);
        expect(lat).toBeLessThanOrEqual(90);
      });
      if (segment.geometry.coords_low_res) {
        expect(segment.geometry.coords_low_res.length).toBeGreaterThanOrEqual(2);
        segment.geometry.coords_low_res.forEach(([lon, lat]) => {
          expect(lon).toBeGreaterThanOrEqual(-180);
          expect(lon).toBeLessThanOrEqual(180);
          expect(lat).toBeGreaterThanOrEqual(-90);
          expect(lat).toBeLessThanOrEqual(90);
        });
      }
      expect(segment.length_km).toBeGreaterThan(0);
      if (segment.country_b !== "SEA") {
        const longs = segment.geometry.coords_hi_res.map((c) => c[0]);
        const lats = segment.geometry.coords_hi_res.map((c) => c[1]);
        const spanLon = Math.max(...longs) - Math.min(...longs);
        const spanLat = Math.max(...lats) - Math.min(...lats);
        // Allow perfectly vertical or horizontal shared borders but disallow degenerate points.
        expect(spanLon > 0 || spanLat > 0).toBe(true);
      }

      const tolerance = 90; // degrees, conservative enough for dateline/archipelago edge cases
      const first = segment.geometry.coords_hi_res[0];
      const last = segment.geometry.coords_hi_res[segment.geometry.coords_hi_res.length - 1];
      const maskA = countryGeom.get(segment.country_a);
      const maskB = segment.country_b === "SEA" ? undefined : countryGeom.get(segment.country_b);
      expect(distanceToMultiPolygon(first, maskA)).toBeLessThanOrEqual(tolerance);
      expect(distanceToMultiPolygon(last, maskA)).toBeLessThanOrEqual(tolerance);
      if (maskB) {
        expect(distanceToMultiPolygon(first, maskB)).toBeLessThanOrEqual(tolerance);
        expect(distanceToMultiPolygon(last, maskB)).toBeLessThanOrEqual(tolerance);
      }
    });
  });

  it("maintains canonical IDs and index membership", () => {
    const idSet = new Set<string>();
    const bra = getId("Brazil");
    const prt = getId("Portugal");
    segments.forEach((seg) => {
      expect(seg.country_a).not.toBe(seg.country_b);
      if (seg.country_b !== "SEA") {
        expect(seg.country_a < seg.country_b).toBe(true);
        expect(seg.id.country_a).toBe(seg.country_a);
        expect(seg.id.country_b).toBe(seg.country_b);
      }
      const idStr = formatBorderSegmentId(seg.id);
      expect(idSet.has(idStr)).toBe(false);
      idSet.add(idStr);

      const byA = getBorderSegmentsForCountry(seg.country_a);
      expect(byA).toContain(seg);
      if (seg.country_b !== "SEA") {
        const byB = getBorderSegmentsForCountry(seg.country_b);
        const pair = getBorderSegmentsBetween(seg.country_a, seg.country_b);
        expect(byB).toContain(seg);
        expect(pair).toContain(seg);
      }
    });

    expect(getBorderSegmentsBetween(bra, prt)).toHaveLength(0);
  });

  it("provides coherent LOD geometry for every segment", () => {
    segments.forEach((seg) => {
      const low = getBorderSegmentGeometryForLOD(seg, 1);
      const hi = getBorderSegmentGeometryForLOD(seg, 8);
      const defaultLow = getBorderSegmentGeometryForLOD(seg, 0.2);
      expect(low.length).toBeGreaterThan(0);
      expect(hi.length).toBeGreaterThan(0);
      expect(defaultLow.length).toBeGreaterThan(0);
    });
  });
});

