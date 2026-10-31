'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-throw-authority-'));
const stored = {}, commands = new Map(), panels = [], errors = [], writes = [], shown = [];
const saveDialogs = [], warnings = [], warningHooks = [], appliedEdits = [];
const disposedListeners = { receive: 0, view: 0, change: 0, close: 0 };
let failOperation = '', launchFailure = false;
let contextState = { identity: 'private:throw-test', revision: 1, selectionRevision: 1, activeSurfaceId: 'code.throw', selection: null };
const contextModel = { snapshot: () => ({ ...contextState }), update(patch) { if (Object.prototype.hasOwnProperty.call(patch, 'selection') && JSON.stringify(patch.selection) !== JSON.stringify(contextState.selection)) contextState.selectionRevision += 1; contextState = { ...contextState, ...patch }; return this.snapshot(); } };
const workspaceState = { get: (key, fallback) => stored[key] ?? fallback, update: async (key, value) => { stored[key] = value; } };
const realSetTimeout = global.setTimeout;
global.setTimeout = (fn, delay, ...args) => realSetTimeout(fn, Math.min(Number(delay) || 0, 20), ...args);

function makePanel() {
  const receive = [], dispose = [], viewState = [];
  const panel = {
    active: true, viewColumn: 2, reveal() { this.active = true; viewState.forEach(fn => fn({ webviewPanel: this })); },
    onDidChangeViewState(fn) { viewState.push(fn); return { dispose() { disposedListeners.view += 1; } }; },
    onDidDispose(fn) { dispose.push(fn); return { dispose() {} }; },
    dispose() { if (this.disposed) return; this.disposed = true; dispose.forEach(fn => fn()); },
    webview: { cspSource: 'test:', html: '', messages: [], onDidReceiveMessage(fn) { receive.push(fn); return { dispose() { disposedListeners.receive += 1; } }; }, postMessage(message) { this.messages.push(message); return true; } }
  };
  panel.send = async message => { for (const fn of receive) await fn(message); };
  panels.push(panel); return panel;
}
function uri(fsPath) { return { fsPath, toString: () => `file:${fsPath}` }; }
const vscode = {
  ViewColumn: { Active: 1, Beside: 2 }, Uri: { file: uri, joinPath: (base, ...rest) => uri(path.join(base.fsPath, ...rest)) },
  Range: class Range { constructor(start, end) { this.start = start; this.end = end; } },
  WorkspaceEdit: class WorkspaceEdit { constructor() { this.replacements = []; } replace(target, range, text) { this.replacements.push({ target, range, text }); } },
  workspace: {
    textDocuments: [], openTextDocument: async value => typeof value === 'object' && value.content !== undefined ? { uri: uri('untitled:throw'), fileName: 'untitled:throw', getText: () => value.content } : { uri: value, fileName: value.fsPath, getText: () => fs.readFileSync(value.fsPath, 'utf8') },
    applyEdit: async edit => { appliedEdits.push(edit); return true; }, getConfiguration: () => ({ get: (_key, fallback) => fallback }),
    onDidChangeTextDocument: () => ({ dispose() { disposedListeners.change += 1; } }), onDidCloseTextDocument: () => ({ dispose() { disposedListeners.close += 1; } })
  },
  commands: { registerCommand(id, fn) { commands.set(id, fn); return { dispose() {} }; }, async executeCommand(id) { if (launchFailure && id === 'ikemen.launchTrainingCurrent') throw new Error('launch failed'); } },
  window: {
    createWebviewPanel: () => makePanel(), showErrorMessage: message => { errors.push(String(message)); },
    showInformationMessage: async () => undefined, showTextDocument: async document => { shown.push(document); return document; },
    showSaveDialog: async () => saveDialogs.shift(), showWarningMessage: async () => { const hook = warningHooks.shift(); if (hook) await hook(); return warnings.shift(); }, showQuickPick: async () => undefined
  }
};
function transactionalWrite(_fs, filename, content, options = {}) {
  if (failOperation && String(options.operation || '').includes(failOperation)) { failOperation = ''; throw new Error('injected write failure'); }
  if (options.allowExisting === false && fs.existsSync(filename)) throw new Error('target exists');
  fs.mkdirSync(path.dirname(filename), { recursive: true }); fs.writeFileSync(filename, content); writes.push({ filename, operation: options.operation });
}
function transactionalWriteSet(_fs, entries, options = {}) { for (const [filename, content] of entries) transactionalWrite(fs, filename, content, options); }
const originalLoad = Module._load;
Module._load = function(request, parent, main) {
  const from = parent?.filename || '';
  if (request === 'vscode') return vscode;
  if (request === './character_picker' && /throw_creator_workspace/.test(from)) return { chooseCharacterDef: async value => value?.fsPath || '' };
  if (request === './sff_reader' && /throw_creator_workspace/.test(from)) return { readSff: () => ({ sprites: [], palettes: [{ group: 1, number: 1, colors: 0 }] }), spriteDataUri: () => '' };
  if (request === './palette_preview' && /throw_creator_workspace/.test(from)) return { assignedDefault: () => ({ index: 0 }) };
  if (request === './viewer_group' && /throw_creator_workspace/.test(from)) return { preferredViewerColumn: () => 2, trackViewerPanel: value => value, revealInViewerGroup() {} };
  if (request === './authoring_context_registry' && /throw_creator_workspace/.test(from)) return { registerCharacterToolPanel() {}, registerAuthoringPanel() { return {}; }, getContextModel: () => contextModel };
  if (request === './launch_controls' && /throw_creator_workspace/.test(from)) return { launchControlsHtml: () => '', launchControlsClientScript: () => '', handleLaunchMessage: async () => false };
  if (request === './webview_policy' && /throw_creator_workspace/.test(from)) return { protect: value => value };
  if (request === './viewer_sessions' && /throw_creator_workspace/.test(from)) return { register() {} };
  if (request === './viewer_close' && /throw_creator_workspace/.test(from)) return { support() {}, prepare: async () => true };
  if (request === './viewer_navigation' && /throw_creator_workspace/.test(from)) return { associatedDefs: filename => [path.join(path.dirname(filename), 'Hero.def')], currentPoint: () => ({}), openConnected: async () => undefined, openViewerSource: async () => undefined };
  if (request === './mutation_safety' && /throw_creator_workspace/.test(from)) return { transactionalWrite, transactionalWriteSet, optionsFromConfig: (_v, _f, operation, options) => ({ ...options, operation }) };
  return originalLoad.call(this, request, parent, main);
};

