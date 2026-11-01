'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL, fileURLToPath } = require('url');
const Module = require('module');

const originalLoad = Module._load;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'story-d2-mutations-'));
const data = path.join(root, 'data'), selectFile = path.join(data, 'select.def');
const zssFile = path.join(root, 'chars', 'Ryu', 'Ryu.zss');
fs.mkdirSync(path.dirname(zssFile), { recursive: true });
fs.mkdirSync(data, { recursive: true });
fs.mkdirSync(path.join(data, 'story'), { recursive: true });
fs.writeFileSync(selectFile, '[Characters]\nRyu/Ryu.def\n');
fs.writeFileSync(zssFile, '[StateDef -1]\n');

function uri(file) {
  const fsPath = path.resolve(file);
  return { scheme: 'file', fsPath, toString: () => pathToFileURL(fsPath).toString() };
}
function makeDocument(file) {
  let text = fs.readFileSync(file, 'utf8'), version = 1, dirty = false, saveMode = 'ok', saveGate = null;
  const doc = {
    fileName: path.resolve(file), uri: uri(file),
    get version() { return version; }, get isDirty() { return dirty; },
    getText: () => text,
    get lineCount() { return text.split(/\r\n|\r|\n/).length; },
    lineAt(line) { return { lineNumber: line, text: text.split(/\r\n|\r|\n/)[line] || '' }; },
    offsetAt(position) { const lines = text.split(/\r\n|\r|\n/); let offset = 0; for (let i = 0; i < position.line; i += 1) offset += (lines[i] || '').length + 1; return offset + position.character; },
    apply(next) { text = next; version += 1; dirty = true; },
    setSaveMode(mode, gate = null) { saveMode = mode; saveGate = gate; },
    async save() { if (saveGate) await saveGate; if (saveMode === 'throw') throw new Error('save exploded'); if (saveMode === 'false') return false; fs.writeFileSync(doc.fileName, text); dirty = false; return true; }
  };
  return doc;
}

const documents = new Map();
function addDocument(file) { const doc = makeDocument(file); documents.set(path.resolve(file), doc); return doc; }
const selectDocument = addDocument(selectFile), zssDocument = addDocument(zssFile);
const changes = [], saves = [], closes = [], posts = [], clipboard = [], edits = [];
let context = { identity: `project:${root}`, revision: 0, selectionRevision: 0, activeSurfaceId: '', selection: null };
const contextModel = {
  snapshot: () => JSON.parse(JSON.stringify(context)),
  update(patch) { context = { ...context, ...patch, revision: context.revision + 1, selectionRevision: context.selectionRevision + (Object.hasOwn(patch, 'selection') ? 1 : 0) }; }
};
const receivers = [], viewListeners = [], disposeListeners = [];
const panel = {
  active: true, disposed: false,
  webview: {
    cspSource: 'test:', html: '',
    onDidReceiveMessage(fn) { receivers.push(fn); return { dispose() {} }; },
    postMessage(message) { posts.push(message); return Promise.resolve(true); }
  },
  reveal() { panel.active = true; for (const fn of viewListeners) fn({ webviewPanel: panel }); },
  dispose() { panel.disposed = true; for (const fn of disposeListeners) fn(); },
  onDidChangeViewState(fn) { viewListeners.push(fn); return { dispose() {} }; },
  onDidDispose(fn) { disposeListeners.push(fn); return { dispose() {} }; },
  async send(message) { let result; for (const fn of [...receivers]) result = await fn(message); await new Promise(resolve => setImmediate(resolve)); return result; }
};

class Position { constructor(line, character) { this.line = line; this.character = character; } }
class Range { constructor(startLine, startCharacter, endLine, endCharacter) { this.start = new Position(startLine, startCharacter); this.end = new Position(endLine, endCharacter); } }
class Selection extends Range {}
class WorkspaceEdit {
  constructor() { this.operations = []; edits.push(this); }
  createFile(target, options) { this.operations.push({ kind: 'create', target, options }); }
  deleteFile(target, options) { this.operations.push({ kind: 'delete', target, options }); }
  insert(target, position, text) { this.operations.push({ kind: 'insert', target, position, text }); }
  replace(target, range, text) { this.operations.push({ kind: 'replace', target, range, text }); }
}
function offsetAtText(text, position) { const lines = text.split(/\r\n|\r|\n/); let offset = 0; for (let i = 0; i < position.line; i += 1) offset += (lines[i] || '').length + 1; return offset + position.character; }

