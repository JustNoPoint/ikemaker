'use strict';

const assert = require('assert');
const Module = require('module');
const original = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return { window: {}, workspace: {}, commands: {}, Uri: { file: (fsPath) => ({ fsPath }) }, ViewColumn: {}, env: { clipboard: {} }, DiagnosticSeverity: { Error: 0, Warning: 1 } };
  return original.call(this, request, parent, main);
};
const { converterHtml, totals } = require('../src/cns_converter_workspace');
Module._load = original;

const file = { mode: 'file', title: 'normal.cns', source: 'normal.cns', target: 'normal.zss', sourceText: '[StateDef 200]', text: '[StateDef 200]', experience: 'learning', counts: { safe: 2, review: 1, unsupported: 0 }, findings: [{ level: 'review', line: 0, message: 'Review timing.' }], canWrite: true };
const page = converterHtml(file);
assert.match(page, /CNS → ZSS Converter/);
assert.match(page, /CNS source/);
assert.match(page, /ZSS preview/);
assert.match(page, /Save ZSS As/);
assert.match(page, /Related Work/);
assert.match(page, /Ctrl\+Alt\+F5/);
assert.match(page, /globalThis\.ikemenNavigationSelection=\(\)=>\(\{mode:model\.mode,index,source:current\(\)\.source\|\|model\.source\}\)/);
assert.match(page, /reference\.mode===model\.mode/);
assert.match(page, /key\(files\[reference\.index\]\?\.source\|\|model\.source\)===key\(reference\.source\)/);
assert.deepStrictEqual(totals(file), file.counts);

const character = { mode: 'character', title: 'Ryu', source: 'Ryu.def', defPath: 'Ryu.def', defText: '', experience: 'advanced', findings: [], files: [{ ...file, counts: { safe: 4, review: 2, unsupported: 0 } }], canWrite: true };
const batch = converterHtml(character);
assert.match(batch, /Save All ZSS/);
assert.match(batch, /Save All \+ Update DEF/);
assert.deepStrictEqual(totals(character), { safe: 4, review: 2, unsupported: 0 });

console.log('CNS-to-ZSS converter workspace tests passed');
