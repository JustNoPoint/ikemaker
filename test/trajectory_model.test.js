'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TAU, TRAJECTORY_KINDS, COORDINATE_SPACES, OWNER_KINDS, EASINGS, TRAJECTORY_LIMITS,
  normalizeTrajectory, validateTrajectory, sampleTrajectory, sampleRange, displayAngles
} = require('../src/trajectory_model');

function close(actual, expected, epsilon = 1e-9) { assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} should be within ${epsilon} of ${expected}`); }
function closePoint(actual, expected, epsilon = 1e-9) { close(actual[0], expected[0], epsilon); close(actual[1], expected[1], epsilon); }

test('exports bounded shared catalog constants', () => {
  assert.deepEqual(TRAJECTORY_KINDS, ['circle', 'ellipse', 'arc', 'spiral', 'formula']);
  assert.ok(COORDINATE_SPACES.includes('owner-relative'));
  assert.ok(OWNER_KINDS.includes('stage-point'));
  assert.ok(OWNER_KINDS.includes('self'));
  assert.ok(EASINGS.includes('ease-in-out'));
  assert.equal(TRAJECTORY_LIMITS.durationTicks, 36000);
  assert.ok(Object.isFrozen(TRAJECTORY_LIMITS));
});

test('rejects control characters from all canonical source-facing text', () => {
  assert.throws(() => normalizeTrajectory({ name: 'safe\nPosSet{x: 999}', owner: { kind: 'self' } }), /bounded text/);
  assert.throws(() => normalizeTrajectory({ anchor: { kind: 'origin', position: [0, 0], provenance: 'bad\rline' }, owner: { kind: 'self' } }), /bounded text/);
});

test('normalizes UI degrees to an immutable radians-only stable 1.0 plan', () => {
  const plan = normalizeTrajectory({ phaseDegrees: 90, tiltDegrees: 45, sweepDegrees: 180 });
  close(plan.phaseRadians, Math.PI / 2);
  close(plan.tiltRadians, Math.PI / 4);
  close(plan.sweepRadians, Math.PI);
  assert.equal(Object.hasOwn(plan, 'phaseDegrees'), false);
  assert.deepEqual(displayAngles(plan), { phaseDegrees: 90, tiltDegrees: 45, sweepDegrees: 180 });
  assert.equal(plan.engine.baseline, true);
  assert.equal(plan.runtimeEvidence, 'physical-pending');
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.owner));
  assert.throws(() => { plan.anchor.position[0] = 2; }, TypeError);
});

test('rejects ambiguous angle units and invalid explicit ownership combinations', () => {
  assert.throws(() => normalizeTrajectory({ phaseDegrees: 1, phaseRadians: 1 }), /cannot both/);
  assert.throws(() => normalizeTrajectory({ owner: { kind: 'helper' } }), /explicit ID/);
  const authored = validateTrajectory({ owner: { kind: 'expression', expression: 'parent, rootDist x' }, coordinateSpace: 'owner-relative' });
  assert.equal(authored.valid, true);
  assert.equal(authored.issues.some(issue => issue.field === 'owner' && issue.level === 'warning'), true);
  assert.throws(() => normalizeTrajectory({ coordinateSpace: 'screen', owner: { kind: 'root' } }), /screen owner/);
  assert.throws(() => normalizeTrajectory({ coordinateSpace: 'camera', owner: { kind: 'screen' } }), /camera owner/);
});

test('samples a clockwise circle at exact deterministic endpoints', () => {
  const plan = normalizeTrajectory({ kind: 'circle', radius: [10, 99], durationTicks: 4, anchor: { position: [100, 50] }, centerOffset: [2, 3] });
  closePoint(sampleTrajectory(plan, 0).position, [112, 53]);
  closePoint(sampleTrajectory(plan, 1).position, [102, 63]);
  closePoint(sampleTrajectory(plan, 2).position, [92, 53]);
  closePoint(sampleTrajectory(plan, 4).position, [112, 53]);
  assert.deepEqual(sampleTrajectory(plan, 0), sampleTrajectory(plan, 0));
});

test('counter-clockwise and facing transforms are explicit and independent', () => {
  const base = { kind: 'ellipse', radius: [20, 10], durationTicks: 4, direction: 'counter-clockwise', phaseDegrees: 90 };
  const normal = sampleTrajectory(base, 1), mirrored = sampleTrajectory({ ...base, facing: -1 }, 1);
  closePoint(normal.position, [20, 0]);
  closePoint(mirrored.position, [-20, 0]);
  assert.equal(normal.direction, 'counter-clockwise');
});

test('finite arcs use the requested sweep and tilt', () => {
  const plan = normalizeTrajectory({ kind: 'arc', radius: [10, 4], durationTicks: 2, phaseDegrees: 0, sweepDegrees: 90, tiltDegrees: 90 });
  closePoint(sampleTrajectory(plan, 0).position, [0, 10]);
  closePoint(sampleTrajectory(plan, 2).position, [-4, 0]);
});

test('spiral interpolates both radii without changing duration', () => {
  const plan = normalizeTrajectory({ kind: 'spiral', startRadius: [0, 0], endRadius: [20, 10], durationTicks: 4, sweepDegrees: 360 });
  closePoint(sampleTrajectory(plan, 0).position, [0, 0]);
  closePoint(sampleTrajectory(plan, 2).radius, [10, 5]);
  closePoint(sampleTrajectory(plan, 4).position, [20, 0]);
});

test('named easing keeps exact boundaries and changes intermediate motion', () => {
  const common = { kind: 'arc', radius: [10, 10], durationTicks: 4, sweepDegrees: 180 };
  const linear = sampleTrajectory({ ...common, easing: 'linear' }, 1);
  const eased = sampleTrajectory({ ...common, easing: 'ease-in' }, 1);
  assert.equal(linear.progress, 0.25);
  assert.equal(eased.progress, 0.0625);
  closePoint(sampleTrajectory({ ...common, easing: 'ease-in-out' }, 0).position, [10, 0]);
  closePoint(sampleTrajectory({ ...common, easing: 'ease-in-out' }, 4).position, [-10, 0]);
});

test('range sampling is visual-only, bounded, and includes exact endpoints', () => {
  const plan = normalizeTrajectory({ durationTicks: 60 });
  const samples = sampleRange(plan, { count: 7 });
  assert.equal(samples.length, 7);
  assert.equal(samples[0].tick, 0);
  assert.equal(samples.at(-1).tick, 60);
  assert.ok(Object.isFrozen(samples));
  assert.throws(() => sampleRange(plan, { count: TRAJECTORY_LIMITS.rangeSamples + 1 }), /sample count/);
});

test('formula trajectories are preserved as opaque text and never executed', () => {
  const source = 'cos(time * 0.1) * 40', plan = normalizeTrajectory({ kind: 'formula', formula: { x: source, y: 'sin(time * 0.1) * 20' } });
  assert.equal(plan.formula.x, source);
  assert.equal(plan.previewAvailable, false);
  assert.throws(() => sampleTrajectory(plan, 0), /opaque/);
  assert.equal(validateTrajectory(plan).issues.some(issue => issue.field === 'formula'), true);
});

test('validation fails closed for malformed and excessive plans', () => {
  assert.equal(validateTrajectory({ durationTicks: 0 }).valid, false);
  assert.equal(validateTrajectory({ durationTicks: TRAJECTORY_LIMITS.durationTicks + 1 }).valid, false);
  assert.equal(validateTrajectory({ localCoord: [0, 240] }).valid, false);
  assert.equal(validateTrajectory({ radius: [Infinity, 2] }).valid, false);
  assert.equal(validateTrajectory({ easing: 'execute-javascript' }).valid, false);
});

test('velocity is a deterministic one-tick delta and remains forward-oriented at the endpoint', () => {
  const plan = normalizeTrajectory({ radius: [10, 10], durationTicks: 4 });
  const atZero = sampleTrajectory(plan, 0), atOne = sampleTrajectory(plan, 1), atEnd = sampleTrajectory(plan, 4), beforeEnd = sampleTrajectory(plan, 3);
  closePoint(atZero.velocity, [atOne.position[0] - atZero.position[0], atOne.position[1] - atZero.position[1]]);
  closePoint(atEnd.velocity, [atEnd.position[0] - beforeEnd.position[0], atEnd.position[1] - beforeEnd.position[1]]);
  close(plan.sweepRadians, TAU);
});