let inputValues = [], inputGate = null, inputHook = null, saveTarget = null, saveHook = null, applyMode = 'ok', applyHook = null, clipboardMode = 'ok', clipboardGate = null;
async function applyEdit(edit) {
  if (applyHook) await applyHook(edit);
  if (applyMode === 'throw') throw new Error('apply exploded');
  if (applyMode === 'false') return false;
  if (applyMode === 'rollback-false' && edit.operations.some(op => op.kind === 'delete')) return false;
  if (applyMode === 'noop') return true;
  const staged = new Map();
  for (const op of edit.operations) {
    const file = path.resolve(op.target.fsPath);
    if (!staged.has(file)) staged.set(file, documents.get(file)?.getText() ?? (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''));
    if (op.kind === 'create') { if (fs.existsSync(file)) return false; staged.set(file, ''); }
    if (op.kind === 'delete') { staged.set(file, null); }
    if (op.kind === 'insert') { const before = staged.get(file), offset = offsetAtText(before, op.position); staged.set(file, before.slice(0, offset) + op.text + before.slice(offset)); }
    if (op.kind === 'replace') staged.set(file, op.text);
  }
  if (['partial-create', 'rollback-false'].includes(applyMode)) for (const file of [...staged.keys()]) if (file === path.resolve(selectFile)) staged.delete(file);
  if (applyMode === 'partial-select') for (const file of [...staged.keys()]) if (file !== path.resolve(selectFile)) staged.delete(file);
  if (applyMode === 'wrong-select' && staged.has(path.resolve(selectFile))) staged.set(path.resolve(selectFile), `${staged.get(path.resolve(selectFile))}\n; wrong select`);
  if (applyMode === 'wrong-route') for (const file of [...staged.keys()]) if (file !== path.resolve(selectFile)) staged.set(file, 'wrong route');
  for (const [file, text] of staged) {
    if (text === null) { fs.rmSync(file, { force: true }); documents.delete(file); continue; }
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text);
    let doc = documents.get(file); if (!doc) { doc = addDocument(file); } else doc.apply(text);
  }
  if (applyMode === 'wrong-post') { const doc = documents.get(path.resolve(zssFile)); doc.apply(`${doc.getText()}\n; wrong poststate`); }
  vscode.workspace.textDocuments = [...documents.values()];
  return true;
}

const activeEditor = { document: zssDocument, selection: { active: new Position(1, 0) } };
const vscode = {
  ViewColumn: { Active: 1 }, TextEditorRevealType: { InCenter: 1 }, Uri: { file: uri, parse: value => uri(fileURLToPath(value)) },
  Position, Range, Selection, WorkspaceEdit,
  workspace: {
    workspaceFolders: [], textDocuments: [...documents.values()], getConfiguration: () => ({ get: (_key, fallback) => fallback }),
    openTextDocument: async target => documents.get(path.resolve(target.fsPath)) || addDocument(target.fsPath), applyEdit,
    onDidChangeTextDocument(fn) { changes.push(fn); return { dispose() {} }; },
    onDidSaveTextDocument(fn) { saves.push(fn); return { dispose() {} }; },
    onDidCloseTextDocument(fn) { closes.push(fn); return { dispose() {} }; }
  },
  window: {
    activeTextEditor: activeEditor, createWebviewPanel: () => panel, registerWebviewPanelSerializer: () => ({ dispose() {} }),
    showInputBox: async () => { if (inputGate) await inputGate; if (inputHook) await inputHook(); return inputValues.shift(); }, showSaveDialog: async () => { if (saveHook) await saveHook(); return saveTarget && uri(saveTarget); }, showQuickPick: async choices => choices[0],
    showWarningMessage: async () => undefined, showInformationMessage: async () => undefined, showErrorMessage: async () => undefined,
    showTextDocument: async document => ({ document, selection: null, revealRange() {} })
  },
  commands: { registerCommand: () => ({ dispose() {} }), executeCommand: async () => true },
  env: { clipboard: { async writeText(text) { if (clipboardGate) await clipboardGate; if (clipboardMode === 'throw') throw new Error('clipboard exploded'); clipboard.push(text); } } }
};

