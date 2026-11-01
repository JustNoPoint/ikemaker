'use strict';

const assert = require('assert');
const structures = require('../src/zss_structures');

assert.ok(structures.STRUCTURES.length >= 30, 'the catalog exposes the full ground-level vocabulary');
for (const id of ['if', 'ifElse', 'ifElseIfElse', 'ignoreHitPauseIf', 'switch', 'for', 'functionParameters', 'functionReturn', 'mapAssign', 'stateDef', 'countdown', 'targetGuard']) {
  assert.ok(structures.structureById(id), `missing structure ${id}`);
}

const wrapped = structures.wrapSnippet(structures.structureById('if'), 'map(Test) := 1;', { eol: '\r\n', indentUnit: '  ' });
assert.ok(wrapped.includes('if ${1:condition} {\r\n  map(Test) := 1;\r\n}'));
assert.ok(wrapped.endsWith('${0}'));

const nested = structures.wrapSnippet(structures.structureById('targetGuard'), 'if time = 0 {\n\tchangeAnim{value: 200}\n}', { indentUnit: '\t' });
assert.ok(nested.includes('if numTarget {'));
assert.ok(nested.includes('\tif time = 0 {'));
assert.ok(nested.includes('\t\tchangeAnim{value: 200\\}'), 'selected closing braces must be escaped for SnippetString insertion');

const escaped = structures.wrapSnippet(structures.structureById('if'), 'let value = $source;', {});
assert.ok(escaped.includes('\\$source'), 'selected ZSS locals must remain literal snippet text');

const functionTemplate = structures.structureById('functionReturn').snippet;
assert.ok(functionTemplate.startsWith('[Function '));
assert.ok(!functionTemplate.includes('{\n'), 'ZSS Function bodies are not brace-delimited');

assert.ok(structures.structuresForGroup('loops', 'repeat').length >= 1);

console.log('zss structure catalog tests passed');
