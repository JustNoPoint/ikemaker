'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createTrajectoryPreview, projectPoint, PREVIEW_LIMITS } = require('../src/trajectory_preview_model');

function close(actual, expected, epsilon = 1e-8) { assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} should be near ${expected}`); }

test('creates one immutable read-only preview contract', () => {
  const preview = createTrajectoryPreview({ durationTicks: 10, radius: [20, 20] }, { tick: 3, pathSampleCount: 6, ghostCount: 4 });
  assert.equal(preview.available, true);
  assert.equal(preview.playbackDefault, 'stopped');
  assert.equal(preview.runtimeEvidence, 'physical-pending');
  assert.deepEqual(preview.playhead, { tick: 3, minimum: 0, maximum: 10, previous: 2, next: 4 });
  assert.equal(preview.path.length, 6);
  assert.equal(preview.ghosts.length, 4);
  assert.ok(Object.isFrozen(preview));
  assert.ok(Object.isFrozen(preview.path));
});

test('path and ghost densities never alter simulation duration or exact playhead', () => {
  const plan = { durationTicks: 90, radius: [12, 12] };
  const sparse = createTrajectoryPreview(plan, { tick: 37, pathSampleCount: 5, ghostCount: 3 });
  const dense = createTrajectoryPreview(plan, { tick: 37, pathSampleCount: 500, ghostCount: 200 });
  assert.equal(sparse.sampling.simulationTicks, 91);
  assert.equal(dense.sampling.simulationTicks, 91);
  assert.deepEqual(sparse.current.position, dense.current.position);
  assert.equal(sparse.playhead.tick, 37);
  assert.equal(dense.playhead.tick, 37);
  assert.equal(sparse.sampling.displayOnly, true);
  assert.equal(dense.sampling.displayOnly, true);
});

test('zero ghosts is honored rather than silently adding a sample', () => {
  const preview = createTrajectoryPreview({ durationTicks: 5 }, { ghostCount: 0 });
  assert.deepEqual(preview.ghosts, []);
  assert.deepEqual(preview.sampling.ghostTicks, []);
});

test('projects local coordinates explicitly using localcoord, viewport, pan, and zoom', () => {
  const projected = projectPoint([160, 120], { viewport: [640, 480], localCoord: [320, 240], origin: [0, 0], pan: [5, -5], zoom: 2 });
  assert.deepEqual(projected, [645, 475]);
  const a = createTrajectoryPreview({ localCoord: [320, 240], radius: [10, 10], durationTicks: 1 }, { projection: { viewport: [640, 480] } });
  const b = createTrajectoryPreview({ localCoord: [640, 480], radius: [10, 10], durationTicks: 1 }, { projection: { viewport: [640, 480] } });
  close(a.current.canvas[0] - 320, 20);
  close(b.current.canvas[0] - 320, 10);
});

test('sprite bounds and collision boxes follow the same position, scale, angle, and facing transform', () => {
  const preview = createTrajectoryPreview({ radius: [0, 0], durationTicks: 1 }, {
    sprite: { width: 10, height: 20, axis: [5, 10], offset: [3, 4], scale: [2, 1], angleDegrees: 90, facing: -1 },
    collisionBoxes: [[-5, -10, 5, 10]],
    projection: { viewport: [320, 240] }
  });
  assert.deepEqual(preview.sprite.origin, [3, 4]);
  assert.equal(preview.sprite.corners.length, 4);
  assert.equal(preview.collisionBoxes.length, 1);
  assert.deepEqual(preview.collisionBoxes[0].source, [-5, -10, 5, 10]);
  assert.equal(preview.collisionBoxes[0].corners.length, 4);
});

test('references remain labelled observations and never replace trajectory ownership', () => {
  const preview = createTrajectoryPreview({ owner: { kind: 'p1' }, anchor: { position: [4, 5], provenance: 'user reviewed' } }, {
    references: { owner: { label: 'Observed P1', position: [100, 200], provenance: 'host frame' }, p2: { position: [20, 30] } }
  });
  assert.equal(preview.plan.owner.kind, 'p1');
  assert.deepEqual(preview.plan.anchor.position, [4, 5]);
  assert.deepEqual(preview.references.owner.position, [100, 200]);
  assert.equal(preview.references.owner.provenance, 'host frame');
});

test('formula plans return a visible unavailable contract without executing source', () => {
  const preview = createTrajectoryPreview({ kind: 'formula', formula: { x: 'process.exit()', y: 'fetch("https://example.invalid")' } });
  assert.equal(preview.available, false);
  assert.match(preview.reason, /not executed/);
  assert.equal(preview.plan.formula.x, 'process.exit()');
});

test('preview bounds reject excessive rendering work and malformed geometry', () => {
  const plan = { durationTicks: 5 };
  assert.throws(() => createTrajectoryPreview(plan, { pathSampleCount: PREVIEW_LIMITS.pathSamples + 1 }), /path sample count/);
  assert.throws(() => createTrajectoryPreview(plan, { ghostCount: PREVIEW_LIMITS.ghosts + 1 }), /ghost count/);
  assert.throws(() => createTrajectoryPreview(plan, { ghostOpacity: 2 }), /opacity/);
  assert.throws(() => createTrajectoryPreview(plan, { collisionBoxes: [[1, 2, 3]] }), /must contain/);
  assert.throws(() => createTrajectoryPreview(plan, { projection: { viewport: [99999, 200] } }), /viewport/);
});

test('numeric inspector exposes radians and display degrees without rounding source data', () => {
  const preview = createTrajectoryPreview({ phaseDegrees: 12.3456789, tiltDegrees: -3.25, sweepDegrees: 123.456, durationTicks: 3 }, { tick: 1 });
  close(preview.inspector.planAngles.phaseDegrees, 12.3456789);
  close(preview.inspector.planAngles.tiltDegrees, -3.25);
  close(preview.inspector.planAngles.sweepDegrees, 123.456);
  assert.equal(preview.inspector.coordinateSpace, 'owner-relative');
});
