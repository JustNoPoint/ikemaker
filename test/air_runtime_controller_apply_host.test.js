'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {};
  if (request === './air_viewer' && /air_docking_workspace\.js$/.test(parent?.filename || '')) return { parseAir: () => [], inferCharacterFiles: () => ({}), collisionRuntimeOptions: () => ({}), collisionRuntimeDraftEntries: () => [] };
  return originalLoad.call(this, request, parent, isMain);
};
const { queueRuntimeControllerReview, applyCollisionDestinationReview } = require('../src/air_docking_workspace');
Module._load = originalLoad;

const capabilityA = 'A'.repeat(64), capabilityC = 'C'.repeat(64), token = 'b'.repeat(48);
function harness(options = {}) {
  const kind = options.kind || 'OverrideClsn', openDirty = options.openDirty === true, root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-air-runtime-')), airPath = path.join(root, 'main.air'), defPath = path.join(root, 'main.def'), sourcePath = path.join(root, 'main.zss');
  let airText = options.airText || '[Begin Action 200]\nClsn1: 1\nClsn1[0] = -4,-5,6,7\n0,0,0,0,1\n';
  let sourceText = kind === 'TransformClsn' ? '[StateDef 200]\nTransformClsn { group: Clsn1; index: 0; scale: 1,1; angle: 0; pivot: 0,0; }\n' : '[StateDef 200]\nOverrideClsn { group: Clsn1; index: 0; rect: -4,-5,6,7; }\n';
  let replaceCalls = 0, insertCalls = 0, applyCalls = 0, saveCalls = 0, capabilityFingerprint = capabilityA, modalMutation = null;
  fs.writeFileSync(airPath, airText); fs.writeFileSync(defPath, '[Info]\nname = Test\n[Files]\nair = main.air\nst = main.zss\n'); fs.writeFileSync(sourcePath, sourceText);
  const airDocument = { fileName: airPath, uri: { fsPath: airPath }, isClosed: false, isDirty: false, version: 2, getText: () => airText };
  const sourceDocument = { fileName: sourcePath, uri: { fsPath: sourcePath }, isClosed: false, isDirty: openDirty, version: 7, getText: () => sourceText, positionAt: offset => ({ offset }), offsetAt: point => point.offset, save: async () => { saveCalls += 1; return true; } };
  class Range { constructor(start, end) { this.start = start; this.end = end; } }
  class WorkspaceEdit { insert() { insertCalls += 1; } replace(uri, range, text) { replaceCalls += 1; this.replacement = { uri, range, text }; } }
  const workspace = {
    textDocuments: openDirty ? [airDocument, sourceDocument] : [airDocument],
    openTextDocument: async filename => { if (path.resolve(filename) === airPath) return airDocument; assert.strictEqual(path.resolve(filename), sourcePath); if (!workspace.textDocuments.includes(sourceDocument)) workspace.textDocuments.push(sourceDocument); return sourceDocument; },
    applyEdit: async edit => { applyCalls += 1; if (options.applyFalse) return false; const operation = edit.replacement; if (!options.postMismatch) sourceText = sourceText.slice(0, operation.range.start.offset) + operation.text + sourceText.slice(operation.range.end.offset); sourceDocument.version += 1; sourceDocument.isDirty = true; return true; }
  };
  const record = { panel: { active: true }, airSourceAvailable: true, data: { airPath, ownerDef: defPath }, referenceContext: { generation: 4, defPath }, browserState: { primaryView: 'collisions', collisionMode: 'transform', action: 200, elementIndex: 0, groupKey: 'clsn1', index: 0 }, collisionEpoch: 0, transformEpoch: 0, runtimeControllerEpoch: 0, destinationEpoch: 0, runtimeControllerQueue: Promise.resolve(), destinationApplyAuthority: null, destinationApplyBusy: false };
  const services = {
    workspace, WorkspaceEdit, Range,
    collisionRuntimeOptions: () => ({ target: { channel: 'nightly', buildId: 'verified' }, targetBuildId: 'verified', capabilityFingerprint, allowIndexed: true, dummyReferenceDecision: true, allocationDecision: { capability: { id: 'collision.air-index-allocation' }, capabilityId: 'collision.air-index-allocation', enabled: true, status: 'supported', capabilityFingerprint } }),
    readRuntimePlan: () => ({ entries: [] }), collisionRuntimeDraftEntries: () => [], applyToken: () => token,
    window: { showWarningMessage: async () => { if (modalMutation) await modalMutation(); return options.confirm === false ? undefined : 'Apply Reviewed Diff'; } }
  };
  return {
    root, kind, record, services, sourceDocument, airDocument,
    setModalMutation(value) { modalMutation = value; }, setCapability(value) { capabilityFingerprint = value; }, setAirText(value) { airText = value; airDocument.version += 1; },
    get sourceText() { return sourceText; }, counts: () => ({ replaceCalls, insertCalls, applyCalls, saveCalls })
  };
}
function baseRequest(overrides = {}) { return { type: 'reviewRuntimeController', reviewKind: 'runtime-controller-replace', action: 200, elementIndex: 0, groupKey: 'clsn1', index: 0, ...overrides }; }
async function review(h, request) { const messages = []; await queueRuntimeControllerReview(h.record, request, payload => messages.push(payload), h.services); return messages[0]; }
async function issue(h) {
  const inventory = await review(h, baseRequest({ request: 1, candidateId: '' }));
  assert.strictEqual(inventory.available, true, inventory.reason); assert.strictEqual(inventory.candidates.length, 1);
  const candidate = inventory.candidates[0], draft = h.kind === 'TransformClsn' ? { kind: h.kind, group: 2, index: 0, scale: [1.5, 0.75], angle: 30, pivot: [4, -3] } : { kind: h.kind, group: 2, index: 0, rect: [-8, -9, 10, 11] }, reviewed = await review(h, baseRequest({ request: 2, candidateId: candidate.id, draft }));
  assert.strictEqual(reviewed.plan.status, 'ready', reviewed.plan.limitations.join(' | ')); assert.strictEqual(reviewed.applyAuthority.token, token); assert.match(reviewed.projection.targetBinding.inspectionHash, /^[A-F0-9]{64}$/); return reviewed;
}
async function withHarness(options, task) { const h = harness(options); try { await task(h); } finally { fs.rmSync(h.root, { recursive: true, force: true }); } }

