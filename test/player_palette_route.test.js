'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemen-player-palette-route-'));
const defPath = path.join(root, 'Ryu.def'), sffPath = path.join(root, 'Ryu.sff'), actPath = path.join(root, 'Ryu-02.act');
fs.writeFileSync(defPath, '[Files]\nsprite = Ryu.sff\n'); fs.writeFileSync(sffPath, 'fixture'); fs.writeFileSync(actPath, Buffer.alloc(768, 1));

let panelHandler, staged, commands = [], information = 'Finish Color Update', inputs = ['1', '2'];
const panel = { webview: { html: '', cspSource: 'fixture', onDidReceiveMessage(handler) { panelHandler = handler; }, postMessage(message) { panel.lastMessage = message; } }, dispose() { panel.disposed = true; } };
const vscode = {
  ConfigurationTarget: { Global: 1 }, ViewColumn: { Active: 1 }, Uri: { file: (fsPath) => ({ fsPath }) },
  workspace: { getConfiguration: () => ({ get: () => 'reversed', update: async () => {} }) },
  window: {
    showQuickPick: async (items) => items.find((item) => item.newSlot),
    showInputBox: async () => inputs.shift(),
    createWebviewPanel: () => panel,
    showInformationMessage: async () => information
  },
  commands: { executeCommand: async (...args) => commands.push(args) }
};
const archive = { buffer: Buffer.alloc(1), palettes: [{ group: 1, number: 1, colors: 256, dataSize: 768, index: 0 }], sprites: [{ group: 0, number: 0, colorDepth: 8, paletteIndex: 0 }] };
const original = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return vscode;
  if (request === './sff_reader') return { readSff: () => archive, actRgba: () => Array.from({ length: 256 }, (_, i) => [i, 0, 0, 255]), spriteDataUri: (_archive, _sprite, colors) => `preview:${colors?.[0]?.[0] ?? 'current'}` };
  if (request === './palette_library') return { pngPaletteRgba: () => [] };
  if (request === './palette_plan') return { stagePalette: (...args) => { staged = args; return { filename: 'plan.json' }; } };
  if (request === './viewer_group') return { preferredViewerColumn: () => 1, trackViewerPanel: (value) => value };
  if (request === './webview_policy') return { protect: (value) => value };
  if (request === './mutation_safety') return { hash: () => '', transactionalWrite() {}, optionsFromConfig: () => ({}) };
  return original.call(this, request, parent, main);
};
const flow = require('../src/roster_palette_flow');
Module._load = original;

(async () => {
  await flow.routeRosterPalette(defPath, actPath);
  assert(panel.webview.html.includes('Reversed Photoshop method (255 → 0)'));
  assert(panel.webview.html.includes('flipTable" type="checkbox" checked'), 'remembered reversed order should be visible before staging');
  await panelHandler({ type: 'preview', flipTable: true, rememberOrder: false });
  assert.strictEqual(panel.lastMessage.after, 'preview:255', 'preview should use the selected reversed table');
  await panelHandler({ type: 'apply', flipTable: true, rememberOrder: false });
  assert.strictEqual(staged[5].tableOrder, 'reversed', 'staged plan must preserve the selected ACT order through the build');
  assert.deepStrictEqual(commands.at(-1), ['ikemen.palettePlayer.finishStaged', { fsPath: sffPath }]);
  assert(!commands.some(([command]) => command === 'sff.openViewer' || command === 'ikemen.paletteImport.open'));

  staged = undefined; commands = []; inputs = ['1', '3']; information = 'Later'; panel.disposed = false;
  await flow.routeRosterPalette(defPath, actPath); await panelHandler({ type: 'cancel' });
  assert.strictEqual(staged, undefined, 'canceling the new-color preview must not stage a plan');
  assert.strictEqual(commands.length, 0, 'canceling must not escape to a broader authoring command');
  fs.rmSync(root, { recursive: true, force: true });
  console.log('Player new-palette route preserves ACT order, stages only after approval, and never opens broad SFF tools');
})().catch((error) => { fs.rmSync(root, { recursive: true, force: true }); console.error(error); process.exitCode = 1; });
