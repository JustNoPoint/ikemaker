'use strict';

const assert = require('assert');
const Module = require('module');

let quickChoice, openChoice, selectedDef = 'C:\\game\\chars\\Ryu\\Ryu.def', routed = [], executed = [], registered = {};
const vscode = {
  window: {
    showQuickPick: async (items, options) => {
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
  if (request === './roster_palette_flow') return { routeRosterPalette: async (...args) => routed.push(args) };
  return original.call(this, request, parent, main);
};
const workspace = require('../src/player_palette_workspace');
Module._load = original;

(async () => {
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
  assert.deepStrictEqual(Object.keys(registered).sort(), ['ikemen.palettePlayer.finishStaged', 'ikemen.palettePlayer.open', 'ikemen.palettePlayer.organize']);
  await registered['ikemen.palettePlayer.organize']({ fsPath: 'C:\\palettes' });
  assert.strictEqual(executed.at(-1)[0], 'ikemen.paletteOrganizer.open', 'Player alias should route to the palette-only organizer');
  await registered['ikemen.palettePlayer.finishStaged']({ fsPath: 'C:\\game\\chars\\Ryu\\Ryu.sff' });
  assert.deepStrictEqual(executed.at(-1), ['sff.buildApprovedManifest', { paletteSourceSff: 'C:\\game\\chars\\Ryu\\Ryu.sff' }]);
  assert(!executed.some(([command]) => command === 'sff.openViewer' || command === 'ikemen.paletteImport.open'));
  console.log('Player Palette Workshop exposes reviewed palette-only routes and safe cancel behavior');
})().catch((error) => { console.error(error); process.exitCode = 1; });
