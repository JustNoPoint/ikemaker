'use strict';
const assert = require('assert');
const vm = require('vm');
const Module = require('module');
const load = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return { window: {}, workspace: {}, commands: {}, Uri: {}, ViewColumn: {} };
  return load.call(this, request, parent, main);
};
const workspace = require('../src/character_dependency_workspace');
Module._load = load;

const root = 'C:\\game\\chars\\Ryu\\Ryu.def', code = 'C:\\game\\chars\\template\\common.zss';
const model = {
  root, character: 'Ryu', summary: { files: 2, missing: 0, assignments: 1, codeLinks: 1 },
  navigation: { generation: 1, selected: 0, count: 2, navMode: 'tabs', readout: '1 of 2 · Ryu.def', items: [] },
  assignments: [{ slot: 0, label: 'Ryu.def', edge: 'root', missing: false }, { slot: 1, label: 'common.zss', edge: '[Files] st', missing: false }],
  code: [{ slot: 1, label: 'Ryu.def', edge: 'calls Example()', line: 12, missing: false }],
  nodes: [
    { id: root, filename: root, label: 'Ryu.def', relative: 'Ryu.def', kind: 'Definition', exists: true },
    { id: code, filename: code, label: 'common.zss', relative: '..\\template\\common.zss', kind: 'Code', exists: true }
  ],
  edges: [
    { from: root, to: code, type: 'assignment', label: '[Files] st', targetLine: 0 },
    { from: code, to: root, type: 'function', label: 'calls Example()', targetLine: 12 }
  ]
};
const page = workspace.html(model);
assert.match(page, /Character Connection Tree/);
assert.match(page, /DEF and assigned assets/);
assert.match(page, /Code relationships/);
assert.match(page, /calls Example\(\)/);
assert.match(page, /setState/);
for (const label of ['Previous connected file', 'Connected file position', 'Next connected file', 'Choose connected file']) assert(page.includes(`aria-label="${label}"`), `missing accessible navigator label: ${label}`);
assert.doesNotThrow(() => new vm.Script(page.match(/<script>([\s\S]*)<\/script>/)[1], { filename: 'character-dependency-client.js' }));
console.log('Character dependency workspace tests passed');
