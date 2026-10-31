'use strict';

const assert = require('assert');
const Module = require('module');

const originalLoad = Module._load;
const stored = {};
const clipboard = [];
const warnings = [];
const prompts = [];
const edits = [];
const sent = [];
const workspaceState = {
  get(key, fallback) { return stored[key] ?? fallback; },
  async update(key, value) { stored[key] = value; }
};
const vscode = {
  workspace: { workspaceFolders: [{ uri: { fsPath: 'C:\\project' } }] },
  env: { clipboard: { async writeText(value) { clipboard.push(value); } } },
  window: {
    activeTextEditor: null,
    async showInputBox(options) { prompts.push(options); return prompts.answers.shift(); },
    async showWarningMessage(message, options, action) { warnings.push({ message, options, action }); return warnings.answers.shift(); }
  }
};
prompts.answers = [];
warnings.answers = [];

Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return vscode;
  if (request === './launch_controls') return { launchControlsHtml: () => '', launchControlsClientScript: () => '', handleLaunchMessage: async () => false };
  if (request === './viewer_group') return { preferredViewerColumn: () => 1, trackViewerPanel: value => value };
  return originalLoad.call(this, request, parent, isMain);
};

const { createEmbeddedPalFx } = require('../src/palfx_editor');
const { composerZss, modifyLayerZss, normalizeProfile } = require('../src/truecolor_fx_model');
Module._load = originalLoad;

(async () => {
  const context = { workspaceState };
  const embedded = createEmbeddedPalFx(context, null, message => sent.push(message));
  assert.match(embedded.html, /PalFX \/ True-Color FX Editor|PalFX Editor/);

  await embedded.handle({ type: 'copy', text: 'palFX {}' });
  assert.strictEqual(clipboard.pop(), 'palFX {}');
  await embedded.handle({ type: 'insert', text: 'palFX {}' });
  assert.match(warnings.pop().message, /Focus a ZSS editor/i);
  vscode.window.activeTextEditor = {
    document: { languageId: 'zss' }, selection: { active: 17 },
    async edit(callback) { callback({ insert(position, text) { edits.push({ position, text }); } }); return true; }
  };
  await embedded.handle({ type: 'insert', text: 'palFX { time: 2; }' });
  assert.deepStrictEqual(edits.pop(), { position: 17, text: 'palFX { time: 2; }' });

  prompts.answers.push('Warm flash');
  await embedded.handle({ type: 'savePreset', values: [1, 2, 3] });
  assert.deepStrictEqual(stored['ikemenZss.palfxPresets']['Warm flash'], [1, 2, 3]);
  assert.strictEqual(sent.pop().selected, 'Warm flash');
  await embedded.handle({ type: 'updatePreset', name: 'Warm flash', values: [4, 5, 6] });
  assert.deepStrictEqual(stored['ikemenZss.palfxPresets']['Warm flash'], [4, 5, 6]);
  warnings.answers.push('Delete');
  await embedded.handle({ type: 'deletePreset', name: 'Warm flash' });
  assert.strictEqual(stored['ikemenZss.palfxPresets']['Warm flash'], undefined);

  const profile = normalizeProfile({ name: 'Glow', anim: 7100, layers: [{ name: 'Base', palfx: { hue: 32 } }, { name: 'Rim', idOffset: 1, trans: 'addalpha' }] });
  await embedded.handle({ type: 'fxCode', profile, layerIndex: 1 });
  assert.strictEqual(sent.pop().text, composerZss(profile));
  await embedded.handle({ type: 'copyFx', profile });
  assert.strictEqual(clipboard.pop(), composerZss(profile));
  await embedded.handle({ type: 'copyModifyFx', profile, layerIndex: 1 });
  assert.strictEqual(clipboard.pop(), modifyLayerZss(profile, 1));
  await embedded.handle({ type: 'copyFxJson', profile });
  assert.deepStrictEqual(JSON.parse(clipboard.pop()), normalizeProfile(profile));
  await embedded.handle({ type: 'insertFx', profile });
  assert.strictEqual(edits.pop().text, composerZss(profile));

  prompts.answers.push('Glow stack');
  await embedded.handle({ type: 'saveFxProfile', profile });
  assert.strictEqual(stored['ikemenZss.trueColorFxPresets']['Glow stack'].name, 'Glow stack');
  assert.strictEqual(sent.pop().selected, 'Glow stack');
  const changed = normalizeProfile({ ...profile, baseId: 920000 });
  await embedded.handle({ type: 'updateFxProfile', name: 'Glow stack', profile: changed });
  assert.strictEqual(stored['ikemenZss.trueColorFxPresets']['Glow stack'].baseId, 920000);
  warnings.answers.push('Delete Profile');
  await embedded.handle({ type: 'deleteFxProfile', name: 'Glow stack' });
  assert.strictEqual(stored['ikemenZss.trueColorFxPresets']['Glow stack'], undefined);

  console.log('PalFX preset, clipboard, editor, generated-code, and FX profile routes execute end to end');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
