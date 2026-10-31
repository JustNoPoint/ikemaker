'use strict';
const assert = require('assert');
const crypto = require('crypto');
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
const {
  buildCollisionAssistance, queueCollisionAssistanceAcceptanceReview, applyCollisionAssistanceReview,
  exactAssistanceApplyEnvelope, revokeCollisionAssistanceReview
} = require('../src/air_docking_workspace');
Module._load = originalLoad;

const text = '[Begin Action 100]\nClsn1: 1\nClsn1[0] = -5, -6, 7, 8\n0,0,0,0,1\n0,1,0,0,1\n';
const capabilityFingerprint = 'C'.repeat(64), token = 'a'.repeat(48);
const cryptoToken = value => crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 48);
const state = { referenceElementIndex: 0, targetElementIndices: [1], groups: { clsn1: { enabled: true, cap: 4 }, clsn2: { enabled: false, cap: 0 } }, locks: { frames: [], boxes: [] }, targetPosition: 0 };
const runtime = () => ({ target: { channel: 'stable', version: '1.0' }, capabilityFingerprint, allocationDecision: { enabled: false, status: 'unsupported', capabilityFingerprint } });
function documentFor(filename, initial = text, dirty = true, version = 4) {
  let source = initial;
  const lines = value => String(value).slice(0, value).split('\n');
  return {
    fileName: filename, uri: { fsPath: filename }, isClosed: false, isDirty: dirty, version,
    getText: () => source,
    positionAt(offset) { const prefix = source.slice(0, offset).split('\n'); return { line: prefix.length - 1, character: prefix[prefix.length - 1].length }; },
    offsetAt(position) { const parts = source.split('\n'); let offset = 0; for (let index = 0; index < position.line; index += 1) offset += parts[index].length + 1; return offset + position.character; },
    _replace(start, end, replacement) { source = source.slice(0, start) + replacement + source.slice(end); this.version += 1; this.isDirty = true; }
  };
}
class Range { constructor(start, end) { this.start = start; this.end = end; } }
class WorkspaceEdit {
  constructor() { this.edits = []; }
  insert(uri, position, replacement) { this.edits.push({ uri, start: position, end: position, replacement }); }
  replace(uri, range, replacement) { this.edits.push({ uri, start: range.start, end: range.end, replacement }); }
}
function workspaceFor(document, closed = false) {
  const workspace = { textDocuments: closed ? [] : [document], openCalls: 0, applyCalls: 0, async openTextDocument() { this.openCalls += 1; if (!this.textDocuments.includes(document)) this.textDocuments.push(document); return document; }, async applyEdit(edit) { this.applyCalls += 1; assert.strictEqual(edit.edits.length, 1); const item = edit.edits[0]; document._replace(document.offsetAt(item.start), document.offsetAt(item.end), item.replacement); return true; } };
  return workspace;
}
function record(filename) { return { panel: { active: true }, airSourceAvailable: true, data: { airPath: filename }, browserState: { primaryView: 'collisions', collisionMode: 'assistance', action: 100, assistanceState: state }, assistanceEpoch: 3, assistanceReviewEpoch: 0, assistanceSessionId: 'air-assistance:test', latestAssistanceReviewRequest: 0, latestAssistanceApplyRequest: 0, assistanceReviewQueue: Promise.resolve(), assistanceApplyAuthority: null, assistanceApplyContext: null, assistanceApplyDocument: null, assistanceApplyBusy: false }; }
function acceptance(projection) { return { proposalHash: projection.proposalHash, targets: projection.targets.map(target => ({ elementIndex: target.elementIndex, clsn1: { mode: 'whole-group', boxes: target.groups.clsn1.proposals.filter(item => !item.locked).map(item => ({ slot: item.target.slot, rect: item.rect.slice() })) }, clsn2: { mode: 'none', boxes: [] } })) }; }
async function issue(recordValue, workspace, fileSystem = fs, request = 7, tokenValue = token, requestedState = state, adjustAcceptance = null) {
  const services = { workspace, fileSystem, collisionRuntimeOptions: runtime, assistanceApplyToken: () => tokenValue };
  recordValue.browserState.assistanceState = requestedState; const proposal = await buildCollisionAssistance(recordValue, { action: 100, assistanceState: requestedState }, services), selected = acceptance(proposal.projection), messages = []; if (adjustAcceptance) adjustAcceptance(selected);
  await queueCollisionAssistanceAcceptanceReview(recordValue, { type: 'reviewCollisionAssistanceAcceptance', request, action: 100, proposalHash: proposal.projection.proposalHash, acceptance: selected }, value => messages.push(value), services);
  assert.strictEqual(messages.length, 1); const published = messages[0]; assert(published.review.ready && published.applyAuthority?.token === tokenValue); assert(!JSON.stringify(published).includes(recordValue.data.airPath)); assert(!('plan' in published) && !('sourceText' in published));
  return { published, services };
}
function applyMessage(published, request = published.applyRequest) { return { type: 'applyCollisionAssistanceAcceptance', request, token: published.applyAuthority.token, action: published.action, proposalHash: published.proposalHash, acceptanceHash: published.acceptanceHash }; }

