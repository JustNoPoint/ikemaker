'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { SCHEMA, MAX_SOURCE_BYTES, MAX_PATCH_BYTES, hash, validateOperation, applyReviewedWorkspacePatch } = require('../src/reviewed_workspace_patch_writer');

const sourcePath = path.normalize(path.resolve('C:/character/main.air'));
function frozen(value) { if (value && typeof value === 'object') { for (const child of Object.values(value)) frozen(child); Object.freeze(value); } return value; }
function operation(beforeText, start, end, replacement, policy, changes = {}) {
  const afterText = beforeText.slice(0, start) + replacement + beforeText.slice(end);
  return frozen({ schema: SCHEMA, version: 1, sourcePath, sourceWasOpen: true, documentVersion: 7, sourceWasDirty: true, beforeHash: hash(beforeText), afterHash: hash(afterText), start, end, before: beforeText.slice(start, end), replacement, policy, ...changes });
}
function harness(text, options = {}) {
  let current = text, applyCalls = 0, saveCalls = 0, operations = [];
  const document = { fileName: sourcePath, uri: { fsPath: sourcePath }, isClosed: false, isDirty: options.dirty ?? true, version: options.version ?? 7, getText: () => current, positionAt: offset => options.badOffset && offset > 0 ? { offset: offset - 1 } : { offset }, offsetAt: position => position.offset, save: async () => { saveCalls += 1; } };
  class Range { constructor(start, end) { this.start = start; this.end = end; } }
  class WorkspaceEdit { insert(uri, position, replacement) { operations.push({ kind: 'insert', uri, start: position.offset, end: position.offset, replacement }); } replace(uri, range, replacement) { operations.push({ kind: 'replace', uri, start: range.start.offset, end: range.end.offset, replacement }); } }
  const workspace = { applyEdit: async () => { applyCalls += 1; if (options.applyFalse) return false; assert.strictEqual(operations.length, 1); const item = operations[0]; current = current.slice(0, item.start) + item.replacement + current.slice(item.end); if (options.postMismatch) current += '!'; document.version += 1; document.isDirty = true; return true; } };
  return { document, services: { workspace, WorkspaceEdit, Range }, get text() { return current; }, set text(value) { current = value; }, get operations() { return operations; }, counts: () => ({ applyCalls, saveCalls }) };
}

