'use strict';

const assert = require('assert');
const helper = require('../src/helper_authoring_model');
const spatial = require('../src/spatial_authoring_model');
const throws = require('../src/throw_creator_model');
const { INVOKE_TYPE, createGeneratedCodeSnapshot, projectGeneratedCodeSnapshot, authorizeGeneratedCodeIntent } = require('../src/generated_code_authority');

function message(snapshot, operationId, artifactIds, targetIds = []) {
  return { type: INVOKE_TYPE, surfaceId: snapshot.surfaceId, snapshotDigest: snapshot.snapshotDigest, operationId, artifactIds, targetIds };
}

const helperOutput = helper.generateHelper(helper.applyRecipe('basic-fireball', { id: 6100, stateNo: 6100 }));
const helperSnapshot = createGeneratedCodeSnapshot({
  surfaceId: 'code.helper', generation: 1, contextIdentity: 'character:ryu', contextRevision: 12,
  valid: helperOutput.valid, issues: helperOutput.issues.map(({ level, message }) => ({ level, message })),
  artifacts: [
    { id: 'helper-controller', role: 'creation-controller', language: 'zss', text: helperOutput.creationControllerCode },
    { id: 'helper-state', role: 'state-body', language: 'zss', text: helperOutput.stateCode },
    { id: 'helper-complete', role: 'complete-scaffold', language: 'zss', text: helperOutput.code }
  ]
});
const helperOps = [
  { id: 'copy-controller', artifactIds: ['helper-controller'], targetPolicyId: 'none', mutationOwner: 'helper-host', atomicity: 'single' },
  { id: 'preview-complete', artifactIds: ['helper-complete'], targetPolicyId: 'none', mutationOwner: 'helper-host', atomicity: 'single' },
  { id: 'replace-controller', artifactIds: ['helper-controller'], targetPolicyId: 'existing-controller', mutationOwner: 'helper-host', atomicity: 'single' },
  { id: 'append-helper-atomic', artifactIds: ['helper-controller', 'helper-state'], targetPolicyId: 'editable-code', mutationOwner: 'helper-host', atomicity: 'all' }
];
const helperContext = { identity: 'character:ryu', revision: 12, targetPolicies: { none: [], 'existing-controller': ['controller:helper-6100'], 'editable-code': ['editor:ryu.zss'] } };
const helperAppend = authorizeGeneratedCodeIntent({ message: message(helperSnapshot, 'append-helper-atomic', ['helper-controller', 'helper-state'], ['editor:ryu.zss']), currentSnapshot: helperSnapshot, operations: helperOps, activeContext: helperContext });
assert.deepStrictEqual(helperAppend.artifacts.map((item) => item.role), ['creation-controller', 'state-body']);
assert.strictEqual(helperAppend.operation.atomicity, 'all');
const helperReplace = authorizeGeneratedCodeIntent({ message: message(helperSnapshot, 'replace-controller', ['helper-controller'], ['controller:helper-6100']), currentSnapshot: helperSnapshot, operations: helperOps, activeContext: helperContext });
assert.deepStrictEqual(helperReplace.artifacts.map((item) => item.role), ['creation-controller'], 'replacement authority is bounded to the exact creation controller');
assert.deepStrictEqual(helperReplace.targetIds, ['controller:helper-6100']);
assert.throws(() => authorizeGeneratedCodeIntent({ message: message(helperSnapshot, 'append-helper-atomic', ['helper-controller', 'helper-state']), currentSnapshot: helperSnapshot, operations: helperOps, activeContext: helperContext }), /requires an explicit target/);

