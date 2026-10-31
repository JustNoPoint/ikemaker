'use strict';

const assert = require('assert');
const { parseCodeStructure, flatten } = require('../src/code_structure_model');
const { attachCodeBlockInsights } = require('../src/code_block_insights');

const zss = `[StateDef 200]\nif false {\n  changeState { value: 0; }\n}\nwhile time {\n  turn {}\n}\n[Function Empty()]\n`;
const zssRoot = parseCodeStructure(zss, 'zss', 'test.zss');
attachCodeBlockInsights(zssRoot, zss, 'zss');
const zssNodes = flatten(zssRoot);
const disabled = zssNodes.find((node) => node.kind === 'condition');
assert(disabled.insights.some((item) => item.code === 'literal-false-condition'));
assert(zssNodes.find((node) => node.kind === 'loop').insights.some((item) => item.code === 'loop-progress'));
assert(zssNodes.find((node) => node.kind === 'function').insights.some((item) => item.code === 'empty-structure'));

const cns = `[StateDef 200]\ntype = S\n[State 200, disabled]\ntype = ChangeState\ntriggerall = 0\nvalue = 0\n`;
const cnsRoot = parseCodeStructure(cns, 'cns', 'test.cns');
attachCodeBlockInsights(cnsRoot, cns, 'cns');
assert(flatten(cnsRoot).find((node) => node.kind === 'controller').insights.some((item) => item.code === 'literal-false-triggerall'));

const clean = `[StateDef 0]\nturn {}\n`;
const cleanRoot = parseCodeStructure(clean, 'zss', 'clean.zss');
attachCodeBlockInsights(cleanRoot, clean, 'zss');
assert.strictEqual(flatten(cleanRoot).find((node) => node.kind === 'controller').insightSummary, 'No local static blocker found');

console.log('Code block insights keep literal blockers, analyzer findings and uncertainty visible');
