'use strict';

const assert = require('assert');
const {
  CONTRACT, INVOKE_TYPE, LIMITS, createGeneratedCodeSnapshot,
  projectGeneratedCodeSnapshot, validateGeneratedCodeIntent, authorizeGeneratedCodeIntent
} = require('../src/generated_code_authority');

const base = {
  surfaceId: 'code.helper', generation: 3, contextIdentity: 'character:ryu', contextRevision: 9,
  valid: true, issues: [{ level: 'warning', code: 'review', message: 'Review the generated scaffold.' }],
  artifacts: [
    { id: 'spawn', role: 'creation-controller', language: 'zss', text: 'if time = 0 {\r\n\thelper{}\r\n}' },
    { id: 'state', role: 'state-body', language: 'zss', text: '[StateDef 1000]\r\n' }
  ]
};
const snapshot = createGeneratedCodeSnapshot(base);
const same = createGeneratedCodeSnapshot({ ...base, artifacts: base.artifacts.map((artifact) => ({ ...artifact, text: artifact.text.replace(/\r\n/g, '\n') })) });
assert.strictEqual(snapshot.contract, CONTRACT);
assert.strictEqual(snapshot.snapshotDigest, same.snapshotDigest, 'canonical newlines must produce deterministic identity');
assert.strictEqual(snapshot.artifacts[0].text, 'if time = 0 {\n\thelper{}\n}');
assert(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.artifacts) && Object.isFrozen(snapshot.artifacts[0]));
assert.notStrictEqual(snapshot.artifacts[0].digest, snapshot.artifacts[1].digest);
const swappedIds = createGeneratedCodeSnapshot({ ...base, artifacts: [{ ...base.artifacts[0], id: 'state' }, { ...base.artifacts[1], id: 'spawn' }] });
assert.notStrictEqual(snapshot.snapshotDigest, swappedIds.snapshotDigest, 'artifact IDs and their exact generated text must be bound together');
for (const changedIssues of [
  [{ level: 'info', code: 'review', message: 'Review the generated scaffold.' }],
  [{ level: 'warning', code: 'changed', message: 'Review the generated scaffold.' }],
  [{ level: 'warning', code: 'review', message: 'Different review.' }],
  [{ level: 'warning', code: 'review', message: 'Review the generated scaffold.', artifactId: 'spawn' }]
]) assert.notStrictEqual(snapshot.snapshotDigest, createGeneratedCodeSnapshot({ ...base, issues: changedIssues }).snapshotDigest, 'the normalized issue set must be snapshot-bound');

const projection = projectGeneratedCodeSnapshot(snapshot);
assert(Object.isFrozen(projection));
assert.deepStrictEqual(Object.keys(projection.artifacts[0]).sort(), ['digest', 'id', 'language', 'role']);
assert(!JSON.stringify(projection).includes('helper{}'), 'client projection must not expose host text');
assert(!Object.prototype.hasOwnProperty.call(projection, 'valid'));

assert.throws(() => createGeneratedCodeSnapshot({ ...base, extra: true }), /unknown field extra/);
assert.throws(() => createGeneratedCodeSnapshot({ ...base, generation: -1 }), /at least zero/);
assert.throws(() => createGeneratedCodeSnapshot({ ...base, artifacts: [] }), /1\.\.128/);
assert.throws(() => createGeneratedCodeSnapshot({ ...base, artifacts: [...base.artifacts, { ...base.artifacts[0] }] }), /unique/);
assert.throws(() => createGeneratedCodeSnapshot({ ...base, artifacts: [{ ...base.artifacts[0], surprise: 1 }] }), /unknown field surprise/);
assert.throws(() => createGeneratedCodeSnapshot({ ...base, artifacts: [{ ...base.artifacts[0], text: 'x'.repeat(LIMITS.artifactBytes + 1) }] }), /byte limit/);
assert.throws(() => createGeneratedCodeSnapshot({ ...base, issues: Array.from({ length: LIMITS.issues + 1 }, () => ({ level: 'info', message: 'x' })) }), /0\.\.128/);
assert.throws(() => createGeneratedCodeSnapshot({ ...base, issues: [{ level: 'warning', message: 'x', artifactId: 'missing' }] }), /unknown artifact/);

