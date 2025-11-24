import type { CameraState, Viewport } from "../types.js";

export function createCameraState(viewportWidth: number, viewportHeight: number): CameraState {
  return {
    zoom: 1,
    center: [viewportWidth / 2, viewportHeight / 2],
    panOffsetX: 0,
    panOffsetY: 0,
    viewportWidth,
    viewportHeight,
  };
}

export function applyZoom(state: CameraState, delta: number, anchorPoint?: [number, number]): CameraState {
  const anchor = anchorPoint ?? [state.viewportWidth / 2, state.viewportHeight / 2];
  const newZoom = Math.max(0.1, state.zoom * delta);
  const ratio = newZoom / state.zoom;
  const newPanX = state.panOffsetX * ratio + anchor[0] * (1 - ratio);
  const newPanY = state.panOffsetY * ratio + anchor[1] * (1 - ratio);
  state.zoom = newZoom;
  state.panOffsetX = newPanX;
  state.panOffsetY = newPanY;
  return state;
}

export function applyPan(state: CameraState, dx: number, dy: number): CameraState {
  state.panOffsetX += dx;
  state.panOffsetY += dy;
  return state;
}

export function applyCameraToPoint(point: [number, number], camera: CameraState): [number, number] {
  const [x, y] = point;
  const cx = camera.center[0];
  const cy = camera.center[1];
  const scaledX = (x - cx) * camera.zoom + cx + camera.panOffsetX;
  const scaledY = (y - cy) * camera.zoom + cy + camera.panOffsetY;
  return [scaledX, scaledY];
}

export function invertCameraPoint(point: [number, number], camera: CameraState): [number, number] {
  const [x, y] = point;
  const cx = camera.center[0];
  const cy = camera.center[1];
  const invX = (x - cx - camera.panOffsetX) / camera.zoom + cx;
  const invY = (y - cy - camera.panOffsetY) / camera.zoom + cy;
  return [invX, invY];
}

export function geoToScreen(
  geoCoord: [number, number],
  camera: CameraState,
  projection: ((coords: [number, number]) => [number, number]) & { invert?: (pt: [number, number]) => [number, number] }
): [number, number] {
  const projected = projection([geoCoord[0], geoCoord[1]]);
  return applyCameraToPoint(projected, camera);
}

export function screenToGeo(
  screenCoord: [number, number],
  camera: CameraState,
  projection: ((coords: [number, number]) => [number, number]) & { invert?: (pt: [number, number]) => [number, number] }
): [number, number] {
  if (typeof projection.invert !== "function") {
    throw new Error("Projection invert not available for screenToGeo");
  }
  const unscaled = invertCameraPoint(screenCoord, camera);
  return projection.invert(unscaled) as [number, number];
}

export function cameraViewport(camera: CameraState): Viewport {
  return { width: camera.viewportWidth, height: camera.viewportHeight };
}

export function adjustCameraToViewport(camera: CameraState, viewport: Viewport): CameraState {
  camera.viewportWidth = viewport.width;
  camera.viewportHeight = viewport.height;
  if (!Number.isFinite(camera.center[0]) || !Number.isFinite(camera.center[1])) {
    camera.center = [viewport.width / 2, viewport.height / 2];
  }
  return camera;
}

/**
 * Blend conceptual and geographic positions under camera zoom/pan.
 */
export function screenPosHybridWithCamera(
  geoPos: [number, number],
  conceptPos: [number, number],
  alpha: number,
  camera: CameraState
): [number, number] {
  const blended: [number, number] = [
    geoPos[0] * (1 - alpha) + conceptPos[0] * alpha,
    geoPos[1] * (1 - alpha) + conceptPos[1] * alpha,
  ];
  return applyCameraToPoint(blended, camera);
}
