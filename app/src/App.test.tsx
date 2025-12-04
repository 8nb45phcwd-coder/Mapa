/* @vitest-environment jsdom */
import React from "react";
import { render, waitFor } from "@testing-library/react";
import { vi, describe, expect, it } from "vitest";
import App from "./App";

const { mockLoadAllInfrastructure, MOCK_TOPO } = vi.hoisted(() => ({
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
    loadGeometryForLOD: vi.fn(async () => ({ topojson: MOCK_TOPO })),
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

describe("App infrastructure loading", () => {
  it("requests fixture-only infrastructure by default", async () => {
    render(<App />);

    await waitFor(() => {
      expect(mockLoadAllInfrastructure).toHaveBeenCalled();
    });

    expect(mockLoadAllInfrastructure).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ useFixturesOnly: true })
    );
  });
});
