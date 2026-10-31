'use strict';

const assert = require('assert');
const grammar = require('../syntaxes/cns.tmLanguage.json');

assert.deepStrictEqual(grammar.patterns.map((item) => item.include).slice(0, 4), ['#comments', '#sections', '#commands', '#assignments'], 'command sequences are recognized before the generic assignment fallback');
const command = grammar.repository.commands.patterns[0], patterns = command.patterns;
assert.strictEqual(command.begin, '^\\s*(command)(\\s*=\\s*)');
assert(patterns.some((item) => item.name === 'keyword.operator.command.modifier.ikemen-cns' && new RegExp(item.match).test('*')), 'the native CMD editor colors the verified Nightly star modifier as command syntax');
assert(patterns.some((item) => item.name === 'keyword.operator.command.modifier.ikemen-cns' && new RegExp(item.match).test('~45')), 'release durations remain one command modifier token');
assert(patterns.some((item) => item.name === 'constant.language.command.direction.ikemen-cns' && new RegExp(item.match).test('DF')), 'directions have a dedicated semantic scope');
assert(patterns.some((item) => item.name === 'variable.language.command.button.ikemen-cns' && new RegExp(item.match).test('x')), 'buttons have a dedicated semantic scope');
assert(patterns.some((item) => item.name === 'keyword.operator.command.relation.ikemen-cns' && new RegExp(item.match).test('|')), 'sequence relations have a dedicated semantic scope');
assert.strictEqual(patterns[0].include, '#comments', 'semicolon comments still end command tokenization safely');

console.log('Native CMD grammar colors command inputs, modifiers, relations, and Nightly star syntax');
