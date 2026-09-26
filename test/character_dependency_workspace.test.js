'use strict';
const assert = require('assert');
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
assert.doesNotThrow(() => new Function(page.match(/<script>([\s\S]*)<\/script>/)[1]));
console.log('Character dependency workspace tests passed');
