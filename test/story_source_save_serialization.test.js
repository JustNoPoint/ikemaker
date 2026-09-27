'use strict';

const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const os = require('os');
const path = require('path');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'story-save-queue-'));
const data = path.join(root, 'data');
const selectFile = path.join(data, 'select.def');
fs.mkdirSync(data, { recursive: true });
fs.writeFileSync(selectFile, '[Characters]\nRyu/Ryu.def\n');

let receiver;
let releaseSelectSave;
let releaseInsert;
let saveCalls = 0;
let insertCalls = 0;
const uri = (filename) => ({ fsPath: filename, toString: () => path.resolve(filename).toLowerCase() });
const selectDocument = {
  fileName: selectFile, uri: uri(selectFile), isDirty: true, lineCount: 1,
  getText: () => fs.readFileSync(selectFile, 'utf8'), lineAt: () => ({ lineNumber: 0, text: '' }),
  save() { saveCalls += 1; return new Promise((resolve) => { releaseSelectSave = () => { this.isDirty = false; resolve(true); }; }); }
};
const targetDocument = { fileName: path.join(root, 'Ryu.zss'), uri: uri(path.join(root, 'Ryu.zss')), isDirty: true };
const editor = {
  document: targetDocument, selection: { active: { line: 3, character: 0 } },
  edit(callback) { insertCalls += 1; callback({ insert() {} }); return new Promise((resolve) => { releaseInsert = () => resolve(true); }); }
};
const panel = {
  reveal() {}, onDidDispose() {},
  webview: {
    cspSource: 'test:', html: '', messages: [],
    onDidReceiveMessage(callback) { receiver = callback; return { dispose() {} }; },
    postMessage(message) { this.messages.push(message); return Promise.resolve(true); }
  }
};
const vscode = {
  ViewColumn: { Active: 1 }, Uri: { file: uri },
  window: {
    activeTextEditor: editor,
    createWebviewPanel: () => panel,
    registerWebviewPanelSerializer: () => ({ dispose() {} }),
    showErrorMessage: (message) => { throw new Error(message); },
    showWarningMessage: async () => undefined
  },
  workspace: {
    workspaceFolders: [], textDocuments: [selectDocument, targetDocument],
    getConfiguration: () => ({ get: (_key, fallback) => fallback }),
    openTextDocument: async () => selectDocument,
    onDidChangeTextDocument: () => ({ dispose() {} }),
    onDidSaveTextDocument: () => ({ dispose() {} })
  },
  commands: { registerCommand: () => ({ dispose() {} }), executeCommand: async () => undefined },
  env: { clipboard: { writeText: async () => undefined } }
};
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return vscode;
  if (request === './viewer_sessions') return { register() {} };
  if (request === './viewer_close') return { support() {} };
  if (request === './viewer_group') return { preferredViewerColumn: () => 2, trackViewerPanel: (value) => value, revealInViewerGroup() {} };
  if (request === './launch_controls') return { launchControlsHtml: () => '', launchControlsClientScript: () => '', handleLaunchMessage: async () => false };
  if (request === './webview_policy') return { protect: (value) => value };
  return originalLoad.call(this, request, parent, isMain);
};

(async () => {
  const workspace = require('../src/story_dialogue_workspace');
  workspace.registerStoryDialogueWorkspace({ workspaceState: { get: (_k, fallback) => fallback, update: async () => undefined }, subscriptions: [] });
  await workspace.openStoryDialogueWorkspace({ fsPath: selectFile }, 'dialogue');

  const firstSave = receiver({ type: 'saveSelect' });
  await new Promise((resolve) => setImmediate(resolve));
  const queuedInsert = receiver({ type: 'dialogue', action: 'insert', lines: [{ side: 'p1', text: 'Ready?' }] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(insertCalls, 0, 'dialogue insertion waits behind a pending select.def save');
  releaseSelectSave();
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(insertCalls, 1, 'the queued insertion begins after the save releases the queue');
  releaseInsert();
  await Promise.all([firstSave, queuedInsert]);

  selectDocument.isDirty = true;
  const firstInsert = receiver({ type: 'dialogue', action: 'insert', lines: [{ side: 'p2', text: 'Fight.' }] });
  await new Promise((resolve) => setImmediate(resolve));
  const savesBefore = saveCalls;
  const queuedSave = receiver({ type: 'saveSelect' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(saveCalls, savesBefore, 'select.def save waits behind a pending dialogue insertion');
  releaseInsert();
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(saveCalls, savesBefore + 1, 'the queued save starts only after the insertion completes');
  releaseSelectSave();
  await Promise.all([firstInsert, queuedSave]);
  assert.strictEqual(panel.webview.messages.filter((message) => message.type === 'insertTargetStatus').length, 2, 'each successful insertion retains and reports its exact target document');
  console.log('Story & Dialogue exact-source save/edit queue serializes both directions');
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { Module._load = originalLoad; fs.rmSync(root, { recursive: true, force: true }); });
