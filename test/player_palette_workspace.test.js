'use strict';

const assert = require('assert');
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');

let quickChoice;
let openChoice;
let selectedDef = 'C:\\game\\chars\\Ryu\\Ryu.def';
const targets = [];
const sources = [];
const executed = [];
const registered = {};

const controller = {
  async openTargetWorkspace(uri, options) { targets.push([uri.fsPath, options]); },
  async openSourceWorkspace(uri, options) { sources.push([uri.fsPath, options]); },
  async openStandaloneTemplateWorkspace(options) { executed.push(['standalone-template', options]); }
};
const vscode = {
  Uri: { file: (fsPath) => ({ fsPath }) },
  window: {
    showQuickPick: async (items, options) => {
      assert.strictEqual(options.title, 'Open Palette Workspace');
      return items.find((item) => item.action === quickChoice);
    },
    showOpenDialog: async (options) => {
      assert.deepStrictEqual(options.filters, { 'ACT or indexed PNG': ['act', 'png'] });
      return openChoice ? [{ fsPath: openChoice }] : undefined;
    }
  },
  commands: {
    registerCommand(command, handler) { registered[command] = handler; return { dispose() {} }; },
    async executeCommand(...args) { executed.push(args); }
  }
};

const original = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return vscode;
  if (request === './character_picker') return { chooseCharacterDef: async () => selectedDef, isCharacterDef: () => true };
  if (request === './roster_palette_flow') return { characterSff: () => 'C:\\game\\chars\\Ryu\\Ryu.sff' };
  if (request === './palette_workspace_controller') return { configurePaletteWorkspaceController: () => undefined, paletteWorkspaceController: () => controller };
  if (request === './palette_workshop_browser') return { register: () => undefined };
  return original.call(this, request, parent, main);
};
const workspace = require('../src/player_palette_workspace');

(async () => {
  await workspace.openCanonicalPaletteWorkspace({ fsPath: 'C:\\game\\chars\\Ryu\\Ryu.sff' });
  assert.deepStrictEqual(targets.at(-1), ['C:\\game\\chars\\Ryu\\Ryu.sff', { origin: { surface: 'palette-workspace' } }], 'An explicit SFF must open exactly that archive in the canonical Palette Workspace');

  await workspace.openCanonicalPaletteWorkspace({ fsPath: 'C:\\game\\chars\\Ryu\\Ryu.sff' }, { section: 'template' });
  assert.deepStrictEqual(targets.at(-1), ['C:\\game\\chars\\Ryu\\Ryu.sff', { section: 'template', origin: { surface: 'palette-workspace' } }], 'Task navigation must preserve the requested Palette Workshop section');

  await workspace.openCanonicalPaletteWorkspace({ fsPath: 'C:\\palettes\\Ryu-03.act' });
  assert.deepStrictEqual(sources.at(-1), ['C:\\palettes\\Ryu-03.act', { section: 'sources-preflight', origin: { compatibilityAlias: null } }], 'A standalone ACT must open as a source without guessing a character');

  await workspace.openCanonicalPaletteWorkspace({ fsPath: 'C:\\palettes\\Ryu-template.png' }, { section: 'organize', compatibilityAlias: 'test' });
  assert.deepStrictEqual(sources.at(-1), ['C:\\palettes\\Ryu-template.png', { section: 'organize', origin: { compatibilityAlias: 'test' } }], 'An indexed PNG must retain the requested Palette Workspace section and origin');

  const ownerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-palette-owner-'));
  const stageDef = path.join(ownerRoot, 'stage.def');
  const stageSff = path.join(ownerRoot, 'stage.sff');
  fs.writeFileSync(stageSff, 'fixture');
  fs.writeFileSync(stageDef, '[Camera]\n[StageInfo]\n[BGDef]\nspr = stage.sff\n');
  await workspace.openCanonicalPaletteWorkspace({ fsPath: stageDef });
  assert.strictEqual(targets.at(-1)[0], stageSff, 'An explicit stage DEF must resolve only its assigned SFF');

  const motifDef = path.join(ownerRoot, 'system.def');
  const motifSff = path.join(ownerRoot, 'system.sff');
  fs.writeFileSync(motifSff, 'fixture');
  fs.writeFileSync(motifDef, '[Info]\nname = Test\n[Files]\nspr = system.sff\n[Title Info]\n');
  await workspace.openCanonicalPaletteWorkspace({ fsPath: motifDef });
  assert.strictEqual(targets.at(-1)[0], motifSff, 'An explicit screenpack DEF must resolve only its assigned SFF');

  quickChoice = 'standalone';
  openChoice = 'C:\\palettes\\Ryu-02.act';
  await workspace.openCanonicalPaletteWorkspace();
  assert.strictEqual(sources.at(-1)[0], openChoice, 'A context-free standalone choice must remain explicit');

  await workspace.openPlayerPaletteWorkspace();
  assert.strictEqual(targets.at(-1)[0], 'C:\\game\\chars\\Ryu\\Ryu.sff', 'The compatibility command must resolve a selected character to its assigned SFF');

  await workspace.openPlayerPaletteWorkspace({ fsPath: 'C:\\palettes\\Ryu-04.act' });
  assert.deepStrictEqual(sources.at(-1)[1], { section: 'embedded', origin: { compatibilityAlias: 'ikemen.palettePlayer.open' } }, 'The compatibility command must forward source files into the canonical workspace with provenance');

  selectedDef = '';
  const targetCount = targets.length;
  await workspace.openPlayerPaletteWorkspace();
  assert.strictEqual(targets.length, targetCount, 'Canceling character selection must not open, stage, or write anything');

  const context = { subscriptions: [] };
  workspace.registerPlayerPaletteWorkspace(context);
  assert.deepStrictEqual(Object.keys(registered).sort(), ['ikemen.palette.companionControl', 'ikemen.palette.createScratch', 'ikemen.palette.createTemplate', 'ikemen.palette.externalDrop', 'ikemen.palette.focusWorkshopTool', 'ikemen.palette.openWorkspace', 'ikemen.palette.resumeScratch', 'ikemen.palettePlayer.finishStaged', 'ikemen.palettePlayer.open', 'ikemen.palettePlayer.organize']);
  await registered['ikemen.palette.createTemplate']();
  assert.deepStrictEqual(executed.at(-1), ['standalone-template', {}], 'The standalone template command must not bind to or replace the active character context');
  await registered['ikemen.palettePlayer.organize']({ fsPath: 'C:\\palettes\\Ryu-05.act' });
  assert.deepStrictEqual(executed.at(-1), ['ikemen.palette.openWorkspace', { fsPath: 'C:\\palettes\\Ryu-05.act' }, { section: 'organize', compatibilityAlias: 'ikemen.palettePlayer.organize' }], 'The old organize alias must forward to the canonical Palette Workspace command');

  fs.rmSync(ownerRoot, { recursive: true, force: true });
  console.log('Player Palette Workspace canonical routing and safe cancel tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { Module._load = original; });
