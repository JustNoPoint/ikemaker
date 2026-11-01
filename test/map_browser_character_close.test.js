'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');

const original = Module._load;
const def = path.resolve('C:/Game/chars/Ryu/Ryu.def');
let disposed = false;
const disposeListeners = [];
const panel = {
  active: true, viewColumn: 2,
  webview: { html: '', cspSource: 'test', onDidReceiveMessage() {}, postMessage() { return true; } },
  onDidChangeViewState() {}, onDidDispose(callback) { disposeListeners.push(callback); }, reveal() {},
  dispose() { disposed = true; for (const callback of disposeListeners.splice(0)) callback(); }
};
const service = {
  scope() { return { def, resolved: true }; },
  async scan() { return { def, root: path.dirname(def), cacheKey: 'one', detail: 'test', complete: true, partial: false, defaultScope: 'assigned', scopes: [{ id: 'assigned', label: 'Assigned' }], entries: [{ name: 'test.map', files: [path.resolve(path.dirname(def), 'states.zss')], occurrences: [], notes: [], observedValues: [], sourceBadges: [], scopeIds: ['assigned'], suggestedPath: [], displayWrites: 1, displayReads: 0 }] }; }
};
const vscode = { ViewColumn: { Beside: 2 }, Uri: { parse: value => ({ toString: () => value }), file: fsPath => ({ fsPath }) }, window: { activeTextEditor: undefined, createWebviewPanel: () => panel }, workspace: {} };

Module._load = function(request, parent, main) {
  if (request === './map_registry_service' && /map_registry_ui/.test(parent?.filename || '')) return { initialize: () => service };
  if (request === './webview_policy' && /map_registry_ui/.test(parent?.filename || '')) return { protect: value => value };
  return original.call(this, request, parent, main);
};

(async () => {
  const registry = require('../src/authoring_context_registry');
  const maps = require('../src/map_registry_ui');
  await maps.openBrowser(vscode, {}, { fsPath: def }, null);
  const context = { type: 'character', key: registry.normalized(def), ownerDef: def, root: path.dirname(def) };
  assert.strictEqual(registry.matchingPanels(context).length, 1, 'floating map browser is owned by the character workspace');
  assert.strictEqual(registry.disposeContextPanels(context), 1);
  assert.strictEqual(disposed, true, 'closing the character workspace closes its floating browser');
  assert.strictEqual(registry.matchingPanels(context).length, 0, 'disposed browser cannot remain as stale context state');
  console.log('Floating Project Maps browser follows character workspace close');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { Module._load = original; });
