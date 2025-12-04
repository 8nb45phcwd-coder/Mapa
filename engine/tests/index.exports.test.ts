import { describe, expect, it } from "vitest";

import { applyCameraToPoint, createCameraState } from "../src/index.js";

describe("package entry exports", () => {
  it("exposes applyCameraToPoint from the public entry", () => {
    const camera = createCameraState(200, 200);
    camera.center = [0, 0];

    const projected = applyCameraToPoint([10, -5], camera);

    expect(projected[0]).toBeCloseTo(10);
    expect(projected[1]).toBeCloseTo(-5);
  });
});
