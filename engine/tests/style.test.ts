import { describe, expect, it } from "vitest";
import { resolvePaintFor, getBorderSegmentRenderInfo } from "../src/style.js";
import type { BorderSegment, BorderSegmentStyle, PaintRule } from "../src/types.js";

const segments: BorderSegment[] = [
  {
    segment_id: "seg-1",
    countries: ["A", "B"],
    geometry_ref: "seg-1",
  },
];

const segmentStyles: BorderSegmentStyle[] = [
  { segment_id: "seg-1", strokeColor: "red", strokeWidth: 2, pattern: "dashed" },
];

const paintRules: PaintRule[] = [
  { target: "country", id: "A", fill: "green" },
  { target: "border_segment", id: "seg-1", stroke: "blue", strokeWidth: 4, opacity: 0.5 },
];

describe("paint rule resolution", () => {
  it("uses the last matching rule for a target", () => {
    const rules: PaintRule[] = [
      { target: "country", id: "X", fill: "red" },
      { target: "country", id: "X", fill: "blue", stroke: "black" },
    ];
    const resolved = resolvePaintFor("country", "X", rules);
    expect(resolved.fill).toBe("blue");
    expect(resolved.stroke).toBe("black");
  });
});

describe("border segment render info", () => {
  const geometrySource = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "seg-1",
        properties: { name: "Segment One" },
        geometry: {
          type: "LineString",
          coordinates: [
            [0, 0],
            [1, 0],
          ],
        },
      },
    ],
  };

  it("merges explicit styles with paint rules and returns geometry", () => {
    const info = getBorderSegmentRenderInfo(
      "seg-1",
      segments,
      segmentStyles,
      paintRules,
      geometrySource,
      ([lon, lat]) => [lon * 2, lat * 2]
    );
    expect(info).toBeTruthy();
    expect(info!.style.stroke).toBe("blue");
    expect(info!.style.strokeWidth).toBe(4);
    expect(info!.style.opacity).toBeCloseTo(0.5);
    expect(info!.geometry).toBeTruthy();
    expect(info!.projectedGeometry.coordinates).toEqual([
      [0, 0],
      [2, 0],
    ]);
  });

  it("returns null for unknown segments", () => {
    const info = getBorderSegmentRenderInfo("missing", segments, segmentStyles, paintRules);
    expect(info).toBeNull();
  });
});
