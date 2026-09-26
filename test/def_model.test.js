'use strict';

const assert = require('assert');
const def = require('../src/def_model');
const { stageModel, parallaxDimensions, validateStage } = require('../src/stage_model');
const { screenpackModel, validateScreenpack } = require('../src/screenpack_model');

const stageText = `
[Info]
name = "Visual Test"
attachedChar = interaction.def
round2def = night.def
[Camera]
boundleft = -500
boundright = 500
zoomout = .75
[PlayerInfo]
p1startx = -120
p2startx = 120
[Bound]
screenleft = 40
[StageInfo]
localcoord = 1280,720
zoffset = 650
[Constants]
WaterGround = 1
[BGDef]
spr = visual.sff
[BG Sky]
type = normal
spriteno = 0, 0
start = 0, -10
delta = .5, .7
layerno = -1
id = 10
[BG Floor]
type = parallax
spriteno = 1, 0
start = 0, 650
xscale = 1, 3
sctrlid = 20
[BG Disabled]
type = normal
spriteno = -1, 0
[BGCtrl Pulse]
type = PalFX
sctrlid = 301
time = 0,60,120
`;
const parsedStage = def.parseDef(stageText, 'visual.def');
assert.strictEqual(def.kind(parsedStage), 'stage');
assert.strictEqual(parsedStage.sections[1].entries[0].line, 2);
const stage = stageModel(parsedStage);
assert.strictEqual(stage.name, 'Visual Test');
assert.deepStrictEqual(stage.localCoord, [1280, 720]);
assert.strictEqual(stage.backgrounds.length, 3);
assert.deepStrictEqual(stage.backgrounds[0].delta, [0.5, 0.7]);
assert.strictEqual(stage.backgrounds[1].sctrlid, 20);
assert.strictEqual(stage.controllers[0].sctrlid, 301);
assert.deepStrictEqual(stage.controllers[0].time, [0, 60, 120]);
assert.deepStrictEqual(parallaxDimensions(stage.backgrounds[1], 200), { top: 200, bottom: 600, source: 200, mode: 'xscale' });
assert.strictEqual(stage.attachedChars[0].path, 'interaction.def');
assert.strictEqual(stage.roundDefs[0].round, 2);
assert.strictEqual(validateStage(stage).filter((item) => item.severity === 'error').length, 0);

const motifText = `
[Info]
name = Sample UI
localcoord = 1280,720
[Files]
spr = system.sff
font1 = fonts/main.def
[Title Info]
menu.pos = 640, 240
menu.item.font = 1,0,0
menu.window = 200,100,1080,650
cursor.spr = 100,0
cursor.offset = 12,4
cursor.layerno = 2
disabled.spr = -1,0
[Select Info]
rows = 3
columns = 4
pos = 100, 120
cell.size = 24, 25
cell.spacing = 2, 3
p1.face.pos = 200,300
p1.face.spr = 9000,1
p1.face.scale = .5,.5
`;
const parsedMotif = def.parseDef(motifText, 'system.def');
assert.strictEqual(def.kind(parsedMotif), 'screenpack');
const motif = screenpackModel(parsedMotif);
assert.deepStrictEqual(motif.localCoord, [1280, 720]);
assert.strictEqual(motif.screens.length, 2);
assert.deepStrictEqual(motif.selectGrid, { sectionLine: 15, rows: 3, columns: 4, position: [100, 120], cellSize: [24, 25], spacing: [2, 3], wrapping: false, showEmptyBoxes: false, moveOverEmptyBoxes: false, cellOverrides: [], skippedCells: [] });
const cursor = motif.screens[0].elements.find((item) => item.name === 'cursor');
assert.deepStrictEqual(cursor.sprite, [100, 0]);
assert.strictEqual(cursor.layer, 2);
assert.strictEqual(validateScreenpack(motif).length, 0);

console.log('DEF, stage, and screenpack model tests passed');
