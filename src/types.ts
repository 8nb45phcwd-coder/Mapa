export type CountryID = string;
export type RegionID = string;
export type UnitID = string;
export type ClusterID = string;
export type LayoutID = string;
export type SlotID = string;
export type SnapshotID = string;
export type SegmentID = string;

export interface Country {
  country_id: CountryID;
  name: string;
  geometry_ref: string; // key in TopoJSON/GeoJSON object
}

export interface Region {
  region_id: RegionID;
  country_id: CountryID;
  name: string;
  region_type: string; // "state","province","NUTS2", etc.
  geometry_ref: string;
}

export interface Unit {
  unit_id: UnitID;
  name: string;
  unit_type: string; // "city","port","mine","hub","border_crossing", etc.
  country_id: CountryID;
  region_id?: RegionID;
  lat: number;
  lon: number;
}

export interface AnchorPoints {
  centroid_geo: [number, number]; // [lat, lon]
  bbox_geo: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  bounding_circle_geo: {
    center: [number, number]; // [lat, lon]
    radius_deg: number;
  };
  primary_city_anchor?: [number, number]; // optional, e.g. capital
}

export interface LayoutSlot {
  slot_id: SlotID;
  x: number; // 0–1
  y: number; // 0–1
  w: number; // 0–1
  h: number; // 0–1
}

export interface LayoutDefinition {
  layout_id: LayoutID;
  label: string;
  slots: LayoutSlot[];
}

export interface CountryLayoutAssignment {
  snapshot_id?: SnapshotID; // for future time-aware states
  layout_id: LayoutID;
  country_id: CountryID;
  slot_id: SlotID;
}

export type ClusterLayoutType = "stack" | "grid" | "ring" | "cloud";

export interface Cluster {
  cluster_id: ClusterID;
  layout_id: LayoutID;
  parent_cluster_id?: ClusterID | null;
  members: CountryID[];
  layout_type: ClusterLayoutType;
}

export interface ClusterEnvelope {
  cluster_id: ClusterID;
  center_concept: [number, number]; // in concept-space
  radius: number;
  hull_points?: [number, number][]; // optional convex hull
  layout_type?: ClusterLayoutType;
  memberCount?: number;
  memberIndex?: number;
}

export interface BorderPoint extends Unit {
  unit_type: "border_crossing" | "checkpoint" | "choke_point" | "corridor_gate";
  countries: CountryID[]; // typically [A,B]
  permeability_level: "open" | "controlled" | "restricted" | "closed";
  flow_types?: string[]; // e.g. ["trade","migration","tourism","military"]
}

export interface BorderSegment {
  segment_id: SegmentID;
  countries: [CountryID, CountryID];
  geometry_ref: string; // polyline that lies on the real border
  permeability_level?: "open" | "controlled" | "restricted" | "closed";
  militarization_level?: "low" | "medium" | "high";
  wall_present?: boolean;
  legal_status?: "normal" | "disputed" | "dmz" | "temporary_corridor";
  notes?: string;
}

export interface BorderSegmentStyle {
  segment_id: SegmentID;
  strokeColor?: string;
  strokeWidth?: number;
  pattern?: "solid" | "dashed" | "dotted" | "double" | "hatch";
  opacity?: number;
}

export type PaintTargetType =
  | "country"
  | "region"
  | "cluster"
  | "slot"
  | "border_segment";

export interface PaintRule {
  target: PaintTargetType;
  id: string; // country_id, region_id, cluster_id, slot_id, segment_id
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  pattern?: "solid" | "dashed" | "dotted" | "hatch" | "stripe" | "dots";
  opacity?: number;
}

export interface TransformMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export interface RenderCountryShape {
  country_id: CountryID;
  polygon: any; // MultiPolygon in projected coordinates
  anchor_geo: AnchorPoints;
  conceptual_pos: [number, number]; // in concept-space
  transform: TransformMatrix;
  screen_pos: [number, number]; // final center in screen-space (pixels)
}

export interface BoundingVolume {
  bbox_screen: { minX: number; maxX: number; minY: number; maxY: number };
  circle_screen: { cx: number; cy: number; radius_px: number };
}

export type AutoSubdivisionMethod = "grid" | "hex" | "voronoi";

export interface AutoSubdivisionConfig {
  method: AutoSubdivisionMethod;
  cells: number; // e.g. 4,9,16...
}

export interface ResolvedStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  pattern?: string;
  opacity?: number;
}

export interface BorderSegmentRenderInfo {
  segment: BorderSegment;
  style: ResolvedStyle;
  geometry?: any;
  projectedGeometry?: any;
}

export interface SubdivisionCell {
  cell_id: string;
  country_id: CountryID;
  polygon_geo: [number, number][][]; // simple polygon ring in [lon,lat]
  centroid_geo: [number, number];
}
