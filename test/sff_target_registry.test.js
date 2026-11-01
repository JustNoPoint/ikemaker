'use strict';

const assert = require('assert');
const { SFF_TARGETS, listSffTargets, requireSffTarget } = require('../src/sff_target_registry');

assert.deepStrictEqual(listSffTargets().map(({ id, label }) => ({ id, label })), [
  { id: 'sff-v1', label: 'SFF v1 — DOS/WinMUGEN Legacy' },
  { id: 'sff-v2.0', label: 'SFF v2.0 — MUGEN 1.0' },
  { id: 'sff-v2.1', label: 'SFF v2.1 — MUGEN 1.1/IKEMEN' }
]);
assert(Object.isFrozen(SFF_TARGETS));
assert(Object.isFrozen(SFF_TARGETS[0]));
assert(Object.isFrozen(SFF_TARGETS[0].version));
assert(Object.isFrozen(SFF_TARGETS[0].capabilities));
assert.throws(() => requireSffTarget(), /explicit SFF targetId/);
assert.throws(() => requireSffTarget('2.1'), /Unknown SFF targetId/);
assert.strictEqual(requireSffTarget('sff-v2.1').version.minor, 1);
assert.strictEqual(requireSffTarget('sff-v2.0').capabilities['compression.raw8'], 'supported');
assert.strictEqual(requireSffTarget('sff-v2.0').capabilities['compression.png8'], undefined, 'the MUGEN 1.0 target is not inferred from shared primary version bytes');
assert.strictEqual(requireSffTarget('sff-v2.1').capabilities['compression.raw8'], undefined, 'the separate MUGEN 1.1/IKEMEN profile is unchanged');

console.log('SFF target registry is explicit, ordered, and immutable');