Module._load = function(request, parent, main) {
  if (request === 'vscode') return vscode;
  if (request === './authoring_context_registry') return { registerAuthoringPanel: host => ({ host }), getContextModel: () => contextModel };
  if (request === './viewer_sessions') return { register() {} };
  if (request === './viewer_group') return { preferredViewerColumn: () => 1, trackViewerPanel: value => value, revealInViewerGroup() {} };
  if (request === './webview_policy') return { protect: value => value };
  if (request === './viewer_close') return { support() {}, prepare: async () => true, clientScript: () => '' };
  return originalLoad.call(this, request, parent, main);
};

function lastResult(requestId) { return posts.filter(item => item.type === 'storyMutationResult' && item.requestId === requestId).at(-1); }
function expectedResult(result, operation, ok, code) {
  assert(result, `missing ${operation} result`);
  assert.deepStrictEqual(Object.keys(result).sort(), ['code', 'contract', 'generation', 'message', 'ok', 'operation', 'requestId', 'surfaceId', 'type']);
  assert.equal(result.surfaceId, 'story.dialogue'); assert.equal(result.contract, 'story-dialogue-mutation-v1');
  assert.equal(result.operation, operation); assert.equal(result.ok, ok, JSON.stringify(result)); assert.equal(result.code, code, JSON.stringify(result));
}
const draft = { label: 'Rival', enemy: 'Ken', phase: 'pre', group: 9100, hidebars: true, lines: [{ side: 'p1', portrait: '0', wait: '10', text: 'Ready?', soundGroup: '', soundIndex: '' }] };

