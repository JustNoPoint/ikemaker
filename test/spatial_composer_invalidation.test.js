'use strict';

const assert = require('assert');
const path = require('path');
const Module = require('module');

const filename = path.resolve('C:/Game/Hero/states.zss');
const uri = `file:///${filename.replace(/\\/g, '/')}`;
let text = 'stateDef 0 {\n}\n';
const cursor = { line: 1, character: 0 };
const document = { fileName: filename, uri: { toString: () => uri }, version: 1, isClosed: false, getText: () => text };
const editor = { document, selection: { active: cursor } };
const vscode = { workspace: { textDocuments: [document] }, window: { visibleTextEditors: [editor] } };
const original = Module._load;
Module._load = function(request, parent, main) { if (request === 'vscode') return vscode; return original.call(this, request, parent, main); };
delete require.cache[require.resolve('../src/spatial_composer_workspace')];
const workspace = require('../src/spatial_composer_workspace');
Module._load = original;

const makeOwner = active => {
  const updates = [], messages = [], owner = {
    mode: 'explod', generation: 2, selectedSource: filename, disposed: false,
    navigation: workspace.spatialNavigation([filename], filename), descriptor: { type: 'project' },
    panel: { active, webview: { postMessage: async message => messages.push(message) } },
    contextModel: { state: null, snapshot() { return this.state; }, update(value) { updates.push(value); this.state = { ...this.state, ...value }; } }
  };
  const context = { identity: 'project:hero', revision: 4, selectionRevision: 7, activeSurfaceId: 'code.spatial', selection: null };
  owner.contextModel.state = context;
  owner.capture = workspace.captureSource(owner, editor, context);
  owner.generatedSnapshot = { snapshotDigest: 'a'.repeat(64) };
  owner.contextModel.state = { ...context, selection: { surfaceId: 'code.spatial', uri, reference: { mode: owner.mode, targetId: `cursor:${owner.capture.opaqueTarget}`, cursor } } };
  return { owner, updates, messages };
};

(async () => {
  const active = makeOwner(true);
  text += '; edit\n'; document.version += 1;
  assert.strictEqual(await workspace.invalidateSpatialCapture(active.owner, 'changed'), true);
  assert.strictEqual(active.owner.capture, null); assert.strictEqual(active.owner.generatedSnapshot, null);
  assert(active.updates.some(value => value.selection === null && value.activeSurfaceId === 'code.spatial'));
  assert(active.messages.some(message => message.type === 'generatedAuthorityClear'));
  const toolbar = active.messages.find(message => message.type === 'spatialToolbarState').model;
  assert.strictEqual(toolbar.slots.find(slot => slot.id === 'text-source').enabled, false);

  text = 'stateDef 0 {\n}\n'; document.version += 1;
  const background = makeOwner(false);
  background.owner.contextModel.state = { ...background.owner.contextModel.state, activeSurfaceId: 'code.structure', selection: { surfaceId: 'code.structure', uri: 'file:///other.zss', reference: { targetId: 'other' } } };
  await workspace.invalidateSpatialCapture(background.owner, 'background changed');
  assert.deepStrictEqual(background.updates, [], 'background invalidation must not steal or clear another surface selection');
  assert(background.messages.some(message => message.type === 'generatedAuthorityClear'), 'background client authority is still revoked');
  const closing = makeOwner(true); let posts = 0;
  closing.owner.panel.webview.postMessage = async () => { posts += 1; closing.owner.disposed = true; };
  await workspace.invalidateSpatialCapture(closing.owner, 'closing');
  assert.strictEqual(posts, 1, 'disposal between async posts prevents a late toolbar render');
  console.log('Spatial Composer invalidation clears owned authority and never steals a background selection');
})().catch(error => { console.error(error); process.exitCode = 1; });
