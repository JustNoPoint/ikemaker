'use strict';

const assert = require('assert');
const { AuthoringContextModel } = require('../src/authoring_context_model');
const { openSourceDraft, activeSourceDraft, fingerprint } = require('../src/authoring_source_draft');

const uri = { scheme: 'file', fsPath: 'C:/chars/Ryu/state.zss', toString: () => 'file:///C:/chars/Ryu/state.zss' };
const document = {
  uri, version: 4, isDirty: false, text: 'before TARGET after', saveCalls: 0,
  getText() { return this.text; }, positionAt(offset) { return { offset }; },
  async save() { this.saveCalls += 1; this.isDirty = false; return true; }
};
const edits = [];
const workspace = {
  async openTextDocument() { return document; },
  async applyEdit(edit) {
    edits.push(edit);
    const operation = edit.operations[0];
    document.text = document.text.slice(0, operation.range.start.offset) + operation.text + document.text.slice(operation.range.end.offset);
    document.version += 1; document.isDirty = true; return true;
  }
};
const createWorkspaceEdit = () => ({ operations: [], replace(target, range, text) { this.operations.push({ target, range, text }); } });

(async () => {
  const context = new AuthoringContextModel({ type: 'character', key: 'C:/chars/Ryu' });
  const first = await openSourceDraft({ context, ownerId: 'code.source', panelId: 'primary', uri, range: { start: 7, end: 13 }, workspace, createWorkspaceEdit });
  const second = await openSourceDraft({ context, ownerId: 'code.source', panelId: 'companion', uri, workspace, createWorkspaceEdit });
  assert.strictEqual(first, second, 'panels share one retained draft and context lease');
  assert.strictEqual(context.hasDraftLease('code.source'), true);
  assert.strictEqual(first.snapshot().panelCount, 2);
  first.edit('EDITED'); first.close('primary'); first.cancel('companion');
  assert.strictEqual(activeSourceDraft(context), first, 'close/cancel preserve the draft and lease');
  assert.strictEqual(first.snapshot().text, 'EDITED');
  const applied = await first.apply();
  assert.strictEqual(applied.applied, true); assert.strictEqual(applied.saved, false); assert.strictEqual(applied.dirty, true);
  assert.strictEqual(document.text, 'before EDITED after'); assert.strictEqual(document.saveCalls, 0);
  assert.strictEqual(edits.length, 1, 'apply uses one injected WorkspaceEdit so native Undo owns the mutation');
  await first.save(); assert.strictEqual(document.saveCalls, 1, 'save is explicit and separate from apply');
  document.save = async function () { this.saveCalls += 1; this.isDirty = true; return false; };
  const failedSave = await first.save(); assert.strictEqual(failedSave.saved, false); assert.strictEqual(failedSave.dirty, true);
  document.save = async function () { this.saveCalls += 1; this.isDirty = false; return true; };
  first.edit('NEXT'); document.text += '\nexternal'; document.version += 1;
  const stale = await first.apply();
  assert.strictEqual(stale.applied, false); assert.strictEqual(stale.stale, true); assert.strictEqual(edits.length, 1, 'external changes fail closed');
  assert.strictEqual(first.discard(), true); assert.strictEqual(context.hasDraftLease(), false);
  assert.strictEqual(fingerprint('x'), fingerprint('x'));
  console.log('Authoring source drafts enforce exact identity/baselines, one shared lease, native undo/dirty state, explicit save and close preservation');
})().catch(error => { console.error(error); process.exitCode = 1; });
