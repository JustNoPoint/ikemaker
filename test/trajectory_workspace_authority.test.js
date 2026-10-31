'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const test = require('node:test');

let activeTextEditor = null;
let visibleTextEditors = [];
const vscode = {
  commands: { registerCommand: () => ({ dispose() {} }), executeCommand: async () => undefined },
  window: {
    get activeTextEditor() { return activeTextEditor; },
    get visibleTextEditors() { return visibleTextEditors; },
    showInformationMessage() {}, showWarningMessage() {}, showTextDocument: async () => undefined
  },
  workspace: { textDocuments: [], onDidChangeTextDocument: () => ({ dispose() {} }), openTextDocument: async () => null },
  env: { clipboard: { writeText: async () => undefined } },
  Uri: { file: fsPath => ({ fsPath, scheme: 'file', toString: () => `file:///${String(fsPath).replace(/\\/g, '/')}` }) },
  ViewColumn: { Active: 1 }
};
const originalLoad = Module._load;
Module._load = function(request, parent, main) { if (request === 'vscode') return vscode; return originalLoad.call(this, request, parent, main); };
const workspace = require('../src/trajectory_workspace');
Module._load = originalLoad;
const { createTrajectoryContextAdapter } = require('../src/trajectory_context_adapters');

function documentAt(filename, text, languageId = 'zss') {
  return { fileName: filename, languageId, version: 1, isClosed: false, uri: vscode.Uri.file(filename), getText: () => text };
}
function editorFor(document, line = 1, character = 0, editResult = true) {
  const insertions = [];
  return {
    document, selection: { active: { line, character } }, insertions,
    async edit(callback) { callback({ insert(position, text) { insertions.push({ position, text }); } }); return editResult; }
  };
}
function ownerFor(defPath) {
  const adapter = createTrajectoryContextAdapter({ kind: 'spatial', id: `spatial:${defPath}`, target: { language: 'zss', engine: 'ikemen-1.0', capabilityState: 'stable' }, mutation: { allowed: true, resolverId: 'trajectory.exact-cursor', owner: 'trajectory-workspace-host' } });
  return { panel: { webview: { postMessage: async () => true } }, disposed: false, defPath, adapter, plan: workspace.defaultPlan('zss'), outputLanguage: 'zss', contextRevision: 1, generation: 1, capture: null, snapshot: null, tick: 0, pathSampleCount: 61, ghostCount: 8, ghostOpacity: 0.35 };
}
function intent(owner) {
  return { type: 'ikemaker.generated-code.invoke', surfaceId: 'code.trajectory', snapshotDigest: owner.snapshot.snapshotDigest, operationId: 'insert-cursor', artifactIds: ['trajectory-controller'], targetIds: [`cursor:${owner.capture.opaqueTarget}`] };
}

