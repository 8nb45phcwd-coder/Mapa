import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { feature } from "topojson-client";
import { geoDistance, geoMercator } from "d3-geo";
import {
  applyCameraToPoint,
  conceptToScreen,
  createCameraState,
  formatBorderSegmentId,
  getAllBorderSegments,
  getBorderSegmentGeometryForLOD,
  getBorderSegmentsForCountry,
  IDENTITY_TRANSFORM,
  initializeBorderIndex,
  prepareRenderCountryShape,
  ProjectedGeometryCache,
  selectLOD,
  loadGeometryForLOD,
} from "world-map-engine";
import type {
  AnchorPoints,
  BorderSegment,
  Country,
  CameraState,
  RenderCountryShape,
  Viewport,
  InfrastructureLine,
  TransnationalInfrastructureLine,
} from "world-map-engine";
import {
  getBaseBorderSemantics,
  getBaseCountries,
  getBaseLanguages,
  getBaseSchemeById,
  getBaseSchemes,
  getBaseSchemeMembers,
  getCountryBaseTags,
  type CountryMeta,
  type SchemeDefinition,
} from "world-map-world-model";
import { loadAllInfrastructure, type IngestedInfrastructure } from "world-map-ingestion";
import { projectInfrastructureLine, buildTransnationalHybridPath } from "world-map-engine";

const DEFAULT_VIEWPORT = () => ({
  width: Math.max(900, typeof window !== "undefined" ? window.innerWidth - 620 : 1200),
  height: Math.max(620, typeof window !== "undefined" ? window.innerHeight - 140 : 720),
});

const GROUP_COLORS = [
  "#60a5fa",
  "#f59e0b",
  "#f472b6",
  "#34d399",
  "#a78bfa",
  "#f97316",
  "#22c55e",
  "#fb7185",
  "#0ea5e9",
  "#c084fc",
];

const INFRA_COLORS: Record<string, string> = {
  pipeline_gas_strategic: "#22c55e",
  pipeline_oil_strategic: "#f97316",
  port_container_major: "#c084fc",
  oil_gas_platform_offshore_major: "#fde047",
  mine_critical_major: "#f472b6",
  airport_hub_major: "#38bdf8",
};

const LAYERS_DEFAULT = {
  countries: true,
  borders: true,
  borderSemantics: true,
  pipelines: true,
  cables: true,
  ports: false,
  mines: false,
  power: false,
};

type LayoutMode = "geo" | "concept" | "hybrid";

type SchemeGroupSelection = {
  schemeId: string;
  groups: Set<string>;
};

interface HitResult {
  countryId?: string;
  segmentId?: string;
}

function buildCountryList(
  topojson: any,
  baseCountries: CountryMeta[]
): { countries: Country[]; featureCollection: any } {
  const fc: any = feature(topojson, (topojson as any).objects.countries);
  const isoNumericToIso3 = new Map<string, string>();
  baseCountries.forEach((c) => {
    if (c.iso_numeric) isoNumericToIso3.set(c.iso_numeric, c.id);
  });
  const geometryRefByIso3 = new Map<string, string>();
  fc.features.forEach((feat: any) => {
    const ref = feat.id?.toString() ?? feat.properties?.name;
    const iso3 = feat.id ? isoNumericToIso3.get(feat.id.toString()) : undefined;
    if (iso3 && ref) geometryRefByIso3.set(iso3, ref);
  });
  const countries: Country[] = baseCountries
    .map((c) => {
      const ref = geometryRefByIso3.get(c.id);
      if (!ref) return null;
      return { country_id: c.id, name: c.name_en, geometry_ref: ref } as Country;
    })
    .filter(Boolean) as Country[];
  return { countries, featureCollection: fc };
}

function conceptualFromAnchor(anchor: AnchorPoints): [number, number] {
  const [lat, lon] = anchor.centroid_geo;
  const x = (lon + 180) / 360;
  const y = 1 - (lat + 90) / 180;
  return [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))];
}

