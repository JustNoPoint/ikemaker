'use strict';

const assert = require('assert');
const Module = require('module');

const original = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return { window: {}, workspace: {}, commands: {}, Uri: {}, env: {}, UIKind: { Web: 2 } };
  return original.call(this, request, parent, main);
};
const { SOURCE_FILE_TYPES, sourceFileTemplate } = require('../src/asset_creation');
Module._load = original;

assert.deepStrictEqual(SOURCE_FILE_TYPES.map((item) => item.extension), ['zss', 'cns', 'inp', 'cmd', 'def', 'lua', 'txt']);
assert.strictEqual(new Set(SOURCE_FILE_TYPES.map((item) => item.command)).size, SOURCE_FILE_TYPES.length);
for (const item of SOURCE_FILE_TYPES) {
  const content = sourceFileTemplate(item.extension);
  assert(content.endsWith('\n'));
  assert(content.toLowerCase().includes(item.extension));
}
assert(sourceFileTemplate('lua').startsWith('--'));
assert(sourceFileTemplate('zss').startsWith(';'));

console.log('Individual source-file creation tests passed');
