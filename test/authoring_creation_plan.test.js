'use strict';

const assert = require('assert');
const path = require('path');
const { parseDef, kind } = require('../src/def_model');
const { stageModel } = require('../src/stage_model');
const { screenpackModel } = require('../src/screenpack_model');
const { storyboardModel } = require('../src/storyboard_model');
const { COORDINATE_PROFILES, parseLocalCoord, creationPlan } = require('../src/authoring_creation_plan');

assert.deepStrictEqual(COORDINATE_PROFILES.map(profile => profile.id), ['classic', 'hires', 'widescreen']);
assert.deepStrictEqual(parseLocalCoord('1280 × 720'), [1280, 720]);
assert.deepStrictEqual(parseLocalCoord('640x480'), [640, 480]);
assert.throws(() => parseLocalCoord('wide'), /width,height/);
assert.throws(() => parseLocalCoord('0,240'), /1 to 16384/);

const root = path.resolve('tmp', 'authoring-plan');
const stage = creationPlan('stage', path.join(root, 'arena.def'), { localCoord: [1280, 720], name: 'Arena', author: 'Builder' });
assert.strictEqual(stage.files.length, 2);
assert.strictEqual(stage.files[1].filename, path.join(root, 'arena.sff'));
const stageDocument = parseDef(stage.files[0].content);
assert.strictEqual(kind(stageDocument), 'stage');
assert.deepStrictEqual(stageModel(stageDocument).localCoord, [1280, 720]);
assert.match(stage.files[0].content, /p1startx = -280/);
assert.match(stage.files[0].content, /zoffset = 660/);
assert.match(stage.files[0].content, /author = "Builder"/);

const screenpack = creationPlan('screenpack', path.join(root, 'custom-system.def'), { localCoord: [640, 480] });
assert.strictEqual(screenpack.files.length, 4);
assert.deepStrictEqual(screenpack.files.map(file => path.basename(file.filename)), ['custom-system.def', 'fight.def', 'system.sff', 'fight.sff']);
assert.deepStrictEqual(screenpackModel(parseDef(screenpack.files[0].content)).localCoord, [640, 480]);
assert.deepStrictEqual(screenpackModel(parseDef(screenpack.files[1].content)).localCoord, [640, 480]);
assert.match(screenpack.files[0].content, /menu\.pos = 320,240/);

const story = creationPlan('storyboard', path.join(root, 'ending.def'), { type: 'ending', localCoord: [1280, 720], duration: 240 });
assert.strictEqual(story.files.length, 2);
const storyModel = storyboardModel(parseDef(story.files[0].content));
assert.deepStrictEqual(storyModel.localCoord, [1280, 720]);
assert.strictEqual(storyModel.scenes[0].endTime, 240);
assert.deepStrictEqual(storyModel.scenes[0].layers[0].position, [640, 360]);

assert.throws(() => creationPlan('screenpack', path.join(root, 'fight.def')), /assigns .*fight\.def more than once/);
assert.throws(() => creationPlan('unknown', path.join(root, 'asset.def')), /Unsupported/);

console.log('Guided visual-authoring creation-plan tests passed');
