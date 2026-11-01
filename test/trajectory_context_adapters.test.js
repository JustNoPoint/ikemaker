'use strict';

const assert = require('assert');
const { createTrajectoryContextAdapter, adapterSeed } = require('../src/trajectory_context_adapters');

const spatial = createTrajectoryContextAdapter({ kind: 'spatial', id: 'ryu:state-200', label: 'Ryu state 200', source: { uri: 'file:///ryu.zss', revision: 'sha256:one', owner: 'character:ryu' }, target: { language: 'zss', engine: 'ikemen-1.0', capabilityState: 'stable' }, observations: [{ kind: 'owner', id: 'p1', label: 'P1 axis', position: [10, 20], confidence: 'exact' }], mutation: { allowed: true, resolverId: 'spatial-composer.exact-source', owner: 'spatial-host' } });
assert.strictEqual(spatial.previewOnly, false);
assert.strictEqual(spatial.mutation.allowed, true);
assert(Object.isFrozen(spatial) && Object.isFrozen(spatial.observations));
const seed = adapterSeed(spatial, { coordinateSpace: 'world', owner: 'self', radius: [32, 24] });
assert.strictEqual(seed.coordinateSpace, 'world');
assert.deepStrictEqual(seed.owner, { kind: 'self', reviewed: false });

for (const kind of ['stage', 'screenpack']) {
  const adapter = createTrajectoryContextAdapter({ kind, id: `${kind}:one`, target: { language: 'zss', engine: 'ikemen-nightly', capabilityState: 'verified-nightly' }, mutation: { allowed: true, resolverId: 'forged', owner: 'forged' } });
  assert.strictEqual(adapter.previewOnly, true);
  assert.strictEqual(adapter.mutation.allowed, false);
  assert.match(adapter.mutation.reason, /preview-only/);
}
assert.throws(() => createTrajectoryContextAdapter({ kind: 'unknown', id: 'x' }), /unsupported/);
assert.throws(() => createTrajectoryContextAdapter({ kind: 'move', id: 'x', observations: Array.from({ length: 257 }, (_, index) => ({ kind: 'x', id: String(index), label: String(index) })) }), /too many/);
assert.throws(() => createTrajectoryContextAdapter({ kind: 'move', id: 'x', observations: [{ kind: 'owner', id: 'p1', label: 'P1', injected: true }] }), /unsupported field/);
assert.throws(() => createTrajectoryContextAdapter({ kind: 'move', id: 'x', observations: [{ kind: 'owner', id: 'p1', label: 'P1', position: [NaN, 0] }] }), /unsafe numeric/);
assert.throws(() => createTrajectoryContextAdapter({ kind: 'move', id: 'x', observations: [{ kind: 'owner', id: 'p1', label: 'P1', position: [0] }] }), /exactly 2/);
assert.throws(() => createTrajectoryContextAdapter({ kind: 'move', id: 'x', observations: [{ kind: 'owner', id: 'p1', label: 'P1', collisionBoxes: [[0, 1, 2]] }] }), /exactly 4/);
console.log('Trajectory context adapters keep one bounded host-owned contract and preview-only Stage/Screenpack authority');
