import { describe, expect, it } from "vitest";
import { registerLayer, unregisterLayer, getLayers } from "../src/layers.js";
import type { MapLayer } from "../src/types.js";

describe("layer registry", () => {
  it("registers and sorts by zIndex", () => {
    unregisterLayer("a");
    unregisterLayer("b");
    const a: MapLayer = { id: "a", zIndex: 5, render: () => {} };
    const b: MapLayer = { id: "b", zIndex: 1, render: () => {} };
    registerLayer(a);
    registerLayer(b);
    const ordered = getLayers();
    expect(ordered[0].id).toBe("b");
    expect(ordered[1].id).toBe("a");
  });

  it("unregisters layers by id", () => {
    unregisterLayer("a");
    unregisterLayer("b");
    const a: MapLayer = { id: "a", zIndex: 1, render: () => {} };
    registerLayer(a);
    expect(getLayers().length).toBeGreaterThan(0);
    unregisterLayer("a");
    expect(getLayers().find((l) => l.id === "a")).toBeUndefined();
  });
});
