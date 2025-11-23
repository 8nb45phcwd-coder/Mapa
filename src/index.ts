/**
 * World Map Engine Core
 * ---------------------
 * Stateless, projection-agnostic mapping kernel for interactive conceptual layouts.
 */
export * from "./types.js";
export {
  loadDefaultWorld,
  loadTopoJSON,
  decodeGeometryByRef,
  buildCountryAnchor,
  createRenderCountryShape,
  projectGeometry,
  ProjectedGeometryCache,
  IDENTITY_TRANSFORM,
  applyTransform,
  prepareRenderCountryShape,
} from "./geometry.js";

export {
  applyConceptLayout,
  detachCountry,
  scaleCountry,
  updateBoundingVolumes,
  resolveCollisions,
  resetTransform,
  conceptToScreen,
} from "./render.js";

export { interpolatePositions, interpolateTransform, screenPosHybrid } from "./interpolate.js";

export { resolvePaintFor, getBorderSegmentRenderInfo } from "./style.js";

export { buildClusterEnvelope, buildClusterMemberEnvelopes } from "./layout.js";

export { generateSubdivisions, projectSubdivisionCells } from "./subdivision.js";

export {
  clipInternalInfrastructure,
  projectInfrastructureLine,
  buildTransnationalHybridPath,
} from "./infrastructure.js";

export {
  ingestInfrastructure,
  defaultInfraSources,
  ensureNodeWithinCountry,
  ensureSegmentWithinCountry,
  buildCountryGeoIndex,
} from "./infrastructureIngest.js";

export { registerLayer, unregisterLayer, getLayers } from "./layers.js";
