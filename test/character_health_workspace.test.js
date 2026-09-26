'use strict';

const assert = require('assert');
const vm = require('vm');
const Module = require('module');
const original = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return { window: {}, workspace: {}, commands: {}, languages: {}, Uri: {}, ViewColumn: {}, DiagnosticSeverity: {}, Diagnostic: class {}, Range: class {}, Position: class {} };
  return original.call(this, request, parent, main);
};
const workspace = require('../src/character_health_workspace');
Module._load = original;

const model = {
  character: 'Ryu', profile: 'ikemen-1.0', profileLabel: 'IKEMEN GO 1.0', defPath: 'C:\\game\\chars\\Ryu\\Ryu.def',
  counts: { error: 0, warning: 1, convention: 1, suggestion: 0, fixable: 2, safe: 1 },
  dependency: { summary: { files: 3, missing: 0 }, nodes: [], edges: [] },
  files: [{ filename: 'C:\\game\\chars\\Ryu\\Ryu.cns', relative: 'Ryu.cns', extension: '.cns', hash: 'x', findings: 2, text: 'excluded from serialized page' }],
  findings: [
    { id: 'a', file: 'C:\\game\\chars\\Ryu\\Ryu.cns', line: 9, endLine: 9, code: 'shadowed-parameter', level: 'warning', title: 'damage is shadowed', message: 'Effective value is 40.', key: 'damage', effectiveValue: '40', safe: true, fix: { kind: 'remove-lines' } },
    { id: 'b', file: 'C:\\game\\chars\\Ryu\\Ryu.cns', line: 19, endLine: 19, code: 'unknown-controller-parameter', level: 'convention', title: 'Unknown HitDef parameter', message: 'Review it.', controller: 'HitDef', suggestion: 'guard.pausetime', action: 200, fix: { kind: 'remove-lines' } }
  ]
};
const page = workspace.healthHtml(model);
assert.match(page, /Character Health & Cleanup/);
assert.match(page, /Audit first/);
assert.match(page, /Select safe/);
assert.match(page, /Comment flagged source/);
assert.match(page, /Delete flagged source/);
assert.match(page, /Preview selected/);
assert.match(page, /Add files…/);
assert.match(page, /Undo last cleanup/);
assert.match(page, /AIR review/);
assert.match(page, /Related Work/);
assert.ok(!page.includes('excluded from serialized page'));
assert.doesNotThrow(() => new vm.Script(page.match(/<script>([\s\S]*)<\/script>/)[1], { filename: 'character-health-webview.js' }));
console.log('Character Health workspace tests passed');
