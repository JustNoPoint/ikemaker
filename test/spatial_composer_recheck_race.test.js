'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-spatial-recheck-'));
const def = path.join(root, 'hero.def'), source = path.join(root, 'states.zss'), other = path.join(root, 'other.zss');
fs.writeFileSync(def, '[Files]\nst=states.zss\nst1=other.zss\n');
fs.writeFileSync(source, '[StateDef 0]\n\n'); fs.writeFileSync(other, '[StateDef 1]\n\n');
let text = fs.readFileSync(source, 'utf8'), version = 1, cursor = { line: 1, character: 0 }, contextModel;
const uri = { toString: () => `file:///${source.replace(/\\/g, '/')}` };
const document = { fileName: source, uri, isClosed: false, get version() { return version; }, getText: () => text };
const editor = { document, selection: { get active() { return cursor; } } };
const vscode = { Uri: { file: fsPath => ({ fsPath }) }, workspace: { textDocuments: [document] }, window: { visibleTextEditors: [editor], showInformationMessage: async () => {}, showWarningMessage: async () => {} } };
const original = Module._load;
Module._load = function(request, parent, main) {
  const from = parent?.filename || '';
  if (request === 'vscode') return vscode;
  if (request === './related_work' && /spatial_composer_workspace/.test(from)) return { resolveAssigned: () => ({ code: [source, other], commands: '', constants: '' }) };
  if (request === './viewer_navigation' && /spatial_composer_workspace/.test(from)) return { associatedDefs: () => [def] };
  if (request === './authoring_context_registry' && /spatial_composer_workspace/.test(from)) return { registerAuthoringPanel: () => ({}), getContextModel: () => contextModel, registerCharacterToolPanel() {} };
  return original.call(this, request, parent, main);
};
delete require.cache[require.resolve('../src/spatial_composer_workspace')];
const workspace = require('../src/spatial_composer_workspace'), spatial = require('../src/spatial_authoring_model');
Module._load = original;

const deferred = () => { let resolve; const promise = new Promise(value => { resolve = value; }); return { promise, resolve }; };
const makeOwner = gate => {
  const messages = [], state = { identity: 'character:hero', revision: 1, selectionRevision: 1, activeSurfaceId: 'code.spatial', selection: null };
  contextModel = { snapshot: () => state, update: value => Object.assign(state, value) };
  const owner = { defPath: def, mode: 'explod', plan: spatial.newExplod(), generation: 1, authorityEpoch: 0, selectedSource: source, navigation: workspace.spatialNavigation([source, other], source), disposed: false, panel: { active: true, webview: { postMessage: async message => { messages.push(message); if (gate && message.type === 'generatedAuthorityClear') await gate.promise; return true; } } }, contextModel };
  return { owner, messages };
};
const settle = () => new Promise(resolve => setImmediate(resolve));

(async () => {
  let gate = deferred(), attempt = makeOwner(gate), pending = workspace.reportInsertionContext(attempt.owner, source, { isCurrent: () => true });
  await settle(); cursor = { line: 0, character: 1 }; gate.resolve();
  const moved = await pending; assert.strictEqual(moved.context.valid, false); assert.strictEqual(attempt.owner.capture, null); assert.strictEqual(attempt.owner.generatedSnapshot, null); assert(!attempt.messages.some(message => message.type === 'generatedAuthority'));

  cursor = { line: 1, character: 0 }; gate = deferred(); attempt = makeOwner(gate); pending = workspace.reportInsertionContext(attempt.owner, source, { isCurrent: () => true });
  await settle(); text += '; changed\n'; version += 1; gate.resolve();
  const edited = await pending; assert.strictEqual(edited.context.valid, false); assert.strictEqual(attempt.owner.capture, null); assert(!attempt.messages.some(message => message.type === 'generatedAuthority'));

  text = '[StateDef 0]\n\n'; version += 1; cursor = { line: 1, character: 0 }; gate = deferred(); attempt = makeOwner(gate); pending = workspace.reportInsertionContext(attempt.owner, source, { isCurrent: () => true });
  await settle(); attempt.owner.selectedSource = other; gate.resolve();
  const switched = await pending; assert.strictEqual(switched.context.valid, false); assert.strictEqual(attempt.owner.capture, null); assert(!attempt.messages.some(message => message.type === 'generatedAuthority'));

  gate = deferred(); attempt = makeOwner(gate); pending = workspace.reportInsertionContext(attempt.owner, source, { isCurrent: () => true });
  await settle(); attempt.owner.disposed = true; gate.resolve();
  const closed = await pending; assert.strictEqual(closed.context.valid, false); assert.strictEqual(attempt.owner.capture, null); assert.strictEqual(attempt.messages.length, 1, 'closing during invalidation emits no late context, toolbar, or authority render');

  attempt = makeOwner(null); const valid = await workspace.reportInsertionContext(attempt.owner, source, { isCurrent: () => true });
  assert.strictEqual(valid.context.valid, true); assert(attempt.owner.capture); assert(attempt.owner.generatedSnapshot); assert(attempt.messages.some(message => message.type === 'generatedAuthority'), 'a rejected Recheck does not prevent a later fresh Recheck');
  console.log('Spatial Composer Recheck fails closed across cursor, document, source, and disposal races, then accepts a fresh context');
})().finally(() => fs.rmSync(root, { recursive: true, force: true })).catch(error => { console.error(error); process.exitCode = 1; });
