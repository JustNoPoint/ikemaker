'use strict';

const assert = require('assert');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {};
  return originalLoad.call(this, request, parent, isMain);
};
const { collisionCapabilityProjection } = require('../src/air_viewer');
Module._load = originalLoad;

const supported = collisionCapabilityProjection({ target: { buildId: 'verified', channel: 'nightly' }, capabilities: { 'collision.dummy-group': { enabled: true, status: 'supported' } } }, true);
assert.strictEqual(supported.dummyReferenceDecision, true);
assert.strictEqual(supported.dummyReferenceStatus, 'supported');
assert.strictEqual(supported.allowDummy, true, 'legacy preview/generator availability remains a separate compatibility path in C5');

const stable = collisionCapabilityProjection({ target: { buildId: 'stable', channel: 'stable', version: '1.0.0' }, capabilities: { 'collision.dummy-group': { enabled: false, status: 'unsupported' } } });
assert.strictEqual(stable.dummyReferenceDecision, false);
assert.strictEqual(stable.dummyReferenceStatus, 'unsupported');

const unknownNightly = collisionCapabilityProjection({ target: { buildId: 'unknown', channel: 'nightly', version: 'nightly' }, capabilities: { 'collision.dummy-group': { enabled: false, status: 'unsupported' } } });
assert.strictEqual(unknownNightly.dummyReferenceDecision, undefined, 'a broad/unknown Nightly is unresolved rather than falsely certified or mislabeled Stable');
assert.strictEqual(unknownNightly.dummyReferenceStatus, 'unknown');
assert.notStrictEqual(unknownNightly.capabilityFingerprint, stable.capabilityFingerprint);

const removed = collisionCapabilityProjection({ target: { buildId: 'removed', channel: 'nightly' }, capabilities: { 'collision.dummy-group': { enabled: false, status: 'removed' } } });
assert.strictEqual(removed.dummyReferenceDecision, false);

console.log('AIR collision capability projection keeps Dummy evidence exact and tri-state');
