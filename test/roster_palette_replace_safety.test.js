'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemen-palette-replace-safety-'));
const defPath = path.join(root, 'Ryu.def'), sffPath = path.join(root, 'Ryu.sff'), actPath = path.join(root, 'Ryu.act');
fs.writeFileSync(defPath, '[Files]\nsprite = Ryu.sff\n');
fs.writeFileSync(sffPath, 'fixture');
fs.writeFileSync(actPath, Buffer.alloc(768, 1));

let handler, answer, updates = 0, writes = 0, warning;
const archive = {
  buffer: Buffer.from('fixture'),
  palettes: [{ group: 1, number: 1, colors: 256, dataSize: 768, index: 0 }],
  sprites: [{ group: 0, number: 0, colorDepth: 8, paletteIndex: 0 }]
};
const panel = {
  webview: { cspSource: 'fixture', html: '', onDidReceiveMessage(callback) { handler = callback; }, postMessage() {} },
  dispose() {}
};
const vscode = {
  ConfigurationTarget: { Global: 1 }, ViewColumn: { Active: 1 }, Uri: { file: (fsPath) => ({ fsPath }) },
  workspace: { getConfiguration: () => ({ get: () => 'index', update: async () => { updates += 1; } }) },
  window: {
    createWebviewPanel: () => panel,
    showWarningMessage: async (...args) => { warning = args; return answer; },
    showInformationMessage() {}
  }
};
const original = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return vscode;
  if (request === './sff_reader') return { readSff: () => archive, actRgba: () => Array.from({ length: 256 }, (_, index) => [index, index, index, 255]), spriteDataUri: () => 'preview' };
  if (request === './palette_editor') return {
    paletteRole: () => 'Player color',
    paletteReplacementPlan: () => ({ changedCount: 12 }),
    bufferWithPaletteReplacement: () => ({ buffer: Buffer.from('changed') }),
    reversePaletteRgb: (colors) => colors.slice().reverse()
  };
  if (request === './palette_selection_operations') return { applyPreset: (colors) => colors };
  if (request === './viewer_group') return { preferredViewerColumn: () => 1, trackViewerPanel: (value) => value };
  if (request === './webview_policy') return { protect: (value) => value };
  if (request === './mutation_safety') return { hash: () => 'hash', optionsFromConfig: () => ({}), transactionalWrite: () => { writes += 1; } };
  return original.call(this, request, parent, main);
};
const { openRosterPaletteFlow } = require('../src/roster_palette_flow');
Module._load = original;

(async () => {
  await openRosterPaletteFlow(defPath, actPath, 0);
  assert(panel.webview.html.includes('Replace Existing Palette'));
  await handler({ type: 'preview', paletteIndex: 0, flipTable: true, rememberOrder: true, preset: 'none' });
  assert.strictEqual(updates, 0, 'preview must not save the ACT-order preference');
  assert.strictEqual(writes, 0, 'preview must not write the SFF');
  await handler({ type: 'cancel' });
  assert.strictEqual(updates, 0, 'cancel must not save the ACT-order preference');
  assert.strictEqual(writes, 0, 'cancel must not write the SFF');

  await openRosterPaletteFlow(defPath, actPath, 0);
  answer = undefined;
  await handler({ type: 'apply', paletteIndex: 0, flipTable: true, rememberOrder: true, preset: 'none' });
  assert.deepStrictEqual(warning.slice(2), ['Replace Palette'], 'the destructive action must be replacement-specific');
  assert.strictEqual(updates, 0, 'declining replacement must not save the ACT-order preference');
  assert.strictEqual(writes, 0, 'declining replacement must not write the SFF');

  answer = 'Replace Palette';
  await handler({ type: 'apply', paletteIndex: 0, flipTable: true, rememberOrder: true, preset: 'none' });
  assert.strictEqual(updates, 1, 'the confirmed replacement may save the chosen ACT order');
  assert.strictEqual(writes, 1, 'the confirmed replacement must perform exactly one transactional SFF write');
  fs.rmSync(root, { recursive: true, force: true });
  console.log('Palette replacement preview/cancel/decline are non-writing; confirmed Replace Palette writes once');
})().catch((error) => { fs.rmSync(root, { recursive: true, force: true }); console.error(error); process.exitCode = 1; });
