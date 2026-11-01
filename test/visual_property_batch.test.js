'use strict';

const assert = require('assert');
const { parseDef } = require('../src/def_model');
const { batchSetEntries, inheritSectionEntries, batchSummary } = require('../src/visual_property_batch');

const source = '[BG One]\ntype = normal\ndelta = 1,1\nstart = 0,0\n\n[BG Two]\ntype = normal\nstart = 20,30\n\n[BG Three]\ntype = anim\nactionno = 5\n';
const lines = Object.fromEntries(parseDef(source).sections.filter(section => section.name).map(section => [section.name, section.line]));

const missing = batchSetEntries(source, [lines['BG Two'], lines['BG Three']], { delta: '0.5,0.5', layerno: '-1' }, { mode: 'missing' });
assert.match(missing.text, /\[BG Two\][\s\S]*delta = 0\.5,0\.5[\s\S]*layerno = -1/);
assert.match(missing.text, /\[BG Three\][\s\S]*delta = 0\.5,0\.5[\s\S]*layerno = -1/);
assert.strictEqual(missing.applied.length, 4);

const overwrite = batchSetEntries(source, [lines['BG One'], lines['BG Two']], { start: '100,200' });
assert.strictEqual(overwrite.applied.length, 2);
assert(overwrite.applied.every(item => item.previous));
assert.strictEqual((overwrite.text.match(/start = 100,200/g) || []).length, 2);

const inherited = inheritSectionEntries(source, lines['BG One'], [lines['BG Two'], lines['BG Three']], ['delta'], { mode: 'missing' });
assert.strictEqual((inherited.text.match(/delta = 1,1/g) || []).length, 3);
assert.strictEqual(batchSummary(inherited), '2 property change(s) across 2 section(s).');

const retained = inheritSectionEntries(source, lines['BG One'], [lines['BG Two']], ['type'], { mode: 'missing' });
assert.strictEqual(retained.applied.length, 0);
assert.strictEqual(retained.skipped.length, 1);
assert.match(batchSummary(retained), /existing value/);

assert.throws(() => batchSetEntries(source, [], { start: '0,0' }), /target section/);
assert.throws(() => batchSetEntries(source, [lines['BG One']], { 'bad\nkey': 'x' }), /Invalid property/);
assert.throws(() => inheritSectionEntries(source, lines['BG One'], [lines['BG One']], ['delta']), /different target/);
console.log('Reviewed visual property inheritance and batch-edit planning tests passed');