(async () => {
  for (const kind of ['OverrideClsn', 'TransformClsn']) for (const openDirty of [false, true]) await withHarness({ kind, openDirty }, async h => {
    await issue(h); const result = await applyCollisionDestinationReview(h.record, token, h.services);
    assert.strictEqual(result.status, 'applied'); assert.match(h.sourceText, /group: Clsn2;/); if (kind === 'OverrideClsn') assert.match(h.sourceText, /rect: -8, -9, 10, 11;/); else assert.match(h.sourceText, /angle: 30;/);
    assert.deepStrictEqual(h.counts(), { replaceCalls: 1, insertCalls: 0, applyCalls: 1, saveCalls: 0 }); await assert.rejects(() => applyCollisionDestinationReview(h.record, token, h.services), /invalid, stale, or already consumed/i);
  });
  await withHarness({ openDirty: true }, async h => { await issue(h); h.sourceDocument.version += 1; await assert.rejects(() => applyCollisionDestinationReview(h.record, token, h.services), /changed before confirmation|open\/dirty\/version/i); assert.strictEqual(h.counts().applyCalls, 0); });
  await withHarness({ confirm: false }, async h => { await issue(h); const result = await applyCollisionDestinationReview(h.record, token, h.services); assert.strictEqual(result.status, 'cancelled'); assert.strictEqual(h.counts().applyCalls, 0); });
  await withHarness({}, async h => { await issue(h); h.record.destinationApplyBusy = true; await assert.rejects(() => applyCollisionDestinationReview(h.record, token, h.services), /already being processed/i); assert.strictEqual(h.counts().applyCalls, 0); });
  await withHarness({ applyFalse: true }, async h => { await issue(h); await assert.rejects(() => applyCollisionDestinationReview(h.record, token, h.services), /rejected the reviewed editor edit/i); assert.strictEqual(h.counts().applyCalls, 1); });
  await withHarness({ postMismatch: true }, async h => { await issue(h); await assert.rejects(() => applyCollisionDestinationReview(h.record, token, h.services), /editor result differs/i); assert.strictEqual(h.counts().applyCalls, 1); });
  for (const drift of ['source-version', 'air', 'capability', 'selection-epoch']) await withHarness({ openDirty: true }, async h => {
    await issue(h); h.setModalMutation(() => { if (drift === 'source-version') h.sourceDocument.version += 1; if (drift === 'air') h.setAirText(h.airDocument.getText() + '; drift\n'); if (drift === 'capability') h.setCapability(capabilityC); if (drift === 'selection-epoch') h.record.runtimeControllerEpoch += 1; });
    await assert.rejects(() => applyCollisionDestinationReview(h.record, token, h.services), /changed during confirmation|changed before confirmation|open\/dirty\/version/i, drift); assert.strictEqual(h.counts().applyCalls, 0, drift);
  });
  for (const invalid of [{ action: 999 }, { elementIndex: 1 }, { groupKey: 'clsn2' }, { index: 1 }]) await withHarness({}, async h => { const response = await review(h, baseRequest({ request: 9, candidateId: '', ...invalid })); assert.strictEqual(response.available, false); assert.match(response.reason, /not one exact authoritative Nightly target/); assert.strictEqual(h.record.destinationApplyAuthority, null); });
  await withHarness({ airText: '[Begin Action 200]\nClsn1: 1\nClsn1[0] = -4,-5,6,7\n0,0,0,0,1\n[Begin Action 200]\nClsn1: 1\nClsn1[0] = 0,0,1,1\n0,0,0,0,1\n' }, async h => { const response = await review(h, baseRequest({ request: 10, candidateId: '' })); assert.strictEqual(response.available, false); assert.match(response.reason, /not one exact authoritative Nightly target/); });
  console.log('AIR runtime-controller Apply covers exact Override/Transform replacement, C8 target binding, modal drift, cancellation, busy, rejection, postcondition, replay, and closed/dirty-open lifecycles');
})().catch(error => { console.error(error); process.exitCode = 1; });
