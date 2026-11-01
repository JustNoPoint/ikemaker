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
const { buildCollisionExistingPropertyReview, queueCollisionDestinationReview, applyCollisionDestinationReview, exactCollisionApplyEnvelope } = require('../src/air_docking_workspace');
Module._load = originalLoad;
const { buildAirActionUsageSnapshot } = require('../src/air_action_usage_authority');
const { hash } = require('../src/mutation_safety');

const airPath = path.resolve('/char/main.air'), statePath = path.resolve('/char/main.zss'), defPath = path.resolve('/char/char.def');
const airText = '[Begin Action 200]\nClsn1: 1\nClsn1[0] = -4,-5,6,7\n0,0,0,0,1\n';
const initialState = '[StateDef 200]\nchangeAnim{value: 200;}\nhitBy{attr: SCA, NA; time: 2; clsn.group: Clsn1; clsn.index: 0; playerno: 2;}\n';
const defText = '[Info]\nname = "Test"\n[Files]\nanim = main.air\nstates = main.zss\n', capability = 'A'.repeat(64), token = 'd'.repeat(48);

function harness(options = {}) {
  let currentAirText = airText, stateText = initialState, insertCalls = 0, replaceCalls = 0, applyCalls = 0, saveCalls = 0, fsCalls = 0, clipboardCalls = 0, commandCalls = 0, navigationCalls = 0;
  const airDocument = { fileName: airPath, isClosed: false, isDirty: false, version: 3, getText: () => currentAirText };
  const sourceDocument = { fileName: statePath, uri: { fsPath: statePath }, isClosed: false, isDirty: false, version: 7, getText: () => stateText, positionAt: offset => ({ offset }), offsetAt: position => position.offset, save: async () => { saveCalls += 1; return true; } };
  class Range { constructor(start, end) { this.start = start; this.end = end; } }
  class WorkspaceEdit {
    insert() { insertCalls += 1; }
    replace(uri, range, text) { replaceCalls += 1; this.replacement = { uri, range, text }; }
  }
  const workspace = {
    textDocuments: options.open ? [airDocument, sourceDocument] : [airDocument], fs: { writeFile: async () => { fsCalls += 1; } },
    openTextDocument: async filename => { assert.strictEqual(path.resolve(filename), statePath); if (!workspace.textDocuments.includes(sourceDocument)) workspace.textDocuments.push(sourceDocument); return sourceDocument; },
    applyEdit: async edit => { applyCalls += 1; if (options.applyFalse) return false; const { range, text } = edit.replacement; stateText = stateText.slice(0, range.start.offset) + text + stateText.slice(range.end.offset); if (options.postMismatch) stateText += '# unexpected\n'; sourceDocument.version += 1; sourceDocument.isDirty = true; return true; }
  };
  const capabilities = { indexed: true, stringExpressions: true, dummyGroup: true, status: 'supported', stringExpressionStatus: 'supported', dummyGroupStatus: 'supported', fingerprint: capability };
  const context = () => ({ defPath, defText, defDirty: false, airPath, airText: currentAirText, inventoryComplete: true, assignedSources: [statePath], sources: [{ available: true, dirty: false, filename: statePath, syntax: 'zss', text: stateText, sourceHash: hash(stateText), version: options.open ? sourceDocument.version : null }], generation: 4, collisionCapabilities: capabilities });
  const target = () => ({ target: { channel: 'nightly', buildId: 'verified' }, targetBuildId: 'verified', capabilityFingerprint: capability, allowIndexed: true, allowStringExpressions: true, dummyReferenceDecision: true, allocationDecision: { capabilityId: 'collision.air-index-allocation', enabled: true, status: 'supported', capabilityFingerprint: capability } });
  const record = { panel: { active: true }, airSourceAvailable: true, data: { airPath, ownerDef: defPath }, referenceContext: { generation: 4, defPath }, collisionEpoch: 0, propertyEpoch: 0, destinationEpoch: 0, propertyQueue: Promise.resolve(), destinationQueue: Promise.resolve(), destinationApplyAuthority: null, destinationApplyBusy: false };
  const services = { workspace, referenceContext: context, collisionRuntimeOptions: target, readRuntimePlan: () => ({ entries: [] }), collisionRuntimeDraftEntries: () => [], WorkspaceEdit, Range, window: { showWarningMessage: async () => options.confirm === false ? undefined : 'Apply Reviewed Diff', showTextDocument: async () => { navigationCalls += 1; } }, clipboard: { writeText: async () => { clipboardCalls += 1; } }, commands: { executeCommand: async () => { commandCalls += 1; } } };
  return { record, services, workspace, airDocument, sourceDocument, context, capabilities, get stateText() { return stateText; }, set stateText(value) { stateText = value; }, get airText() { return currentAirText; }, set airText(value) { currentAirText = value; airDocument.version += 1; }, counts: () => ({ insertCalls, replaceCalls, applyCalls, saveCalls, fsCalls, clipboardCalls, commandCalls, navigationCalls }) };
}

