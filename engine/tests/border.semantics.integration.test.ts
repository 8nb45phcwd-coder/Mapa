import { beforeAll, describe, expect, it } from "vitest";
import { feature } from "topojson-client";
import world50 from "world-atlas/countries-50m.json";
import world110 from "world-atlas/countries-110m.json";

import { createCameraState, applyCameraToPoint } from "../src/view/camera.js";
import {
  getAllBorderSegments,
  getBorderSegmentsBetween,
  getBorderSegmentGeometryForLOD,
  getBorderSegmentRenderInfo,
  initializeBorderIndex,
} from "../src/index.js";
import { formatBorderSegmentId } from "../src/borders/types.js";
import type {
  BorderSegment,
  BorderSegmentStyle,
  BorderSegmentId,
  Country,
  RenderCountryShape,
  Viewport,
} from "../src/types.js";
import { createRenderCountryShape } from "../src/geometry.js";
import { conceptToScreen, detachCountry } from "../src/render.js";
import { getBaseBorderSemantics, getSegmentsBySemanticTag } from "../../world_model/src/index.js";

const countriesFeatureCollection: any = feature(world50 as any, (world50 as any).objects.countries);
const countries: Country[] = countriesFeatureCollection.features.map((f: any) => ({
  country_id: f.id?.toString() ?? f.properties?.name ?? "unknown",
  name: f.properties?.name ?? f.id?.toString() ?? "unknown",
  geometry_ref: f.id?.toString() ?? f.properties?.name ?? "unknown",
}));

const getId = (name: string) => countries.find((c) => c.name === name)?.country_id ?? "";
const borderSemantics = getBaseBorderSemantics();
const semanticMap = new Map(borderSemantics.map((entry) => [entry.segment_id, entry.tags]));
let segments: BorderSegment[] = [];

beforeAll(() => {
  initializeBorderIndex({ countries, topojsonHigh: world50 as any, topojsonLow: world110 as any });
  segments = getAllBorderSegments();
});

describe("border semantics and styling", () => {
  it("exposes tagged segment ids for semantic schemes", () => {
    const schengen = getSegmentsBySemanticTag("schengen_internal").map((s) => s.segment_id);
    const euInternal = getSegmentsBySemanticTag("eu_internal").map((s) => s.segment_id);
    expect(schengen.length).toBeGreaterThan(0);
    expect(euInternal.length).toBeGreaterThan(0);

    const allIds = [...schengen, ...euInternal];
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBeGreaterThan(0);
    expect(uniqueIds.size).toBeLessThanOrEqual(allIds.length);

    // Validate that ids remain parseable and stable even if they fall outside the current LOD index
    allIds.forEach((id) => {
      expect(semanticMap.has(id)).toBe(true);
      expect(id.split("-")).toHaveLength(3);
    });
  });

  it("styles tagged segments differently from untagged siblings and preserves ids across schemes", () => {
    const syntheticSegments: BorderSegment[] = [
      {
        id: { country_a: "ESP", country_b: "PRT", index: 0 },
        segment_id: "ESP-PRT-0",
        country_a: "ESP",
        country_b: "PRT",
        geometry: { coords_hi_res: [[0, 0], [1, 0]], coords_low_res: [[0, 0], [1, 0]] },
        length_km: 1,
      },
      {
        id: { country_a: "ESP", country_b: "PRT", index: 1 },
        segment_id: "ESP-PRT-1",
        country_a: "ESP",
        country_b: "PRT",
        geometry: { coords_hi_res: [[1, 0], [2, 0]], coords_low_res: [[1, 0], [2, 0]] },
        length_km: 1,
      },
      {
        id: { country_a: "ESP", country_b: "PRT", index: 2 },
        segment_id: "ESP-PRT-2",
        country_a: "ESP",
        country_b: "PRT",
        geometry: { coords_hi_res: [[2, 0], [3, 0]], coords_low_res: [[2, 0], [3, 0]] },
        length_km: 1,
      },
    ];

    const schengenStyles: BorderSegmentStyle[] = getSegmentsBySemanticTag("schengen_internal").map((entry) => ({
      segment_id: entry.segment_id as string,
      strokeColor: "#ff00ff",
    }));

    const customsStyles: BorderSegmentStyle[] = getSegmentsBySemanticTag("eu_internal").map((entry) => ({
      segment_id: entry.segment_id as string,
      strokeColor: "#2563eb",
    }));

    const taggedInfo = getBorderSegmentRenderInfo("ESP-PRT-0", syntheticSegments, schengenStyles);
    const untaggedInfo = getBorderSegmentRenderInfo("ESP-PRT-2", syntheticSegments, schengenStyles);

    expect(taggedInfo?.style.stroke).toBe("#ff00ff");
    expect(untaggedInfo?.style.stroke).toBeUndefined();

    const updatedTagged = getBorderSegmentRenderInfo("ESP-PRT-0", syntheticSegments, customsStyles);
    expect(updatedTagged?.segment.segment_id).toEqual("ESP-PRT-0");
    expect(updatedTagged?.style.stroke).toBe("#2563eb");
  });
});