function polygonToPath(
  shape: RenderCountryShape,
  offset: [number, number],
  camera: CameraState
): Path2D {
  const path = new Path2D();
  const polygons = shape.polygon.coordinates as any[];
  const processRing = (ring: any[]) => {
    ring.forEach((pt: any, idx: number) => {
      const projected = applyCameraToPoint(
        [shape.transform.a * pt[0] + shape.transform.c * pt[1] + shape.transform.e + offset[0],
          shape.transform.b * pt[0] + shape.transform.d * pt[1] + shape.transform.f + offset[1]],
        camera
      );
      if (idx === 0) path.moveTo(projected[0], projected[1]);
      else path.lineTo(projected[0], projected[1]);
    });
    path.closePath();
  };
  polygons.forEach((poly) => {
    poly.forEach((ring: any[]) => processRing(ring));
  });
  return path;
}

function lineToPath(coords: [number, number][], camera: CameraState): Path2D {
  const path = new Path2D();
  coords.forEach((pt, idx) => {
    const projected = applyCameraToPoint(pt, camera);
    if (idx === 0) path.moveTo(projected[0], projected[1]);
    else path.lineTo(projected[0], projected[1]);
  });
  return path;
}

const viewportFromState = (camera: CameraState): Viewport => ({
  width: camera.viewportWidth,
  height: camera.viewportHeight,
  padding: 0.02,
});

const paletteColor = (group: string, scheme?: SchemeDefinition) => {
  if (!scheme) return GROUP_COLORS[0];
  const idx = Math.max(0, scheme.groups.indexOf(group));
  return GROUP_COLORS[idx % GROUP_COLORS.length];
};

