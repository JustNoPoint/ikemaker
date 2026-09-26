'use strict';

const assert = require('assert');
const { parseDef, kind } = require('../src/def_model');
const { stageDef, screenpackDef, fightDef } = require('../src/workspace_templates');
const { stageModel } = require('../src/stage_model');
const { screenpackModel } = require('../src/screenpack_model');

const stage = parseDef(stageDef('Test Stage', 'test.sff'));
assert.strictEqual(kind(stage), 'stage');
assert.strictEqual(stageModel(stage).name, 'Test Stage');
assert.strictEqual(stageModel(stage).sff, 'test.sff');
const screenpack = parseDef(screenpackDef());
assert.strictEqual(kind(screenpack), 'screenpack');
assert.strictEqual(screenpackModel(screenpack).sff, 'system.sff');
const fight = parseDef(fightDef());
assert.strictEqual(kind(fight), 'lifebar');
assert.strictEqual(screenpackModel(fight).sff, 'fight.sff');

console.log('Stage and UI starter-template tests passed');
