import { describe, expect, it } from "vitest";
import { buildClusterEnvelope, buildClusterMemberEnvelopes } from "../src/layout.js";
import type { Cluster, CountryLayoutAssignment, LayoutDefinition } from "../src/types.js";

describe("cluster envelopes", () => {
  const layout: LayoutDefinition = {
    layout_id: "L1",
    label: "Cluster test",
    slots: [
      { slot_id: "s1", x: 0, y: 0, w: 0.2, h: 0.2 },
      { slot_id: "s2", x: 0.8, y: 0.8, w: 0.2, h: 0.2 },
    ],
  };

  const assignments: CountryLayoutAssignment[] = [
    { layout_id: "L1", country_id: "A", slot_id: "s1" },
    { layout_id: "L1", country_id: "B", slot_id: "s2" },
  ];

  const cluster: Cluster = {
    cluster_id: "c1",
    layout_id: "L1",
    layout_type: "grid",
    members: ["A", "B"],
  };

  it("computes center and radius from member slots", () => {
    const envelope = buildClusterEnvelope(cluster, layout, assignments, 0);
    expect(envelope.center_concept[0]).toBeCloseTo(0.5);
    expect(envelope.center_concept[1]).toBeCloseTo(0.5);
    expect(envelope.radius).toBeGreaterThan(0.3);
  });

  it("produces member-specific envelopes carrying indices", () => {
    const envelopes = buildClusterMemberEnvelopes(cluster, layout, assignments, 0.01);
    expect(envelopes.get("A")?.memberIndex).toBe(0);
    expect(envelopes.get("B")?.memberIndex).toBe(1);
  });
});
