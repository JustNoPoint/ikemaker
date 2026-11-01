'use strict';

const assert = require('assert');
const path = require('path');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {};
  if (request === './air_viewer' && /air_docking_workspace\.js$/.test(parent?.filename || '')) return { parseAir: () => [], inferCharacterFiles: () => ({}), collisionRuntimeOptions: () => ({}), collisionRuntimeDraftEntries: () => [] };
  return originalLoad.call(this, request, parent, isMain);
};
const { buildCollisionDestinationReview, queueCollisionDestinationReview, applyCollisionDestinationReview } = require('../src/air_docking_workspace');
Module._load = originalLoad;
const { hash } = require('../src/mutation_safety');

const airPath = path.resolve('/char/main.air'), statePath = path.resolve('/char/main.zss'), defPath = path.resolve('/char/char.def');
const baseAir = '[Begin Action 200]\nClsn1: 1\nClsn1[0] = -4,-5,6,7\n0,0,0,0,1\n';
const baseState = '[StateDef 200]\nchangeAnim{value: 200}\n';
const capability = 'A'.repeat(64), token = 'c'.repeat(48);

function harness(options = {}) {
  let airText = baseAir, stateText = baseState, insertCalls = 0, replaceCalls = 0, applyCalls = 0, saveCalls = 0, navigationCalls = 0, commandCalls = 0, fsCalls = 0;
  const airDocument = { fileName: airPath, isClosed: false, isDirty: false, version: 3, getText: () => airText };
  const sourceDocument = { fileName: statePath, uri: { fsPath: statePath }, isClosed: false, isDirty: false, version: 7, getText: () => stateText, positionAt: offset => ({ offset }), offsetAt: position => position.offset, save: async () => { saveCalls += 1; return true; } };
  class WorkspaceEdit { insert(uri, position, text) { insertCalls += 1; this.insertion = { uri, position, text }; } replace() { replaceCalls += 1; } }
  const workspace = {
    textDocuments: options.open ? [airDocument, sourceDocument] : [airDocument], fs: { writeFile: async () => { fsCalls += 1; } },
    openTextDocument: async filename => { if (path.resolve(filename) === statePath) { if (!workspace.textDocuments.includes(sourceDocument)) workspace.textDocuments.push(sourceDocument); return sourceDocument; } throw new Error('unexpected open'); },
    applyEdit: async edit => { applyCalls += 1; if (options.applyFalse) return false; const offset = edit.insertion.position.offset; stateText = stateText.slice(0, offset) + edit.insertion.text + stateText.slice(offset); if (options.postMismatch) stateText += '# unexpected\n'; sourceDocument.version += 1; sourceDocument.isDirty = true; return true; }
  };
  const target = () => ({ target: { channel: 'nightly', buildId: 'verified' }, targetBuildId: 'verified', capabilityFingerprint: capability, allowIndexed: true, dummyReferenceDecision: true, allocationDecision: { capabilityId: 'collision.air-index-allocation', enabled: true, status: 'supported', capabilityFingerprint: capability } });
  const context = () => ({ defPath, defDirty: false, inventoryComplete: true, assignedSources: [statePath], sources: [{ available: true, dirty: false, filename: statePath, syntax: 'zss', text: stateText, sourceHash: hash(stateText), version: options.open ? sourceDocument.version : null }] });
  const record = { panel: { active: true }, airSourceAvailable: true, data: { airPath, ownerDef: defPath }, referenceContext: { generation: 4, defPath }, collisionGeneration: 0, collisionEpoch: 0, propertyEpoch: 0, destinationEpoch: 0, propertyQueue: Promise.resolve(), destinationQueue: Promise.resolve(), destinationApplyAuthority: null, destinationApplyBusy: false, collisionAuthorities: new Map(), consumedCollisionRoutes: new Set() };
  const services = { workspace, referenceContext: context, collisionRuntimeOptions: target, readRuntimePlan: () => ({ entries: [] }), collisionRuntimeDraftEntries: () => [], WorkspaceEdit, window: { showWarningMessage: async () => options.confirm === false ? undefined : 'Apply Reviewed Diff', showTextDocument: async () => { navigationCalls += 1; } }, commands: { executeCommand: async () => { commandCalls += 1; } } };
  return { record, services, workspace, airDocument, sourceDocument, context, get stateText() { return stateText; }, set stateText(value) { stateText = value; }, set airText(value) { airText = value; airDocument.version += 1; }, counts: () => ({ insertCalls, replaceCalls, applyCalls, saveCalls, navigationCalls, commandCalls, fsCalls }) };
}

