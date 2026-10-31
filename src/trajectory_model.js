'use strict';

const TAU = Math.PI * 2;
const TRAJECTORY_KINDS = Object.freeze(['circle', 'ellipse', 'arc', 'spiral', 'formula']);
const COORDINATE_SPACES = Object.freeze(['owner-relative', 'local', 'world', 'screen', 'camera', 'stage']);
const OWNER_KINDS = Object.freeze(['self', 'root', 'parent', 'helper', 'p1', 'p2', 'screen', 'camera', 'stage-point', 'expression']);
const EASINGS = Object.freeze(['linear', 'ease-in', 'ease-out', 'ease-in-out']);
const TRAJECTORY_LIMITS = Object.freeze({
  durationTicks: 36000,
  rangeSamples: 8192,
  coordinate: 1000000,
  radius: 1000000,
  loops: 1000,
  expressionLength: 2048,
  nameLength: 120,
  ownerIdLength: 120
});

function fail(message) { throw new Error(`Trajectory: ${message}`); }
function finite(value, label, fallback) {
  if (value === undefined && fallback !== undefined) return fallback;
  const result = Number(value);
  if (!Number.isFinite(result)) fail(`${label} must be a finite number.`);
  return result;
}
function bounded(value, label, maximum, fallback) {
  const result = finite(value, label, fallback);
  if (Math.abs(result) > maximum) fail(`${label} exceeds the supported magnitude ${maximum}.`);
  return result;
}
function boundedInteger(value, label, minimum, maximum, fallback) {
  const result = finite(value, label, fallback);
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) fail(`${label} must be a whole number from ${minimum} through ${maximum}.`);
  return result;
}
function pair(value, label, fallback = [0, 0], maximum = TRAJECTORY_LIMITS.coordinate) {
  const source = value === undefined ? fallback : value;
  if (!Array.isArray(source) || source.length !== 2) fail(`${label} must contain exactly X and Y.`);
  return [bounded(source[0], `${label} X`, maximum), bounded(source[1], `${label} Y`, maximum)];
}
function choice(value, label, allowed, fallback) {
  const result = value === undefined ? fallback : String(value).trim().toLowerCase();
  if (!allowed.includes(result)) fail(`${label} must be one of: ${allowed.join(', ')}.`);
  return result;
}
function cleanText(value, label, maximum, fallback = '') {
  const result = value === undefined ? fallback : String(value).trim();
  if (result.length > maximum || /[\u0000-\u001f\u007f]/.test(result)) fail(`${label} is not bounded text.`);
  return result;
}
function radians(input, degreeKey, radianKey, fallback = 0) {
  if (input[degreeKey] !== undefined && input[radianKey] !== undefined) fail(`${degreeKey} and ${radianKey} cannot both be supplied.`);
  if (input[radianKey] !== undefined) return bounded(input[radianKey], radianKey, Math.PI * TRAJECTORY_LIMITS.loops * 2);
  return bounded(input[degreeKey], degreeKey, 360 * TRAJECTORY_LIMITS.loops, fallback * 180 / Math.PI) * Math.PI / 180;
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
function ownerRecord(input = {}) {
  const kind = choice(input.kind, 'owner kind', OWNER_KINDS, 'self');
  const id = cleanText(input.id, 'owner ID', TRAJECTORY_LIMITS.ownerIdLength);
  const expression = cleanText(input.expression, 'owner expression', TRAJECTORY_LIMITS.expressionLength);
  if (kind === 'helper' && !id) fail('helper owner requires an explicit ID.');
  if (kind === 'expression' && !expression) fail('expression owner requires an explicit authored expression.');
  if (kind !== 'expression' && expression) fail('owner expression is only valid for an expression owner.');
  return { kind, id, expression, reviewed: input.reviewed === true };
}
function anchorRecord(input = {}) {
  return {
    kind: cleanText(input.kind, 'anchor kind', 80, 'origin') || 'origin',
    position: pair(input.position, 'anchor position'),
    provenance: cleanText(input.provenance, 'anchor provenance', 240, 'user-authored') || 'user-authored'
  };
}
function engineRecord(input = {}) {
  const channel = choice(input.channel, 'engine channel', ['stable', 'nightly', 'custom'], 'stable');
  const version = cleanText(input.version, 'engine version', 80, channel === 'stable' ? '1.0' : '');
  const buildId = cleanText(input.buildId, 'engine build ID', 160);
  return { channel, version, buildId, baseline: channel === 'stable' && version === '1.0' };
}
function normalizeTrajectory(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('plan must be an object.');
  const kind = choice(input.kind, 'kind', TRAJECTORY_KINDS, 'circle');
  const durationTicks = boundedInteger(input.durationTicks, 'durationTicks', 1, TRAJECTORY_LIMITS.durationTicks, 60);
  const direction = choice(input.direction, 'direction', ['clockwise', 'counter-clockwise'], 'clockwise');
  const startRadius = pair(input.startRadius ?? input.radius, 'start radius', kind === 'circle' ? [40, 40] : [40, 24], TRAJECTORY_LIMITS.radius).map(Math.abs);
  let endRadius = pair(input.endRadius, 'end radius', startRadius, TRAJECTORY_LIMITS.radius).map(Math.abs);
  if (kind === 'circle') {
    startRadius[1] = startRadius[0];
    endRadius = [...startRadius];
  } else if (kind !== 'spiral') endRadius = [...startRadius];
  const loops = bounded(input.loops, 'loops', TRAJECTORY_LIMITS.loops, 1);
  if (loops <= 0) fail('loops must be greater than zero.');
  const defaultSweep = kind === 'arc' ? Math.PI : TAU * loops;
  const phaseRadians = radians(input, 'phaseDegrees', 'phaseRadians', 0);
  const tiltRadians = radians(input, 'tiltDegrees', 'tiltRadians', 0);
  const sweepRadians = radians(input, 'sweepDegrees', 'sweepRadians', defaultSweep);
  if (sweepRadians === 0) fail('sweep must not be zero. Use direction to choose travel direction.');
  const coordinateSpace = choice(input.coordinateSpace, 'coordinateSpace', COORDINATE_SPACES, 'owner-relative');
  const owner = ownerRecord(input.owner);
  const anchor = anchorRecord(input.anchor);
  if (coordinateSpace === 'owner-relative' && ['screen', 'camera', 'stage-point'].includes(owner.kind)) fail(`owner-relative coordinates cannot use ${owner.kind} as the owner.`);
  if (coordinateSpace === 'screen' && owner.kind !== 'screen') fail('screen coordinates require the explicit screen owner.');
  if (coordinateSpace === 'camera' && owner.kind !== 'camera') fail('camera coordinates require the explicit camera owner.');
  if (coordinateSpace === 'stage' && owner.kind === 'screen') fail('stage coordinates cannot use screen as the owner.');
  const formula = kind === 'formula' ? {
    x: cleanText(input.formula?.x, 'X formula', TRAJECTORY_LIMITS.expressionLength),
    y: cleanText(input.formula?.y, 'Y formula', TRAJECTORY_LIMITS.expressionLength)
  } : null;
  if (formula && (!formula.x || !formula.y)) fail('formula trajectories require explicit X and Y expressions.');
  return deepFreeze({
    version: 1,
    kind,
    name: cleanText(input.name, 'name', TRAJECTORY_LIMITS.nameLength, 'Orbit trajectory') || 'Orbit trajectory',
    durationTicks,
    coordinateSpace,
    owner,
    anchor,
    localCoord: pair(input.localCoord, 'localCoord', [320, 240]).map((value) => {
      if (value <= 0) fail('localCoord values must be positive.');
      return value;
    }),
    centerOffset: pair(input.centerOffset, 'centerOffset'),
    startRadius,
    endRadius,
    phaseRadians,
    tiltRadians,
    sweepRadians: Math.abs(sweepRadians),
    direction,
    directionSign: direction === 'clockwise' ? 1 : -1,
    facing: finite(input.facing, 'facing', 1) < 0 ? -1 : 1,
    easing: choice(input.easing, 'easing', EASINGS, 'linear'),
    engine: engineRecord(input.engine),
    formula,
    previewAvailable: kind !== 'formula',
    runtimeEvidence: 'physical-pending'
  });
}

function validateTrajectory(input) {
  try {
    const plan = normalizeTrajectory(input), issues = [];
    if (plan.owner.kind === 'expression' && !plan.owner.reviewed) issues.push({ level: 'warning', field: 'owner', message: 'The authored owner expression is preserved but must be reviewed before code generation.' });
    if (!plan.engine.baseline) issues.push({ level: 'info', field: 'engine', message: 'This plan is outside the stable 1.0 baseline. Capability-gated emitters must verify its exact engine target.' });
    if (!plan.previewAvailable) issues.push({ level: 'warning', field: 'formula', message: 'Authored formulas are retained as opaque text and are never executed by the preview.' });
    return { valid: true, plan, issues };
  } catch (error) {
    return { valid: false, plan: null, issues: [{ level: 'error', field: 'plan', message: error.message }] };
  }
}

function ease(name, value) {
  const t = Math.max(0, Math.min(1, value));
  if (name === 'ease-in') return t * t;
  if (name === 'ease-out') return 1 - (1 - t) * (1 - t);
  if (name === 'ease-in-out') return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  return t;
}
function positionAt(plan, tick) {
  if (!plan.previewAvailable) fail('authored formulas are opaque and cannot be executed by the preview.');
  const rawProgress = Math.max(0, Math.min(1, finite(tick, 'tick') / plan.durationTicks));
  const progress = ease(plan.easing, rawProgress);
  const angle = plan.phaseRadians + plan.directionSign * plan.sweepRadians * progress;
  const radiusX = plan.startRadius[0] + (plan.endRadius[0] - plan.startRadius[0]) * progress;
  const radiusY = plan.startRadius[1] + (plan.endRadius[1] - plan.startRadius[1]) * progress;
  const ellipseX = Math.cos(angle) * radiusX, ellipseY = Math.sin(angle) * radiusY;
  const cos = Math.cos(plan.tiltRadians), sin = Math.sin(plan.tiltRadians);
  const rotatedX = ellipseX * cos - ellipseY * sin, rotatedY = ellipseX * sin + ellipseY * cos;
  const center = [plan.anchor.position[0] + plan.centerOffset[0], plan.anchor.position[1] + plan.centerOffset[1]];
  return { tick: Math.max(0, Math.min(plan.durationTicks, finite(tick, 'tick'))), rawProgress, progress, angleRadians: angle, radius: [radiusX, radiusY], center, position: [center[0] + rotatedX * plan.facing, center[1] + rotatedY] };
}
function sampleTrajectory(input, tick) {
  const plan = normalizeTrajectory(input);
  const current = positionAt(plan, tick), delta = current.tick >= plan.durationTicks ? -1 : 1;
  const neighbor = positionAt(plan, current.tick + delta);
  const velocity = delta > 0
    ? [neighbor.position[0] - current.position[0], neighbor.position[1] - current.position[1]]
    : [current.position[0] - neighbor.position[0], current.position[1] - neighbor.position[1]];
  return deepFreeze({ ...current, velocity, direction: plan.direction, coordinateSpace: plan.coordinateSpace, owner: plan.owner, anchor: plan.anchor });
}
function sampleRange(input, options = {}) {
  const plan = normalizeTrajectory(input);
  if (!plan.previewAvailable) fail('authored formulas are opaque and cannot be sampled.');
  const startTick = bounded(options.startTick, 'startTick', plan.durationTicks, 0);
  const endTick = bounded(options.endTick, 'endTick', plan.durationTicks, plan.durationTicks);
  if (startTick < 0 || endTick < startTick) fail('sample range must satisfy 0 <= startTick <= endTick.');
  const count = boundedInteger(options.count, 'sample count', 2, TRAJECTORY_LIMITS.rangeSamples, Math.min(plan.durationTicks + 1, 121));
  const output = [];
  for (let index = 0; index < count; index += 1) output.push(sampleTrajectory(plan, startTick + (endTick - startTick) * index / (count - 1)));
  return deepFreeze(output);
}
function displayAngles(input) {
  const plan = normalizeTrajectory(input);
  return deepFreeze({ phaseDegrees: plan.phaseRadians * 180 / Math.PI, tiltDegrees: plan.tiltRadians * 180 / Math.PI, sweepDegrees: plan.sweepRadians * 180 / Math.PI });
}

module.exports = { TAU, TRAJECTORY_KINDS, COORDINATE_SPACES, OWNER_KINDS, EASINGS, TRAJECTORY_LIMITS, normalizeTrajectory, validateTrajectory, sampleTrajectory, sampleRange, displayAngles };