function occurrence(h) {
  const context = h.context(), snapshot = buildAirActionUsageSnapshot(context), item = snapshot.publicCollisions.items.find(candidate => candidate.controller === 'HitBy');
  assert(item && item.relatedActions.includes(200) && item.relation === 'same-state'); return item;
}

async function issue(h, editAction, fieldKey, draft, issueToken = token, request = 1) {
  const item = occurrence(h), base = { reviewKind: 'existing-field', occurrenceId: item.id, action: 200, elementIndex: 0, groupKey: 'clsn1', index: 0, draft };
  const inventory = await buildCollisionExistingPropertyReview(h.record, base, h.services);
  assert.strictEqual(inventory.available, true, inventory.reason); const field = inventory.fields.find(candidate => candidate.key === fieldKey); assert(field, `${fieldKey} is offered by exact host evidence`);
  const planned = await buildCollisionExistingPropertyReview(h.record, { ...base, fieldId: field.id, editAction }, h.services);
  assert.strictEqual(planned.plan.status, 'ready', planned.plan.limitations.join(' | '));
  const published = [];
  await queueCollisionDestinationReview(h.record, { ...base, request, fieldId: field.id, editAction }, payload => published.push(payload), { ...h.services, applyToken: () => issueToken });
  assert.strictEqual(published[0].applyAuthority.token, issueToken); assert(!Object.prototype.hasOwnProperty.call(published[0], '_authorityInput'));
  return published[0];
}

