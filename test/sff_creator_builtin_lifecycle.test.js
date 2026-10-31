'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createCreatorBuiltInLifecycleCoordinator, draftRevision } = require('../src/sff_creator_builtin_lifecycle');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-sff-ui-life-'));
  try {
    const active = path.join(root, 'active.sff'), specificationPath = path.join(root, 'spec.json');
    fs.writeFileSync(active, Buffer.from('active'));
    const specification = { schema: 'spec', version: 1, specificationHash: 'a'.repeat(64), sprites: [], palettes: [] };
    fs.writeFileSync(specificationPath, `${JSON.stringify(specification)}\n`);
    let draft = { sources: [{ id: 'one' }], target: { path: active } }, starts = 0, confirms = 0;
    const target = () => ({ filename: active, exists: true, hash: require('crypto').createHash('sha256').update(fs.readFileSync(active)).digest('hex').toUpperCase() });
    const build = { specificationPath, specificationHash: specification.specificationHash };
    const base = { workspaceRoot: root, packageRoot: root, build, formatId: 'sff-v2.1', targetSnapshot: target(), draftRevision: draftRevision(draft), getCurrentDraft: () => draft };
    let observedStart;
    const coordinator = createCreatorBuiltInLifecycleCoordinator({
      captureTarget: target,
      startLifecycle: async input => { starts += 1; observedStart = input; return { status: 'completed', operationId: 'operation-1', completedLocator: { id: 1 } }; },
      verifyCompleted: async () => ({ status: 'verified', lifecycleState: 'Completed', operationId: 'operation-1', specificationHash: specification.specificationHash, routeEnvelopeHash: observedStart.expectedRouteEnvelopeHash, targetId: 'sff-v2.1', backendId: 'ikemaker-builtin-sff-v21-png8-prerelease', adapterId: 'builtin-v21-png8', activePath: active })
    });
    const completed = await coordinator.startCreatorBuiltInAdoption(base, { confirm: async envelope => { confirms += 1; assert.strictEqual(envelope.route.targetId, 'sff-v2.1'); return true; } });
    assert.strictEqual(completed.status, 'completed-verified'); assert.strictEqual(completed.resetDraft, true); assert.strictEqual(starts, 1); assert.strictEqual(confirms, 1);
    assert.strictEqual(observedStart.specificationArtifactBytes.equals(fs.readFileSync(specificationPath)), true);

    const cancelled = await coordinator.startCreatorBuiltInAdoption({ ...base, formatId: 'sff-v2.0' }, { confirm: async () => false });
    assert.strictEqual(cancelled.status, 'cancelled'); assert.strictEqual(cancelled.resetDraft, false); assert.strictEqual(starts, 1);
    let v20Start;
    const v20 = createCreatorBuiltInLifecycleCoordinator({
      captureTarget: target,
      startLifecycle: async input => { v20Start = input; return { status: 'completed', operationId: 'operation-20', completedLocator: { id: 20 } }; },
      verifyCompleted: async () => ({ status: 'verified', lifecycleState: 'Completed', operationId: 'operation-20', specificationHash: specification.specificationHash, routeEnvelopeHash: v20Start.expectedRouteEnvelopeHash, targetId: 'sff-v2.0', backendId: 'ikemaker-builtin-sff-v2.0', adapterId: 'builtin-v20-raw8', activePath: active })
    });
    const completed20 = await v20.startCreatorBuiltInAdoption({ ...base, formatId: 'sff-v2.0' }, { confirm: async () => true });
    assert.strictEqual(completed20.status, 'completed-verified'); assert.strictEqual(v20Start.routeEnvelope.route.targetId, 'sff-v2.0');
    await assert.rejects(() => coordinator.startCreatorBuiltInAdoption({ ...base, formatId: 'sff-v1' }, { confirm: async () => true }), /only explicit SFF v2\.0 and v2\.1/);
    await assert.rejects(() => coordinator.startCreatorBuiltInAdoption({ ...base, targetSnapshot: { filename: path.join(root, 'new.sff'), exists: false, hash: '' } }, { confirm: async () => true }), /requires an existing active SFF/);

    await assert.rejects(() => coordinator.startCreatorBuiltInAdoption({ ...base, draftRevision: '0'.repeat(64) }, { confirm: async () => true }), /draft changed before route review/);
    let mutateAtConfirm = false;
    await assert.rejects(() => coordinator.startCreatorBuiltInAdoption(base, { confirm: async () => { mutateAtConfirm = true; draft = { ...draft, changed: true }; return true; } }), /draft changed immediately before dispatch/);
    assert.strictEqual(mutateAtConfirm, true); assert.strictEqual(starts, 1); draft = { sources: [{ id: 'one' }], target: { path: active } };

    await assert.rejects(() => coordinator.startCreatorBuiltInAdoption(base, { confirm: async () => { fs.writeFileSync(specificationPath, `${JSON.stringify({ ...specification, drift: true })}\n`); return true; } }), /specification changed immediately before dispatch/);
    fs.writeFileSync(specificationPath, `${JSON.stringify(specification)}\n`);
    await assert.rejects(() => coordinator.startCreatorBuiltInAdoption(base, { confirm: async () => { fs.writeFileSync(active, Buffer.from('changed')); return true; } }), /active SFF changed immediately before dispatch/);

    fs.writeFileSync(active, Buffer.from('active'));
    let release;
    const held = new Promise(resolve => { release = resolve; });
    const concurrent = createCreatorBuiltInLifecycleCoordinator({ captureTarget: target, startLifecycle: async () => { await held; return { status: 'paused', operationId: 'held' }; }, verifyCompleted: async () => { throw new Error('not reached'); } });
    const first = concurrent.startCreatorBuiltInAdoption(base, { confirm: async () => true });
    await new Promise(resolve => setImmediate(resolve));
    const second = await concurrent.startCreatorBuiltInAdoption(base, { confirm: async () => true });
    assert.strictEqual(second.status, 'dispatch-already-running'); assert.strictEqual(second.resetDraft, false); release(); assert.strictEqual((await first).resetDraft, false);

    let retained = null;
    const continuation = createCreatorBuiltInLifecycleCoordinator({ captureTarget: target, startLifecycle: async () => ({ status: 'history-review-required', operationId: 'operation-pending', continuationLocator: { locator: true } }), verifyCompleted: async () => { throw new Error('not reached'); }, retainContinuation: async value => { retained = value; } });
    const incomplete = await continuation.startCreatorBuiltInAdoption({ ...base, draftKey: 'sff-creator:test' }, { confirm: async () => true });
    assert.strictEqual(incomplete.resetDraft, false); assert.strictEqual(incomplete.status, 'history-review-required'); assert.strictEqual(retained.draftKey, 'sff-creator:test'); assert.strictEqual(retained.draftRevision, base.draftRevision); assert.match(retained.binding.routeEnvelopeHash, /^[0-9a-f]{64}$/); assert.strictEqual(retained.binding.targetId, 'sff-v2.1'); assert.deepStrictEqual(retained.locator, { locator: true });

    console.log('sff_creator_builtin_lifecycle.test.js: all tests passed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
