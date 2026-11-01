'use strict';

const { normalizeTrajectory, sampleTrajectory, sampleRange, displayAngles, TRAJECTORY_LIMITS } = require('./trajectory_model');

const PREVIEW_LIMITS = Object.freeze({ pathSamples: 2048, ghosts: 512, boxes: 512, viewport: 16384, zoom: 64 });

function fail(message) { throw new Error(`Trajectory preview: ${message}`); }
function finite(value, label, fallback) { if (value === undefined) return fallback; const n = Number(value); if (!Number.isFinite(n)) fail(`${label} must be finite.`); return n; }
function integer(value, label, minimum, maximum, fallback) { const n = finite(value, label, fallback); if (!Number.isInteger(n) || n < minimum || n > maximum) fail(`${label} must be a whole number from ${minimum} through ${maximum}.`); return n; }
function point(value, label, fallback = [0, 0]) { const v = value === undefined ? fallback : value; if (!Array.isArray(v) || v.length !== 2) fail(`${label} must contain X and Y.`); return [finite(v[0], `${label} X`), finite(v[1], `${label} Y`)]; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
function normalizeProjection(value = {}, localCoord = [320, 240]) {
  const viewport = point(value.viewport, 'viewport', [640, 480]);
  if (viewport.some((entry) => entry <= 0 || entry > PREVIEW_LIMITS.viewport)) fail(`viewport dimensions must be positive and no larger than ${PREVIEW_LIMITS.viewport}.`);
  const zoom = finite(value.zoom, 'zoom', 1);
  if (zoom <= 0 || zoom > PREVIEW_LIMITS.zoom) fail(`zoom must be greater than zero and no larger than ${PREVIEW_LIMITS.zoom}.`);
  return { viewport, localCoord: [...localCoord], origin: point(value.origin, 'origin', [viewport[0] / 2, viewport[1] / 2]), pan: point(value.pan, 'pan'), zoom };
}
function projectPoint(value, projection) {
  const p = point(value, 'point'), model = normalizeProjection(projection, projection?.localCoord || [320, 240]);
  const scale = [model.viewport[0] / model.localCoord[0] * model.zoom, model.viewport[1] / model.localCoord[1] * model.zoom];
  return deepFreeze([model.origin[0] + model.pan[0] + p[0] * scale[0], model.origin[1] + model.pan[1] + p[1] * scale[1]]);
}
function transformPoint(value, center, scale, angleRadians) {
  const x = value[0] * scale[0], y = value[1] * scale[1], cos = Math.cos(angleRadians), sin = Math.sin(angleRadians);
  return [center[0] + x * cos - y * sin, center[1] + x * sin + y * cos];
}
function normalizeSprite(sprite) {
  if (!sprite) return null;
  const width = finite(sprite.width, 'sprite width'), height = finite(sprite.height, 'sprite height');
  if (width < 0 || height < 0 || width > PREVIEW_LIMITS.viewport * 4 || height > PREVIEW_LIMITS.viewport * 4) fail('sprite dimensions are outside preview limits.');
  const scale = point(sprite.scale, 'sprite scale', [1, 1]), axis = point(sprite.axis, 'sprite axis'), offset = point(sprite.offset, 'sprite offset');
  const angleRadians = sprite.angleRadians !== undefined ? finite(sprite.angleRadians, 'sprite angleRadians') : finite(sprite.angleDegrees, 'sprite angleDegrees', 0) * Math.PI / 180;
  return { width, height, axis, offset, scale, angleRadians, facing: finite(sprite.facing, 'sprite facing', 1) < 0 ? -1 : 1 };
}
function spriteGeometry(sprite, position) {
  if (!sprite) return null;
  const origin = [position[0] + sprite.offset[0], position[1] + sprite.offset[1]], sx = sprite.scale[0] * sprite.facing, sy = sprite.scale[1];
  const local = [[-sprite.axis[0], -sprite.axis[1]], [sprite.width - sprite.axis[0], -sprite.axis[1]], [sprite.width - sprite.axis[0], sprite.height - sprite.axis[1]], [-sprite.axis[0], sprite.height - sprite.axis[1]]];
  return { origin, corners: local.map((entry) => transformPoint(entry, origin, [sx, sy], sprite.angleRadians)) };
}
function collisionGeometry(boxes, sprite, position) {
  if (!Array.isArray(boxes)) return [];
  if (boxes.length > PREVIEW_LIMITS.boxes) fail(`collision boxes exceed the preview limit of ${PREVIEW_LIMITS.boxes}.`);
  const source = sprite || { offset: [0, 0], scale: [1, 1], angleRadians: 0, facing: 1 }, origin = [position[0] + source.offset[0], position[1] + source.offset[1]], scale = [source.scale[0] * source.facing, source.scale[1]];
  return boxes.map((box, index) => {
    if (!Array.isArray(box) || box.length !== 4) fail(`collision box ${index + 1} must contain x1, y1, x2, y2.`);
    const values = box.map((entry, at) => finite(entry, `collision box ${index + 1} value ${at + 1}`)), points = [[values[0], values[1]], [values[2], values[1]], [values[2], values[3]], [values[0], values[3]]];
    return { source: values, corners: points.map((entry) => transformPoint(entry, origin, scale, source.angleRadians)) };
  });
}
function evenlySpacedIntegerTicks(duration, count) {
  if (count === 0) return [];
  if (count <= 1) return [0];
  const ticks = [];
  for (let index = 0; index < count; index += 1) ticks.push(Math.round(duration * index / (count - 1)));
  return [...new Set(ticks)];
}
function reference(value, label) {
  if (!value) return null;
  return { label: String(value.label || label).slice(0, 120), position: point(value.position, `${label} position`), provenance: String(value.provenance || 'host observation').slice(0, 240) };
}
function createTrajectoryPreview(input, options = {}) {
  const plan = normalizeTrajectory(input);
  if (!plan.previewAvailable) return deepFreeze({ available: false, reason: 'Authored formulas are retained as opaque text and are not executed by IKEMaker.', plan, runtimeEvidence: 'physical-pending' });
  const tick = integer(options.tick, 'tick', 0, plan.durationTicks, 0), projection = normalizeProjection(options.projection, plan.localCoord);
  const pathSampleCount = integer(options.pathSampleCount, 'path sample count', 2, PREVIEW_LIMITS.pathSamples, Math.min(plan.durationTicks + 1, 121));
  const ghostCount = integer(options.ghostCount, 'ghost count', 0, PREVIEW_LIMITS.ghosts, Math.min(12, plan.durationTicks + 1));
  const ghostOpacity = finite(options.ghostOpacity, 'ghost opacity', 0.35);
  if (ghostOpacity < 0 || ghostOpacity > 1) fail('ghost opacity must be from zero through one.');
  const current = sampleTrajectory(plan, tick), sprite = normalizeSprite(options.sprite), boxes = collisionGeometry(options.collisionBoxes || [], sprite, current.position);
  const path = sampleRange(plan, { count: pathSampleCount }).map((sample) => ({ tick: sample.tick, position: sample.position, canvas: projectPoint(sample.position, projection) }));
  const ghostTicks = evenlySpacedIntegerTicks(plan.durationTicks, ghostCount), ghosts = ghostTicks.map((ghostTick) => {
    const sample = sampleTrajectory(plan, ghostTick);
    return { tick: ghostTick, position: sample.position, canvas: projectPoint(sample.position, projection), opacity: ghostOpacity };
  });
  const geometry = spriteGeometry(sprite, current.position), projectCorners = corners => corners.map((entry) => projectPoint(entry, projection));
  return deepFreeze({
    available: true,
    plan,
    playbackDefault: 'stopped',
    runtimeEvidence: 'physical-pending',
    playhead: { tick, minimum: 0, maximum: plan.durationTicks, previous: Math.max(0, tick - 1), next: Math.min(plan.durationTicks, tick + 1) },
    current: { ...current, canvas: projectPoint(current.position, projection), centerCanvas: projectPoint(current.center, projection), velocityEndCanvas: projectPoint([current.position[0] + current.velocity[0], current.position[1] + current.velocity[1]], projection) },
    path,
    ghosts,
    sampling: { simulationTicks: plan.durationTicks + 1, pathSampleCount, ghostCount: ghosts.length, ghostTicks, displayOnly: true },
    sprite: geometry ? { ...geometry, canvasCorners: projectCorners(geometry.corners) } : null,
    collisionBoxes: boxes.map((box) => ({ ...box, canvasCorners: projectCorners(box.corners) })),
    references: {
      owner: reference(options.references?.owner, 'Owner'),
      p2: reference(options.references?.p2, 'P2'),
      camera: reference(options.references?.camera, 'Camera')
    },
    inspector: {
      tick,
      position: current.position,
      velocity: current.velocity,
      progress: current.progress,
      angleRadians: current.angleRadians,
      angleDegrees: current.angleRadians * 180 / Math.PI,
      planAngles: displayAngles(plan),
      coordinateSpace: plan.coordinateSpace,
      owner: plan.owner,
      anchor: plan.anchor,
      localCoord: plan.localCoord
    },
    projection
  });
}

module.exports = { PREVIEW_LIMITS, projectPoint, createTrajectoryPreview };
