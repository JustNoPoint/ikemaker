'use strict';

const assert = require('assert');
const { parseCodeStructure, parseZssStructure, parseCnsStructure, parseLuaStructure, flatten, luaRisk } = require('../src/code_structure_model');

const zss = parseZssStructure(`[StateDef -1]
if command = "x" {
  changeState{value: 200}
}

[Function JNP_Test(value) ret]
let ret = value;
`);
const zssNodes = flatten(zss);
assert.deepStrictEqual(zss.children.map((item) => item.kind), ['state', 'function']);
assert.ok(zssNodes.some((item) => item.kind === 'condition' && item.title.includes('command')));
assert.ok(zssNodes.some((item) => item.kind === 'controller' && item.title === 'changeState'));
assert.ok(zssNodes.some((item) => item.kind === 'assignment' && item.title === 'let ret'));

const lua = parseLuaStructure(`local menu = require("menu")
local function drawOptions()
  if motif then
    return true
  end
end
`, 'data/motif/custom_module.lua');
const luaNodes = flatten(lua);
assert.ok(luaNodes.some((item) => item.kind === 'require'));
assert.ok(luaNodes.some((item) => item.kind === 'function' && item.title === 'drawOptions'));
assert.ok(luaNodes.some((item) => item.kind === 'condition'));
assert.strictEqual(lua.risk.level, 'safe');
assert.strictEqual(luaRisk('assertInput(1, "x")', 'chars/test/runtime.lua').level, 'unsafe');
assert.strictEqual(luaRisk('local value = 1', 'unknown.lua').level, 'review');

const cns = parseCnsStructure(`[Statedef 200]\ntype = S\nmovetype = A\nphysics = S\n\n[State 200, Hit]\ntype = HitDef\ntrigger1 = AnimElem = 2\nattr = S, NA\ndamage = 30, 0\n\n[State 200, End]\ntype = ChangeState\ntrigger1 = AnimTime = 0\nvalue = 0\nctrl = 1\n`);
assert.strictEqual(cns.language, 'cns');
const cnsNodes = flatten(cns);
assert.ok(cnsNodes.some((item) => item.kind === 'state' && item.title === 'State 200'));
const cnsHitDef = cnsNodes.find((item) => item.kind === 'controller' && item.title === 'HitDef');
assert.ok(cnsHitDef);
assert.ok(cnsHitDef.children.some((item) => item.kind === 'condition' && item.signature.includes('trigger1')));
assert.ok(cnsHitDef.children.some((item) => item.kind === 'assignment' && item.title === 'damage'));
assert.strictEqual(parseCodeStructure('[Statedef 0]\n', 'cns').language, 'cns');

console.log('Visual code structure model tests passed');
