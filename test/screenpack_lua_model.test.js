'use strict';

const assert = require('assert');
const { parseDef } = require('../src/def_model');
const { screenpackModel } = require('../src/screenpack_model');
const { luaRisk } = require('../src/code_structure_model');

const model = screenpackModel(parseDef(`[Info]
name = "Test"
localcoord = 320, 240

[Files]
spr = system.sff
module = modules/screenpack.lua
`, 'system.def'));
assert.strictEqual(model.module, 'modules/screenpack.lua');
assert.strictEqual(luaRisk('local motif = {}', 'data/test/modules/screenpack.lua').level, 'safe');

console.log('Screenpack Lua integration model tests passed');
