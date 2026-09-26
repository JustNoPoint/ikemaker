'use strict';

const assert = require('assert');
const Module = require('module');
const original = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return { window: {}, workspace: {}, commands: {}, Uri: { file: (fsPath) => ({ fsPath }) }, ViewColumn: {}, TreeItemCollapsibleState: {} };
  return original.call(this, request, parent, main);
};
const workspace = require('../src/menu_modes_workspace');
Module._load = original;

const page = workspace.html({
  files: { systemFile: 'C:/game/data/system.def', selectFile: 'C:/game/data/select.def' },
  menu: [{ key: 'menu.itemname.arcade', path: ['arcade'], action: 'arcade', label: 'ARCADE', line: 10, enabled: true, capability: 'native', description: '' }],
  nativeActions: [{ id: 'arcade', label: 'Arcade', description: 'Native arcade.', capability: 'native' }],
  recipes: [{ id: 'standard', label: 'Standard Modes', status: 'native', summary: 'Native.' }, { id: 'bossrush', label: 'Boss Rush', status: 'module', summary: 'Module.' }],
  orders: [{ mode: 'default', counts: [{ order: 1, count: 2 }] }], options: [],
  evidence: { screenpack: 'Native screenpack.', roster: 'Native roster.', behavior: 'Module only for new behavior.' }
}, 'creator');
assert.match(page, /Player Mode/);
assert.match(page, /Creator Mode/);
assert.match(page, /IKEMEN 1\.0 VERIFIED/);
assert.match(page, /Complete menu and roster-mode configuration/);
assert.match(page, /MODULE REQUIRED/);
assert.match(page, /globalThis\.ikemenNavigationSelection=\(\)=>\(\{view\}\)/);
assert.match(page, /\['player','creator'\]\.includes\(reference\.view\)/);
assert.match(page, /globalThis\.ikemenRestoreNavigation=reference=>setView\(reference\.view\)/);
const script = page.match(/<script>([\s\S]*)<\/script>/)[1];
assert.doesNotThrow(() => new Function(script));
console.log('Menu and modes workspace tests passed');
