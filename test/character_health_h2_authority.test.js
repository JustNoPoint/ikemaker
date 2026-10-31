'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { pathToFileURL, fileURLToPath } = require('url');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'health-h2-authority-'));
const def = path.join(root, 'Hero.def');
const cns = path.join(root, 'Hero.cns');
const air = path.join(root, 'Hero.air');
const original = '[Statedef 0]\ntype=S\n[State 0]\ntype=VelSet\nx=1\nx=2\n';
const originalAir = '[Begin Action 0]\n0,0,0,0\n[Begin Action 0]\n0,0,0,0\n';
fs.writeFileSync(def, '[Info]\nname=Hero\n[Files]\nst=Hero.cns\nanim=Hero.air\n');
fs.writeFileSync(cns, original);
fs.writeFileSync(air, originalAir);

const uri = {
  file(filename) {
    const resolved = path.resolve(filename);
    return { fsPath: resolved, scheme: 'file', toString: () => pathToFileURL(resolved).toString() };
  },
  parse(value) {
    return {
      fsPath: String(value).startsWith('file:') ? fileURLToPath(value) : '',
      scheme: String(value).split(':')[0],
      toString: () => value
    };
  }
};
class Position { constructor(line, character) { this.line = line; this.character = character; } }
class Range { constructor(start, end) { this.start = start; this.end = end; } }
class WorkspaceEdit { replace() {} }

const posts = [];
const commands = [];
const listeners = { change: [], save: [], close: [] };
const removable = (list, item) => ({ dispose() { const index = list.indexOf(item); if (index >= 0) list.splice(index, 1); } });
function panel() {
  const receivers = [], disposers = [], views = [];
  return {
    active: true,
    disposed: false,
    receivers,
    webview: {
      cspSource: 'test:',
      html: '',
      postMessage: async (message) => (posts.push(message), true),
      onDidReceiveMessage: (fn) => (receivers.push(fn), removable(receivers, fn))
    },
    onDidDispose: (fn) => (disposers.push(fn), removable(disposers, fn)),
    onDidChangeViewState: (fn) => (views.push(fn), removable(views, fn)),
    reveal() { this.active = true; for (const fn of [...views]) fn({ webviewPanel: this }); },
    dispose() { if (this.disposed) return; this.disposed = true; for (const fn of [...disposers]) fn(); }
  };
}

let context = { identity: `character:${def}`, revision: 1, selectionRevision: 0, activeSurfaceId: null, selection: null };
const contextModel = {
  snapshot: () => ({ ...context }),
  update(changes = {}) {
    context = {
      ...context,
      ...changes,
      revision: context.revision + 1,
      selectionRevision: context.selectionRevision + (Object.prototype.hasOwnProperty.call(changes, 'selection') ? 1 : 0)
    };
    return context;
  }
};

let warningHook = async (_message, _options, action) => action;
let commandHook = async () => true;
let failWrite = false;
const vscode = {
  Uri: uri,
  Position,
  Range,
  WorkspaceEdit,
  ViewColumn: { Active: 1, Beside: 2 },
  workspace: {
    textDocuments: [],
    getConfiguration: () => ({ get: (_key, fallback) => fallback }),
    onDidChangeTextDocument: (fn) => (listeners.change.push(fn), removable(listeners.change, fn)),
    onDidSaveTextDocument: (fn) => (listeners.save.push(fn), removable(listeners.save, fn)),
    onDidCloseTextDocument: (fn) => (listeners.close.push(fn), removable(listeners.close, fn)),
    openTextDocument: async () => { throw new Error('not expected'); },
    applyEdit: async () => { throw new Error('not expected'); }
  },
  window: {
    showQuickPick: async (choices) => choices?.[0],
    showOpenDialog: async () => undefined,
    showWarningMessage: (...args) => warningHook(...args),
    showInformationMessage: async () => undefined,
    showErrorMessage() {}
  },
  commands: {
    executeCommand: async (...args) => {
      commands.push(args);
      return commandHook(...args);
    }
  },
  languages: {},
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  Diagnostic: class {}
};