const lengthKm = (coords: [number, number][]): number => {
  if (coords.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < coords.length; i += 1) {
    total += geoDistance(coords[i - 1], coords[i]) * 6371;
  }
  return total;
};

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [viewport, setViewport] = useState(DEFAULT_VIEWPORT);
  const [camera, setCamera] = useState<CameraState>(() => {
    const c = createCameraState(DEFAULT_VIEWPORT().width, DEFAULT_VIEWPORT().height);
    c.zoom = 1.6;
    return c;
  });
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("geo");
  const [hybridAlpha, setHybridAlpha] = useState(0.5);
  const [countries, setCountries] = useState<Country[]>([]);
  const [featureCollection, setFeatureCollection] = useState<any | null>(null);
  const [projection, setProjection] = useState<any | null>(null);
  const [shapes, setShapes] = useState<RenderCountryShape[]>([]);
  const shapeMapRef = useRef<Map<string, RenderCountryShape>>(new Map());
  const [borderSegments, setBorderSegments] = useState<BorderSegment[]>([]);
  const [borderSemanticsMap, setBorderSemanticsMap] = useState<Map<string, string[]>>(new Map());
  const [borderSemanticScheme, setBorderSemanticScheme] = useState<string>(
    () => getBaseBorderSemantics()[0]?.tags[0] ?? "schengen_internal"
  );
  const allowLiveInfrastructure =
    (typeof import.meta !== "undefined" && (import.meta as any)?.env?.VITE_ALLOW_LIVE_INFRA === "true") ||
    (typeof process !== "undefined" && process?.env?.VITE_ALLOW_LIVE_INFRA === "true");
  const [useLiveInfrastructure, setUseLiveInfrastructure] = useState(false);
  const [infra, setInfra] = useState<IngestedInfrastructure | null>(null);
  const [infraStatus, setInfraStatus] = useState<string>("idle");
  const [lodLevel, setLodLevel] = useState<string>("medium");
  const [borderLodOverride, setBorderLodOverride] = useState<"auto" | "hi" | "low">("auto");
  const lodCacheRef = useRef<Map<string, any>>(new Map());
  const anchorCacheRef = useRef<Map<string, AnchorPoints>>(new Map());
  const geometryCacheRef = useRef<ProjectedGeometryCache>(new ProjectedGeometryCache());
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [selectedBorderId, setSelectedBorderId] = useState<string | null>(null);
  const [layers, setLayers] = useState(LAYERS_DEFAULT);
  const [schemeSelection, setSchemeSelection] = useState<SchemeGroupSelection>({
    schemeId: "world_system_position",
    groups: new Set<string>(),
  });
  const [loading, setLoading] = useState(true);

  const baseCountries = useMemo(() => getBaseCountries(), []);
  const baseSchemes = useMemo(() => getBaseSchemes(), []);
  const baseLanguages = useMemo(() => getBaseLanguages(), []);

  const viewportObj: Viewport = useMemo(
    () => ({ width: viewport.width, height: viewport.height, padding: 0.02 }),
    [viewport]
  );

  const alphaValue = layoutMode === "geo" ? 0 : layoutMode === "concept" ? 1 : hybridAlpha;

  const conceptOffsets = useMemo(() => {
    const offsets = new Map<string, [number, number]>();
    shapes.forEach((shape) => {
      const concept = conceptToScreen(shape.conceptual_pos, viewportObj);
      const blended = [
        shape.screen_pos[0] * (1 - alphaValue) + concept[0] * alphaValue,
        shape.screen_pos[1] * (1 - alphaValue) + concept[1] * alphaValue,
      ] as [number, number];
      offsets.set(shape.country_id, [blended[0] - shape.screen_pos[0], blended[1] - shape.screen_pos[1]]);
    });
    return offsets;
  }, [alphaValue, shapes, viewportObj]);

  const scheme = useMemo(
    () => getBaseSchemeById(schemeSelection.schemeId) ?? baseSchemes[0],
    [schemeSelection.schemeId, baseSchemes]
  );

  const borderSemanticsList = useMemo(() => getBaseBorderSemantics(), []);

  const borderSemanticTags = useMemo(() => {
    const tags = new Set<string>();
    borderSemanticsList.forEach((entry) => entry.tags.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [borderSemanticsList]);

  const borderSemanticSummary = useMemo(() => {
    const counts = new Map<string, number>();
    borderSemanticsList.forEach((entry) => {
      entry.tags.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1));
    });
    return counts;
  }, [borderSemanticsList]);

  const selectedSegment = useMemo(() => {
    if (!selectedBorderId) return null;
    return borderSegments.find((seg) => formatBorderSegmentId(seg.id) === selectedBorderId) ?? null;
  }, [borderSegments, selectedBorderId]);

  const ensureLodGeometry = useCallback(
    async (levelName: string) => {
      if (lodCacheRef.current.has(levelName)) return lodCacheRef.current.get(levelName);
      const lodSet = await loadGeometryForLOD(levelName as any);
      lodCacheRef.current.set(levelName, lodSet.topojson);
      return lodSet.topojson;
    },
    []
  );

  const rebuildShapes = useCallback(
    (
      topo: any,
      currentLod: string,
      countryList: Country[],
      fc: any,
      existingProjection?: any
    ) => {
      const projectionFn =
        existingProjection ?? geoMercator().fitSize([viewport.width, viewport.height], fc as any);
      const newShapes = countryList.map((c) => {
        const shape = prepareRenderCountryShape(topo, c, projectionFn, {
          cache: geometryCacheRef.current,
          anchorCache: anchorCacheRef.current,
          projectionName: `app-${currentLod}`,
          lod: currentLod,
        });
        shape.conceptual_pos = conceptualFromAnchor(shape.anchor_geo);
        return shape;
      });
      shapeMapRef.current = new Map(newShapes.map((s) => [s.country_id, s]));
      setProjection(projectionFn);
      setShapes(newShapes);
    },
    [viewport.height, viewport.width]
  );

  useEffect(() => {
    const handleResize = () => {
      setViewport(DEFAULT_VIEWPORT());
      setCamera((cam) => ({
        ...cam,
        viewportWidth: DEFAULT_VIEWPORT().width,
        viewportHeight: DEFAULT_VIEWPORT().height,
        center: [DEFAULT_VIEWPORT().width / 2, DEFAULT_VIEWPORT().height / 2],
      }));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const lodName = selectLOD(camera.zoom);
        const mediumTopo = await ensureLodGeometry(lodName);
        const { countries: countryList, featureCollection: fc } = buildCountryList(
          mediumTopo,
          baseCountries
        );
        const projectionFn = geoMercator().fitSize([viewport.width, viewport.height], fc as any);
        setCountries(countryList);
        setFeatureCollection(fc);
        setLodLevel(lodName);
        setLoading(false);
        rebuildShapes(mediumTopo, lodName, countryList, fc, projectionFn);

        // Border index prep
        const highTopo = await ensureLodGeometry("high");
        const lowTopo = await ensureLodGeometry("low");
        initializeBorderIndex({ countries: countryList, topojsonHigh: highTopo, topojsonLow: lowTopo });
        setBorderSegments(getAllBorderSegments());
        const semantics = new Map<string, string[]>();
        getBaseBorderSemantics().forEach((entry) => {
          semantics.set(entry.segment_id, entry.tags ?? []);
        });
        setBorderSemanticsMap(semantics);

        // Infrastructure
        setInfraStatus(useLiveInfrastructure ? "loading_live" : "loading_fixtures");
        try {
          const infraRes = await loadAllInfrastructure(highTopo, countryList, {
            countryIndex: undefined,
            useFixturesOnly: !useLiveInfrastructure,
          });
          if (!cancelled) {
            setInfra(infraRes);
            setInfraStatus("ready");
          }
        } catch (err) {
          console.error("Infrastructure load failed", err);
          if (!cancelled) setInfraStatus("error");
        }
      } catch (err) {
        console.error(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    baseCountries,
    camera.zoom,
    ensureLodGeometry,
    rebuildShapes,
    useLiveInfrastructure,
    viewport.height,
    viewport.width,
  ]);

  useEffect(() => {
    if (!countries.length || !featureCollection) return;
    const targetLod = selectLOD(camera.zoom);
    if (targetLod === lodLevel) return;
    ensureLodGeometry(targetLod).then((topo) => {
      rebuildShapes(topo, targetLod, countries, featureCollection);
      setLodLevel(targetLod);
    });
  }, [camera.zoom, countries, ensureLodGeometry, featureCollection, lodLevel, rebuildShapes]);

  useEffect(() => {
    if (!countries.length || !lodCacheRef.current.has(lodLevel) || !featureCollection) return;
    const topo = lodCacheRef.current.get(lodLevel);
    rebuildShapes(topo, lodLevel, countries, featureCollection);
  }, [countries, featureCollection, lodLevel, rebuildShapes, viewport]);

  const getSegmentCoords = useCallback(
    (segment: BorderSegment) => {
      if (borderLodOverride === "low") {
        return segment.geometry.coords_low_res ?? segment.geometry.coords_hi_res;
      }
      if (borderLodOverride === "hi") {
        return segment.geometry.coords_hi_res;
      }
      return getBorderSegmentGeometryForLOD(segment, camera.zoom);
    },
    [borderLodOverride, camera.zoom]
  );

  const drawScene = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !projection) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, viewport.width, viewport.height);

    const fillForCountry = (countryId: string): string => {
      const tags = getCountryBaseTags(countryId);
      if (!scheme || !tags || schemeSelection.groups.size === 0) return "#1f2937";
      const val = tags[scheme.id];
      if (scheme.exclusive) {
        if (val && typeof val === "string" && schemeSelection.groups.has(val)) {
          return paletteColor(val, scheme);
        }
      } else if (Array.isArray(val)) {
        const hit = val.find((v) => schemeSelection.groups.has(v));
        if (hit) return paletteColor(hit, scheme);
      }
      return "#1f2937";
    };

    if (layers.countries) {
      shapes.forEach((shape) => {
        const offset = conceptOffsets.get(shape.country_id) ?? [0, 0];
        const path = polygonToPath(shape, offset, camera);
        ctx.fillStyle = fillForCountry(shape.country_id);
        ctx.strokeStyle = selectedCountry === shape.country_id ? "#fbbf24" : "#0f172a";
        ctx.lineWidth = selectedCountry === shape.country_id ? 1.6 : 0.6;
        ctx.fill(path);
        ctx.stroke(path);
      });
    }

    if (layers.borders) {
      borderSegments.forEach((segment) => {
        const segId = formatBorderSegmentId(segment.id);
        const offsetA = conceptOffsets.get(segment.country_a) ?? [0, 0];
        const offsetB =
          segment.country_b && segment.country_b !== "SEA"
            ? conceptOffsets.get(segment.country_b) ?? [0, 0]
            : offsetA;
        const avgOffset: [number, number] = [
          (offsetA[0] + offsetB[0]) / 2,
          (offsetA[1] + offsetB[1]) / 2,
        ];
        const coords = getSegmentCoords(segment).map((pt) => [
          pt[0] + avgOffset[0],
          pt[1] + avgOffset[1],
        ]) as [number, number][];
        const path = lineToPath(coords, camera);
        const hasSemantics = borderSemanticsMap.has(segId);
        const stroke = hasSemantics && layers.borderSemantics ? "#f472b6" : "#6b7280";
        ctx.strokeStyle = segId === selectedBorderId ? "#fbbf24" : stroke;
        ctx.lineWidth = segId === selectedBorderId ? 2 : 1;
        ctx.stroke(path);
      });
    }

    if (infra && projection) {
      const drawInternal = (line: InfrastructureLine) => {
        const countryShape = shapeMapRef.current.get(line.country_id);
        const offset = conceptOffsets.get(line.country_id) ?? [0, 0];
        const transform = countryShape
          ? {
              ...countryShape.transform,
              e: countryShape.transform.e + offset[0],
              f: countryShape.transform.f + offset[1],
            }
          : { ...IDENTITY_TRANSFORM, e: offset[0], f: offset[1] };
        const segments = (line as any).clipped_segments?.length
          ? (line as any).clipped_segments
          : [line.geometry_geo];
        segments.forEach((geom: [number, number][]) => {
          const projected = projectInfrastructureLine(
            { ...line, geometry_geo: geom },
            projection,
            transform,
            { apply: (pt) => applyCameraToPoint(pt as [number, number], camera) }
          );
          const path = new Path2D();
          projected.geometry_projected.forEach((pt, idx) => {
            if (idx === 0) path.moveTo(pt[0], pt[1]);
            else path.lineTo(pt[0], pt[1]);
          });
          ctx.strokeStyle = INFRA_COLORS[line.type ?? line.kind ?? "pipeline_gas_strategic"] ?? "#22c55e";
          ctx.lineWidth = 1.4;
          ctx.stroke(path);
        });
      };

      const drawTransnational = (line: TransnationalInfrastructureLine) => {
        const pathSet = buildTransnationalHybridPath(
          line,
          shapeMapRef.current,
          projection,
          viewportObj,
          alphaValue,
          { apply: (pt) => applyCameraToPoint(pt as [number, number], camera) }
        );
        const coords = alphaValue > 0 ? pathSet.hybrid : pathSet.geo;
        const path = new Path2D();
        coords.forEach((pt, idx) => {
          if (idx === 0) path.moveTo(pt[0], pt[1]);
          else path.lineTo(pt[0], pt[1]);
        });
        ctx.strokeStyle = INFRA_COLORS[line.type ?? line.kind ?? "pipeline_gas_strategic"] ?? "#22c55e";
        ctx.lineWidth = 1.2;
        ctx.stroke(path);
      };

      if (layers.pipelines) {
        infra.internalSegments
          .filter((seg) => seg.type === "pipeline_gas_strategic" || seg.type === "pipeline_oil_strategic")
          .forEach(drawInternal);
        infra.transnationalSegments
          .filter((seg) => seg.type === "pipeline_gas_strategic" || seg.type === "pipeline_oil_strategic")
          .forEach(drawTransnational);
      }
      if (layers.ports || layers.mines || layers.power || layers.cables) {
        const nodeTypes = new Set<string>();
        if (layers.ports) {
          ["port_container_major", "oil_gas_platform_offshore_major"].forEach((t) => nodeTypes.add(t));
        }
        if (layers.mines) nodeTypes.add("mine_critical_major");
        if (layers.power) nodeTypes.add("airport_hub_major");
        infra.nodes
          .filter((n) => (n.type ? nodeTypes.has(n.type) : false))
          .forEach((node) => {
            const projected = applyCameraToPoint(projection([node.lon, node.lat]), camera);
            ctx.fillStyle = INFRA_COLORS[node.type ?? "port_container_major"] ?? "#c084fc";
            ctx.beginPath();
            ctx.arc(projected[0], projected[1], 3, 0, Math.PI * 2);
            ctx.fill();
          });
      }
    }
  }, [
    alphaValue,
    borderSegments,
    borderSemanticsMap,
    camera,
    conceptOffsets,
    infra,
    getSegmentCoords,
    layers,
    projection,
    scheme,
    schemeSelection.groups,
    selectedBorderId,
    selectedCountry,
    shapes,
    viewport.height,
    viewport.width,
    viewportObj,
  ]);

  useEffect(() => {
    drawScene();
  }, [drawScene]);

  const toggleGroup = (group: string) => {
    setSchemeSelection((prev) => {
      const groups = new Set(prev.groups);
      if (groups.has(group)) groups.delete(group);
      else groups.add(group);
      return { ...prev, groups };
    });
  };

  const handleCanvasClick = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;
    const hit: HitResult = {};

    for (const shape of shapes) {
      const offset = conceptOffsets.get(shape.country_id) ?? [0, 0];
      const path = polygonToPath(shape, offset, camera);
      if (canvasRef.current && canvasRef.current.getContext("2d")?.isPointInPath(path, x, y)) {
        hit.countryId = shape.country_id;
        break;
      }
    }

    if (!hit.countryId && layers.borders) {
      for (const segment of borderSegments) {
        const segId = formatBorderSegmentId(segment.id);
        const offsetA = conceptOffsets.get(segment.country_a) ?? [0, 0];
        const offsetB =
          segment.country_b && segment.country_b !== "SEA"
            ? conceptOffsets.get(segment.country_b) ?? [0, 0]
            : offsetA;
        const avgOffset: [number, number] = [
          (offsetA[0] + offsetB[0]) / 2,
          (offsetA[1] + offsetB[1]) / 2,
        ];
        const coords = getSegmentCoords(segment).map((pt) => [
          pt[0] + avgOffset[0],
          pt[1] + avgOffset[1],
        ]) as [number, number][];
        const path = lineToPath(coords, camera);
        const ctx = canvasRef.current.getContext("2d");
        if (ctx && ctx.isPointInStroke(path, x, y)) {
          hit.segmentId = segId;
          break;
        }
      }
    }

    setSelectedCountry(hit.countryId ?? null);
    setSelectedBorderId(hit.segmentId ?? null);
  };

  const selectedCountryMeta = selectedCountry
    ? baseCountries.find((c) => c.id === selectedCountry)
    : undefined;
  const selectedCountryTags = selectedCountry ? getCountryBaseTags(selectedCountry) : undefined;
  const selectedLanguages = selectedCountry
    ? baseLanguages.filter((lang) => lang.country_ids.includes(selectedCountry))
    : [];

  const selectedSegmentSemantics = selectedBorderId
    ? borderSemanticsList.find((s) => s.segment_id === selectedBorderId)
    : undefined;

  const selectedSegmentTagged = useMemo(() => {
    if (!selectedBorderId || !borderSemanticScheme) return false;
    const entry = borderSemanticsList.find((s) => s.segment_id === selectedBorderId);
    return entry?.tags.includes(borderSemanticScheme) ?? false;
  }, [borderSemanticScheme, borderSemanticsList, selectedBorderId]);

  const selectedHiCoords = selectedSegment?.geometry.coords_hi_res ?? [];
  const selectedLowCoords = selectedSegment?.geometry.coords_low_res ?? [];
  const selectedHiLength = selectedHiCoords.length ? lengthKm(selectedHiCoords) : 0;
  const selectedLowLength = selectedLowCoords.length ? lengthKm(selectedLowCoords) : null;
  const selectedLengthDiffPct =
    selectedLowLength !== null && selectedHiLength > 0
      ? ((selectedLowLength - selectedHiLength) / selectedHiLength) * 100
      : null;

  const currentLodMode =
    borderLodOverride === "auto"
      ? `${selectLOD(camera.zoom)} (auto)`
      : `${borderLodOverride === "hi" ? "hi-res" : "low-res"} (manual)`;

  const toggleBorderLodOverride = () => {
    setBorderLodOverride((prev) => {
      if (prev === "auto") return "low";
      if (prev === "low") return "hi";
      return "auto";
    });
  };

  const updateZoom = (zoom: number) => {
    setCamera((cam) => ({ ...cam, zoom: Math.max(0.2, Math.min(5, zoom)) }));
  };

  const panBy = (dx: number, dy: number) => {
    setCamera((cam) => ({ ...cam, panOffsetX: cam.panOffsetX + dx, panOffsetY: cam.panOffsetY + dy }));
  };

  return (
    <div className="app-shell">
      <div className="panel controls">
        <h3>Camera</h3>
        <label>
          Zoom: {camera.zoom.toFixed(2)}
          <input
            type="range"
            min={0.5}
            max={4}
            step={0.05}
            value={camera.zoom}
            onChange={(e) => updateZoom(parseFloat(e.target.value))}
          />
        </label>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button onClick={() => panBy(0, -40)}>↑</button>
          <button onClick={() => panBy(-40, 0)}>←</button>
          <button onClick={() => panBy(40, 0)}>→</button>
          <button onClick={() => panBy(0, 40)}>↓</button>
        </div>

        <h3>Layout</h3>
        <label>
          <input
            type="radio"
            checked={layoutMode === "geo"}
            onChange={() => setLayoutMode("geo")}
          />
          Geographic
        </label>
        <label>
          <input
            type="radio"
            checked={layoutMode === "concept"}
            onChange={() => setLayoutMode("concept")}
          />
          Concept
        </label>
        <label>
          <input
            type="radio"
            checked={layoutMode === "hybrid"}
            onChange={() => setLayoutMode("hybrid")}
          />
          Hybrid
        </label>
        <div data-testid="layout-mode-label" className="status-row">
          Mode: {layoutMode}
        </div>
        {layoutMode === "hybrid" && (
          <label>
            Alpha: {hybridAlpha.toFixed(2)}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={hybridAlpha}
              onChange={(e) => setHybridAlpha(parseFloat(e.target.value))}
            />
          </label>
        )}

        <h3>World Model</h3>
        <label>
          Scheme
          <select
            value={schemeSelection.schemeId}
            onChange={(e) => setSchemeSelection({ schemeId: e.target.value, groups: new Set() })}
          >
            {baseSchemes.map((s) => (
              <option value={s.id} key={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <div className="scheme-groups">
          {(scheme?.groups ?? []).map((g) => (
            <label key={g}>
              <input
                type="checkbox"
                checked={schemeSelection.groups.has(g)}
                onChange={() => toggleGroup(g)}
              />
              <span style={{ color: paletteColor(g, scheme) }}>{g}</span>
            </label>
          ))}
        </div>

        <h3>Layers</h3>
        {Object.entries(layers).map(([key, value]) => (
          <label className="layer-toggle" key={key}>
            <input
              type="checkbox"
              checked={value}
              onChange={() => setLayers((prev) => ({ ...prev, [key]: !prev[key as keyof typeof layers] }))}
            />
            {key}
            <span
              className="status-row"
              data-testid={`layer-${key}-state`}
              style={{ marginLeft: 8 }}
            >
              {value ? "on" : "off"}
            </span>
          </label>
        ))}

        <div className="status-row">LOD: {lodLevel}</div>
        <div className="status-row">
          Infra: {infraStatus} ({useLiveInfrastructure ? "live (opt-in)" : "fixtures/offline"})
        </div>
        {allowLiveInfrastructure ? (
          <label className="layer-toggle">
            <input
              type="checkbox"
              checked={useLiveInfrastructure}
              onChange={(evt) => setUseLiveInfrastructure(evt.target.checked)}
            />
            Use live infrastructure data (default is offline fixtures; may be slow/non-deterministic)
          </label>
        ) : (
          <p className="status-row">
            Infrastructure uses fixture data by default for offline-deterministic runs.
          </p>
        )}
        {loading && <div className="status-row">Loading world data…</div>}
      </div>

      <div className="panel" style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
        <canvas
          ref={canvasRef}
          width={viewport.width}
          height={viewport.height}
          onClick={handleCanvasClick}
          style={{ width: "100%", height: "100%", maxHeight: "calc(100vh - 40px)" }}
        />
      </div>

      <div className="panel">
        <h3>Selection</h3>
        {selectedCountryMeta ? (
          <div>
            <h4>
              {selectedCountryMeta.name_en} ({selectedCountryMeta.id})
            </h4>
            <p>
              Region: {selectedCountryMeta.un_region} / {selectedCountryMeta.un_subregion}
            </p>
            <p>Languages: {selectedLanguages.map((l) => l.name_en).join(", ") || "N/A"}</p>
            <div>
              <strong>Tags</strong>
              <ul className="info-list">
                {(scheme ? [scheme] : baseSchemes).map((s) => (
                  <li key={`${selectedCountryMeta.id}-${s.id}`}>
                    {s.label}: {JSON.stringify(selectedCountryTags?.[s.id] ?? null)}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <strong>Borders</strong>
              <p>
                Neighbours: {getBorderSegmentsForCountry(selectedCountryMeta.id).length} segments
              </p>
            </div>
          </div>
        ) : selectedBorderId ? (
          <div>
            <h4>Border Segment {selectedBorderId}</h4>
            <p>Tags: {selectedSegmentSemantics?.tags.join(", ") || "None"}</p>
          </div>
        ) : (
          <p>Select a country or border segment.</p>
        )}

        <h3>Border LOD Debug</h3>
        <div className="debug-row">Current zoom: {camera.zoom.toFixed(2)}</div>
        <div className="debug-row">Current LOD mode: {currentLodMode}</div>
        <div className="debug-row">Selected segment: {selectedBorderId ?? "None"}</div>
        <button className="debug-toggle" onClick={toggleBorderLodOverride}>
          Toggle border LOD (auto → low → hi)
        </button>
        {selectedSegment ? (
          <div className="debug-grid">
            <div>
              <div className="debug-label">Hi-res vertices</div>
              <div className="debug-value">{selectedHiCoords.length}</div>
            </div>
            <div>
              <div className="debug-label">Low-res vertices</div>
              <div className="debug-value">{selectedLowCoords.length || "n/a"}</div>
            </div>
            <div>
              <div className="debug-label">Length (hi)</div>
              <div className="debug-value">{selectedHiLength.toFixed(2)} km</div>
            </div>
            <div>
              <div className="debug-label">Length (low)</div>
              <div className="debug-value">
                {selectedLowLength !== null ? `${selectedLowLength.toFixed(2)} km` : "n/a"}
              </div>
            </div>
            <div>
              <div className="debug-label">Difference</div>
              <div className="debug-value">
                {selectedLengthDiffPct !== null ? `${selectedLengthDiffPct.toFixed(2)}%` : "n/a"}
              </div>
            </div>
          </div>
        ) : (
          <p className="status-row">Select a border to inspect geometry.</p>
        )}

        <h3>Border semantics debug</h3>
        <div className="debug-row">
          Current scheme:
          <select
            value={borderSemanticScheme}
            onChange={(evt) => setBorderSemanticScheme(evt.target.value)}
            style={{ marginLeft: 8 }}
          >
            {borderSemanticTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </div>
        {selectedSegment ? (
          <div className="debug-grid">
            <div>
              <div className="debug-label">Segment</div>
              <div className="debug-value">{formatBorderSegmentId(selectedSegment.id)}</div>
            </div>
            <div>
              <div className="debug-label">Countries</div>
              <div className="debug-value">
                {selectedSegment.country_a} / {selectedSegment.country_b}
              </div>
            </div>
            <div>
              <div className="debug-label">Tagged?</div>
              <div className="debug-value">{selectedSegmentTagged ? "Yes" : "No"}</div>
            </div>
          </div>
        ) : (
          <p className="status-row">Select a border to inspect semantics.</p>
        )}
        <div>
          <strong>Tagged segments per scheme</strong>
          <ul className="info-list">
            {borderSemanticTags.map((tag) => (
              <li key={tag}>
                {tag}: {borderSemanticSummary.get(tag) ?? 0}
              </li>
            ))}
          </ul>
        </div>

        <h3>Quick Queries</h3>
        <p>NATO members tagged: {getBaseSchemeMembers("geo_political_blocs", "nato").length}</p>
        <p>EU customs union members: {getBaseSchemeMembers("economic_blocs", "eu_customs_union").length}</p>
        <p>WTO members tracked: {getBaseSchemeMembers("financial_structures", "wto_member").length}</p>
      </div>
    </div>
  );
};

export default App;
