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
const { ZssRegistryProvider } = require('../src/zss_registry_provider');
Module._load = original;

(async () => {
  const provider = new ZssRegistryProvider(api, () => ({}));
  const roots = await provider.getChildren();
  const maps = roots.find((item) => item.key === 'maps');
  assert.ok(maps && /scanning/.test(maps.label), 'root groups render without waiting for the legacy scan');
  await provider.pending;
  assert.strictEqual(provider.status, 'failed');
  assert.match(provider.failure, /discovery unavailable/);
  const children = await provider.getChildren(maps);
  assert.strictEqual(children[0].label, 'Browse Maps…', 'Browse Maps remains first and available after a rejected legacy scan');
  assert.strictEqual(children.length, 1, 'failed/empty inventory does not hide or duplicate the browser action');
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

  console.log('Project Data legacy scan failure/partial handling keeps Browse Maps available');
})().catch((error) => { console.error(error); process.exitCode = 1; });