const realMutation = require('../src/mutation_safety');
const originalLoad = Module._load;
Module._load = function (request, parent, main) {
  if (request === 'vscode') return vscode;
  if (request === './mutation_safety') return {
    ...realMutation,
    transactionalWriteSet(...args) {
      if (failWrite) throw new Error('injected transaction refusal');
      return realMutation.transactionalWriteSet(...args);
    }
  };
  if (request === './authoring_context_registry') return { registerAuthoringPanel: () => ({}), getContextModel: () => contextModel };
  if (request === './viewer_group') return { preferredViewerColumn: () => 1, trackViewerPanel: (value) => value, revealInViewerGroup() {} };
  if (request === './viewer_navigation') return { openViewerSource: async () => true, currentPoint: () => ({}), acknowledgeRestore: () => true, registerSourcePanel() {} };
  if (request === './viewer_close') return { support() {}, prepare: async () => true, clientScript: () => '' };
  if (request === './webview_policy') return { protect: (value) => value };
  if (request === './character_picker') return { chooseCharacterDef: async () => null };
  return originalLoad.call(this, request, parent, main);
};

const send = async (p, message) => Promise.all(p.receivers.map((receiver) => receiver(message))).then((values) => values[0]);
const claim = (owner) => contextModel.update({ activeSurfaceId: 'character.health', selection: owner.selectedReference ? { surfaceId: 'character.health', uri: owner.selectedReference.fileUri, reference: owner.selectedReference } : null });
const drain = async (owner) => { await owner.queue; await new Promise((resolve) => setImmediate(resolve)); await owner.queue; };

