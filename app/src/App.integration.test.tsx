/* @vitest-environment jsdom */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const { mockLoadAllInfrastructure, MOCK_TOPO, loadGeometryForLODMock } = vi.hoisted(() => ({
  mockLoadAllInfrastructure: vi.fn(async () => ({
    internalSegments: [],
    transnationalSegments: [],
    nodes: [],
  })),
  MOCK_TOPO: {
    type: "Topology",
    objects: {
      countries: {
        type: "GeometryCollection",
        geometries: [
          {
            id: "001",
            type: "Polygon",
            arcs: [],
            properties: { name: "Testland" },
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
                [0, 0],
              ],
            ],
          },
        ],
      },
    },
  },
  loadGeometryForLODMock: vi.fn(async () => ({ topojson: MOCK_TOPO })),
}));

vi.mock("world-map-ingestion", () => ({
  loadAllInfrastructure: mockLoadAllInfrastructure,
}));

vi.mock("world-map-engine", () => {
  const IDENTITY_TRANSFORM = {
    a: 1,
    b: 0,
    c: 0,
    d: 1,
    e: 0,
    f: 0,
  };
  return {
    IDENTITY_TRANSFORM,
    ProjectedGeometryCache: class {},
    applyCameraToPoint: (pt: [number, number]) => pt,
    conceptToScreen: (pt: [number, number]) => pt,
    createCameraState: (width: number, height: number) => ({
      viewportWidth: width,
      viewportHeight: height,
      zoom: 1,
      panOffsetX: 0,
      panOffsetY: 0,
    }),
    formatBorderSegmentId: (id: string) => id,
    getAllBorderSegments: () => [],
    getBorderSegmentGeometryForLOD: () => [],
    getBorderSegmentsForCountry: () => [],
    initializeBorderIndex: () => undefined,
    prepareRenderCountryShape: (
      _topology: any,
      country: { country_id: string },
      _projection: any
    ) => ({
      country_id: country.country_id,
      polygon: { type: "Polygon", coordinates: [[[0, 0]]] },
      transform: IDENTITY_TRANSFORM,
      centroid_concept: [0, 0],
      centroid_geo: [0, 0],
      screen_pos: [0, 0],
      conceptual_pos: [0, 0],
      anchor_geo: {
        centroid_concept: [0, 0],
        centroid_geo: [0, 0],
      },
      anchor: {
        centroid_concept: [0, 0],
        centroid_geo: [0, 0],
      },
    }),
    selectLOD: () => "high",
    loadGeometryForLOD: loadGeometryForLODMock,
    projectInfrastructureLine: (line: any) => ({
      ...line,
      geometry_projected: line.geometry_geo ?? [],
    }),
    buildTransnationalHybridPath: (line: any) => ({
      geo: line.geometry_geo ?? [],
      hybrid: line.geometry_geo ?? [],
    }),
  };
});

vi.mock("world-map-world-model", () => ({
  getBaseCountries: () => [
    {
      id: "TST",
      name_en: "Testland",
      iso_numeric: "001",
      un_region: "Test",
      un_subregion: "Test",
    },
  ],
  getBaseLanguages: () => [],
  getBaseSchemes: () => [
    {
      id: "scheme",
      label: "Scheme",
      groups: ["g1"],
      exclusive: false,
    },
  ],
  getBaseSchemeById: () => ({
    id: "scheme",
    label: "Scheme",
    groups: ["g1"],
    exclusive: false,
  }),
  getBaseSchemeMembers: () => [],
  getBaseBorderSemantics: () => [
    { segment_id: "seg1", tags: ["tag1"] },
  ],
  getCountryBaseTags: () => ({}),
  getBaseLanguagesByCountry: () => ({
    TST: [],
  }),
}));

vi.mock("topojson-client", () => ({
  feature: () => ({
    type: "FeatureCollection",
    features: [
      {
        id: "001",
        properties: { name: "Testland" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0],
            ],
          ],
        },
      },
    ],
  }),
}));

vi.mock("d3-geo", () => ({
  geoDistance: () => 0,
  geoMercator: () => {
    const fn: any = (pt: [number, number]) => pt;
    fn.fitSize = () => fn;
    return fn;
  },
}));

beforeEach(() => {
  mockLoadAllInfrastructure.mockClear();
  loadGeometryForLODMock.mockClear();
});

describe("App integration wiring", () => {
  it("switches layout modes via the controls", async () => {
    render(<App />);

    const geoRadio = screen.getByLabelText(/Geographic/i) as HTMLInputElement;
    const conceptRadio = screen.getByLabelText(/Concept/i) as HTMLInputElement;
    const hybridRadio = screen.getByLabelText(/Hybrid/i) as HTMLInputElement;

    await waitFor(() => {
      expect(screen.getByTestId("layout-mode-label").textContent).toContain("geo");
    });

    fireEvent.click(conceptRadio);
    expect(conceptRadio.checked).toBe(true);
    expect(screen.getByTestId("layout-mode-label").textContent).toContain("concept");

    fireEvent.click(hybridRadio);
    expect(hybridRadio.checked).toBe(true);
    expect(screen.getByTestId("layout-mode-label").textContent).toContain("hybrid");

    fireEvent.click(geoRadio);
    expect(geoRadio.checked).toBe(true);
    expect(screen.getByTestId("layout-mode-label").textContent).toContain("geo");
  });

  it("toggles layer state and reflects it in debug labels", async () => {
    render(<App />);

    const pipelinesToggle = await screen.findByLabelText(/pipelines/i);
    const pipelinesStatus = screen.getByTestId("layer-pipelines-state");

    expect((pipelinesToggle as HTMLInputElement).checked).toBe(true);
    expect(pipelinesStatus.textContent).toContain("on");

    fireEvent.click(pipelinesToggle);
    expect((pipelinesToggle as HTMLInputElement).checked).toBe(false);
    expect(pipelinesStatus.textContent).toContain("off");

    fireEvent.click(pipelinesToggle);
    expect((pipelinesToggle as HTMLInputElement).checked).toBe(true);
    expect(pipelinesStatus.textContent).toContain("on");
  });

  it("surfaces an error when topology fails to load", async () => {
    loadGeometryForLODMock.mockRejectedValueOnce(new Error("topology missing"));

    render(<App />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Failed to load base map data");
    expect(screen.getByRole("button", { name: /Retry/i })).toBeTruthy();
  });

  it("keeps the map usable when infrastructure fixtures fail", async () => {
    mockLoadAllInfrastructure.mockResolvedValueOnce({
      internalSegments: [],
      transnationalSegments: [],
      nodes: [],
      errors: ["fixture 404"],
    });

    render(<App />);

    await screen.findByText(/Infra:/);

    const infraAlert = screen.getByRole("alert");
    expect(infraAlert.textContent).toContain("Failed to load infrastructure fixtures");
  });
});
