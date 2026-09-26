'use strict';

const { parallaxDimensions } = require('./stage_model');

function sampleParallax(model, item, sprite, cameraX, zoom) {
  const shape = parallaxDimensions(item, sprite && sprite.width);
  if (!shape) return null;
  const width = Math.max(shape.top, shape.bottom) * Math.abs(item.scaleStart[0] || 1);
  const sourceLeft = model.localCoord[0] / 2 + item.start[0] - cameraX * item.delta[0] - (sprite ? sprite.axisX : 0);
  const sourceCenter = sourceLeft + width / 2;
  const anchor = model.camera.zoomAnchor === 'bottom' ? model.localCoord[0] / 2 : model.localCoord[0] / 2;
  const center = anchor + (sourceCenter - anchor) * zoom;
  const drawnWidth = width * zoom;
  const left = center - drawnWidth / 2, right = center + drawnWidth / 2;
  return { cameraX, zoom, left, right, width: drawnWidth, gapLeft: Math.max(0, left), gapRight: Math.max(0, model.localCoord[0] - right), covered: left <= 0 && right >= model.localCoord[0] };
}

function analyzeParallax(model, item, sprite) {
  if (!item || item.type !== 'parallax') return null;
  const cameras = [...new Set([model.camera.bounds[0], model.camera.start[0], model.camera.bounds[1]])];
  const zooms = [...new Set([model.camera.zoom[1], model.camera.zoom[0], model.camera.zoom[2]])];
  const samples = [];
  for (const cameraX of cameras) for (const zoom of zooms) samples.push(sampleParallax(model, item, sprite, cameraX, zoom));
  const failing = item.tile[0] ? [] : samples.filter((sample) => !sample.covered);
  const maxGap = failing.reduce((result, sample) => Math.max(result, sample.gapLeft, sample.gapRight), 0);
  const shape = parallaxDimensions(item, sprite && sprite.width);
  return {
    shape,
    samples,
    failing: failing.length,
    maxGap,
    coverage: item.tile[0] ? 'tiled' : failing.length ? 'review' : 'covered',
    note: item.autoResizeParallax
      ? 'AutoResizeParallax changes severe zoom-out behavior; the canvas sweep is an authoring estimate and must be verified in IKEMEN.'
      : 'Coverage estimates use explicit width/xscale, delta, scale, camera bounds, and zoom. Engine verification remains authoritative.'
  };
}

module.exports = { sampleParallax, analyzeParallax };
