'use strict';

const assert = require('assert');
const { planControllerOptionInsertion, applyInsertion } = require('../src/controller_option_mutation');

const zss = '[StateDef 200]\r\nhitDef{\r\n\tcustom.option : keep(me) ; # unknown stays\r\n\tdamage: 20, 0;\n}\r\n';
let plan = planControllerOptionInsertion(zss, { syntax: 'zss', startLine: 1, endLine: 4, name: 'guardflag', value: 'MA' });
assert.strictEqual(plan.text, '\tguardflag: MA;\n', 'the insertion uses the line ending local to the closing boundary in a mixed-EOL source');
let after = applyInsertion(zss, plan);
assert(after.includes('\tcustom.option : keep(me) ; # unknown stays\r\n'), 'unknown fields, spacing, expressions and comments remain byte-identical');
assert.strictEqual(after.slice(0, plan.offset) + after.slice(plan.offset + plan.text.length), zss, 'removing the one inserted byte range restores the exact source');

const inline = 'playSnd{value: S1,0; custom: "}";}';
plan = planControllerOptionInsertion(inline, { syntax: 'zss', startLine: 0, endLine: 0, name: 'channel', value: '4' });
after = applyInsertion(inline, plan);
assert.strictEqual(after.slice(0, plan.offset) + after.slice(plan.offset + plan.text.length), inline, 'inline controllers and quoted braces also round-trip exactly');
assert(after.includes('custom: "}";\n\tchannel: 4;\n}'));

const cns = '[State 200, Custom]\r\ntype = CustomController\r\ncustom = first ; keep\r\ncustom = second ; duplicate stays\n[State 201, Next]\r\ntype = Null\r\n';
plan = planControllerOptionInsertion(cns, { syntax: 'cns', startLine: 0, endLine: 3, name: 'documented', value: '42' });
after = applyInsertion(cns, plan);
assert.strictEqual(plan.text, 'documented = 42\n', 'CNS insertion uses the immediately local mixed line ending');
assert.strictEqual(after.slice(0, plan.offset) + after.slice(plan.offset + plan.text.length), cns, 'comments, duplicate custom fields, spacing and mixed line endings are untouched');
assert.throws(() => planControllerOptionInsertion(zss, { syntax: 'zss', startLine: 1, name: 'bad name', value: '1' }), /invalid/);
assert.throws(() => planControllerOptionInsertion(zss, { syntax: 'zss', startLine: 1, name: 'damage', value: '1\n2' }), /one reviewed line/);
console.log('Byte-safe generic controller option insertion plan tests passed');
