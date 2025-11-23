import type {
  BoundingVolume,
  ClusterEnvelope,
  ClusterLayoutType,
  CountryLayoutAssignment,
  LayoutDefinition,
  RenderCountryShape,
} from "./types.js";
import { applyTransform, IDENTITY_TRANSFORM } from "./geometry.js";

function computeClusterLayoutOffset(
  layoutType: ClusterLayoutType,
  memberIndex: number,
  memberCount: number
): [number, number] {
  if (memberCount <= 1) return [0, 0];
  switch (layoutType) {
    case "stack": {
      const spacing = 0.35;
      const offset = memberIndex - (memberCount - 1) / 2;
      return [0, offset * spacing];
    }
    case "grid": {
      const cols = Math.ceil(Math.sqrt(memberCount));
      const rows = Math.ceil(memberCount / cols);
      const col = memberIndex % cols;
      const row = Math.floor(memberIndex / cols);
      const nx = cols > 1 ? (col / (cols - 1)) * 2 - 1 : 0;
      const ny = rows > 1 ? (row / (rows - 1)) * 2 - 1 : 0;
      return [nx * 0.6, ny * 0.6];
    }
    case "ring": {
      const angle = (Math.PI * 2 * memberIndex) / memberCount;
      const radius = memberCount === 2 ? 0.5 : 0.8;
      return [Math.cos(angle) * radius, Math.sin(angle) * radius];
    }
    case "cloud": {
      // deterministic jitter based on member index
      const phi = (1 + Math.sqrt(5)) / 2;
      const angle = (2 * Math.PI * ((memberIndex * phi) % 1));
      const radius = 0.2 + 0.7 * ((memberIndex % 3) / 2);
      return [Math.cos(angle) * radius, Math.sin(angle) * radius];
    }
    default:
      return [0, 0];
  }
}

/** Place country in concept-space using slot and optional cluster envelope. */
export function applyConceptLayout(
  rc: RenderCountryShape,
  layout: LayoutDefinition,
  assignment: CountryLayoutAssignment,
  clusterEnvelope?: ClusterEnvelope
): void {
  if (assignment.layout_id !== layout.layout_id) {
    throw new Error(
      `Layout mismatch: assignment ${assignment.layout_id} does not match layout ${layout.layout_id}`
    );
  }
  const slot = layout.slots.find((s) => s.slot_id === assignment.slot_id);
  if (!slot) throw new Error(`Slot ${assignment.slot_id} not found in layout ${layout.layout_id}`);
  const slotCenter: [number, number] = [slot.x + slot.w / 2, slot.y + slot.h / 2];
  if (clusterEnvelope) {
    const layoutType = clusterEnvelope.layout_type || "stack";
    const offsetLocal = computeClusterLayoutOffset(
      layoutType,
      clusterEnvelope.memberIndex ?? 0,
      clusterEnvelope.memberCount ?? 1
    );
    const scaledOffset: [number, number] = [
      offsetLocal[0] * clusterEnvelope.radius,
      offsetLocal[1] * clusterEnvelope.radius,
    ];
    rc.conceptual_pos = [
      clusterEnvelope.center_concept[0] + scaledOffset[0],
      clusterEnvelope.center_concept[1] + scaledOffset[1],
    ];
  } else {
    rc.conceptual_pos = slotCenter;
  }
  rc.screen_pos = rc.conceptual_pos;
}

/** Translate a country in screen space. */
export function detachCountry(rc: RenderCountryShape, offset: [number, number]): void {
  rc.transform = {
    ...rc.transform,
    e: rc.transform.e + offset[0],
    f: rc.transform.f + offset[1],
  };
  rc.screen_pos = [rc.screen_pos[0] + offset[0], rc.screen_pos[1] + offset[1]];
}

/** Scale country for visual deformation (no geographic mutation). */
export function scaleCountry(rc: RenderCountryShape, scaleX: number, scaleY: number): void {
  rc.transform = {
    a: rc.transform.a * scaleX,
    b: rc.transform.b * scaleX,
    c: rc.transform.c * scaleY,
    d: rc.transform.d * scaleY,
    e: rc.transform.e,
    f: rc.transform.f,
  };
}

/** Compute bounding box and circle in screen-space after applying transforms. */
export function updateBoundingVolumes(rc: RenderCountryShape): BoundingVolume {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const accumulate = (coords: any) => {
    if (typeof coords[0] === "number") {
      const [tx, ty] = applyTransform(rc.transform, coords as [number, number]);
      if (tx < minX) minX = tx;
      if (ty < minY) minY = ty;
      if (tx > maxX) maxX = tx;
      if (ty > maxY) maxY = ty;
      return;
    }
    for (const c of coords) accumulate(c);
  };
  accumulate(rc.polygon.coordinates);

  const width = maxX - minX;
  const height = maxY - minY;
  const radius = Math.max(width, height) / 2;
  const cx = minX + width / 2;
  const cy = minY + height / 2;

  return {
    bbox_screen: { minX, maxX, minY, maxY },
    circle_screen: { cx, cy, radius_px: radius },
  };
}

/** Simple circle-based collision resolution via iterative repulsion. */
export function resolveCollisions(shapes: RenderCountryShape[], iterations = 5): void {
  const radii = new Map<string, number>();
  const centers = new Map<string, [number, number]>();

  const refresh = () => {
    radii.clear();
    centers.clear();
    for (const s of shapes) {
      const bounds = updateBoundingVolumes(s);
      radii.set(s.country_id, bounds.circle_screen.radius_px);
      centers.set(s.country_id, [bounds.circle_screen.cx, bounds.circle_screen.cy]);
    }
  };

  refresh();
  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;
    for (let i = 0; i < shapes.length; i++) {
      for (let j = i + 1; j < shapes.length; j++) {
        const idA = shapes[i].country_id;
        const idB = shapes[j].country_id;
        const cA = centers.get(idA)!;
        const cB = centers.get(idB)!;
        const rA = radii.get(idA)!;
        const rB = radii.get(idB)!;
        const dx = cB[0] - cA[0];
        const dy = cB[1] - cA[1];
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
        const overlap = rA + rB - dist;
        if (overlap > 0) {
          const push = overlap / 2;
          const ux = dx / dist;
          const uy = dy / dist;
          const moveA: [number, number] = [-ux * push, -uy * push];
          const moveB: [number, number] = [ux * push, uy * push];
          detachCountry(shapes[i], moveA);
          detachCountry(shapes[j], moveB);
          moved = true;
        }
      }
    }
    if (moved) refresh();
  }
}

/** Reset transform to identity. Useful for reusing shapes across layouts. */
export function resetTransform(rc: RenderCountryShape): void {
  rc.transform = { ...IDENTITY_TRANSFORM };
}
