'use strict';

const assert = require('assert');
const { parseDef } = require('../src/def_model');
const { storyboardModel } = require('../src/storyboard_model');
const components = require('../src/visual_component_model');

const stage = '[BGDef]\nspr = stage.sff\n\n[BG Clouds]\ntype = normal\nspriteno = 2,3\nstart = 10,20\ndelta = 0.5,0.5\nlayerno = -1\n';
const stageDocument = parseDef(stage), cloudLine = stageDocument.sections.find(section => section.name === 'BG Clouds').line;
const cloud = components.captureSection(stage, cloudLine, 'stage-background', { name: 'Cloud bank' });
assert.strictEqual(cloud.entries[1].value, '2,3');
const insertedCloud = components.insertSectionComponent(stage, cloud, { name: 'Clouds' });
assert.strictEqual(insertedCloud.identity, 'BG Clouds 2');
assert.match(insertedCloud.text, /\[BG Clouds 2\][\s\S]*spriteno = 2,3/);

const story = '[Info]\nlocalcoord = 320,240\n[SceneDef]\nspr = story.sff\n[Scene 0]\nclearcolor = 0,0,0\nlayer0.offset = 160,120\nlayer0.spr = 0,0\nend.time = 180\n';
const storyDocument = parseDef(story), sceneLine = storyDocument.sections.find(section => section.name === 'Scene 0').line;
const scene = components.captureSection(story, sceneLine, 'storyboard-scene');
const insertedScene = components.insertSectionComponent(story, scene);
assert.strictEqual(insertedScene.identity, 1);
assert.strictEqual(storyboardModel(parseDef(insertedScene.text)).scenes.length, 2);

const ui = '[Title Info]\nmenu.pos = 160,120\nmenu.spr = 1,0\nmenu.layerno = 1\nother.spr = 2,0\n';
const titleLine = parseDef(ui).sections.find(section => section.name === 'Title Info').line;
const menu = components.captureUiElement(ui, titleLine, 'menu');
assert.deepStrictEqual(menu.entries.map(item => item.key), ['pos', 'spr', 'layerno']);
const insertedMenu = components.insertUiElement(ui, titleLine, menu);
assert.strictEqual(insertedMenu.identity, 'menu2');
assert.match(insertedMenu.text, /menu2\.pos = 160,120/);
assert.strictEqual(components.uniqueUiBase(ui,titleLine,'menu'),'menu2');
assert.strictEqual(components.uniqueUiBase(ui,titleLine,'fresh.element'),'fresh.element');

let store = components.normalizeStore();
store = components.upsert(store, cloud); store = components.upsert(store, menu);
assert.strictEqual(store.components.length, 2);
store = components.remove(store, cloud.id);
assert.deepStrictEqual(store.components.map(item => item.id), [menu.id]);

assert.throws(() => components.captureUiElement(ui, titleLine, 'missing'), /No missing/);
assert.throws(() => components.insertSectionComponent(stage, menu), /UI element insertion/);
console.log('Reusable visual component capture, allocation, and insertion tests passed');
