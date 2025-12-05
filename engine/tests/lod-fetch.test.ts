import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("world-atlas/countries-110m.json", () => {
  throw new Error("no atlas 110m");
});

vi.mock("world-atlas/countries-50m.json", () => {
  throw new Error("no atlas 50m");
});

vi.mock("world-atlas/countries-10m.json", () => {
  throw new Error("no atlas 10m");
});

const originalEnv = process.env.WORLD_MAP_NO_NET;

afterEach(() => {
  delete (global as any).window;
  process.env.WORLD_MAP_NO_NET = originalEnv;
  vi.resetModules();
});

describe("bundled topology loading", () => {
  it("prefers bundled assets before falling back to CDN", async () => {
    (global as any).window = { location: { href: "https://example.test/" } };
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ bundled: true }) } as any));
    const { loadGeometryForLOD } = await import("../src/view/lod.js");

    const lod = await loadGeometryForLOD("medium", { fetcher });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toContain("/topology/countries-50m.json");
    expect((lod.topojson as any).bundled).toBe(true);
  });

  it("reports a clear error when bundled fetch fails in offline mode", async () => {
    (global as any).window = { location: { href: "https://example.test/" } };
    const fetcher = vi.fn(async () => {
      throw new Error("bundled missing");
    });
    process.env.WORLD_MAP_NO_NET = "1";
    const { loadGeometryForLOD } = await import("../src/view/lod.js");

    await expect(loadGeometryForLOD("medium", { fetcher })).rejects.toThrow(/Network fetches are disabled/);
    expect(fetcher).toHaveBeenCalled();
  });
});