(async () => {
  const base = 'alpha beta gamma';
  for (const [label, op] of [
    ['insert', operation(base, 6, 6, 'new ', 'insert')],
    ['replace', operation(base, 6, 10, 'BETA', 'replace')],
    ['remove', operation(base, 5, 10, '', 'remove')]
  ]) {
    const h = harness(base), result = await applyReviewedWorkspacePatch(h.document, op, h.services);
    assert.strictEqual(result.applied, true, label); assert.strictEqual(h.text, base.slice(0, op.start) + op.replacement + base.slice(op.end));
    assert.strictEqual(h.operations.length, 1); assert.strictEqual(h.operations[0].kind, label === 'insert' ? 'insert' : 'replace'); assert.deepStrictEqual(h.counts(), { applyCalls: 1, saveCalls: 0 });
  }
  const closed = harness(base, { dirty: false, version: 3 }), closedOp = operation(base, 0, 0, 'x', 'insert', { sourceWasOpen: false, documentVersion: null, sourceWasDirty: false });
  assert.strictEqual((await applyReviewedWorkspacePatch(closed.document, closedOp, closed.services)).applied, true, 'a reviewed closed source may open clean at its final editor version');

  for (const [label, mutate] of [
    ['path', value => { value.sourcePath = path.normalize(path.resolve('C:/character/other.air')); }], ['version', value => { value.documentVersion = 8; }], ['dirty', value => { value.sourceWasDirty = false; }],
    ['before hash', value => { value.beforeHash = 'D'.repeat(64); }], ['after hash', value => { value.afterHash = 'D'.repeat(64); }], ['slice', value => { value.before = 'xxxx'; }], ['range', value => { value.end = MAX_SOURCE_BYTES + 1; }]
  ]) {
    const mutable = JSON.parse(JSON.stringify(operation(base, 6, 10, 'BETA', 'replace'))); mutate(mutable); const invalid = frozen(mutable), h = harness(base);
    await assert.rejects(() => applyReviewedWorkspacePatch(h.document, invalid, h.services), /reviewed|document|source|hash|range|boundary/i, label); assert.strictEqual(h.counts().applyCalls, 0, label);
  }
  const wholeHarness = harness(base), whole = operation(base, 0, base.length, 'replacement', 'replace'); await assert.rejects(() => applyReviewedWorkspacePatch(wholeHarness.document, whole, wholeHarness.services), /narrow patch boundary/);
  const badOffset = harness(base, { badOffset: true }); await assert.rejects(() => applyReviewedWorkspacePatch(badOffset.document, operation(base, 6, 10, 'BETA', 'replace'), badOffset.services), /editor positions/); assert.strictEqual(badOffset.counts().applyCalls, 0);
  const rejected = harness(base, { applyFalse: true }); await assert.rejects(() => applyReviewedWorkspacePatch(rejected.document, operation(base, 6, 10, 'BETA', 'replace'), rejected.services), /rejected/); assert.strictEqual(rejected.counts().applyCalls, 1);
  const mismatch = harness(base, { postMismatch: true }); await assert.rejects(() => applyReviewedWorkspacePatch(mismatch.document, operation(base, 6, 10, 'BETA', 'replace'), mismatch.services), /differs/);

  const mutable = JSON.parse(JSON.stringify(operation(base, 6, 10, 'BETA', 'replace'))); assert.throws(() => validateOperation(mutable), /deeply frozen/);
  const shallow = Object.freeze({ ...operation(base, 6, 10, 'BETA', 'replace'), nested: Object.freeze({}) }); assert.throws(() => validateOperation(shallow), /not exact/);
  let getterRuns = 0; const accessor = {}; Object.defineProperty(accessor, 'schema', { enumerable: true, get() { getterRuns += 1; return SCHEMA; } }); assert.throws(() => validateOperation(accessor), /not exact/); assert.strictEqual(getterRuns, 0);
  let proxyRuns = 0; const proxy = new Proxy({}, { ownKeys() { proxyRuns += 1; throw new Error('trap'); } }); assert.throws(() => validateOperation(proxy), /not exact/); assert.strictEqual(proxyRuns, 0);
  const cyclic = {}; cyclic.self = cyclic; Object.freeze(cyclic); assert.throws(() => validateOperation(cyclic), /not exact/);
  const atCap = operation('x', 0, 0, 'y'.repeat(MAX_PATCH_BYTES), 'insert'); assert.doesNotThrow(() => validateOperation(atCap));
  const overCap = operation('x', 0, 0, 'y'.repeat(MAX_PATCH_BYTES + 1), 'insert'); assert.throws(() => validateOperation(overCap), /byte limit/);
  assert(MAX_PATCH_BYTES < MAX_SOURCE_BYTES);
  const viewerSource = fs.readFileSync(path.join(__dirname, '../src/air_viewer.js'), 'utf8'), viewerApply = viewerSource.slice(viewerSource.indexOf('async function applyReviewedAirCollisionEdit'), viewerSource.indexOf('async function handleAirCollisionEditApplyMessage'));
  const dockingSource = fs.readFileSync(path.join(__dirname, '../src/air_docking_workspace.js'), 'utf8'), dockingApply = dockingSource.slice(dockingSource.indexOf('async function applyCollisionDestinationReview'), dockingSource.indexOf('async function openCollisionSourceRoute'));
  for (const [label, source] of [['C12B3', viewerApply], ['C11/C14/C15', dockingApply]]) { assert(source.includes('applyReviewedWorkspacePatch'), `${label} delegates to the shared writer`); assert(!source.includes('new WorkspaceEdit') && !source.includes('workspace.applyEdit('), `${label} has no second low-level patch executor`); }

  console.log('Reviewed workspace patch writer is exact, bounded, one-operation, source-pinned, and non-saving');
})().catch(error => { console.error(error); process.exitCode = 1; });
