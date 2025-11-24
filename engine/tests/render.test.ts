import { describe, expect, it } from "vitest";
import {
  applyConceptLayout,
  detachCountry,
  scaleCountry,
  updateBoundingVolumes,
  resolveCollisions,
  conceptToScreen,
} from "../src/render.js";
import { createRenderCountryShape } from "../src/geometry.js";
import type { AnchorPoints, LayoutDefinition, CountryLayoutAssignment, ClusterEnvelope } from "../src/types.js";

const dummyAnchors: AnchorPoints = {
  centroid_geo: [0, 0],
  bbox_geo: { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 },
  bounding_circle_geo: { center: [0, 0], radius_deg: 1 },
};

function makeTriangleShape(id: string) {
  const triangle = {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [0, 1],
        [0, 0],
      ],
    ],
  };
  return createRenderCountryShape(triangle, dummyAnchors, id);
}

describe("concept layouts", () => {
  const layout: LayoutDefinition = {
    layout_id: "L1",
    label: "test",
    slots: [{ slot_id: "s1", x: 0, y: 0, w: 1, h: 1 }],
  };
  const assignment: CountryLayoutAssignment = {
    layout_id: "L1",
    country_id: "X",
    slot_id: "s1",
  };

  it("places a country at the center of its slot", () => {
    const rc = makeTriangleShape("X");
    const viewport = { width: 100, height: 100 };
    applyConceptLayout(rc, layout, assignment, undefined, viewport);
    expect(rc.conceptual_pos).toEqual([0.5, 0.5]);
    const bounds = updateBoundingVolumes(rc);
    const target = conceptToScreen([0.5, 0.5], viewport);
    expect(bounds.circle_screen.cx).toBeCloseTo(target[0]);
    expect(bounds.circle_screen.cy).toBeCloseTo(target[1]);
  });

  it("applies cluster-based offsets for ring layout", () => {
    const rc = makeTriangleShape("X");
    const viewport = { width: 200, height: 100 };
    const envelope: ClusterEnvelope = {
      cluster_id: "c1",
      center_concept: [0.5, 0.5],
      radius: 0.1,
      layout_type: "ring",
      memberCount: 4,
      memberIndex: 1,
    };
    applyConceptLayout(rc, layout, assignment, envelope, viewport);
    const expectedAngle = (Math.PI * 2 * 1) / 4;
    const localRadius = 0.8 * envelope.radius;
    const targetX = 0.5 + Math.cos(expectedAngle) * localRadius;
    const targetY = 0.5 + Math.sin(expectedAngle) * localRadius;
    expect(rc.conceptual_pos[0]).toBeCloseTo(targetX);
    expect(rc.conceptual_pos[1]).toBeCloseTo(targetY);
    const bounds = updateBoundingVolumes(rc);
    const targetScreen = conceptToScreen([targetX, targetY], viewport);
    expect(bounds.circle_screen.cx).toBeCloseTo(targetScreen[0]);
    expect(bounds.circle_screen.cy).toBeCloseTo(targetScreen[1]);
  });
});

describe("transform utilities", () => {
  it("detaches with screen-space offsets", () => {
    const rc = makeTriangleShape("X");
    detachCountry(rc, [10, -5]);
    expect(rc.transform.e).toBeCloseTo(10);
    expect(rc.transform.f).toBeCloseTo(-5);
    expect(rc.screen_pos).toEqual([10.25, -4.75]);
  });

  it("scales shapes for view-only deformation", () => {
    const rc = makeTriangleShape("X");
    scaleCountry(rc, 2, 3);
    expect(rc.transform.a).toBeCloseTo(2);
    expect(rc.transform.d).toBeCloseTo(3);
  });
});

describe("bounding volumes and collisions", () => {
  it("computes bounding boxes and circles after transforms", () => {
    const rc = makeTriangleShape("X");
    detachCountry(rc, [1, 2]);
    const bounds = updateBoundingVolumes(rc);
    expect(bounds.bbox_screen.minX).toBeCloseTo(1);
    expect(bounds.bbox_screen.maxX).toBeCloseTo(2);
    expect(bounds.bbox_screen.minY).toBeCloseTo(2);
    expect(bounds.bbox_screen.maxY).toBeCloseTo(3);
    expect(bounds.circle_screen.radius_px).toBeCloseTo(0.5);
  });

  it("separates overlapping shapes via iterative repulsion", () => {
    const a = makeTriangleShape("A");
    const b = makeTriangleShape("B");
    detachCountry(a, [0, 0]);
    detachCountry(b, [0.1, 0.1]);
    const boundsA = updateBoundingVolumes(a);
    const boundsB = updateBoundingVolumes(b);
    const initialDist = Math.hypot(
      boundsB.circle_screen.cx - boundsA.circle_screen.cx,
      boundsB.circle_screen.cy - boundsA.circle_screen.cy
    );
    resolveCollisions([a, b], 10);
    const afterA = updateBoundingVolumes(a);
    const afterB = updateBoundingVolumes(b);
    const afterDist = Math.hypot(
      afterB.circle_screen.cx - afterA.circle_screen.cx,
      afterB.circle_screen.cy - afterA.circle_screen.cy
    );
    const sumRadii = afterA.circle_screen.radius_px + afterB.circle_screen.radius_px;
    expect(afterDist).toBeGreaterThanOrEqual(sumRadii - 1e-3);
    expect(afterDist).toBeGreaterThan(initialDist);
  });
});
