'use strict';
const assert = require('assert');
const Module = require('module');
const original = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return { window: {}, workspace: {}, commands: {}, Uri: { file: (fsPath) => ({ fsPath }) }, ProgressLocation: { Notification: 1 } };
  return original.call(this, request, parent, main);
};
const { affectedProjects } = require('../src/engine_migration_ui');
Module._load = original;

const registry = { projects: [
  { id: 'universal', name: 'Universal', roots: ['.'], engineTarget: { buildId: 'stable' } },
  { id: 'game', name: 'Game', roots: ['.'], engineTarget: { buildId: 'stable' } },
  { id: 'character', name: 'Character', roots: ['chars/Ryu'], engineTarget: { buildId: 'stable' } },
  { id: 'stale-pin', name: 'Stale Pin', roots: ['stages/Test'], engineTarget: { buildId: 'older-nightly' } }
] };
const affected = affectedProjects(registry, 'C:\\Game\\chars\\template\\.ikemen\\project-registry.json', 'C:\\Game', { buildId: 'stable' });
assert.deepEqual(affected.map((item) => item.id), ['game', 'character', 'stale-pin']);
console.log('Engine migration shared-runtime profiles include root, subroot and stale-pin siblings');
