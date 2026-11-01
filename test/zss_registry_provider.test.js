'use strict';

const assert = require('assert');
const Module = require('module');

class TreeItem { constructor(label, state) { this.label = label; this.collapsibleState = state; } }
class EventEmitter { constructor() { this.event = () => {}; this.fires = 0; } fire() { this.fires += 1; } }
const api = {
  TreeItem, EventEmitter, TreeItemCollapsibleState: { None: 0, Collapsed: 1 }, ThemeIcon: class { constructor(id) { this.id = id; } },
  workspace: {
    getConfiguration: () => ({ get: (_key, fallback) => fallback }),
    findFiles: async () => { throw new Error('discovery unavailable'); },
    openTextDocument: async () => { throw new Error('not reached'); },
    asRelativePath: () => ''
  }
};
const original = Module._load;
Module._load = function patched(request, parent, main) { if (request === 'vscode') return api; return original.call(this, request, parent, main); };
const { ZssRegistryProvider, emptyData } = require('../src/zss_registry_provider');
Module._load = original;

(async () => {
  const provider = new ZssRegistryProvider(api, () => ({}));
  const roots = await provider.getChildren();
  const maps = roots.find((item) => item.key === 'maps');
  assert.ok(maps && /scanning/.test(maps.label), 'root groups render without waiting for the workspace scan');
  await provider.pending;
  assert.strictEqual(provider.status, 'failed');
  assert.match(provider.failure, /discovery unavailable/);
  const children = await provider.getChildren(maps);
  assert.strictEqual(children[0].label, 'Browse Maps…', 'Browse Maps remains first and available after a rejected workspace scan');
  assert.strictEqual(children[1].label, 'No maps found', 'failed/empty inventory renders an explicit empty result instead of a blank group');
  assert.match(children[1].description, /Add or save ZSS sources|could not be read/);
  const failedRoots = await provider.getChildren();
  assert.ok(failedRoots.every((item) => /Use Refresh to retry/.test(item.description)), 'failed inventory state exposes an explicit retry path');

  provider.refresh();
  api.workspace.findFiles = async () => [{ fsPath: 'gone.zss' }];
  const retryRoots = await provider.getChildren();
  assert.ok(/scanning/.test(retryRoots[0].label));
  await provider.pending;
  assert.strictEqual(provider.status, 'partial', 'unreadable individual files yield a partial inventory instead of rejecting the detached scan');
  const partialChildren = await provider.getChildren(retryRoots.find((item) => item.key === 'maps'));
  assert.strictEqual(partialChildren[0].label, 'Browse Maps…');

  const calls = [];
  class RelativePattern { constructor(base, pattern) { this.base = base; this.pattern = pattern; } }
  const fallbackApi = {
    TreeItem, EventEmitter, RelativePattern,
    TreeItemCollapsibleState: api.TreeItemCollapsibleState, ThemeIcon: api.ThemeIcon,
    window: { activeTextEditor: { document: { uri: { fsPath: 'D:\\game\\chars\\ryu\\main.zss' } } } },
    workspace: {
      textDocuments: [],
      getConfiguration: () => ({ get: (_key, fallback) => fallback }),
      findFiles: async (include) => { calls.push(include); return typeof include === 'string' ? [] : [{ fsPath: 'D:\\game\\chars\\ryu\\main.zss' }]; },
      openTextDocument: async () => ({ getText: () => '[Function Demo()]' }),
      asRelativePath: () => 'chars/ryu/main.zss'
    }
  };
  const fallbackProvider = new ZssRegistryProvider(fallbackApi, () => ({ ...emptyData(), functions: [{ name: 'Demo', line: 0 }] }));
  await fallbackProvider.scan();
  assert.strictEqual(fallbackProvider.scope, 'active-project', 'an empty workspace search falls back to the active project file');
  assert.ok(calls[1] instanceof RelativePattern, 'the fallback performs a bounded project-root search');
  assert.strictEqual(calls[1].pattern, '**/*.zss');
  assert.match(fallbackProvider.statusText(), /Active-project ZSS inventory/);
  const fallbackRoots = await fallbackProvider.getChildren();
  assert.match(fallbackRoots.find((item) => item.key === 'functions').label, /Functions \(1\)/);

  console.log('Project Data handles failure/partial scans and falls back from an empty workspace search to the active project');
})().catch((error) => { console.error(error); process.exitCode = 1; });
