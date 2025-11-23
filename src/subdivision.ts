import type {
  AnchorPoints,
  AutoSubdivisionConfig,
  CountryID,
  SubdivisionCell,
} from "./types.js";

function polygonFromBBox(bbox: { minLon: number; maxLon: number; minLat: number; maxLat: number }): [number, number][][] {
  const { minLon, maxLon, minLat, maxLat } = bbox;
  return [
    [
      [minLon, minLat],
      [maxLon, minLat],
      [maxLon, maxLat],
      [minLon, maxLat],
      [minLon, minLat],
    ],
  ];
}

function centroid(coords: [number, number][][]): [number, number] {
  const ring = coords[0];
  let cx = 0;
  let cy = 0;
  ring.forEach(([lon, lat]) => {
    cx += lon;
    cy += lat;
  });
  const n = ring.length || 1;
  return [cx / n, cy / n];
}

function buildGridCells(country_id: CountryID, anchor: AnchorPoints, cells: number): SubdivisionCell[] {
  const cols = Math.ceil(Math.sqrt(cells));
  const rows = Math.ceil(cells / cols);
  const lonStep = (anchor.bbox_geo.maxLon - anchor.bbox_geo.minLon) / cols;
  const latStep = (anchor.bbox_geo.maxLat - anchor.bbox_geo.minLat) / rows;
  const result: SubdivisionCell[] = [];
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols && idx < cells; c++) {
      const bbox = {
        minLon: anchor.bbox_geo.minLon + c * lonStep,
        maxLon: anchor.bbox_geo.minLon + (c + 1) * lonStep,
        minLat: anchor.bbox_geo.minLat + r * latStep,
        maxLat: anchor.bbox_geo.minLat + (r + 1) * latStep,
      };
      const polygon = polygonFromBBox(bbox);
      result.push({
        cell_id: `${country_id}::grid::${idx}`,
        country_id,
        polygon_geo: polygon,
        centroid_geo: centroid(polygon),
      });
      idx++;
    }
  }
  return result;
}

function buildHexCells(country_id: CountryID, anchor: AnchorPoints, cells: number): SubdivisionCell[] {
  const cols = Math.ceil(Math.sqrt(cells));
  const rows = Math.ceil(cells / cols);
  const lonStep = (anchor.bbox_geo.maxLon - anchor.bbox_geo.minLon) / cols;
  const latStep = (anchor.bbox_geo.maxLat - anchor.bbox_geo.minLat) / rows;
  const result: SubdivisionCell[] = [];
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols && idx < cells; c++) {
      const offsetLon = (r % 2 === 0 ? 0 : lonStep / 2);
      const centerLon = anchor.bbox_geo.minLon + c * lonStep + offsetLon + lonStep / 2;
      const centerLat = anchor.bbox_geo.minLat + r * latStep + latStep / 2;
      const radiusLon = lonStep / 2;
      const radiusLat = latStep / 2;
      const polygon: [number, number][][] = [
        [0, 1, 2, 3, 4, 5, 0].map((i) => {
          const angle = (Math.PI / 3) * i;
          return [centerLon + Math.cos(angle) * radiusLon, centerLat + Math.sin(angle) * radiusLat];
        }),
      ];
      result.push({
        cell_id: `${country_id}::hex::${idx}`,
        country_id,
        polygon_geo: polygon,
        centroid_geo: [centerLon, centerLat],
      });
      idx++;
    }
  }
  return result;
}

function buildVoronoiCells(country_id: CountryID, anchor: AnchorPoints, cells: number): SubdivisionCell[] {
  const result: SubdivisionCell[] = [];
  const center = anchor.bounding_circle_geo.center;
  const radius = anchor.bounding_circle_geo.radius_deg;
  for (let i = 0; i < cells; i++) {
    const angleStart = (2 * Math.PI * i) / cells;
    const angleEnd = (2 * Math.PI * (i + 1)) / cells;
    const points: [number, number][] = [
      [center[1], center[0]],
      [center[1] + Math.cos(angleStart) * radius, center[0] + Math.sin(angleStart) * radius],
      [center[1] + Math.cos((angleStart + angleEnd) / 2) * radius, center[0] + Math.sin((angleStart + angleEnd) / 2) * radius],
      [center[1] + Math.cos(angleEnd) * radius, center[0] + Math.sin(angleEnd) * radius],
      [center[1], center[0]],
    ];
    const polygon: [number, number][][] = [points];
    result.push({
      cell_id: `${country_id}::voronoi::${i}`,
      country_id,
      polygon_geo: polygon,
      centroid_geo: centroid(polygon),
    });
  }
  return result;
}

/**
 * Generate automatic subdivision cells for a country.
 */
export function generateSubdivisions(
  country_id: CountryID,
  anchor: AnchorPoints,
  config: AutoSubdivisionConfig
): SubdivisionCell[] {
  if (config.cells <= 0) return [];
  switch (config.method) {
    case "grid":
      return buildGridCells(country_id, anchor, config.cells);
    case "hex":
      return buildHexCells(country_id, anchor, config.cells);
    case "voronoi":
      return buildVoronoiCells(country_id, anchor, config.cells);
    default:
      return [];
  }
}
