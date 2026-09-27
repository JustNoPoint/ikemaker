'use strict';

function clampZoom(value) {
  return Math.max(.25, Math.min(8, Number(value) || 1));
}

function screenPoint(originX, originY, worldX, worldY, zoom) {
  const scale = clampZoom(zoom);
  return { x: Number(originX) + Number(worldX) * scale, y: Number(originY) + Number(worldY) * scale };
}

function worldPoint(originX, originY, screenX, screenY, zoom) {
  const scale = clampZoom(zoom);
  return { x: (Number(screenX) - Number(originX)) / scale, y: (Number(screenY) - Number(originY)) / scale };
}

function zoomPan(oldZoom, nextZoom, panX, panY, pointerX, pointerY, pivotX, pivotY) {
  const oldScale = clampZoom(oldZoom), nextScale = clampZoom(nextZoom);
  return {
    x: Number(pointerX) - Number(pivotX) - (Number(pointerX) - Number(pivotX) - Number(panX)) * nextScale / oldScale,
    y: Number(pointerY) - Number(pivotY) - (Number(pointerY) - Number(pivotY) - Number(panY)) * nextScale / oldScale
  };
}

function normalizePreviewScene(value = {}) {
  const finite = (candidate, fallback) => Number.isFinite(Number(candidate)) ? Number(candidate) : fallback;
  return {
    zoom: clampZoom(value.zoom ?? 2),
    panX: finite(value.panX, 0),
    panY: finite(value.panY, 0),
    p1WorldX: finite(value.p1WorldX, -40),
    p1WorldY: finite(value.p1WorldY, 0),
    p2WorldX: finite(value.p2WorldX, 40),
    p2WorldY: finite(value.p2WorldY, 0)
  };
}

function previewAxes(width, height, value = {}) {
  const scene = normalizePreviewScene(value), origin = {
    x: Number(width) / 2 + scene.panX,
    y: Number(height) * .78 + scene.panY
  };
  return {
    origin,
    p1: screenPoint(origin.x, origin.y, scene.p1WorldX, scene.p1WorldY, scene.zoom),
    p2: screenPoint(origin.x, origin.y, scene.p2WorldX, scene.p2WorldY, scene.zoom)
  };
}

function migrateOpponent(saved = {}, zoom = 2, viewportWidth = 960, viewportHeight = 540) {
  if (Number.isFinite(Number(saved.opponentWorldX)) && Number.isFinite(Number(saved.opponentWorldY))) {
    return { x: Number(saved.opponentWorldX), y: Number(saved.opponentWorldY) };
  }
  const oldX = Number.isFinite(Number(saved.opponentX)) ? Number(saved.opponentX) : Number(viewportWidth) / 2 + 80;
  const oldY = Number.isFinite(Number(saved.opponentY)) ? Number(saved.opponentY) : Number(viewportHeight) * .8 - 2;
  return worldPoint(Number(viewportWidth) / 2, Number(viewportHeight) * .8, oldX, oldY, zoom);
}

function clientScript() {
  return `const moveView=(()=>{const clampZoom=${clampZoom.toString()},screenPoint=${screenPoint.toString()},worldPoint=${worldPoint.toString()},zoomPan=${zoomPan.toString()},normalizePreviewScene=${normalizePreviewScene.toString()},previewAxes=${previewAxes.toString()},migrateOpponent=${migrateOpponent.toString()};return{clampZoom,screenPoint,worldPoint,zoomPan,normalizePreviewScene,previewAxes,migrateOpponent}})();`;
}

module.exports = { clampZoom, screenPoint, worldPoint, zoomPan, normalizePreviewScene, previewAxes, migrateOpponent, clientScript };