const spatialOutput = spatial.generatePosition(spatial.newPosition({ name: 'Throw bind', subject: 'target', position: [18, -40], bindTime: 3 }));
const spatialSnapshot = createGeneratedCodeSnapshot({
  surfaceId: 'code.spatial', generation: 4, contextIdentity: 'character:ryu', contextRevision: 12,
  valid: spatialOutput.valid, issues: spatialOutput.issues.map(({ level, message }) => ({ level, message })),
  artifacts: [{ id: 'spatial-controller', role: 'controller', language: 'zss', text: spatialOutput.code }]
});
const spatialOps = [{ id: 'insert-cursor', artifactIds: ['spatial-controller'], targetPolicyId: 'active-cursor', mutationOwner: 'spatial-host', atomicity: 'single' }];
const spatialContext = { identity: 'character:ryu', revision: 12, targetPolicies: { 'active-cursor': ['cursor:active'] } };
const spatialInsert = authorizeGeneratedCodeIntent({ message: message(spatialSnapshot, 'insert-cursor', ['spatial-controller'], ['cursor:active']), currentSnapshot: spatialSnapshot, operations: spatialOps, activeContext: spatialContext });
assert.strictEqual(spatialInsert.artifacts.length, 1, 'Spatial insert-cursor authorizes exactly one generated controller');
assert.throws(() => authorizeGeneratedCodeIntent({ message: message(spatialSnapshot, 'insert-cursor', ['spatial-controller']), currentSnapshot: spatialSnapshot, operations: spatialOps, activeContext: spatialContext }), /requires an explicit target/);

const air = '[Begin Action 800]\n800, 0, 0, 0, 12\n\n[Begin Action 801]\n801, 0, 0, 0, 12\n';
const tracks = throws.actionTracks(air), throwPlan = throws.newPlan('Authority Throw', 'command');
throwPlan.p1Action = 800; throwPlan.p2Action = 801; throwPlan.endTick = 12;
const throwCode = throws.generateZss(throwPlan, tracks);
const throwSnapshot = createGeneratedCodeSnapshot({
  surfaceId: 'code.throw', generation: 2, contextIdentity: 'character:ryu', contextRevision: 12,
  valid: true, issues: [], artifacts: [{ id: 'throw-zss', role: 'throw-scaffold', language: 'zss', text: throwCode }]
});
const throwOps = [
  { id: 'preview', artifactIds: ['throw-zss'], targetPolicyId: 'none', mutationOwner: 'throw-host', atomicity: 'single' },
  { id: 'save-new', artifactIds: ['throw-zss'], targetPolicyId: 'new-code-resource', mutationOwner: 'throw-host', atomicity: 'single' }
];
const throwContext = { identity: 'character:ryu', revision: 12, targetPolicies: { none: [], 'new-code-resource': ['resource:new'] } };
assert.strictEqual(authorizeGeneratedCodeIntent({ message: message(throwSnapshot, 'preview', ['throw-zss']), currentSnapshot: throwSnapshot, operations: throwOps, activeContext: throwContext }).operation.id, 'preview');
assert.strictEqual(authorizeGeneratedCodeIntent({ message: message(throwSnapshot, 'save-new', ['throw-zss'], ['resource:new']), currentSnapshot: throwSnapshot, operations: throwOps, activeContext: throwContext }).operation.id, 'save-new');
assert.throws(() => authorizeGeneratedCodeIntent({ message: message(throwSnapshot, 'save-new', ['throw-zss']), currentSnapshot: throwSnapshot, operations: throwOps, activeContext: throwContext }), /requires an explicit target/);
assert.deepStrictEqual(throwOps.map((item) => item.id), ['preview', 'save-new']);
const forbiddenConcepts = ['air-timing', 'plan', 'live-profile', 'contact-sheet'];
assert(forbiddenConcepts.every((name) => !throwOps.some((operation) => operation.id.includes(name))));
assert(forbiddenConcepts.every((name) => !throwSnapshot.artifacts.some((artifact) => artifact.id.includes(name) || artifact.role.includes(name))));

assert.throws(() => authorizeGeneratedCodeIntent({ message: message(helperSnapshot, 'append-helper-atomic', ['helper-controller', 'helper-state'], ['editor:ryu.zss']), currentSnapshot: spatialSnapshot, operations: spatialOps, activeContext: spatialContext }), /surface/);
assert(!JSON.stringify(projectGeneratedCodeSnapshot(helperSnapshot)).includes(helperOutput.code));
assert(!JSON.stringify(projectGeneratedCodeSnapshot(spatialSnapshot)).includes(spatialOutput.code));
assert(!JSON.stringify(projectGeneratedCodeSnapshot(throwSnapshot)).includes(throwCode));

console.log('Generated-code authority existing-generator tests passed');
