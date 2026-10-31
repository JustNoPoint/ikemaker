'use strict';

const assert = require('assert');
const { parseDef } = require('../src/def_model');
const { expectedSpriteIdentities, verifySffIdentities, adoptGeneratedSource } = require('../src/layered_psd_adoption');

const expected = expectedSpriteIdentities([
  { id: 'front', name: 'Front', sprite: [30, 100] },
  { id: 'back', name: 'Back', sprite: [30, 101] }
]);
assert.deepStrictEqual(expected.map(item => item.key), ['30,100', '30,101']);
assert.throws(() => expectedSpriteIdentities([{ id: 'a', sprite: [1, 2] }, { id: 'b', sprite: [1, 2] }]), /more than once/);

let verification = verifySffIdentities({ sprites: [{ group: 30, number: 100 }, { group: 30, number: 101 }] }, expected);
assert.strictEqual(verification.ok, true);
assert.strictEqual(verification.present.length, 2);
verification = verifySffIdentities({ sprites: [{ group: 30, number: 100 }, { group: 30, number: 100 }] }, expected);
assert.strictEqual(verification.ok, false);
assert.deepStrictEqual(verification.missing.map(item => item.key), ['30,101']);
assert.deepStrictEqual(verification.ambiguous.map(item => item.key), ['30,100']);

const stageSource = '[Info]\nname = Test\n\n[Camera]\nstartx = 0\n';
const stageCode = '[BG PSD Sky]\ntype = normal\nspriteno = 30,100\n';
const adoptedStage = adoptGeneratedSource(stageSource, { target: 'stage', code: stageCode });
assert.match(adoptedStage, /\[BG PSD Sky\]/);
assert.throws(() => adoptGeneratedSource(adoptedStage, { target: 'stage', code: stageCode }), /already exists/);

const uiSource = '[Info]\nname = UI\n';
const adoptedUi = adoptGeneratedSource(uiSource, { target: 'ui', code: '[TitleBG 4]\ntype = normal\nspriteno = 40,0' });
assert(parseDef(adoptedUi).sections.some(section => section.name === 'TitleBG 4'));

const storySource = '[Info]\nlocalcoord = 320,240\n\n[SceneDef]\nspr = story.sff\n\n[Scene 0]\nend.time = 180\n\n[Scene 1]\nend.time = 180\n';
const storyCode = '; PSD layer\nlayer1.offset = 160,120\nlayer1.spr = 50,5\nlayer1.starttime = 0';
const adoptedStory = adoptGeneratedSource(storySource, { target: 'story', targetName: 'Scene 0', code: storyCode });
const scene0 = parseDef(adoptedStory).sections.find(section => section.name === 'Scene 0');
assert(scene0.entries.some(entry => entry.normalized === 'layer1.spr'));
assert.throws(() => adoptGeneratedSource(adoptedStory, { target: 'story', targetName: 'Scene 0', code: storyCode }), /already exists/);
assert.throws(() => adoptGeneratedSource(storySource, { target: 'story', targetName: 'Scene 9', code: storyCode }), /no longer exists/);

console.log('Layered PSD SFF verification and reviewed source-adoption tests passed');