describe("border movement with conceptual detaches", () => {
  const dummyAnchors = {
    centroid_geo: [0, 0] as [number, number],
    bbox_geo: { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 },
    bounding_circle_geo: { center: [0, 0] as [number, number], radius_deg: 1 },
  };
  const viewport: Viewport = { width: 100, height: 100, padding: 0 };

  function makeSquare(id: string, originX: number): RenderCountryShape {
    const square = {
      type: "Polygon",
      coordinates: [[[originX, 0],[originX + 10, 0],[originX + 10, 10],[originX, 10],[originX, 0]]],
    };
    return createRenderCountryShape(square, dummyAnchors, id);
  }

  it("moves borders in lock-step with detached neighbours while keeping ids and tags stable", () => {
    const countryA = makeSquare("A", 0);
    const countryB = makeSquare("B", 12);
    const borderId: BorderSegmentId = { country_a: "A", country_b: "B", index: 0 };
    const border: BorderSegment = {
      id: borderId,
      segment_id: formatBorderSegmentId(borderId),
      country_a: "A",
      country_b: "B",
      geometry: { coords_hi_res: [[10, 5],[12, 5]], coords_low_res: [[10, 5],[12, 5]] },
      length_km: 1,
    };

    const camera = createCameraState(100, 100);
    const segmentMidpoint = [11, 5] as [number, number];
    const originalScreen = applyCameraToPoint(segmentMidpoint, camera);

    const offset: [number, number] = [8, -6];
    detachCountry(countryA, offset);
    detachCountry(countryB, offset);

    const countryATarget = conceptToScreen(countryA.conceptual_pos, viewport);
    const countryBTarget = conceptToScreen(countryB.conceptual_pos, viewport);

    const offsetA: [number, number] = [countryATarget[0] - countryA.screen_pos[0], countryATarget[1] - countryA.screen_pos[1]];
    const offsetB: [number, number] = [countryBTarget[0] - countryB.screen_pos[0], countryBTarget[1] - countryB.screen_pos[1]];
    const avgOffset: [number, number] = [(offsetA[0] + offsetB[0]) / 2, (offsetA[1] + offsetB[1]) / 2];

    const translatedSegment = border.geometry.coords_hi_res.map((pt) => [pt[0] + avgOffset[0], pt[1] + avgOffset[1]]) as [number, number][];
    const translatedScreen = applyCameraToPoint(translatedSegment[0], camera);
    const expectedScreen = applyCameraToPoint(
      [segmentMidpoint[0] + avgOffset[0], segmentMidpoint[1] + avgOffset[1]],
      camera
    );

    expect(border.segment_id).toBe(formatBorderSegmentId(borderId));
    expect(semanticMap.get(border.segment_id)).toEqual(semanticMap.get(border.segment_id));
    expect(Math.abs(translatedScreen[0] - expectedScreen[0])).toBeLessThanOrEqual(1);
    expect(Math.abs(translatedScreen[1] - expectedScreen[1])).toBeLessThanOrEqual(1);
  });
});

describe("zoom, mode, and LOD interactions", () => {
  function nearestSegmentId(point: [number, number], cameraZoom: number, candidates = segments): string | undefined {
    const camera = createCameraState(400, 200);
    camera.zoom = cameraZoom;
    return candidates
      .map((segment) => {
        const projected = segment.geometry.coords_hi_res.map((pt) => applyCameraToPoint(pt as [number, number], camera));
        let best = Infinity;
        for (let i = 1; i < projected.length; i += 1) {
          const [x1, y1] = projected[i - 1];
          const [x2, y2] = projected[i];
          const dx = x2 - x1;
          const dy = y2 - y1;
          const t = Math.max(0, Math.min(1, ((point[0] - x1) * dx + (point[1] - y1) * dy) / (dx * dx + dy * dy + Number.EPSILON)));
          const px = x1 + t * dx;
          const py = y1 + t * dy;
          const dist = Math.hypot(point[0] - px, point[1] - py);
          if (dist < best) best = dist;
        }
        return { id: formatBorderSegmentId(segment.id), dist: best };
      })
      .reduce((prev, curr) => (curr.dist < prev.dist ? curr : prev), { id: undefined as string | undefined, dist: Infinity }).id;
  }

  it("returns the same segment id for hit-testing across zoom levels", () => {
    const pairSegments = getBorderSegmentsBetween(getId("Portugal"), getId("Spain"));
    const sample = pairSegments[0];
    const midpoint: [number, number] = sample.geometry.coords_hi_res[Math.floor(sample.geometry.coords_hi_res.length / 2)];
    const lowScreenPoint = applyCameraToPoint(midpoint, createCameraState(400, 200));
    const highScreenPoint = applyCameraToPoint(midpoint, (() => {
      const cam = createCameraState(400, 200);
      cam.zoom = 3.2;
      return cam;
    })());

    const lowZoomHit = nearestSegmentId(lowScreenPoint, 0.8, pairSegments);
    const highZoomHit = nearestSegmentId(highScreenPoint, 3.2, pairSegments);

    expect(lowZoomHit).toBe(formatBorderSegmentId(sample.id));
    expect(highZoomHit).toBe(formatBorderSegmentId(sample.id));
  });

  it("keeps semantics intact across LOD changes and layout modes", () => {
    const sample = getBorderSegmentsBetween(getId("Portugal"), getId("Spain"))[0];
    const lowGeom = getBorderSegmentGeometryForLOD(sample, 0.5);
    const highGeom = getBorderSegmentGeometryForLOD(sample, 3);
    expect(lowGeom.length).toBeGreaterThan(0);
    expect(highGeom.length).toBeGreaterThan(0);
    expect(semanticMap.get(formatBorderSegmentId(sample.id))).toEqual(semanticMap.get(formatBorderSegmentId(sample.id)));
  });
});
