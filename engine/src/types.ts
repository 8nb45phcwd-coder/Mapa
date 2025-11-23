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

export interface Viewport {
  width: number;
  height: number;
  padding?: number; // optional padding factor (0-1) applied symmetrically
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

export type LodLevel = "low" | "medium" | "high" | number;

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
  polygon_geo: [number, number][][] | [number, number][][][]; // polygon or multipolygon rings in [lon,lat]
  centroid_geo: [number, number];
}

export interface ProjectedSubdivisionCell {
  cell_id: string;
  country_id: CountryID;
  polygon_projected: [number, number][][] | [number, number][][][];
  centroid_projected: [number, number];
}

export type GeoRing = [number, number][]; // [lon,lat]
export type GeoPolygon = GeoRing[];
export type GeoMultiPolygon = GeoPolygon[];

export type InfrastructureSegmentType =
  | "pipeline_oil"
  | "pipeline_gas"
  | "power_interconnector"
  | "rail_corridor_intl"
  | "subsea_cable";

export type InfrastructureNodeType =
  | "port_container"
  | "port_bulk"
  | "port_oil"
  | "port_lng"
  | "mine_critical"
  | "refinery"
  | "power_plant_strategic"
  | "cable_landing"
  | "cargo_airport";

export interface InfrastructureLine {
  id: string;
  country_id: CountryID;
  geometry_geo: GeoRing; // polyline in [lon,lat]
  kind?: string;
  type?: InfrastructureSegmentType;
  name?: string;
  countries?: CountryID[];
}

export interface ClippedInfrastructureLine extends InfrastructureLine {
  clipped_segments: GeoRing[];
}

export interface ProjectedInfrastructureLine extends InfrastructureLine {
  geometry_projected: [number, number][];
}

export interface TransnationalInfrastructureLine {
  id: string;
  countries: CountryID[];
  geometry_geo: GeoRing;
  kind?: string;
  type?: InfrastructureSegmentType;
  name?: string;
}

export interface InfrastructureNode {
  id: string;
  country_id?: CountryID;
  type?: InfrastructureNodeType;
  name?: string;
  lon: number;
  lat: number;
  properties?: Record<string, any>;
}

// Layers must resolve data by IDs only (CountryID/RegionID/etc.), never by absolute screen coordinates.
export interface MapLayerContext {
  getCountryShape(id: CountryID): RenderCountryShape | undefined;
  getRegionShape?(id: RegionID): RenderCountryShape | undefined;
  projection?: any;
  viewport: { width: number; height: number };
}

export interface RendererAPI {
  drawLine?(points: [number, number][], style?: ResolvedStyle): void;
  drawPolygon?(polygon: any, style?: ResolvedStyle): void;
  applyMask?(polygon: any): void;
}

export interface MapLayer {
  id: string;
  zIndex: number;
  init?(ctx: MapLayerContext): void | Promise<void>;
  render(ctx: MapLayerContext, renderer: RendererAPI): void;
}

export interface TemporalLayer extends MapLayer {
  setTime?(t: Date | string | number | SnapshotID): void;
}
