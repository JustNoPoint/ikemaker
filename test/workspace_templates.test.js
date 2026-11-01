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
const wideStage = stageModel(parseDef(stageDef('Wide Stage', 'wide.sff', { localCoord: [1280, 720] })));
assert.deepStrictEqual(wideStage.localCoord, [1280, 720]);
const wideScreenpack = screenpackModel(parseDef(screenpackDef({ localCoord: [1280, 720] })));
assert.deepStrictEqual(wideScreenpack.localCoord, [1280, 720]);
assert.match(fightDef({ localCoord: [1280, 720] }), /p2\.pos = 1200,60/);
assert.match(stageDef('Authored', 'authored.sff', { author: 'Test Author' }), /author = "Test Author"/);
assert.match(screenpackDef({ name: 'My UI', author: 'Test Author' }), /name = "My UI"[\s\S]*author = "Test Author"/);

console.log('Stage and UI starter-template tests passed');