test('Orbit Assist exact-source authority fails closed and performs one native edit', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-trajectory-authority-'));
  const defPath = path.join(root, 'test.def'), sourcePath = path.join(root, 'state.zss'), commandPath = path.join(root, 'test.cmd'), constantsPath = path.join(root, 'constants.cns');
  try {
    fs.writeFileSync(defPath, '[Info]\nname = Test\n[Files]\nst = state.zss\ncmd = test.cmd\ncns = constants.cns\n');
    fs.writeFileSync(sourcePath, '[StateDef 1]\n\n');
    fs.writeFileSync(commandPath, '[StateDef -1]\n\n');
    fs.writeFileSync(constantsPath, '[StateDef -2]\n\n');
    assert.deepStrictEqual(workspace.assignedSources(defPath), [sourcePath]);
    const document = documentAt(sourcePath, '[StateDef 1]\n\n'), editor = editorFor(document);
    activeTextEditor = editor; visibleTextEditors = [editor];

    const owner = ownerFor(defPath);
    workspace.captureCurrent(owner);
    assert.strictEqual(owner.capture.targetLanguage, 'zss');
    assert.strictEqual(workspace.currentCapture(owner).editor, editor);
    await workspace.insert(owner, intent(owner));
    assert.strictEqual(editor.insertions.length, 1);
    assert.match(editor.insertions[0].text, /posSet\{/);
    assert.strictEqual(owner.capture, null, 'successful insertion consumes authority');

    const staleVersion = ownerFor(defPath);
    workspace.captureCurrent(staleVersion);
    document.version += 1;
    assert.strictEqual(workspace.currentCapture(staleVersion), null);
    document.version -= 1;

    const moved = ownerFor(defPath);
    workspace.captureCurrent(moved);
    editor.selection.active = { line: 1, character: 1 };
    assert.strictEqual(workspace.currentCapture(moved), null);
    editor.selection.active = { line: 1, character: 0 };

    const reassigned = ownerFor(defPath);
    workspace.captureCurrent(reassigned);
    fs.writeFileSync(defPath, '[Info]\nname = Test\n[Files]\n');
    assert.strictEqual(workspace.currentCapture(reassigned), null);
    fs.writeFileSync(defPath, '[Info]\nname = Test\n[Files]\nst = state.zss\ncmd = test.cmd\ncns = constants.cns\n');

    const mismatch = ownerFor(defPath);
    mismatch.outputLanguage = 'cns';
    assert.throws(() => workspace.captureCurrent(mismatch), /proposal is CNS.*source is ZSS/i);

    const commandOwner = ownerFor(defPath), commandDocument = documentAt(commandPath, '[StateDef -1]\n\n', 'ikemen-cns'), commandEditor = editorFor(commandDocument);
    activeTextEditor = commandEditor; visibleTextEditors = [commandEditor];
    assert.throws(() => workspace.captureCurrent(commandOwner), /assigned character state source/);
    activeTextEditor = editor; visibleTextEditors = [editor];

    const unsafe = ownerFor(defPath);
    editor.selection.active = { line: 0, character: 0 };
    assert.throws(() => workspace.captureCurrent(unsafe), /blank line|StateDef/i);
    editor.selection.active = { line: 1, character: 0 };

    const forged = ownerFor(defPath);
    workspace.captureCurrent(forged);
    await assert.rejects(() => workspace.insert(forged, { ...intent(forged), snapshotDigest: '0'.repeat(64) }), /stale/);
    await assert.rejects(() => workspace.insert(forged, { ...intent(forged), targetIds: ['cursor:forged'] }), /not allowed/);

    const rejected = ownerFor(defPath), rejectingEditor = editorFor(document, 1, 0, false);
    activeTextEditor = rejectingEditor; visibleTextEditors = [rejectingEditor];
    workspace.captureCurrent(rejected);
    await assert.rejects(() => workspace.insert(rejected, intent(rejected)), /rejected the edit/);
    assert.strictEqual(rejectingEditor.insertions.length, 1, 'the editor callback is invoked once even when VS Code rejects the edit transaction');
  } finally {
    activeTextEditor = null; visibleTextEditors = [];
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('CNS insertion context accepts only complete controller boundaries', () => {
  assert.strictEqual(workspace.cnsInsertionContext('[StateDef 1]\ntype = S\n\n[State 1, A]\ntype = PosSet\nx = 0\n\n', 2).valid, true);
  assert.strictEqual(workspace.cnsInsertionContext('[StateDef 1]\n\n type = S\n', 1).valid, false);
  assert.strictEqual(workspace.cnsInsertionContext('[StateDef 1]\n[State 1, A]\ntype = PosSet\n\nx = 0\n', 3).valid, false);
  assert.strictEqual(workspace.cnsInsertionContext('[StateDef 1]\n[State 1, A]\ntype = PosSet\nx = 0\n\n', 4).valid, true);
  assert.strictEqual(workspace.cnsInsertionContext('[StateDef 1]\ntype = S\n[Data]\nlife = 1000\n\n', 4).valid, false);
});
