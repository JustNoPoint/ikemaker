'use strict';

const assert = require('assert');
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');

let quickChoice, openChoice, selectedDef = 'C:\\game\\chars\\Ryu\\Ryu.def', routed = [], executed = [], registered = {};
const vscode = {
  window: {
    showQuickPick: async (items, options) => {
      if (options.title === 'Open Palette Workspace') return items.find((item) => item.action === quickChoice);
      assert.strictEqual(options.title, 'Player Palette Workshop');
      assert(items.every((item) => !/code|sprite authoring/i.test(item.label)));
      return items.find((item) => item.action === quickChoice);
    },
    showOpenDialog: async (options) => {
      assert.deepStrictEqual(options.filters, { 'ACT or indexed PNG palette': ['act', 'png'] });
      return openChoice ? [{ fsPath: openChoice }] : undefined;
    },
    showWarningMessage: async () => 'Continue to Reviewed Build'
  },
  commands: {
    registerCommand(command, handler) { registered[command] = handler; return { dispose() {} }; },
    async executeCommand(...args) { executed.push(args); }
  }
};
const original = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return vscode;
  if (request === './character_picker') return { chooseCharacterDef: async () => selectedDef };
  if (request === './roster_palette_flow') return { routeRosterPalette: async (...args) => routed.push(args), characterSff: () => 'C:\\game\\chars\\Ryu\\Ryu.sff' };
  return original.call(this, request, parent, main);
};
const workspace = require('../src/player_palette_workspace');
Module._load = original;

(async () => {
  await workspace.openCanonicalPaletteWorkspace({ fsPath: 'C:\\game\\chars\\Ryu\\Ryu.sff' });
  assert.deepStrictEqual(executed.at(-1), ['sff.openViewer', { fsPath: 'C:\\game\\chars\\Ryu\\Ryu.sff' }, undefined, { destination: 'palette' }], 'An explicit SFF must open exactly that archive');
  await workspace.openCanonicalPaletteWorkspace({ fsPath: 'C:\\palettes\\Ryu-03.act' });
  assert.deepStrictEqual(executed.at(-1), ['ikemen.paletteOrganizer.open', { fsPath: 'C:\\palettes\\Ryu-03.act' }], 'A standalone ACT must not guess a character');
  const ownerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-palette-owner-'));
  const stageDef = path.join(ownerRoot, 'stage.def'), stageSff = path.join(ownerRoot, 'stage.sff');
  fs.writeFileSync(stageSff, 'fixture');
  fs.writeFileSync(stageDef, '[Camera]\n[StageInfo]\n[BGDef]\nspr = stage.sff\n');
  await workspace.openCanonicalPaletteWorkspace({ fsPath: stageDef });
  assert.deepStrictEqual(executed.at(-1), ['sff.openViewer', { fsPath: stageSff }, undefined, { destination: 'palette' }], 'An explicit stage DEF should resolve only its assigned SFF');
  const motifDef = path.join(ownerRoot, 'system.def'), motifSff = path.join(ownerRoot, 'system.sff');
  fs.writeFileSync(motifSff, 'fixture');
  fs.writeFileSync(motifDef, '[Info]\nname = Test\n[Files]\nspr = system.sff\n[Title Info]\n');
  await workspace.openCanonicalPaletteWorkspace({ fsPath: motifDef });
  assert.deepStrictEqual(executed.at(-1), ['sff.openViewer', { fsPath: motifSff }, undefined, { destination: 'palette' }], 'An explicit screenpack DEF should resolve only its assigned SFF');
  quickChoice = 'standalone';
  await workspace.openCanonicalPaletteWorkspace();
  assert.strictEqual(executed.at(-1)[0], 'ikemen.paletteOrganizer.open', 'A context-free standalone choice must remain explicit');

  quickChoice = 'workspace';
  await workspace.openPlayerPaletteWorkspace();
  assert.deepStrictEqual(executed.at(-1), ['sff.openViewer', { fsPath: 'C:\\game\\chars\\Ryu\\Ryu.sff' }, undefined, { destination: 'palette' }]);

  quickChoice = 'apply'; openChoice = 'C:\\palettes\\Ryu-02.act';
  await workspace.openPlayerPaletteWorkspace();
  assert.deepStrictEqual(routed, [[selectedDef, openChoice]], 'Player palette placement must reuse the reviewed preview/apply flow');

  quickChoice = 'organize';
  await workspace.openPlayerPaletteWorkspace({ fsPath: 'C:\\palettes' });
  assert.strictEqual(executed.at(-1)[0], 'ikemen.palettePlayer.organize');

  quickChoice = 'folder';
  await workspace.openPlayerPaletteWorkspace();
  assert.strictEqual(executed.at(-1)[0], 'ikemen.openPaletteFolder');

  selectedDef = ''; quickChoice = 'apply'; openChoice = 'C:\\palettes\\unused.act';
  const before = routed.length;
  await workspace.openPlayerPaletteWorkspace();
  assert.strictEqual(routed.length, before, 'Canceling character selection must not stage or write a palette');

  const context = { subscriptions: [] };
  workspace.registerPlayerPaletteWorkspace(context);
  assert.deepStrictEqual(Object.keys(registered).sort(), ['ikemen.palette.openWorkspace', 'ikemen.palettePlayer.finishStaged', 'ikemen.palettePlayer.open', 'ikemen.palettePlayer.organize']);
  await registered['ikemen.palettePlayer.organize']({ fsPath: 'C:\\palettes' });
  assert.strictEqual(executed.at(-1)[0], 'ikemen.paletteOrganizer.open', 'Player alias should route to the palette-only organizer');
  await registered['ikemen.palettePlayer.finishStaged']({ fsPath: 'C:\\game\\chars\\Ryu\\Ryu.sff' });
  assert.deepStrictEqual(executed.at(-1), ['sff.buildApprovedManifest', { paletteSourceSff: 'C:\\game\\chars\\Ryu\\Ryu.sff' }]);
  assert(executed.some(([command]) => command === 'sff.openViewer'));
  assert(!executed.some(([command]) => command === 'ikemen.paletteImport.open'));
  fs.rmSync(ownerRoot, { recursive: true, force: true });
  console.log('Player Palette Workshop exposes reviewed palette-only routes and safe cancel behavior');
})().catch((error) => { console.error(error); process.exitCode = 1; });
