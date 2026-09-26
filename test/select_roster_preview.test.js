'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseSelectDef } = require('../src/select_def_model');
const { rosterCells, resolveCharacterDef, motifPreview, reorderCharacterLines, gameRoot } = require('../src/select_roster_preview');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemen-roster-preview-'));
try {
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', 'system.base.def'), '');
  const selectFile = path.join(root, 'data', 'select.def');
  const source = '[Characters]\r\nA, order=1\r\nslot = {\r\nB\r\nC\r\n}\r\nD, order=2\r\nE, exclude=1\r\n';
  fs.writeFileSync(selectFile, source);
  const model = parseSelectDef(source), cells = rosterCells(model);
  assert.strictEqual(cells.length, 3);
  assert.strictEqual(cells[0].name, 'A');
  assert.strictEqual(cells[1].kind, 'slot');
  assert.strictEqual(cells[1].members.length, 2);
  assert.strictEqual(cells[1].draggable, false);
  const normal = model.characters.filter((entry) => !entry.inSlot);
  const reordered = reorderCharacterLines(source, [normal[1].line, normal[0].line]);
  assert.ok(reordered.includes('[Characters]\r\nD, order=2\r\nslot = {\r\nB\r\nC\r\n}\r\nA, order=1'));
  assert.throws(() => reorderCharacterLines(source, [normal[0].line]), /changed while the preview order was pending/);

  const characterFolder = path.join(root, 'chars', 'A'); fs.mkdirSync(characterFolder, { recursive: true });
  const characterDef = path.join(characterFolder, 'A.def'); fs.writeFileSync(characterDef, '[Info]\nname=A\n[Files]\nsprite=A.sff\n');
  assert.strictEqual(resolveCharacterDef(selectFile, 'A'), characterDef);
  assert.strictEqual(resolveCharacterDef(selectFile, 'randomselect'), '');

  const motifFile = path.join(root, 'data', 'system.def');
  fs.writeFileSync(motifFile, '[Info]\nname=Test\nlocalcoord=640,360\n[Select Info]\nrows=2\ncolumns=3\npos=100,80\ncell.size=24,25\ncell.spacing=2,3\ncell.1-0.skip=1\ncell.2-1.skip=1\nportrait.spr=9000,0\nportrait.scale=.5,.5\n[SelectBG animated]\ntype=anim\nactionno=20\nstart=-320,0\n[Begin Action 20]\n0,-1,0,0,10\n22,0,7,8,2\n');
  const motif = motifPreview(motifFile);
  assert.strictEqual(motif.state, 'ready');
  assert.deepStrictEqual(motif.localCoord, [640, 360]);
  assert.deepStrictEqual(motif.grid.skippedCells, [[1, 0], [2, 1]]);
  assert.strictEqual(motif.grid.cellOverrides.length, 2);
  assert.deepStrictEqual(motif.portraitSpec.sprite, [9000, 0]);
  assert.deepStrictEqual(motif.faceSpecs.p1.sprite, [9000, 1]);
  assert.deepStrictEqual(motif.faceSpecs.p2.sprite, [9000, 1]);
  assert.strictEqual(motif.faceSpecs.p2.facing, -1);
  assert.strictEqual(motif.backgrounds.length, 1);
  assert.deepStrictEqual(motif.backgrounds[0].sprite, [22, 0]);
  assert.deepStrictEqual(motif.backgrounds[0].frameOffset, [7, 8]);
} finally { fs.rmSync(root, { recursive: true, force: true }); }

const packagedParent = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemen-packaged-parent-'));
try {
  const packagedRoot = path.join(packagedParent, 'Renamed Game');
  fs.mkdirSync(path.join(packagedRoot, 'data'), { recursive: true });
  fs.mkdirSync(path.join(packagedRoot, 'chars'), { recursive: true });
  fs.writeFileSync(path.join(packagedRoot, 'data', 'select.def'), '[Characters]\n');
  fs.writeFileSync(path.join(packagedParent, 'Ikemen_GO.exe'), 'parent marker');
  assert.strictEqual(gameRoot(path.join(packagedRoot, 'data', 'select.def')), packagedRoot);
} finally { fs.rmSync(packagedParent, { recursive: true, force: true }); }

console.log('Roster select-screen preview tests passed');