async function issue(h, issueToken = token) {
  const request = { action: 200, elementIndex: 0, groupKey: 'clsn1', index: 0, draft: { family: 'eligibility', kind: 'HitBy', attr: 'SCA, AP', time: 2 } };
  const inventory = await buildCollisionDestinationReview(h.record, request, h.services);
  assert.strictEqual(inventory.candidates.length, 1);
  const published = [];
  await queueCollisionDestinationReview(h.record, { ...request, request: 1, destinationId: inventory.candidates[0].id }, payload => published.push(payload), { ...h.services, applyToken: () => issueToken });
  assert.strictEqual(published[0].applyAuthority.token, issueToken);
  assert.deepStrictEqual(Object.keys(published[0].applyAuthority).sort(), ['label', 'token'], 'public authority contains only opaque token and label');
  return published[0];
}

(async () => {
  const closed = harness(); await issue(closed); const appliedClosed = await applyCollisionDestinationReview(closed.record, token, closed.services);
  assert.strictEqual(appliedClosed.status, 'applied'); assert.match(closed.stateText, /hitBy\{/); assert.deepStrictEqual(closed.counts(), { insertCalls: 1, replaceCalls: 0, applyCalls: 1, saveCalls: 0, navigationCalls: 0, commandCalls: 0, fsCalls: 0 });

  const open = harness({ open: true }); await issue(open); const appliedOpen = await applyCollisionDestinationReview(open.record, token, open.services);
  assert.strictEqual(appliedOpen.status, 'applied'); assert.strictEqual(open.counts().insertCalls, 1, 'an already-open exact version uses one insertion');

  const cancelled = harness({ confirm: false }); await issue(cancelled); const cancelledResult = await applyCollisionDestinationReview(cancelled.record, token, cancelled.services);
  assert.strictEqual(cancelledResult.status, 'cancelled'); assert.strictEqual(cancelled.counts().applyCalls, 0); await assert.rejects(() => applyCollisionDestinationReview(cancelled.record, token, cancelled.services), /invalid, stale, or already consumed/i);

  const dirty = harness({ open: true }); await issue(dirty); dirty.sourceDocument.isDirty = true;
  await assert.rejects(() => applyCollisionDestinationReview(dirty.record, token, dirty.services), /open\/dirty\/version state changed/i); assert.strictEqual(dirty.counts().applyCalls, 0);
  const versionDrift = harness({ open: true }); await issue(versionDrift); versionDrift.sourceDocument.version += 1;
  await assert.rejects(() => applyCollisionDestinationReview(versionDrift.record, token, versionDrift.services), /changed before confirmation|open\/dirty\/version state changed/i);
  const epochDrift = harness(); await issue(epochDrift); epochDrift.record.propertyEpoch += 1;
  await assert.rejects(() => applyCollisionDestinationReview(epochDrift.record, token, epochDrift.services), /changed before confirmation/i);
  const selectionDrift = harness(); await issue(selectionDrift); selectionDrift.record.collisionEpoch += 1;
  await assert.rejects(() => applyCollisionDestinationReview(selectionDrift.record, token, selectionDrift.services), /changed before confirmation/i);
  const defDrift = harness(); await issue(defDrift); defDrift.record.referenceContext.defPath = path.resolve('/char/other.def');
  await assert.rejects(() => applyCollisionDestinationReview(defDrift.record, token, defDrift.services), /changed before confirmation/i);
  const capabilityDrift = harness(); await issue(capabilityDrift); capabilityDrift.services.collisionRuntimeOptions = () => ({ target: { channel: 'nightly', buildId: 'newer' }, targetBuildId: 'newer', capabilityFingerprint: 'D'.repeat(64), allowIndexed: true, dummyReferenceDecision: true, allocationDecision: { capabilityId: 'collision.air-index-allocation', enabled: true, status: 'supported', capabilityFingerprint: 'D'.repeat(64) } });
  await assert.rejects(() => applyCollisionDestinationReview(capabilityDrift.record, token, capabilityDrift.services), /changed before confirmation/i);
  const sourceDrift = harness(); await issue(sourceDrift); sourceDrift.stateText += '# changed\n';
  await assert.rejects(() => applyCollisionDestinationReview(sourceDrift.record, token, sourceDrift.services), /changed before confirmation/i);

  const during = harness(); await issue(during); during.services.window.showWarningMessage = async () => { during.airText = baseAir + '# changed during modal\n'; return 'Apply Reviewed Diff'; };
  await assert.rejects(() => applyCollisionDestinationReview(during.record, token, during.services), /changed during confirmation/i); assert.strictEqual(during.counts().applyCalls, 0);
  const openedDuring = harness(); await issue(openedDuring); openedDuring.services.window.showWarningMessage = async () => { openedDuring.workspace.textDocuments.push(openedDuring.sourceDocument); return 'Apply Reviewed Diff'; };
  await assert.rejects(() => applyCollisionDestinationReview(openedDuring.record, token, openedDuring.services), /open\/dirty\/version state changed during confirmation/i);
  const dirtyDuring = harness({ open: true }); await issue(dirtyDuring); dirtyDuring.services.window.showWarningMessage = async () => { dirtyDuring.sourceDocument.isDirty = true; return 'Apply Reviewed Diff'; };
  await assert.rejects(() => applyCollisionDestinationReview(dirtyDuring.record, token, dirtyDuring.services), /open\/dirty\/version state changed during confirmation/i);
  const versionDuring = harness({ open: true }); await issue(versionDuring); versionDuring.services.window.showWarningMessage = async () => { versionDuring.sourceDocument.version += 1; return 'Apply Reviewed Diff'; };
  await assert.rejects(() => applyCollisionDestinationReview(versionDuring.record, token, versionDuring.services), /changed during confirmation|open\/dirty\/version state changed during confirmation/i);

  const missing = harness(); await issue(missing); missing.services.referenceContext = () => ({ defPath, defDirty: false, inventoryComplete: false, assignedSources: [], sources: [], reason: 'source deleted' });
  await assert.rejects(() => applyCollisionDestinationReview(missing.record, token, missing.services), /changed before confirmation/i);
  const renamed = harness(); await issue(renamed); const renamedPath = path.resolve('/char/renamed.zss'); renamed.services.referenceContext = () => ({ defPath, defDirty: false, inventoryComplete: true, assignedSources: [renamedPath], sources: [{ available: true, dirty: false, filename: renamedPath, syntax: 'zss', text: renamed.stateText, sourceHash: hash(renamed.stateText), version: null }] });
  await assert.rejects(() => applyCollisionDestinationReview(renamed.record, token, renamed.services), /changed before confirmation/i);
  const rejected = harness({ applyFalse: true }); await issue(rejected); await assert.rejects(() => applyCollisionDestinationReview(rejected.record, token, rejected.services), /rejected/); assert.strictEqual(rejected.counts().insertCalls, 1); assert.strictEqual(rejected.counts().applyCalls, 1);
  const mismatch = harness({ postMismatch: true }); await issue(mismatch); await assert.rejects(() => applyCollisionDestinationReview(mismatch.record, token, mismatch.services), /differs from the reviewed after-text/i);

  const busy = harness(); await issue(busy); busy.record.destinationApplyBusy = true;
  await assert.rejects(() => applyCollisionDestinationReview(busy.record, token, busy.services), /already being processed/i); await assert.rejects(() => applyCollisionDestinationReview(busy.record, token, busy.services), /invalid, stale, or already consumed/i); assert.strictEqual(busy.counts().applyCalls, 0);

  console.log('AIR collision reviewed Apply handles closed/open success, cancellation, drift, rejection, mismatch, and replay without side effects');
})().catch(error => { console.error(error); process.exitCode = 1; });
