'use strict';

const assert = require('assert');
const { createTrajectoryProposal, expression } = require('../src/trajectory_proposal_model');

const base = { kind: 'ellipse', anchor: { kind: 'origin', position: [12, -20], provenance: 'test' }, centerOffset: [3, 4], startRadius: [40, 20], phaseDegrees: 0, sweepDegrees: 360, durationTicks: 60, tiltDegrees: 15, direction: 'counter-clockwise', easing: 'linear', coordinateSpace: 'world', owner: { kind: 'self', reviewed: true }, localCoord: [320, 240], facing: 1 };
const zss = createTrajectoryProposal(base, { kind: 'spatial', language: 'zss', capabilityState: 'stable', name: 'Fire orbit' });
assert.strictEqual(zss.valid, true);
assert.strictEqual(zss.artifacts.length, 1);
assert.match(zss.artifacts[0].text, /posSet\{/);
assert.match(zss.artifacts[0].text, /time <= 60/);
assert.match(zss.artifacts[0].text, /Runtime timing/);
assert(Object.isFrozen(zss) && Object.isFrozen(zss.plan));

const cns = createTrajectoryProposal(base, { kind: 'helper', language: 'cns', capabilityState: 'stable' });
assert.strictEqual(cns.valid, true);
assert.match(cns.artifacts[0].text, /type = PosSet/);
assert.match(cns.artifacts[0].text, /trigger1 = time <= 60/);

for (const [change, code] of [
  [{ coordinateSpace: 'camera', owner: { kind: 'camera', reviewed: true } }, 'coordinate-conversion-unproven'],
  [{ owner: { kind: 'parent', reviewed: true } }, 'owner-unproven'],
  [{ owner: { kind: 'root', reviewed: true } }, 'owner-unproven'],
  [{ easing: 'ease-in-out' }, 'easing-not-emitted'],
  [{ kind: 'formula', formula: { x: 'authoredX', y: 'authoredY' } }, 'formula-opaque']
]) {
  const proposal = createTrajectoryProposal({ ...base, ...change }, { kind: 'spatial', language: 'zss', capabilityState: 'stable' });
  assert.strictEqual(proposal.valid, false);
  assert.strictEqual(proposal.artifacts.length, 0);
  assert(proposal.issues.some(item => item.code === code));
}
const stage = createTrajectoryProposal(base, { kind: 'stage', language: 'zss', capabilityState: 'stable' });
assert.strictEqual(stage.valid, false);
assert(stage.issues.some(item => item.code === 'preview-only-context'));
assert.strictEqual(stage.artifacts.length, 0);

const uncertain = createTrajectoryProposal(base, { kind: 'spatial', language: 'zss', capabilityState: 'conflicting' });
assert.strictEqual(uncertain.valid, false);
assert(uncertain.issues.some(item => item.code === 'capability-uncertain'));
const unowned = createTrajectoryProposal(base, { kind: 'helper', language: 'zss', capabilityState: 'stable', mutationAllowed: false });
assert.strictEqual(unowned.valid, false);
assert.strictEqual(unowned.artifacts.length, 0);
assert(unowned.issues.some(item => item.code === 'mutation-authority-missing'));
const unsupported = createTrajectoryProposal(base, { kind: 'spatial', language: 'lua', capabilityState: 'stable' });
assert.strictEqual(unsupported.valid, false);
assert.strictEqual(unsupported.artifacts.length, 0);
assert(unsupported.issues.some(item => item.code === 'language-unsupported'));
const injectedName = createTrajectoryProposal({ ...base, name: 'orbit\nPosSet{x: 999}' }, { kind: 'spatial', language: 'zss', capabilityState: 'stable' });
assert.strictEqual(injectedName.valid, false);
assert.strictEqual(injectedName.artifacts.length, 0);

const faced = expression({ ...zss.plan, facing: -1 });
assert.match(faced.x, /-1 \*/);
assert.match(expression({ ...zss.plan, phaseRadians: Math.PI / 2, sweepRadians: Math.PI }).theta, /^\(90 \+ -3 \* time\)$/);
assert(!zss.artifacts[0].text.includes('eval'));
console.log('Trajectory proposal generation is bounded, reviewable, stable-targeted, and preview-only where mutation authority is absent');