function fixture() {
  const folder = path.join(root, 'Hero'); fs.mkdirSync(folder, { recursive: true });
  const def = path.join(folder, 'Hero.def'), air = path.join(folder, 'Hero.air'), sff = path.join(folder, 'Hero.sff');
  fs.writeFileSync(def, '[Info]\nname=Hero\n[Files]\nanim=Hero.air\nsprite=Hero.sff\n');
  fs.writeFileSync(air, '[Begin Action 800]\n0,0,0,0,2\n0,1,0,0,3\n[Begin Action 801]\n0,0,0,0,4\n0,1,0,0,4\n');
  fs.writeFileSync(sff, 'fixture'); return { folder, def, air, sff };
}

(async () => { try {
  const assets = fixture(), creator = require('../src/throw_creator_model'), workspace = require('../src/throw_creator_workspace');
  workspace.registerThrowCreator({ workspaceState, subscriptions: [], extensionUri: uri(root) });
  const panel = await commands.get('ikemen.throwCreator.open')(uri(assets.def));
  assert(panel, `Throw Creator should open: ${errors.join(' | ')}`);
  const plan = creator.newPlan('Authority Test'); plan.id = 'authority-test'; plan.p1Action = 800; plan.p2Action = 801; plan.timingMode = 'match-p1-boundaries';

  let exactOpens = 0, changeBeforeOpen = false;
  const exactOwner = { assets, model: workspace.workspaceModel(assets, plan), selectedRole: 'p1', generation: 1, authorityEpoch: 1, panel: { active: true }, disposed: false, descriptor: { type: 'character', ownerDef: assets.def } };
  const exactContext = () => ({ identity: `project:${path.resolve(assets.air).toLowerCase()}`, revision: 0, selectionRevision: 0, activeSurfaceId: 'code.throw', selection: { surfaceId: 'code.throw', uri: `file:${assets.air}`, reference: workspace.actionReference(fs.readFileSync(assets.air, 'utf8'), 800, 'p1') } });
  const exactToolbar = workspace.createThrowToolbar(exactOwner, { requireActive: exactContext, beforeNavigateCheck: async () => { if (changeBeforeOpen) fs.appendFileSync(assets.air, '; changed\n'); }, navigation: { openViewerSource: async () => { exactOpens += 1; }, currentPoint: () => ({}), openConnected: async () => undefined } });
  await exactToolbar.openExact(); assert.strictEqual(exactOpens, 1, 'exact selected AIR action opens after the final authority recheck');
  changeBeforeOpen = true; await assert.rejects(exactToolbar.openExact(), /changed immediately before navigation/); assert.strictEqual(exactOpens, 1, 'TOCTOU change prevents exact-source navigation');
  fs.writeFileSync(assets.air, '[Begin Action 800]\n0,0,0,0,2\n0,1,0,0,3\n[Begin Action 801]\n0,0,0,0,4\n0,1,0,0,4\n');

  await panel.send({ type: 'actionNavigate', role: 'p1', action: 'select-index', index: 999 });
  assert(panel.webview.messages.some(item => item.type === 'actionNavigationRollback' && item.p1Action === 800), 'failed navigation reposts committed P1/P2 state');
  panel.active = false; await panel.send({ type: 'savePlan', plan });
  assert(errors.some(item => /no longer the active/.test(item)), 'background mutation is refused');
  panel.active = true; errors.length = 0;
  await panel.send({ type: 'loadPlan', filename: path.join(root, 'outside.json') });
  assert(errors.some(item => /no longer in this character plan list/.test(item)), 'plan loading is restricted to host-enumerated character plans'); errors.length = 0;
  failOperation = 'save-throw-plan'; await panel.send({ type: 'savePlan', plan });
  assert(errors.some(item => /injected write failure/.test(item)), 'plan write failure is surfaced while its staged draft remains available'); errors.length = 0;

  await panel.send({ type: 'applyTiming', plan });
  assert(!writes.some(item => item.operation === 'apply-throw-timing'), 'cancel leaves AIR unchanged');
  const timingWrites = writes.filter(item => item.operation === 'apply-throw-timing').length;
  warningHooks.push(async () => fs.appendFileSync(assets.air, '; modal race\n')); warnings.push('Apply Timing'); await panel.send({ type: 'applyTiming', plan });
  assert.strictEqual(writes.filter(item => item.operation === 'apply-throw-timing').length, timingWrites, 'AIR byte change during confirmation refuses the mutation');
  fs.writeFileSync(assets.air, '[Begin Action 800]\n0,0,0,0,2\n0,1,0,0,3\n[Begin Action 801]\n0,0,0,0,4\n0,1,0,0,4\n');
  warningHooks.push(async () => fs.writeFileSync(assets.air, '[Begin Action 800]\n0,0,0,0,2\n0,1,0,0,3\n[Begin Action 801]\n0,0,0,0,6\n0,1,0,0,4\n')); warnings.push('Apply Timing'); await panel.send({ type: 'applyTiming', plan });
  assert.strictEqual(writes.filter(item => item.operation === 'apply-throw-timing').length, timingWrites, 'selected action signature change during confirmation refuses the mutation');
  fs.writeFileSync(assets.air, '[Begin Action 800]\n0,0,0,0,2\n0,1,0,0,3\n[Begin Action 801]\n0,0,0,0,4\n0,1,0,0,4\n');
  const versionRace = { fileName: assets.air, uri: uri(assets.air), version: 20, isDirty: true, isClosed: false, text: fs.readFileSync(assets.air, 'utf8'), getText() { return this.text; }, positionAt: offset => ({ line: 0, character: offset }) };
  vscode.workspace.textDocuments.push(versionRace); warningHooks.push(async () => { versionRace.version += 1; }); warnings.push('Apply Timing'); await panel.send({ type: 'applyTiming', plan }); vscode.workspace.textDocuments.length = 0;
  assert.strictEqual(appliedEdits.length, 0, 'dirty AIR version change during confirmation refuses WorkspaceEdit');
  warningHooks.push(async () => { panel.active = false; }); warnings.push('Apply Timing'); await panel.send({ type: 'applyTiming', plan }); panel.active = true;
  assert.strictEqual(writes.filter(item => item.operation === 'apply-throw-timing').length, timingWrites, 'active Throw context change during confirmation refuses the mutation');
  warningHooks.push(async () => { contextState.revision += 1; contextState.selection = { forged: 'selection' }; contextState.selectionRevision += 1; }); warnings.push('Apply Timing'); await panel.send({ type: 'applyTiming', plan });
  assert.strictEqual(writes.filter(item => item.operation === 'apply-throw-timing').length, timingWrites, 'context revision and selected AIR identity change during confirmation refuse the mutation');
  await panel.send({ type: 'applyTiming', plan });
  assert.strictEqual(writes.filter(item => item.operation === 'apply-throw-timing').length, timingWrites, 'stable but forged context selection remains rejected');
  panel.active = false; panel.reveal();
  warnings.push('Apply Timing'); await panel.send({ type: 'applyTiming', plan });
  assert.strictEqual(fs.readFileSync(assets.air, 'utf8'), '[Begin Action 800]\n0,0,0,0,2\n0,1,0,0,3\n[Begin Action 801]\n0,0,0,0,1\n0,1,0,0,1\n', 'closed AIR mutation changes only the selected action duration fields');
  const dirtyText = '[Begin Action 800]\n0,0,0,0,2\n0,1,0,0,3\n[Begin Action 801]\n0,0,0,0,4\n0,1,0,0,4\n';
  vscode.workspace.textDocuments.push({ fileName: assets.air, uri: uri(assets.air), version: 7, isDirty: true, isClosed: false, getText: () => dirtyText, positionAt: offset => ({ line: 0, character: offset }) });
  warnings.push('Apply Timing'); await panel.send({ type: 'applyTiming', plan });
  assert.strictEqual(appliedEdits.at(-1).replacements.length, 2, 'dirty AIR timing uses one undoable WorkspaceEdit containing duration-token replacements');
  assert.strictEqual(fs.readFileSync(assets.air, 'utf8').includes('0,0,0,0,1'), true, 'dirty editor path does not directly rewrite the disk file');
  vscode.workspace.textDocuments.length = 0;
  fs.writeFileSync(assets.air, '[Begin Action 800]\n0,0,0,0,2\n[Begin Action 801]\n0,0,0,0,4\n[Begin Action 801]\n0,1,0,0,5\n');
  panel.active = false; panel.reveal();
  warnings.push('Apply Timing'); await panel.send({ type: 'applyTiming', plan });
  assert(errors.some(item => /missing or ambiguous/.test(item)), 'different-body duplicate action numbers are refused');
  fs.writeFileSync(assets.air, '[Begin Action 800]\n0,0,0,0,2\n0,1,0,0,3\n[Begin Action 801]\n0,0,0,0,4\n0,1,0,0,4\n'); panel.active = false; panel.reveal(); errors.length = 0;

  plan.timingMode = 'independent';
  await panel.send({ type: 'previewCode', plan }); assert(shown.some(document => document.fileName === 'untitled:throw'), `scaffold preview is virtual/untitled: ${errors.join(' | ')}`);
  const wrongScaffold = path.join(assets.folder, 'wrong.txt'); saveDialogs.push(uri(wrongScaffold)); await panel.send({ type: 'saveCode', plan });
  assert(!fs.existsSync(wrongScaffold), 'host-selected scaffold targets must end in .zss');
  const existing = path.join(assets.folder, 'existing.zss'); fs.writeFileSync(existing, 'keep'); saveDialogs.push(uri(existing)); await panel.send({ type: 'saveCode', plan });
  assert.strictEqual(fs.readFileSync(existing, 'utf8'), 'keep', 'save-new scaffold never overwrites an existing target');
  const scaffold = path.join(assets.folder, 'new-throw.zss'); saveDialogs.push(uri(scaffold)); await panel.send({ type: 'saveCode', plan }); assert(fs.existsSync(scaffold));

  const beforeForged = errors.length; await panel.send({ type: 'selectRole', role: 'p1', forged: true }); await panel.send({ type: 'selectRole', role: 'p2' });
  assert(errors.length === beforeForged + 1, 'forged message is rejected and the following valid message still succeeds');

  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const cancelledWrites = writes.length; await panel.send({ type: 'contactSheet', dataUri: png, plan }); assert.strictEqual(writes.length, cancelledWrites, 'cancelled contact-sheet dialog writes nothing');
  const wrongImage = path.join(assets.folder, 'wrong.jpg'); saveDialogs.push(uri(wrongImage)); await panel.send({ type: 'contactSheet', dataUri: png, plan }); assert(!fs.existsSync(wrongImage), 'host-selected review targets must end in .png');
  const review = path.join(assets.folder, 'review.png'); saveDialogs.push(uri(review)); await panel.send({ type: 'contactSheet', dataUri: png, plan }); assert(fs.existsSync(review));
  const writesBefore = writes.length; await panel.send({ type: 'contactSheet', dataUri: 'data:image/png;base64,AAAA', plan }); assert.strictEqual(writes.length, writesBefore, 'invalid PNG never reaches the writer');

  launchFailure = true; await panel.send({ type: 'livePreview', plan }); launchFailure = false;
  const profile = path.join(assets.folder, 'tools', 'ikemen-tools', 'ikemen_tools_preview_profile.zss');
  assert.match(fs.readFileSync(profile, 'utf8'), /ignoreHitPause if 0/, 'launch failure atomically disarms the preview profile');
  assert.strictEqual(panel.webview.messages.filter(item => item.type === 'previewState').at(-1)?.armed, false, 'launch failure publishes the disarmed control state');
  await panel.send({ type: 'livePreview', plan }); await new Promise(resolve => realSetTimeout(resolve, 60));
  assert.match(fs.readFileSync(profile, 'utf8'), /ignoreHitPause if 0/, 'auto-disarm remains host-owned and disables the profile');
  assert.deepStrictEqual(panel.webview.messages.filter(item => item.type === 'previewState').slice(-2).map(item => item.armed), [true, false], 'armed and automatic-disarm transitions are published to the exact workspace');
  await panel.send({ type: 'livePreview', plan }); await panel.send({ type: 'disablePreview', plan });
  assert.match(fs.readFileSync(profile, 'utf8'), /ignoreHitPause if 0/, 'manual disable uses the same guarded disarm authority');
  assert.strictEqual(panel.webview.messages.filter(item => item.type === 'previewState').at(-1)?.armed, false, 'manual disable publishes the disarmed control state');
  await panel.send({ type: 'livePreview', plan }); failOperation = 'close-disarm'; const messageCountAtDispose = panel.webview.messages.length, writeCountAtDispose = writes.length; panel.dispose();
  await new Promise(resolve => realSetTimeout(resolve, 80));
  assert.match(fs.readFileSync(profile, 'utf8'), /ignoreHitPause if 0/, 'dispose write failure is retried by the host until preview is disabled');
  assert.strictEqual(panel.webview.messages.length, messageCountAtDispose, 'retry-disarm posts no late UI message after disposal');
  assert(writes.slice(writeCountAtDispose).every(item => path.resolve(item.filename) === path.resolve(profile)), 'post-dispose retry mutates only the owned preview profile');
  assert.deepStrictEqual(disposedListeners, { receive: 1, view: 1, change: 1, close: 1 }, 'receive, view-state, AIR-change, and AIR-close listeners are all disposed exactly once');
  console.log('Throw Creator host authority, mutation, rollback, export, and preview-disarm lifecycle tests passed');
} finally { Module._load = originalLoad; global.setTimeout = realSetTimeout; fs.rmSync(root, { recursive: true, force: true }); } })().catch(error => { console.error(error); process.exitCode = 1; });
