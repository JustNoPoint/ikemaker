'use strict';

const assert = require('assert');
const Module = require('module');

const original = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return { TreeItem: class {}, TreeItemCollapsibleState: { None: 0 } };
  return original.call(this, request, parent, main);
};
const { controllerName, controllerSnippet, signatureSnippet, portableStructure, portableAudit } = require('../src/web_extension');
Module._load = original;

assert.strictEqual(controllerName('ChangeState'), 'changeState');
const controller = { name: 'ChangeState', params: [{ name: 'value', placeholder: 'state_no', required: true }, { name: 'ctrl', placeholder: 'value', required: false }] };
assert.ok(controllerSnippet(controller, true).includes('value: ${1:state_no};'));
assert.ok(controllerSnippet(controller, true).includes('Add optional options'));
assert.ok(!controllerSnippet(controller, false).includes('Add optional options'));
assert.ok(!controllerSnippet(controller, true).includes('ctrl:'));
assert.strictEqual(signatureSnippet({ name: 'test', signature: 'test(value, name)' }), 'test(${1:value}, ${2:name})');

const document = { fileName: '/game/chars/test/normals.zss', getText: () => '[StateDef 200]\nif time = 0 {\nchangeState{value: 0;}\n' };
const outline = portableStructure(document);
assert.ok(outline.includes('StateDef: 200'));
assert.ok(outline.includes('controller: changeState'));
assert.ok(outline.includes('does not modify'));
const audit = portableAudit(document);
assert.ok(audit.includes('Brace balance differs'));
assert.ok(audit.includes('review time = 0 ownership'));
assert.ok(audit.includes('smaller than the desktop analyzer'));

console.log('Portable web model tests passed');
