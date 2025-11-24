import type {
  Cluster,
  ClusterEnvelope,
  CountryID,
  CountryLayoutAssignment,
  LayoutDefinition,
  LayoutSlot,
} from "./types.js";

function slotCenter(slot: LayoutSlot): [number, number] {
  return [slot.x + slot.w / 2, slot.y + slot.h / 2];
}

/**
 * Compute a cluster envelope from member assignments and their slots.
 * The center is the centroid of the occupied slots and the radius grows with coverage.
 */
export function buildClusterEnvelope(
  cluster: Cluster,
  layout: LayoutDefinition,
  assignments: CountryLayoutAssignment[],
  padding = 0.05
): ClusterEnvelope {
  const memberSlots = assignments
    .filter((a) => cluster.members.includes(a.country_id) && a.layout_id === layout.layout_id)
    .map((a) => layout.slots.find((s) => s.slot_id === a.slot_id))
    .filter((s): s is LayoutSlot => Boolean(s));

  const centers = memberSlots.map(slotCenter);
  const cx = centers.reduce((acc, c) => acc + c[0], 0) / Math.max(centers.length, 1);
  const cy = centers.reduce((acc, c) => acc + c[1], 0) / Math.max(centers.length, 1);
  let maxDistance = 0;
  for (const c of centers) {
    const dx = c[0] - cx;
    const dy = c[1] - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > maxDistance) maxDistance = dist;
  }
  const radius = maxDistance + padding;

  return {
    cluster_id: cluster.cluster_id,
    center_concept: [cx, cy],
    radius,
    hull_points: centers,
    layout_type: cluster.layout_type,
    memberCount: cluster.members.length,
    memberIndex: 0,
  };
}

/**
 * Build member-specific envelopes that carry index/count to drive layouts.
 */
export function buildClusterMemberEnvelopes(
  cluster: Cluster,
  layout: LayoutDefinition,
  assignments: CountryLayoutAssignment[],
  padding = 0.05
): Map<CountryID, ClusterEnvelope> {
  const base = buildClusterEnvelope(cluster, layout, assignments, padding);
  const envelopes = new Map<CountryID, ClusterEnvelope>();
  cluster.members.forEach((countryId, idx) => {
    envelopes.set(countryId, { ...base, memberIndex: idx });
  });
  return envelopes;
}