(async () => {
  try {
    const story = require('../src/story_dialogue_workspace');
    await story.openStoryDialogueWorkspace(uri(selectFile), 'player');
    const owner = story.sessions.get(path.resolve(selectFile).toLowerCase());
    assert(owner, 'registered Story panel owns the project');

    inputValues = ['RyuArc', 'Ryu Story', 'Ryu/Ryu.def']; saveTarget = path.join(data, 'story', 'ryu.lua');
    const beforeSelect = selectDocument.getText();
    await panel.send({ type: 'storyCreateArc', generation: owner.generation, requestId: 1 });
    expectedResult(lastResult(1), 'create-arc', true, 'ok');
    assert(fs.existsSync(saveTarget)); assert.match(fs.readFileSync(saveTarget, 'utf8'), /launchFight/);
    assert.match(selectDocument.getText(), /name = RyuArc/); assert.match(selectDocument.getText(), /path = data\/story\/ryu.lua/);
    const createEdit = edits.find(edit => edit.operations.some(op => op.kind === 'create'));
    assert.deepStrictEqual(createEdit.operations.map(op => op.kind), ['create', 'insert', 'replace'], 'route and registration share one WorkspaceEdit transaction');
    assert.equal(await panel.send({ type: 'ikemaker.universal-toolbar.invoke', slotId: 'save' }), true, 'universal Save persists the selected select.def after route creation');
    assert.equal(selectDocument.isDirty, false);

    const failedTarget = path.join(data, 'story', 'failed.lua'), selectAfterSuccess = selectDocument.getText();
    inputValues = ['FailedArc', 'Failed Story', 'Ryu/Ryu.def']; saveTarget = failedTarget; applyMode = 'false';
    await panel.send({ type: 'storyCreateArc', generation: owner.generation, requestId: 2 }); applyMode = 'ok';
    expectedResult(lastResult(2), 'create-arc', false, 'write-failed');
    assert(!fs.existsSync(failedTarget), 'rejected atomic edit leaves no route file'); assert.equal(selectDocument.getText(), selectAfterSuccess, 'rejected atomic edit leaves select.def unchanged');

    const partialTarget = path.join(data, 'story', 'partial.lua'); inputValues = ['PartialArc', 'Partial Story', 'Ryu/Ryu.def']; saveTarget = partialTarget; applyMode = 'partial-create';
    await panel.send({ type: 'storyCreateArc', generation: owner.generation, requestId: 20 }); applyMode = 'ok';
    expectedResult(lastResult(20), 'create-arc', false, 'write-failed'); assert(!fs.existsSync(partialTarget), 'known partial route creation is rolled back'); assert.equal(selectDocument.getText(), selectAfterSuccess);

    for (const [requestId, mode] of [[24, 'noop'], [25, 'partial-select'], [26, 'wrong-select'], [27, 'wrong-route']]) {
      const target = path.join(data, 'story', `${mode}.lua`); inputValues = [`Arc${requestId}`, `Arc ${requestId}`, 'Ryu/Ryu.def']; saveTarget = target; applyMode = mode;
      await panel.send({ type: 'storyCreateArc', generation: owner.generation, requestId }); applyMode = 'ok'; expectedResult(lastResult(requestId), 'create-arc', false, 'write-failed');
      if (['noop', 'partial-select'].includes(mode)) { assert(!fs.existsSync(target), `${mode} returns to no route artifact`); assert.equal(selectDocument.getText(), selectAfterSuccess, `${mode} restores select.def`); }
      else { fs.rmSync(target, { force: true }); selectDocument.apply(selectAfterSuccess); await selectDocument.save(); }
      if (selectDocument.isDirty) await selectDocument.save();
    }

    const rollbackFailureTarget = path.join(data, 'story', 'rollback-failure.lua'); inputValues = ['RollbackFailure', 'Rollback Failure', 'Ryu/Ryu.def']; saveTarget = rollbackFailureTarget; applyMode = 'rollback-false';
    await panel.send({ type: 'storyCreateArc', generation: owner.generation, requestId: 28 }); applyMode = 'ok'; expectedResult(lastResult(28), 'create-arc', false, 'write-failed'); assert(fs.existsSync(rollbackFailureTarget), 'failed inverse recovery truthfully retains the unknown artifact'); fs.rmSync(rollbackFailureTarget, { force: true });

    inputValues = ['RetryArc', 'Retry Story', 'Ryu/Ryu.def']; saveTarget = path.join(data, 'story', 'retry.lua');
    await panel.send({ type: 'storyCreateArc', generation: owner.generation, requestId: 21 }); expectedResult(lastResult(21), 'create-arc', true, 'ok');
    assert(fs.existsSync(saveTarget), 'a clean retry succeeds after rollback'); await panel.send({ type: 'ikemaker.universal-toolbar.invoke', slotId: 'save' });

    inputValues = ['RetryArc', 'Duplicate Story', 'Ryu/Ryu.def']; saveTarget = path.join(data, 'story', 'duplicate.lua');
    await panel.send({ type: 'storyCreateArc', generation: owner.generation, requestId: 22 }); expectedResult(lastResult(22), 'create-arc', false, 'conflict'); assert(!fs.existsSync(saveTarget), 'duplicate route id is rejected');
    inputValues = ['EscapeArc', 'Escape Story', 'Ryu/Ryu.def']; saveTarget = path.join(root, '..', 'escape.lua');
    await panel.send({ type: 'storyCreateArc', generation: owner.generation, requestId: 23 }); expectedResult(lastResult(23), 'create-arc', false, 'conflict'); assert(!fs.existsSync(saveTarget), 'out-of-root target is rejected');

    for (const [requestId, values] of [[40, ['bad\nname']], [41, ['A'.repeat(300)]], [42, ['ValidName', 'bad\ndisplay']], [43, ['ValidName', 'Display', 'bad\ncharacter']]]) {
      inputValues = values; saveTarget = path.join(data, 'story', `invalid-${requestId}.lua`); await panel.send({ type: 'storyCreateArc', generation: owner.generation, requestId }); expectedResult(lastResult(requestId), 'create-arc', false, 'invalid'); assert(!fs.existsSync(saveTarget));
    }

    const dirtyTarget = path.join(data, 'story', 'dirty-open.lua'), dirtyDoc = { fileName: dirtyTarget, uri: uri(dirtyTarget), version: 1, isDirty: true, getText: () => 'unsaved', lineCount: 1, lineAt: () => ({ lineNumber: 0, text: 'unsaved' }) };
    inputValues = ['DirtyOpen', 'Dirty Open', 'Ryu/Ryu.def']; saveTarget = dirtyTarget; saveHook = async () => { vscode.workspace.textDocuments.push(dirtyDoc); }; await panel.send({ type: 'storyCreateArc', generation: owner.generation, requestId: 44 }); saveHook = null; expectedResult(lastResult(44), 'create-arc', false, 'conflict'); vscode.workspace.textDocuments = [...documents.values()];
    const outsideAlias = path.join(root, 'outside.lua'), aliasTarget = path.join(data, 'story', 'alias.lua'); fs.writeFileSync(outsideAlias, 'outside'); try { fs.symlinkSync(outsideAlias, aliasTarget); inputValues = ['AliasArc', 'Alias', 'Ryu/Ryu.def']; saveTarget = aliasTarget; await panel.send({ type: 'storyCreateArc', generation: owner.generation, requestId: 45 }); expectedResult(lastResult(45), 'create-arc', false, 'conflict'); fs.rmSync(aliasTarget, { force: true }); } catch (error) { if (!['EPERM', 'EACCES', 'UNKNOWN'].includes(error.code)) throw error; }

    const collisionTarget = path.join(data, 'story', 'final-collision.lua'); inputValues = ['FinalCollision', 'Final Collision', 'Ryu/Ryu.def']; saveTarget = collisionTarget; applyHook = async edit => { if (edit.operations.some(op => op.kind === 'create')) fs.writeFileSync(collisionTarget, 'racer'); };
    await panel.send({ type: 'storyCreateArc', generation: owner.generation, requestId: 46 }); applyHook = null; expectedResult(lastResult(46), 'create-arc', false, 'write-failed'); fs.rmSync(collisionTarget, { force: true });

    const versionRaceTarget = path.join(data, 'story', 'version-race.lua'); inputValues = ['VersionRace', 'Version Race', 'Ryu/Ryu.def']; saveTarget = versionRaceTarget; applyHook = async edit => { if (edit.operations.some(op => op.kind === 'create')) selectDocument.apply(selectDocument.getText()); };
    await panel.send({ type: 'storyCreateArc', generation: owner.generation, requestId: 47 }); applyHook = null; expectedResult(lastResult(47), 'create-arc', false, 'write-failed'); assert(!fs.existsSync(versionRaceTarget)); if (selectDocument.isDirty) await selectDocument.save();

    const takeoverTarget = path.join(data, 'story', 'takeover.lua'); inputValues = ['TakeoverArc', 'Takeover', 'Ryu/Ryu.def']; saveTarget = takeoverTarget; applyHook = async edit => { if (edit.operations.some(op => op.kind === 'create')) contextModel.update({ activeSurfaceId: 'foreign.surface', selection: { surfaceId: 'foreign.surface' } }); };
    await panel.send({ type: 'storyCreateArc', generation: owner.generation, requestId: 48 }); applyHook = null; expectedResult(lastResult(48), 'create-arc', false, 'stale'); assert.notEqual(lastResult(48).ok, true, 'takeover at apply boundary never reports false success'); fs.rmSync(takeoverTarget, { force: true }); selectDocument.apply(selectAfterSuccess); await selectDocument.save(); panel.reveal(); await owner.queue;

    clipboardMode = 'ok'; await panel.send({ type: 'storyDialogue', generation: owner.generation, requestId: 3, operation: 'copy', draft });
    expectedResult(lastResult(3), 'copy', true, 'ok'); assert.match(clipboard.at(-1), /Dialogue/); assert.match(clipboard.at(-1), /Ready\?/);
    clipboardMode = 'throw'; await panel.send({ type: 'storyDialogue', generation: owner.generation, requestId: 4, operation: 'copy', draft }); clipboardMode = 'ok';
    expectedResult(lastResult(4), 'copy', false, 'write-failed');

    activeEditor.selection.active = new Position(1, 0); const beforeZss = zssDocument.getText();
    await panel.send({ type: 'storyDialogue', generation: owner.generation, requestId: 5, operation: 'insert', draft });
    expectedResult(lastResult(5), 'insert', true, 'ok');
    assert(zssDocument.getText().startsWith(beforeZss)); assert.match(zssDocument.getText(), /Dialogue/); assert(zssDocument.isDirty, 'Dialogue insertion remains an unsaved document edit');
    assert.equal(owner.view, 'dialogue'); assert.equal(owner.selectedReference.role, 'inserted-dialogue', 'insert commit selects the exact generated block');

    const saveGeneration = owner.generation;
    assert.equal(story.toolbarModel(owner).slots.find(slot => slot.id === 'save').enabled, true);
    assert.equal(await panel.send({ type: 'ikemaker.universal-toolbar.invoke', slotId: 'save' }), true, 'universal Save persists selected inserted Dialogue document');
    assert.equal(zssDocument.isDirty, false); assert.equal(fs.readFileSync(zssFile, 'utf8'), zssDocument.getText());

    zssDocument.apply(`${zssDocument.getText()}\n; unsaved`); zssDocument.setSaveMode('false');
    assert.equal(await panel.send({ type: 'ikemaker.universal-toolbar.invoke', slotId: 'save' }), false, 'failed document save remains failed');
    assert(zssDocument.isDirty); zssDocument.setSaveMode('throw'); assert.equal(await panel.send({ type: 'ikemaker.universal-toolbar.invoke', slotId: 'save' }), false, 'thrown document save remains failed and dirty'); assert(zssDocument.isDirty); zssDocument.setSaveMode('ok');

    let releaseSave; const saveWait = new Promise(resolve => { releaseSave = resolve; }); zssDocument.setSaveMode('ok', saveWait);
    const racingSave = panel.send({ type: 'ikemaker.universal-toolbar.invoke', slotId: 'save' }); await new Promise(resolve => setImmediate(resolve));
    contextModel.update({ activeSurfaceId: 'foreign.surface', selection: { surfaceId: 'foreign.surface' } }); releaseSave();
    assert.equal(await racingSave, false, 'context takeover during Save prevents a late success commit');
    zssDocument.setSaveMode('ok'); panel.reveal(); await owner.queue;

    for (const [requestId, mutate] of [[50, () => zssDocument.apply(zssDocument.getText())], [51, () => zssDocument.apply(`${zssDocument.getText()}\n; changed during save`)], [52, () => { owner.selectionEpoch += 1; contextModel.update({ selection: { surfaceId: 'story.dialogue', uri: owner.selectedReference.uri, reference: owner.selectedReference } }); }]]) {
      zssDocument.apply(`${zssDocument.getText()}\n; save race ${requestId}`); let release; const gate = new Promise(resolve => { release = resolve; }); zssDocument.setSaveMode('ok', gate); const pending = panel.send({ type: 'ikemaker.universal-toolbar.invoke', slotId: 'save' }); await new Promise(resolve => setImmediate(resolve)); mutate(); release(); assert.equal(await pending, false, `Save refuses exact post-await race ${requestId}`); zssDocument.setSaveMode('ok'); panel.reveal(); await owner.queue;
    }

    let releaseClipboard; clipboardGate = new Promise(resolve => { releaseClipboard = resolve; });
    const copyGeneration = owner.generation, racingCopy = panel.send({ type: 'storyDialogue', generation: copyGeneration, requestId: 6, operation: 'copy', draft }); await new Promise(resolve => setImmediate(resolve));
    contextModel.update({ activeSurfaceId: 'foreign.surface', selection: { surfaceId: 'foreign.surface' } }); releaseClipboard(); await racingCopy; clipboardGate = null;
    expectedResult(lastResult(6), 'copy', false, 'stale');

    panel.reveal(); await owner.queue; activeEditor.selection.active = new Position(0, 0);
    const beforeRejectedInsert = zssDocument.getText(); applyMode = 'false';
    await panel.send({ type: 'storyDialogue', generation: owner.generation, requestId: 7, operation: 'insert', draft }); applyMode = 'ok';
    expectedResult(lastResult(7), 'insert', false, 'write-failed');
    assert.equal(zssDocument.getText(), beforeRejectedInsert, 'rejected Dialogue WorkspaceEdit leaves the target untouched');

    for (const [requestId, mode] of [[30, 'throw'], [31, 'noop'], [32, 'wrong-post']]) {
      const terminalBefore = posts.filter(item => item.type === 'storyMutationResult' && item.requestId === requestId).length, textBefore = zssDocument.getText(); applyMode = mode;
      await panel.send({ type: 'storyDialogue', generation: owner.generation, requestId, operation: 'insert', draft }); applyMode = 'ok';
      expectedResult(lastResult(requestId), 'insert', false, 'write-failed'); assert.equal(posts.filter(item => item.type === 'storyMutationResult' && item.requestId === requestId).length, terminalBefore + 1, `${mode} produces exactly one terminal result`);
      if (mode !== 'wrong-post') assert.equal(zssDocument.getText(), textBefore, `${mode} does not partially edit the target`); else zssDocument.apply(textBefore);
    }

    activeEditor.selection.active = new Position(0, 0); let requestId = 33, race = panel.send({ type: 'storyDialogue', generation: owner.generation, requestId, operation: 'insert', draft }); activeEditor.selection.active = new Position(1, 0); await race; expectedResult(lastResult(requestId), 'insert', false, 'unavailable');
    activeEditor.selection.active = new Position(0, 0); requestId = 34; race = panel.send({ type: 'storyDialogue', generation: owner.generation, requestId, operation: 'insert', draft }); zssDocument.apply(`${zssDocument.getText()}\n; version race`); await race; expectedResult(lastResult(requestId), 'insert', false, 'unavailable');
    const replacement = makeDocument(zssFile); vscode.workspace.textDocuments = [selectDocument, replacement]; requestId = 35; race = panel.send({ type: 'storyDialogue', generation: owner.generation, requestId, operation: 'insert', draft }); await race; expectedResult(lastResult(requestId), 'insert', false, 'unavailable'); vscode.workspace.textDocuments = [...documents.values()];
    activeEditor.selection.active = new Position(0, 0); panel.active = false; await panel.send({ type: 'storyDialogue', generation: owner.generation, requestId: 36, operation: 'insert', draft }); expectedResult(lastResult(36), 'insert', false, 'stale'); panel.reveal(); await owner.queue;

    applyHook = async edit => { if (edit.operations.some(op => op.target.fsPath === zssFile)) contextModel.update({ activeSurfaceId: 'foreign.surface', selection: { surfaceId: 'foreign.surface' } }); };
    await panel.send({ type: 'storyDialogue', generation: owner.generation, requestId: 8, operation: 'insert', draft }); applyHook = null;
    expectedResult(lastResult(8), 'insert', false, 'write-failed');

    panel.reveal(); await owner.queue;
    inputValues = ['RaceArc'];
    inputHook = async () => { selectDocument.apply(`${selectDocument.getText()}\n; changed during prompt`); };
    saveTarget = path.join(data, 'story', 'race.lua');
    await panel.send({ type: 'storyCreateArc', generation: owner.generation, requestId: 9 }); inputHook = null;
    expectedResult(lastResult(9), 'create-arc', false, 'stale'); assert(!fs.existsSync(saveTarget));
    assert.equal(owner.generation >= saveGeneration, true);

    selectDocument.apply(selectAfterSuccess); await selectDocument.save(); panel.reveal(); await owner.queue; let releaseInput; inputGate = new Promise(resolve => { releaseInput = resolve; }); inputValues = ['DisposedArc']; saveTarget = path.join(data, 'story', 'disposed.lua'); const terminalsBeforeDispose = posts.filter(item => item.type === 'storyMutationResult' && item.requestId === 99).length, disposing = panel.send({ type: 'storyCreateArc', generation: owner.generation, requestId: 99 }); await new Promise(resolve => setImmediate(resolve)); panel.dispose(); releaseInput(); await disposing; inputGate = null; assert.equal(posts.filter(item => item.type === 'storyMutationResult' && item.requestId === 99).length, terminalsBeforeDispose, 'dispose during modal produces no late terminal'); assert(!fs.existsSync(saveTarget), 'dispose during modal produces no late write');

    console.log('Story Dialogue D2 registered panel covers atomic Create Arc, Dialogue Copy/Insert, universal Save, failures, and authority races');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