(async () => {
  const filename = path.resolve('test-fixtures/assistance-open.air'), document = documentFor(filename), workspace = workspaceFor(document), rec = record(filename), { published, services } = await issue(rec, workspace);
  const result = await applyCollisionAssistanceReview(rec, applyMessage(published), { ...services, window: { showWarningMessage: async (_message, _options, choice) => choice }, WorkspaceEdit, Range });
  assert.strictEqual(result.status, 'applied'); assert.strictEqual(workspace.applyCalls, 1); assert.strictEqual(workspace.openCalls, 0); assert(document.getText() !== text); assert.strictEqual(rec.assistanceApplyAuthority, null);

  const cancelDocument = documentFor(filename), cancelWorkspace = workspaceFor(cancelDocument), cancelRecord = record(filename), cancelled = await issue(cancelRecord, cancelWorkspace, fs, 8);
  const cancelResult = await applyCollisionAssistanceReview(cancelRecord, applyMessage(cancelled.published), { ...cancelled.services, window: { showWarningMessage: async () => undefined }, WorkspaceEdit, Range });
  assert.strictEqual(cancelResult.status, 'cancelled'); assert.strictEqual(cancelWorkspace.applyCalls, 0); await assert.rejects(() => applyCollisionAssistanceReview(cancelRecord, applyMessage(cancelled.published), { ...cancelled.services, window: {}, WorkspaceEdit, Range }), /already consumed|invalid|stale/i);

  const malformedDocument = documentFor(filename), malformedWorkspace = workspaceFor(malformedDocument), malformedRecord = record(filename), malformed = await issue(malformedRecord, malformedWorkspace, fs, 9), accessor = applyMessage(malformed.published, 4);
  Object.defineProperty(accessor, 'action', { enumerable: true, get() { throw new Error('getter must not run'); } });
  await assert.rejects(() => applyCollisionAssistanceReview(malformedRecord, accessor, { ...malformed.services, window: {}, WorkspaceEdit, Range }), /malformed|invalid|match/i); assert.strictEqual(malformedRecord.assistanceApplyAuthority, null, 'accessor envelope consumes the presented one-use authority without executing the getter');
  assert.strictEqual(exactAssistanceApplyEnvelope(new Proxy(applyMessage(malformed.published), {})).valid, false);
  const wrongRequestDocument = documentFor(filename), wrongRequestWorkspace = workspaceFor(wrongRequestDocument), wrongRequestRecord = record(filename), wrongRequest = await issue(wrongRequestRecord, wrongRequestWorkspace, fs, 91);
  await assert.rejects(() => applyCollisionAssistanceReview(wrongRequestRecord, applyMessage(wrongRequest.published, 92), { ...wrongRequest.services, window: {}, WorkspaceEdit, Range }), /did not exactly match/i); assert.strictEqual(wrongRequestRecord.assistanceApplyAuthority, null, 'a wrong Apply request nonce consumes the otherwise valid token'); assert.strictEqual(wrongRequestWorkspace.applyCalls, 0);
  for (const [label, mutate] of [['Action', value => { value.action += 1; }], ['proposal', value => { value.proposalHash = 'D'.repeat(64); }], ['acceptance', value => { value.acceptanceHash = 'E'.repeat(64); }], ['token', value => { value.token = 'f'.repeat(48); }]]) {
    const hostileDocument = documentFor(filename), hostileWorkspace = workspaceFor(hostileDocument), hostileRecord = record(filename), hostile = await issue(hostileRecord, hostileWorkspace, fs, 93, cryptoToken(label)); const wire = applyMessage(hostile.published); mutate(wire); await assert.rejects(() => applyCollisionAssistanceReview(hostileRecord, wire, { ...hostile.services, window: {}, WorkspaceEdit, Range }), /invalid|stale|match/i, `${label} drift rejects`); assert.strictEqual(hostileRecord.assistanceApplyAuthority, null); assert.strictEqual(hostileWorkspace.applyCalls, 0);
  }

  const busyDocument = documentFor(filename), busyWorkspace = workspaceFor(busyDocument), busyRecord = record(filename), busy = await issue(busyRecord, busyWorkspace, fs, 10); busyRecord.assistanceApplyBusy = true;
  await assert.rejects(() => applyCollisionAssistanceReview(busyRecord, applyMessage(busy.published), { ...busy.services, window: {}, WorkspaceEdit, Range }), /already being processed/i); assert.strictEqual(busyRecord.assistanceApplyAuthority, null);

  const rejectDocument = documentFor(filename), rejectWorkspace = workspaceFor(rejectDocument), rejectRecord = record(filename), rejected = await issue(rejectRecord, rejectWorkspace, fs, 101); rejectWorkspace.applyEdit = async () => { rejectWorkspace.applyCalls += 1; return false; };
  await assert.rejects(() => applyCollisionAssistanceReview(rejectRecord, applyMessage(rejected.published), { ...rejected.services, window: { showWarningMessage: async (_message, _options, choice) => choice }, WorkspaceEdit, Range }), /VS Code rejected.*No success/i); assert.strictEqual(rejectWorkspace.applyCalls, 1);
  const mismatchDocument = documentFor(filename), mismatchWorkspace = workspaceFor(mismatchDocument), mismatchRecord = record(filename), mismatch = await issue(mismatchRecord, mismatchWorkspace, fs, 102); mismatchWorkspace.applyEdit = async () => { mismatchWorkspace.applyCalls += 1; return true; };
  await assert.rejects(() => applyCollisionAssistanceReview(mismatchRecord, applyMessage(mismatch.published), { ...mismatch.services, window: { showWarningMessage: async (_message, _options, choice) => choice }, WorkspaceEdit, Range }), /differs.*No rollback/i); assert.strictEqual(mismatchWorkspace.applyCalls, 1);

  const driftDocument = documentFor(filename), driftWorkspace = workspaceFor(driftDocument), driftRecord = record(filename), drift = await issue(driftRecord, driftWorkspace, fs, 11); driftRecord.browserState.assistanceState = { ...state, referenceElementIndex: 1 };
  await assert.rejects(() => applyCollisionAssistanceReview(driftRecord, applyMessage(drift.published), { ...drift.services, window: {}, WorkspaceEdit, Range }), /changed before confirmation|proposal changed/i); assert.strictEqual(driftWorkspace.applyCalls, 0);
  const modalDocument = documentFor(filename), modalWorkspace = workspaceFor(modalDocument), modalRecord = record(filename), modal = await issue(modalRecord, modalWorkspace, fs, 111); let acceptModal; const modalPending = applyCollisionAssistanceReview(modalRecord, applyMessage(modal.published), { ...modal.services, window: { showWarningMessage: () => new Promise(resolve => { acceptModal = choice => resolve(choice); }) }, WorkspaceEdit, Range }); await Promise.resolve(); await Promise.resolve(); modalDocument._replace(modalDocument.getText().length, modalDocument.getText().length, '; drift\n'); acceptModal('Apply Reviewed Proposals'); await assert.rejects(() => modalPending, /changed during confirmation|proposal changed/i); assert.strictEqual(modalWorkspace.applyCalls, 0);
  const capabilityDocument = documentFor(filename), capabilityWorkspace = workspaceFor(capabilityDocument), capabilityRecord = record(filename), capability = await issue(capabilityRecord, capabilityWorkspace, fs, 112); await assert.rejects(() => applyCollisionAssistanceReview(capabilityRecord, applyMessage(capability.published), { ...capability.services, collisionRuntimeOptions: () => ({ ...runtime(), capabilityFingerprint: 'F'.repeat(64) }), window: {}, WorkspaceEdit, Range }), /changed before confirmation|proposal changed|capability evidence/i); assert.strictEqual(capabilityWorkspace.applyCalls, 0);
  const removedDocument = documentFor(filename), removedWorkspace = workspaceFor(removedDocument), removedRecord = record(filename), removed = await issue(removedRecord, removedWorkspace, fs, 113); removedRecord.airSourceAvailable = false; await assert.rejects(() => applyCollisionAssistanceReview(removedRecord, applyMessage(removed.published), { ...removed.services, window: {}, WorkspaceEdit, Range }), /no longer active|removed|changed/i); assert.strictEqual(removedWorkspace.applyCalls, 0);
  const renamedDocument = documentFor(filename), renamedWorkspace = workspaceFor(renamedDocument), renamedRecord = record(filename), renamed = await issue(renamedRecord, renamedWorkspace, fs, 119, '3'.repeat(48)); renamedRecord.data.airPath = path.resolve('test-fixtures/renamed.air'); renamedRecord.airSourceAvailable = false; await assert.rejects(() => applyCollisionAssistanceReview(renamedRecord, applyMessage(renamed.published), { ...renamed.services, window: {}, WorkspaceEdit, Range }), /no longer active|removed|changed/i); assert.strictEqual(renamedWorkspace.applyCalls, 0);

  const defaultSource = '[Begin Action 100]\nClsn1Default: 1\nClsn1[0]=1,2,3,4\n100,0,0,0,1\n100,1,0,0,1\nClsn1: 1\nClsn1[0]=10,20,30,40\n100,2,0,0,1', cohortState = { ...state, referenceElementIndex: 2, targetElementIndices: [0, 1] }, cohortDocument = documentFor(filename, defaultSource), cohortWorkspace = workspaceFor(cohortDocument), cohortRecord = record(filename), cohort = await issue(cohortRecord, cohortWorkspace, fs, 114, 'c'.repeat(48), cohortState); const defaultDecision = cohort.published.review.ownershipDecisions.find(item => item.kind === 'default-write-once'); assert(defaultDecision && JSON.stringify(defaultDecision.tiedElementIndices) === JSON.stringify([0, 1]), 'integration review preserves the complete default-owner cohort');
  const adjustedDocument = documentFor(filename), adjustedWorkspace = workspaceFor(adjustedDocument), adjustedRecord = record(filename), adjusted = await issue(adjustedRecord, adjustedWorkspace, fs, 118, '2'.repeat(48), state, selected => { selected.targets[0].clsn1.mode = 'selected-boxes'; selected.targets[0].clsn1.boxes[0].rect = [-9, -10, 11, 12]; }); assert(adjusted.published.review.targets.some(target => target.groups.clsn1.slots.some(slot => slot.adjusted)), 'adjusted accepted rectangles remain explicit in the public review');

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-air-assist-')), delayedPath = path.join(temp, 'delayed.air'); fs.writeFileSync(delayedPath, text, 'utf8'); const delayedDocument = documentFor(delayedPath, text, false, 1), delayedWorkspace = workspaceFor(delayedDocument, true); let releaseOpen; delayedWorkspace.openTextDocument = () => { delayedWorkspace.openCalls += 1; return new Promise(resolve => { releaseOpen = () => { delayedWorkspace.textDocuments.push(delayedDocument); resolve(delayedDocument); }; }); }; const delayedRecord = record(delayedPath), delayedOld = await issue(delayedRecord, delayedWorkspace, fs, 115, 'd'.repeat(48)), delayedPending = applyCollisionAssistanceReview(delayedRecord, applyMessage(delayedOld.published), { ...delayedOld.services, window: { showWarningMessage: async (_message, _options, choice) => choice }, WorkspaceEdit, Range }); await Promise.resolve(); await Promise.resolve(); assert.strictEqual(typeof releaseOpen, 'function'); const delayedNew = await issue(delayedRecord, delayedWorkspace, fs, 116, 'e'.repeat(48)); releaseOpen(); await assert.rejects(() => delayedPending, /changed while.*opening/i); assert.strictEqual(delayedWorkspace.applyCalls, 0); assert.strictEqual(delayedRecord.assistanceApplyAuthority?.token, delayedNew.published.applyAuthority.token, 'a newer review survives the older delayed-open terminal path');

  const capabilityOpenPath = path.join(temp, 'capability-open.air'); fs.writeFileSync(capabilityOpenPath, text, 'utf8'); const capabilityOpenDocument = documentFor(capabilityOpenPath, text, false, 1), capabilityOpenWorkspace = workspaceFor(capabilityOpenDocument, true); let releaseCapabilityOpen; capabilityOpenWorkspace.openTextDocument = () => { capabilityOpenWorkspace.openCalls += 1; return new Promise(resolve => { releaseCapabilityOpen = () => { capabilityOpenWorkspace.textDocuments.push(capabilityOpenDocument); resolve(capabilityOpenDocument); }; }); }; const capabilityOpenRecord = record(capabilityOpenPath), capabilityOpen = await issue(capabilityOpenRecord, capabilityOpenWorkspace, fs, 117, '1'.repeat(48)); let currentCapability = runtime(); const capabilityOpenPending = applyCollisionAssistanceReview(capabilityOpenRecord, applyMessage(capabilityOpen.published), { ...capabilityOpen.services, collisionRuntimeOptions: () => currentCapability, window: { showWarningMessage: async (_message, _options, choice) => choice }, WorkspaceEdit, Range }); await Promise.resolve(); await Promise.resolve(); currentCapability = { ...runtime(), capabilityFingerprint: 'F'.repeat(64) }; releaseCapabilityOpen(); await assert.rejects(() => capabilityOpenPending, /changed while.*opening/i); assert.strictEqual(capabilityOpenWorkspace.applyCalls, 0);

  const closedPath = path.join(temp, 'closed.air'); fs.writeFileSync(closedPath, text, 'utf8'); const closedDocument = documentFor(closedPath, text, false, 1), closedWorkspace = workspaceFor(closedDocument, true), closedRecord = record(closedPath), closed = await issue(closedRecord, closedWorkspace);
  assert.strictEqual(closedWorkspace.openCalls, 0, 'reviewing a closed AIR source keeps it closed');
  const closedResult = await applyCollisionAssistanceReview(closedRecord, applyMessage(closed.published), { ...closed.services, window: { showWarningMessage: async (_message, _options, choice) => choice }, WorkspaceEdit, Range });
  assert.strictEqual(closedResult.status, 'applied'); assert.strictEqual(closedWorkspace.openCalls, 1, 'a closed AIR source opens once only at the final writer step'); assert.strictEqual(closedWorkspace.applyCalls, 1); fs.rmSync(temp, { recursive: true, force: true });

  const revokedDocument = documentFor(filename), revokedWorkspace = workspaceFor(revokedDocument), revokedRecord = record(filename), revoked = await issue(revokedRecord, revokedWorkspace, fs, 12); revokeCollisionAssistanceReview(revokedRecord); await assert.rejects(() => applyCollisionAssistanceReview(revokedRecord, applyMessage(revoked.published), { ...revoked.services, window: {}, WorkspaceEdit, Range }), /invalid|stale|consumed/i);

  const newerDocument = documentFor(filename), newerWorkspace = workspaceFor(newerDocument), newerRecord = record(filename), older = await issue(newerRecord, newerWorkspace, fs, 13); let releaseModal; const olderPending = applyCollisionAssistanceReview(newerRecord, applyMessage(older.published), { ...older.services, window: { showWarningMessage: () => new Promise(resolve => { releaseModal = () => resolve(undefined); }) }, WorkspaceEdit, Range });
  await Promise.resolve(); await Promise.resolve(); assert.strictEqual(typeof releaseModal, 'function'); const newer = await issue(newerRecord, newerWorkspace, fs, 14, 'b'.repeat(48)); assert.strictEqual(newerRecord.assistanceApplyAuthority?.token, 'b'.repeat(48)); releaseModal(); const olderResult = await olderPending; assert.strictEqual(olderResult.status, 'cancelled'); assert.strictEqual(newerRecord.assistanceApplyAuthority?.token, 'b'.repeat(48), 'an older terminal modal path cannot revoke a newer reviewed authority'); assert.strictEqual(newer.published.applyAuthority.token, 'b'.repeat(48));
  console.log('AIR collision Assistance Apply is one-use, exact, closed-source-safe, and editor-only');
})().catch(error => { console.error(error); process.exitCode = 1; });
