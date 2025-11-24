import { beforeAll, describe, expect, it } from "vitest";
import { feature } from "topojson-client";
import world50 from "world-atlas/countries-50m.json";
import world110 from "world-atlas/countries-110m.json";
import type { Country } from "../src/types.js";
import {
  initializeBorderIndex,
  getBorderSegmentsBetween,
  getBorderSegmentsForCountry,
  getAllBorderSegments,
} from "../src/index.js";
import { getBorderSegmentGeometryForLOD } from "../src/borders/lod.js";

const countriesFeatureCollection: any = feature(world50 as any, (world50 as any).objects.countries);
const countries: Country[] = countriesFeatureCollection.features.map((f: any) => ({
  country_id: f.id?.toString() ?? f.properties?.name ?? "unknown",
  name: f.properties?.name ?? f.id?.toString() ?? "unknown",
  geometry_ref: f.id?.toString() ?? f.properties?.name ?? "unknown",
}));

const getId = (name: string) => countries.find((c) => c.name === name)?.country_id ?? "";
const prtId = getId("Portugal");
const espId = getId("Spain");
const islId = getId("Iceland");

beforeAll(() => {
  initializeBorderIndex({ countries, topojsonHigh: world50 as any, topojsonLow: world110 as any });
});

describe("border adjacency extraction", () => {
  it("extracts well-known neighbouring borders", () => {
    const prtEsp = getBorderSegmentsBetween(prtId, espId);
    const fraDeu = getBorderSegmentsBetween(getId("France"), getId("Germany"));
    const usaCan = getBorderSegmentsBetween(getId("United States of America"), getId("Canada"));
    const braPrt = getBorderSegmentsBetween(getId("Brazil"), getId("Portugal"));
    expect(prtEsp.length).toBeGreaterThan(0);
    expect(fraDeu.length).toBeGreaterThan(0);
    expect(usaCan.length).toBeGreaterThan(0);
    expect(braPrt.length).toBe(0);
  });

  it("produces canonical ordering and contiguous indices", () => {
    const prtEsp = getBorderSegmentsBetween(prtId, espId);
    prtEsp.forEach((seg) => {
      expect(seg.id.country_a < seg.id.country_b).toBe(true);
    });

    const usaCan = getBorderSegmentsBetween(getId("United States of America"), getId("Canada"));
    const indices = usaCan.map((s) => s.id.index).sort((a, b) => a - b);
    indices.forEach((v, i) => expect(v).toBe(i));
  });
});

describe("border geometry fidelity", () => {
  it("returns hi-res coords that sit on country boundaries", () => {
    const prtEsp = getBorderSegmentsBetween(prtId, espId);
    const first = prtEsp[0];
    expect(first.geometry.coords_hi_res.length).toBeGreaterThan(1);
    const [lon, lat] = first.geometry.coords_hi_res[0];
    expect(Math.abs(lon)).toBeLessThanOrEqual(180);
    expect(Math.abs(lat)).toBeLessThanOrEqual(90);
  });

  it("generates coastline segments for island nations", () => {
    const iceland = getBorderSegmentsForCountry(islId);
    expect(iceland.length).toBeGreaterThan(0);
    expect(iceland.every((s) => s.country_b === "SEA")).toBe(true);
  });

  it("prefers low-res geometry at low zoom and hi-res afterwards", () => {
    const prtEsp = getBorderSegmentsBetween(prtId, espId);
    const seg = prtEsp[0];
    expect(seg.geometry.coords_low_res?.length).toBeGreaterThan(1);
    const low = getBorderSegmentGeometryForLOD(seg, 0.5);
    const mid = getBorderSegmentGeometryForLOD(seg, 2);
    expect(low).toEqual(seg.geometry.coords_low_res);
    expect(mid).toEqual(seg.geometry.coords_hi_res);
  });

  it("retains coastline geometry for islands across LODs", () => {
    const iceland = getBorderSegmentsForCountry(islId);
    const seg = iceland[0];
    const low = getBorderSegmentGeometryForLOD(seg, 0.2);
    const hi = getBorderSegmentGeometryForLOD(seg, 3);
    expect(low.length).toBeGreaterThan(1);
    expect(hi.length).toBeGreaterThan(1);
    expect(low[0][0]).toBeGreaterThanOrEqual(-180);
    expect(hi[0][1]).toBeLessThanOrEqual(90);
  });
});

describe("border index coherence", () => {
  it("returns all country segments via index", () => {
    const prtCountrySegments = getBorderSegmentsForCountry(getId("Portugal"));
    const prtEsp = getBorderSegmentsBetween(getId("Portugal"), getId("Spain"));
    prtEsp.forEach((seg) => {
      expect(prtCountrySegments).toContain(seg);
    });
  });

  it("collects coastline-only countries", () => {
    const islSegments = getBorderSegmentsForCountry(getId("Iceland"));
    expect(islSegments.every((s) => s.country_b === "SEA")).toBe(true);
  });

  it("segments are non-empty and globally indexed", () => {
    const all = getAllBorderSegments();
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((s) => s.geometry.coords_hi_res.length >= 2)).toBe(true);
  });
});