const intent = {
  type: INVOKE_TYPE, surfaceId: snapshot.surfaceId, snapshotDigest: snapshot.snapshotDigest,
  operationId: 'append-helper', artifactIds: ['spawn', 'state'], targetIds: ['editor:primary']
};
const checkedIntent = validateGeneratedCodeIntent(intent);
assert(Object.isFrozen(checkedIntent));
for (const spoof of ['code', 'path', 'kind', 'hashes', 'revisions']) assert.throws(() => validateGeneratedCodeIntent({ ...intent, [spoof]: 'owned' }), new RegExp(`unknown field ${spoof}`));
assert.throws(() => validateGeneratedCodeIntent({ ...intent, artifactIds: ['spawn', 'spawn'] }), /duplicate/);

const operations = [{ id: 'append-helper', artifactIds: ['spawn', 'state'], targetPolicyId: 'open-editors', mutationOwner: 'helper-workspace-host', atomicity: 'all' }];
const activeContext = { identity: 'character:ryu', revision: 9, targetPolicies: { 'open-editors': ['editor:primary'] } };
const authorized = authorizeGeneratedCodeIntent({ message: intent, currentSnapshot: snapshot, operations, activeContext });
assert(Object.isFrozen(authorized));
assert.deepStrictEqual(authorized.artifacts.map((artifact) => artifact.text), snapshot.artifacts.map((artifact) => artifact.text), 'only the authorized host result retains source text');
assert.deepStrictEqual(authorized.targetIds, ['editor:primary']);
assert.throws(() => authorizeGeneratedCodeIntent({ message: { ...intent, snapshotDigest: '0'.repeat(64) }, currentSnapshot: snapshot, operations, activeContext }), /stale/);
assert.throws(() => authorizeGeneratedCodeIntent({ message: { ...intent, surfaceId: 'code.spatial' }, currentSnapshot: snapshot, operations, activeContext }), /surface/);
assert.throws(() => authorizeGeneratedCodeIntent({ message: intent, currentSnapshot: snapshot, operations, activeContext: { ...activeContext, revision: 10 } }), /active context/);
assert.throws(() => authorizeGeneratedCodeIntent({ message: { ...intent, targetIds: ['path:C:/owned'] }, currentSnapshot: snapshot, operations, activeContext }), /not allowed/);
assert.throws(() => authorizeGeneratedCodeIntent({ message: { ...intent, artifactIds: ['spawn'] }, currentSnapshot: snapshot, operations, activeContext }), /complete atomic/);
assert.throws(() => authorizeGeneratedCodeIntent({ message: { ...intent, artifactIds: ['spawn', 'unknown'] }, currentSnapshot: snapshot, operations, activeContext }), /not allowed/);
assert.throws(() => authorizeGeneratedCodeIntent({ message: { ...intent, targetIds: [] }, currentSnapshot: snapshot, operations, activeContext }), /requires an explicit target/);
assert.throws(() => authorizeGeneratedCodeIntent({ message: { ...intent, operationId: 'unknown' }, currentSnapshot: snapshot, operations, activeContext }), /operation unknown is not allowed/);
assert.throws(() => authorizeGeneratedCodeIntent({ message: { ...intent, snapshotDigest: swappedIds.snapshotDigest }, currentSnapshot: snapshot, operations, activeContext }), /stale/);
const forgedArtifact = { ...snapshot.artifacts[0], text: 'malicious replacement' };
const forgedSnapshot = { ...snapshot, artifacts: [forgedArtifact, snapshot.artifacts[1]] };
assert.throws(() => authorizeGeneratedCodeIntent({ message: intent, currentSnapshot: forgedSnapshot, operations, activeContext }), /digest does not match/);
assert.throws(() => projectGeneratedCodeSnapshot({ ...snapshot, extra: true }), /unknown field extra/);
const errored = createGeneratedCodeSnapshot({ ...base, valid: true, issues: [{ level: 'error', message: 'Unsafe output.' }] });
assert.throws(() => authorizeGeneratedCodeIntent({ message: { ...intent, snapshotDigest: errored.snapshotDigest }, currentSnapshot: errored, operations, activeContext }), /not valid/);
assert.throws(() => authorizeGeneratedCodeIntent({ message: intent, currentSnapshot: snapshot, operations: [{ ...operations[0], extra: true }], activeContext }), /unknown field extra/);

console.log('Generated-code authority tests passed');