(async () => {
  const replacement = harness(); await issue(replacement, 'replace', 'attr', { family: 'eligibility', kind: 'HitBy', attr: 'SCA, AP', time: 2, playerno: '2' });
  const appliedReplacement = await applyCollisionDestinationReview(replacement.record, token, replacement.services);
  assert.strictEqual(appliedReplacement.status, 'applied'); assert.match(replacement.stateText, /attr: SCA, AP/); assert.deepStrictEqual(replacement.counts(), { insertCalls: 0, replaceCalls: 1, applyCalls: 1, saveCalls: 0, fsCalls: 0, clipboardCalls: 0, commandCalls: 0, navigationCalls: 0 });
  await assert.rejects(() => applyCollisionDestinationReview(replacement.record, token, replacement.services), /invalid, stale, or already consumed/i, 'successful authority cannot replay');

  const removal = harness(); await issue(removal, 'remove', 'playerno', { family: 'eligibility', kind: 'HitBy', attr: 'SCA, NA', time: 2 });
  const appliedRemoval = await applyCollisionDestinationReview(removal.record, token, removal.services);
  assert.strictEqual(appliedRemoval.status, 'applied'); assert(!/playerno\s*:/.test(removal.stateText)); assert.deepStrictEqual(removal.counts(), { insertCalls: 0, replaceCalls: 1, applyCalls: 1, saveCalls: 0, fsCalls: 0, clipboardCalls: 0, commandCalls: 0, navigationCalls: 0 });

  const replacementDraft = { family: 'eligibility', kind: 'HitBy', attr: 'SCA, AP', time: 2, playerno: '2' };
  const cancelled = harness({ confirm: false }); await issue(cancelled, 'replace', 'attr', replacementDraft); const cancelledResult = await applyCollisionDestinationReview(cancelled.record, token, cancelled.services);
  assert.strictEqual(cancelledResult.status, 'cancelled'); assert.strictEqual(cancelled.counts().applyCalls, 0); await assert.rejects(() => applyCollisionDestinationReview(cancelled.record, token, cancelled.services), /invalid, stale, or already consumed/i);

  const open = harness({ open: true }); await issue(open, 'replace', 'attr', replacementDraft); assert.strictEqual((await applyCollisionDestinationReview(open.record, token, open.services)).status, 'applied'); assert.strictEqual(open.counts().replaceCalls, 1);
  for (const [label, mutate] of [
    ['property epoch', h => { h.record.propertyEpoch += 1; }],
    ['collision epoch', h => { h.record.collisionEpoch += 1; }],
    ['destination epoch', h => { h.record.destinationEpoch += 1; }],
    ['DEF path', h => { h.record.referenceContext.defPath = path.resolve('/char/other.def'); }],
    ['source bytes', h => { h.stateText += '# changed\n'; }]
  ]) {
    const drift = harness(); await issue(drift, 'replace', 'attr', replacementDraft); mutate(drift);
    await assert.rejects(() => applyCollisionDestinationReview(drift.record, token, drift.services), /changed before confirmation/i, label);
    assert.strictEqual(drift.counts().applyCalls, 0);
  }
  const capabilityDrift = harness(); await issue(capabilityDrift, 'replace', 'attr', replacementDraft); capabilityDrift.services.collisionRuntimeOptions = () => ({ target: { channel: 'nightly', buildId: 'newer' }, targetBuildId: 'newer', capabilityFingerprint: 'B'.repeat(64), allowIndexed: true, allowStringExpressions: true, dummyReferenceDecision: true, allocationDecision: { capabilityId: 'collision.air-index-allocation', enabled: true, status: 'supported', capabilityFingerprint: 'B'.repeat(64) } });
  await assert.rejects(() => applyCollisionDestinationReview(capabilityDrift.record, token, capabilityDrift.services), /changed before confirmation/i);

  const dirty = harness({ open: true }); await issue(dirty, 'replace', 'attr', replacementDraft); dirty.sourceDocument.isDirty = true; await assert.rejects(() => applyCollisionDestinationReview(dirty.record, token, dirty.services), /open\/dirty\/version state changed/i);
  const version = harness({ open: true }); await issue(version, 'replace', 'attr', replacementDraft); version.sourceDocument.version += 1; await assert.rejects(() => applyCollisionDestinationReview(version.record, token, version.services), /changed before confirmation|open\/dirty\/version state changed/i);
  const missing = harness(); await issue(missing, 'replace', 'attr', replacementDraft); missing.services.referenceContext = () => ({ defPath, defText, defDirty: false, airPath, airText, inventoryComplete: false, assignedSources: [], sources: [], reason: 'source deleted', generation: 4, collisionCapabilities: missing.capabilities }); await assert.rejects(() => applyCollisionDestinationReview(missing.record, token, missing.services), /changed before confirmation/i);
  const renamed = harness(); await issue(renamed, 'replace', 'attr', replacementDraft); const renamedPath = path.resolve('/char/renamed.zss'); renamed.services.referenceContext = () => ({ defPath, defText, defDirty: false, airPath, airText, inventoryComplete: true, assignedSources: [renamedPath], sources: [{ available: true, dirty: false, filename: renamedPath, syntax: 'zss', text: renamed.stateText, sourceHash: hash(renamed.stateText), version: null }], generation: 4, collisionCapabilities: renamed.capabilities }); await assert.rejects(() => applyCollisionDestinationReview(renamed.record, token, renamed.services), /changed before confirmation/i);

  const airDuring = harness(); await issue(airDuring, 'replace', 'attr', replacementDraft); airDuring.services.window.showWarningMessage = async () => { airDuring.airText = airText + '# changed during modal\n'; return 'Apply Reviewed Diff'; }; await assert.rejects(() => applyCollisionDestinationReview(airDuring.record, token, airDuring.services), /changed during confirmation/i);
  const openedDuring = harness(); await issue(openedDuring, 'replace', 'attr', replacementDraft); openedDuring.services.window.showWarningMessage = async () => { openedDuring.workspace.textDocuments.push(openedDuring.sourceDocument); return 'Apply Reviewed Diff'; }; await assert.rejects(() => applyCollisionDestinationReview(openedDuring.record, token, openedDuring.services), /open\/dirty\/version state changed during confirmation/i);
  const dirtyDuring = harness({ open: true }); await issue(dirtyDuring, 'replace', 'attr', replacementDraft); dirtyDuring.services.window.showWarningMessage = async () => { dirtyDuring.sourceDocument.isDirty = true; return 'Apply Reviewed Diff'; }; await assert.rejects(() => applyCollisionDestinationReview(dirtyDuring.record, token, dirtyDuring.services), /open\/dirty\/version state changed during confirmation/i);
  const versionDuring = harness({ open: true }); await issue(versionDuring, 'replace', 'attr', replacementDraft); versionDuring.services.window.showWarningMessage = async () => { versionDuring.sourceDocument.version += 1; return 'Apply Reviewed Diff'; }; await assert.rejects(() => applyCollisionDestinationReview(versionDuring.record, token, versionDuring.services), /changed during confirmation|open\/dirty\/version state changed during confirmation/i);
  const deletedDuring = harness(); await issue(deletedDuring, 'replace', 'attr', replacementDraft); deletedDuring.services.window.showWarningMessage = async () => { deletedDuring.services.referenceContext = () => ({ defPath, defText, defDirty: false, airPath, airText, inventoryComplete: false, assignedSources: [], sources: [], reason: 'deleted', generation: 4, collisionCapabilities: deletedDuring.capabilities }); return 'Apply Reviewed Diff'; }; await assert.rejects(() => applyCollisionDestinationReview(deletedDuring.record, token, deletedDuring.services), /changed during confirmation/i);
  const renamedDuring = harness(); await issue(renamedDuring, 'replace', 'attr', replacementDraft); renamedDuring.services.window.showWarningMessage = async () => { const moved = path.resolve('/char/moved.zss'); renamedDuring.services.referenceContext = () => ({ defPath, defText, defDirty: false, airPath, airText, inventoryComplete: true, assignedSources: [moved], sources: [{ available: true, dirty: false, filename: moved, syntax: 'zss', text: renamedDuring.stateText, sourceHash: hash(renamedDuring.stateText), version: null }], generation: 4, collisionCapabilities: renamedDuring.capabilities }); return 'Apply Reviewed Diff'; }; await assert.rejects(() => applyCollisionDestinationReview(renamedDuring.record, token, renamedDuring.services), /changed during confirmation/i);

  const newer = harness(); await issue(newer, 'replace', 'attr', replacementDraft); const newerToken = 'e'.repeat(48); newer.services.window.showWarningMessage = async () => { await issue(newer, 'replace', 'time', { family: 'eligibility', kind: 'HitBy', attr: 'SCA, NA', time: 7, playerno: '2' }, newerToken, 2); return 'Apply Reviewed Diff'; };
  await assert.rejects(() => applyCollisionDestinationReview(newer.record, token, newer.services), /changed during confirmation/i, 'field/recipe/newer-review drift invalidates the old modal');
  newer.services.window.showWarningMessage = async () => 'Apply Reviewed Diff'; assert.strictEqual((await applyCollisionDestinationReview(newer.record, newerToken, newer.services)).status, 'applied', 'the newer reviewed field authority survives the older modal');

  const rejected = harness({ applyFalse: true }); await issue(rejected, 'replace', 'attr', replacementDraft); await assert.rejects(() => applyCollisionDestinationReview(rejected.record, token, rejected.services), /rejected/); assert.strictEqual(rejected.counts().replaceCalls, 1);
  const mismatch = harness({ postMismatch: true }); await issue(mismatch, 'replace', 'attr', replacementDraft); await assert.rejects(() => applyCollisionDestinationReview(mismatch.record, token, mismatch.services), /differs from the reviewed after-text/i);
  const rangeMismatch = harness(); await issue(rangeMismatch, 'replace', 'attr', replacementDraft); rangeMismatch.sourceDocument.positionAt = offset => ({ offset: offset + 1 }); await assert.rejects(() => applyCollisionDestinationReview(rangeMismatch.record, token, rangeMismatch.services), /one exact editor range/i); assert.strictEqual(rangeMismatch.counts().applyCalls, 0);

  const busy = harness(); await issue(busy, 'replace', 'attr', replacementDraft); busy.record.destinationApplyBusy = true; await assert.rejects(() => applyCollisionDestinationReview(busy.record, token, busy.services), /already being processed/i); await assert.rejects(() => applyCollisionDestinationReview(busy.record, token, busy.services), /invalid, stale, or already consumed/i);
  const doubleClick = harness(); await issue(doubleClick, 'replace', 'attr', replacementDraft); let enterModal, releaseModal; const entered = new Promise(resolve => { enterModal = resolve; }), modal = new Promise(resolve => { releaseModal = resolve; }); doubleClick.services.window.showWarningMessage = async () => { enterModal(); return modal; }; const firstApply = applyCollisionDestinationReview(doubleClick.record, token, doubleClick.services); await entered; await assert.rejects(() => applyCollisionDestinationReview(doubleClick.record, token, doubleClick.services), /invalid, stale, or already consumed/i); releaseModal('Apply Reviewed Diff'); assert.strictEqual((await firstApply).status, 'applied'); assert.strictEqual(doubleClick.counts().replaceCalls, 1);

  const malformed = harness(), item = occurrence(malformed), getterRequest = { reviewKind: 'existing-field', occurrenceId: item.id, action: 200, elementIndex: 0, groupKey: 'clsn1', index: 0 };
  let getterRuns = 0; Object.defineProperty(getterRequest, 'draft', { enumerable: true, get() { getterRuns += 1; return {}; } });
  const malformedResult = await buildCollisionExistingPropertyReview(malformed.record, getterRequest, malformed.services);
  assert.strictEqual(malformedResult.available, false); assert.strictEqual(getterRuns, 0, 'host request accessors are rejected without execution');

  assert.deepStrictEqual(exactCollisionApplyEnvelope({ type: 'applyCollisionDestination', request: 3, token }), { valid: true, request: 3, token });
  assert.strictEqual(exactCollisionApplyEnvelope({ type: 'applyCollisionDestination', request: '3', token }).valid, false, 'apply request integers are not coerced');
  let tokenGetterRuns = 0; const hostileApply = { type: 'applyCollisionDestination', request: 3 }; Object.defineProperty(hostileApply, 'token', { enumerable: true, get() { tokenGetterRuns += 1; return token; } });
  assert.strictEqual(exactCollisionApplyEnvelope(hostileApply).valid, false); assert.strictEqual(tokenGetterRuns, 0, 'apply-envelope accessors are rejected without execution');

  console.log('AIR existing-property Apply performs one exact replace/removal, no insert/save, and rejects hostile review envelopes');
})().catch(error => { console.error(error); process.exitCode = 1; });
