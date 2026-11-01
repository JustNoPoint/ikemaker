'use strict';

const assert = require('assert');
const { SFF_BACKENDS, listSffBackends, requireSffBackend, resolveSffTargetBackend } = require('../src/sff_backend_registry');

assert(Object.isFrozen(SFF_BACKENDS));
assert(SFF_BACKENDS.every(Object.isFrozen));
assert.deepStrictEqual(listSffBackends('sff-v1').map((entry) => entry.id), ['ikemaker-builtin-sff-v1', 'elecbyte-sprmaker-sff-v1']);
assert.deepStrictEqual(listSffBackends('sff-v2.0').map((entry) => entry.id), ['ikemaker-builtin-sff-v2.0', 'sprmake2-sff-v2.0']);
assert.deepStrictEqual(listSffBackends('sff-v2.1').map((entry) => entry.id), ['ikemaker-builtin-sff-v21-png8-prerelease', 'sprmake2-sff-v2.1']);
assert(!listSffBackends('sff-v1').some((entry) => entry.id.includes('sprmake2')));
assert(!listSffBackends('sff-v2.1').some((entry) => entry.id.includes('sprmaker-sff-v1')));
assert.throws(() => requireSffBackend(), /explicit SFF backendId/);
assert.throws(() => resolveSffTargetBackend({}), /explicit SFF targetId/);
assert.throws(() => resolveSffTargetBackend({ targetId: 'sff-v2.1' }), /explicit SFF backendId/);
assert.throws(() => resolveSffTargetBackend({ targetId: 'sff-v1', backendId: 'sprmake2-sff-v2.1' }), /incompatible.*no fallback/);
assert.strictEqual(resolveSffTargetBackend({ targetId: 'sff-v2.1', backendId: 'ikemaker-builtin-sff-v21-png8-prerelease' }).backend.adoptionSupported, false);
const builtin1 = resolveSffTargetBackend({ targetId: 'sff-v1', backendId: 'ikemaker-builtin-sff-v1' }).backend;
assert.deepStrictEqual(builtin1.adapter, { id: 'builtin-v1-pcx8', version: 1 });
assert.strictEqual(builtin1.adoptionSupported, false);
assert.strictEqual(builtin1.capabilities['compression.pcx-rle8'], 'supported');
assert.strictEqual(builtin1.capabilities['palette.mode.shared'], 'unsupported');
const sprmaker1 = requireSffBackend('elecbyte-sprmaker-sff-v1');
assert.strictEqual(sprmaker1.implemented, false); assert.strictEqual(sprmaker1.contractImplemented, true); assert.strictEqual(sprmaker1.executionImplemented, false); assert.strictEqual(sprmaker1.adoptionSupported, false);
const builtin20 = resolveSffTargetBackend({ targetId: 'sff-v2.0', backendId: 'ikemaker-builtin-sff-v2.0' }).backend;
assert.deepStrictEqual(builtin20.adapter, { id: 'builtin-v20-raw8', version: 1 });
assert.strictEqual(builtin20.capabilities['compression.raw8'], 'supported');
assert.strictEqual(builtin20.capabilities['sprite.links'], 'supported');
assert.strictEqual(builtin20.capabilities['palette.links'], 'supported');
assert.strictEqual(builtin20.capabilities['compression.png8'], undefined);
assert.notStrictEqual(builtin20.strictValidator.id, requireSffBackend('ikemaker-builtin-sff-v21-png8-prerelease').strictValidator.id);

console.log('SFF backend registry requires an explicit compatible pair without fallback');