(async () => {
  try {
    const health = require('../src/character_health_workspace');
    const p = panel();
    const owner = health.attach(p);
    assert(health.bind(owner, health.buildCandidate(def, 'ikemen-1.0', []), { claim: true }));
    let token = health.repairTokens(owner.candidate).find(Boolean);
    assert(token);
    const tokenFinding = owner.candidate.model.findings[token.slot];
    assert.notEqual(health.repairSha({ ...tokenFinding, fix: { ...tokenFinding.fix, reason: `${tokenFinding.fix.reason} changed` } }, token.reference), token.repairSha, 'fix reason/replacement authority is digest-bound');
    const { createRepairPlan } = require('../src/character_health_model');
    const overlapModel = { files: [{ filename: cns, text: original, hash: require('crypto').createHash('sha256').update(original).digest('hex') }], findings: [
      { id: 'one', file: cns, fix: { kind: 'remove-lines', startLine: 3, endLine: 4, reason: 'one' } },
      { id: 'two', file: cns, fix: { kind: 'remove-lines', startLine: 4, endLine: 4, reason: 'two' } }
    ] };
    assert.equal(createRepairPlan(overlapModel, ['one', 'two'], 'delete').skipped.length, 1, 'overlapping repair ranges are never silently accepted');
    const overlapTokens = health.repairTokens(owner.candidate).filter((entry) => entry && entry.reference.fileUri === uri.file(air).toString());
    assert(overlapTokens.length >= 2, 'AIR fixture exposes a block repair overlapping its malformed element repair');
    const overlapResultCount = posts.filter((message) => message.type === 'healthRepairResult').length;
    assert.equal(await send(p, { type: 'healthApplyRepairs', generation: owner.generation, requestId: 30, tokens: overlapTokens, mode: 'delete' }), false);
    assert.equal(fs.readFileSync(air, 'utf8'), originalAir, 'host-authorized overlap rejection performs no write');
    assert.equal(posts.filter((message) => message.type === 'healthRepairResult' && message.requestId === 30 && message.code === 'overlap').length, 1);
    assert.equal(posts.filter((message) => message.type === 'healthRepairResult').length, overlapResultCount + 1);
    const cnsToken = health.repairTokens(owner.candidate).find((entry) => entry?.reference.fileUri === uri.file(cns).toString());
    assert(cnsToken, 'fixture exposes a stable CNS repair token');
    fs.writeFileSync(cns, '[Statedef 0]\ntype=S\n[State 0]\ntype=VelSet\nx=1\n');
    assert.equal(await send(p, { type: 'healthApplyRepairs', generation: owner.generation, requestId: 32, tokens: [cnsToken], mode: 'delete' }), false);
    assert.equal(posts.filter((message) => message.type === 'healthRepairResult' && message.requestId === 32 && message.code === 'stale').length, 1, 'removed repair tokens fail closed');
    fs.writeFileSync(cns, `${original}x=2\n`);
    assert.equal(await send(p, { type: 'healthApplyRepairs', generation: owner.generation, requestId: 33, tokens: [cnsToken], mode: 'delete' }), false);
    assert.equal(posts.filter((message) => message.type === 'healthRepairResult' && message.requestId === 33 && ['stale', 'ambiguous'].includes(message.code)).length, 1, 'changed duplicate cardinality cannot authorize an old token');
    fs.writeFileSync(cns, original);
    assert(health.bind(owner, health.buildCandidate(def, owner.profile, owner.extras), { claim: true }));
    token = health.repairTokens(owner.candidate).find(Boolean);
    assert.equal(health.toolbarModel(owner).slots.find((slot) => slot.id === 'text-source').enabled, true, 'promoted exact source is enabled for the current live text finding');
    const originalRealpath = fs.realpathSync.native;
    fs.realpathSync.native = (filename) => path.basename(filename).startsWith('alias-') ? cns : originalRealpath(filename);
    assert.equal(health.validateRealTargets([{ filename: cns }, { filename: path.join(root, 'alias-Hero.cns') }]), false, 'real-path aliases are rejected before mutation');
    fs.realpathSync.native = originalRealpath;
    assert.equal(health.validBodyMessage({ type: 'healthApplyRepairs', generation: owner.generation, requestId: 1, tokens: [token], mode: 'delete', path: cns }, owner.generation), false);
    const nullPrototype = Object.assign(Object.create(null), token);
    assert.equal(health.validBodyMessage({ type: 'healthApplyRepairs', generation: owner.generation, requestId: 1, tokens: [nullPrototype], mode: 'delete' }, owner.generation), false);
    const livePreview = health.previewRepairs(owner, { type: 'healthPreviewRepairs', generation: owner.generation, requestId: 1, tokens: [token], mode: 'comment' });
    assert.equal(owner.busy, 1);
    assert.equal(await owner.toolbar.close(), false, 'Close refuses while an actual repair operation is in flight');
    assert.equal(await livePreview, true);

    warningHook = async (_message, _options, action) => {
      contextModel.update({ activeSurfaceId: 'foreign.surface', selection: { surfaceId: 'foreign.surface' } });
      return action;
    };
    assert.equal(await send(p, { type: 'healthApplyRepairs', generation: owner.generation, requestId: 2, tokens: [token], mode: 'delete' }), false);
    assert.equal(fs.readFileSync(cns, 'utf8'), original, 'foreign takeover during modal prevents write');

    claim(owner);
    warningHook = async (_message, _options, action) => {
      fs.writeFileSync(cns, `${original}; changed during modal\n`);
      return action;
    };
    assert.equal(await send(p, { type: 'healthApplyRepairs', generation: owner.generation, requestId: 3, tokens: [token], mode: 'delete' }), false);
    assert.equal(owner.undo, null);
    fs.writeFileSync(cns, original);
    assert(health.bind(owner, health.buildCandidate(def, owner.profile, owner.extras), { claim: true }));
    token = health.repairTokens(owner.candidate).find(Boolean);

    warningHook = async (_message, _options, action) => action;
    const realpathResultCount = posts.filter((message) => message.type === 'healthRepairResult').length;
    fs.realpathSync.native = () => { throw new Error('injected realpath refusal'); };
    assert.equal(await send(p, { type: 'healthApplyRepairs', generation: owner.generation, requestId: 31, tokens: [token], mode: 'delete' }), false);
    assert.equal(fs.readFileSync(cns, 'utf8'), original, 'unresolved real paths fail closed before any repair write');
    assert.equal(posts.filter((message) => message.type === 'healthRepairResult' && message.requestId === 31).length, 1, 'realpath failure produces exactly one terminal result');
    assert.equal(posts.filter((message) => message.type === 'healthRepairResult').length, realpathResultCount + 1);
    fs.realpathSync.native = originalRealpath;
    warningHook = async () => { throw new Error('injected apply confirmation refusal'); };
    assert.equal(await send(p, { type: 'healthApplyRepairs', generation: owner.generation, requestId: 34, tokens: [token], mode: 'delete' }), false);
    assert.equal(posts.filter((message) => message.type === 'healthRepairResult' && message.requestId === 34 && message.code === 'unavailable').length, 1, 'thrown Apply modal has exactly one terminal result');
    warningHook = async (_message, _options, action) => action;
    failWrite = true;
    assert.equal(await send(p, { type: 'healthApplyRepairs', generation: owner.generation, requestId: 4, tokens: [token], mode: 'delete' }), false);
    assert.equal(posts.filter((message) => message.type === 'healthRepairResult' && message.requestId === 4 && message.code === 'write-failed').length, 1, 'thrown transaction has exactly one Apply result');
    assert.equal(fs.readFileSync(cns, 'utf8'), original, 'transaction refusal leaves source unchanged');
    assert.equal(owner.undo, null, 'failed apply does not replace undo authority');
    failWrite = false;
    assert.equal(await send(p, { type: 'healthApplyRepairs', generation: owner.generation, requestId: 5, tokens: [token], mode: 'delete' }), true);
    await drain(owner);
    assert(owner.undo?.id);

    const undo = owner.undo;
    warningHook = async () => { throw new Error('injected undo confirmation refusal'); };
    assert.equal(await send(p, { type: 'healthUndoCleanup', generation: owner.generation, requestId: 35, undoId: undo.id }), false);
    assert.equal(owner.undo.id, undo.id, 'thrown Undo modal retains recovery authority');
    assert.equal(posts.filter((message) => message.type === 'healthRepairResult' && message.requestId === 35 && message.code === 'unavailable').length, 1, 'thrown Undo modal has exactly one terminal result');
    warningHook = async (_message, _options, action) => action;
    failWrite = true;
    assert.equal(await send(p, { type: 'healthUndoCleanup', generation: owner.generation, requestId: 6, undoId: undo.id }), false);
    assert.equal(posts.filter((message) => message.type === 'healthRepairResult' && message.requestId === 6 && message.code === 'write-failed').length, 1, 'thrown inverse transaction has exactly one Undo result');
    assert.equal(owner.undo.id, undo.id, 'failed undo retains exact undo authority');
    failWrite = false;
    assert.equal(await send(p, { type: 'healthUndoCleanup', generation: owner.generation, requestId: 7, undoId: undo.id }), true);
    await drain(owner);
    assert.equal(fs.readFileSync(cns, 'utf8'), original);

    token = health.repairTokens(owner.candidate).find(Boolean);
    let resultCount = posts.filter((message) => message.type === 'healthRepairResult').length;
    const previewKeysBeforeRace = owner.previewKeys.length;
    commandHook = async (command) => {
      if (command === 'vscode.diff') contextModel.update({ activeSurfaceId: 'foreign.preview', selection: { surfaceId: 'foreign.preview' } });
      return true;
    };
    assert.equal(await health.previewRepairs(owner, { type: 'healthPreviewRepairs', generation: owner.generation, requestId: 36, tokens: [token], mode: 'comment' }), false);
    assert.equal(posts.filter((message) => message.type === 'healthRepairResult' && message.requestId === 36 && message.code === 'stale').length, 1, 'preview takeover has exactly one stale terminal result');
    assert.equal(owner.previewKeys.length, previewKeysBeforeRace, 'stale preview cache entry is removed');
    claim(owner);
    resultCount = posts.filter((message) => message.type === 'healthRepairResult').length;
    commandHook = async () => { throw new Error('injected diff refusal'); };
    assert.equal(await health.previewRepairs(owner, { type: 'healthPreviewRepairs', generation: owner.generation, requestId: 8, tokens: [token], mode: 'comment' }), false);
    assert.equal(posts.filter((message) => message.type === 'healthRepairResult').length, resultCount + 1, 'a thrown diff command has one terminal result');
    assert.equal(posts.filter((message) => message.type === 'healthRepairResult').at(-1).code, 'unavailable');
    commandHook = async () => true;
    assert.equal(await health.previewRepairs(owner, { type: 'healthPreviewRepairs', generation: owner.generation, requestId: 9, tokens: [token], mode: 'comment' }), true, 'preview recovers after a thrown command');

    const resultsBefore = posts.filter((message) => message.type === 'healthRepairResult').length;
    commandHook = async (command) => {
      if (command === 'vscode.diff') p.dispose();
      return true;
    };
    assert.equal(await health.previewRepairs(owner, { type: 'healthPreviewRepairs', generation: owner.generation, requestId: 10, tokens: [token], mode: 'comment' }), false);
    assert.equal(posts.filter((message) => message.type === 'healthRepairResult').length, resultsBefore, 'dispose during preview posts no late terminal result');
    assert.equal(listeners.change.length, 0);
    assert.equal(listeners.save.length, 0);
    assert.equal(listeners.close.length, 0);
    console.log('Character Health H2 modal/source authority, transactional refusal/retry, undo retention and preview disposal tests passed');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
