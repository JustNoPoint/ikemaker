'use strict';
const assert = require('assert');
const policy = require('../src/engine_capability_policy');
const engine = require('../src/engine_registry_model');
const catalog = { builds: [{ id: engine.STABLE_BUILD_ID, channel: 'stable' }, { id: 'future', channel: 'nightly', commit: 'abc' }], capabilities: [
  { id: 'removed', buildIds: [engine.STABLE_BUILD_ID], removedBuildIds: [engine.STABLE_BUILD_ID] },
  { id: 'future-only', buildIds: ['future'], evidence: [{ domain: 'source', status: 'observed' }] },
  { id: 'fallback', buildIds: ['future'], fallbackBuildIds: [engine.STABLE_BUILD_ID], evidence: [{ domain: 'runtime', status: 'verified', fallbackBuildIds: [engine.STABLE_BUILD_ID] }] },
  { id: 'changed', changeKind: 'changed', buildIds: [engine.STABLE_BUILD_ID], evidence: [{ domain: 'runtime', status: 'verified', buildIds: [engine.STABLE_BUILD_ID] }] },
  { id: 'deprecated', changeKind: 'deprecated', buildIds: [engine.STABLE_BUILD_ID], evidence: [{ domain: 'project', status: 'verified', buildIds: [engine.STABLE_BUILD_ID], projectIds: ['game-a'] }] },
  { id: 'wrong-build-evidence', buildIds: [engine.STABLE_BUILD_ID], evidence: [{ domain: 'runtime', status: 'verified', buildIds: ['future'] }] }
] };
assert.equal(policy.decision(catalog, engine.STABLE_TARGET, 'future-only').visible, false);
assert.equal(policy.decision(catalog, engine.STABLE_TARGET, 'future-only', { showOtherVersions: true }).status, 'unsupported');
assert.equal(policy.decision(catalog, engine.STABLE_TARGET, 'removed', { showOtherVersions: true }).status, 'removed');
assert.equal(policy.decision(catalog, engine.STABLE_TARGET, 'fallback').enabled, true);
const fallbackConflict = { ...catalog, capabilities: [...catalog.capabilities.filter((item) => item.id !== 'fallback'), { id: 'fallback', buildIds: ['future'], fallbackBuildIds: [engine.STABLE_BUILD_ID], evidence: [{ domain: 'runtime', status: 'verified', fallbackBuildIds: [engine.STABLE_BUILD_ID] }, { domain: 'runtime', status: 'conflicting', fallbackBuildIds: [engine.STABLE_BUILD_ID] }] }] };
assert.equal(policy.decision(fallbackConflict, engine.STABLE_TARGET, 'fallback').status, 'conflicting');
const unrelatedFallbackConflict = { ...catalog, capabilities: [...catalog.capabilities.filter((item) => item.id !== 'fallback'), { id: 'fallback', buildIds: ['future'], fallbackBuildIds: [engine.STABLE_BUILD_ID], evidence: [{ domain: 'runtime', status: 'verified', fallbackBuildIds: [engine.STABLE_BUILD_ID] }, { domain: 'runtime', status: 'conflicting', fallbackBuildIds: ['future'] }] }] };
assert.equal(policy.decision(unrelatedFallbackConflict, engine.STABLE_TARGET, 'fallback').status, 'fallback');
const otherProjectFallbackConflict = { ...catalog, capabilities: [...catalog.capabilities.filter((item) => item.id !== 'fallback'), { id: 'fallback', buildIds: ['future'], fallbackBuildIds: [engine.STABLE_BUILD_ID], evidence: [{ domain: 'runtime', status: 'verified', fallbackBuildIds: [engine.STABLE_BUILD_ID] }, { domain: 'runtime', status: 'conflicting', fallbackBuildIds: [engine.STABLE_BUILD_ID], projectIds: ['other-game'] }] }] };
assert.equal(policy.decision(otherProjectFallbackConflict, engine.STABLE_TARGET, 'fallback', { projectId: 'game-a' }).status, 'fallback');
assert.equal(policy.decision(catalog, engine.STABLE_TARGET, 'changed').status, 'changed');
assert.equal(policy.decision(catalog, engine.STABLE_TARGET, 'deprecated', { projectId: 'game-a' }).status, 'deprecated');
assert.equal(policy.decision(catalog, engine.STABLE_TARGET, 'deprecated', { projectId: 'game-b' }).status, 'unverified');
assert.equal(policy.decision(catalog, engine.STABLE_TARGET, 'wrong-build-evidence').status, 'unverified');
const conflicted = { ...catalog, conflicts: [{ capabilityId: 'changed', status: 'unresolved' }] };
assert.equal(policy.decision(conflicted, engine.STABLE_TARGET, 'changed').status, 'conflicting');
assert.equal(policy.consumer('editor-visibility').status, 'framework');
assert.throws(() => policy.assertAllowed(catalog, engine.STABLE_TARGET, 'future-only'), /not supported/);
console.log('Engine capability policy tests passed');
