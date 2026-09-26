'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { visibleBrowserSeed, openVisibleBrowser, editorTarget } = require('../src/map_registry_ui');

(async () => {
  const explicit = { fsPath: 'C:/game/chars/Ryu/Ryu.def' };
  const resolvedService = { scope: () => ({ def: explicit.fsPath, resolved: true }) };
  let choices = 0;
  assert.deepStrictEqual(await visibleBrowserSeed({ window: {} }, resolvedService, explicit, async () => { choices += 1; }), { seed: explicit, cancelled: false });
  assert.strictEqual(choices, 0, 'an explicit tree/context seed must not be replaced by a picker');

  const luaUri = { fsPath: 'C:/game/script.lua' }, luaDocument = { uri: luaUri, fileName: luaUri.fsPath, languageId: 'lua' };
  const luaVscode = { window: { activeTextEditor: { document: luaDocument } }, Uri: { file: (fsPath) => ({ fsPath }) } };
  assert.deepStrictEqual(await visibleBrowserSeed(luaVscode, resolvedService, undefined, async () => { choices += 1; }), { seed: luaUri, cancelled: false }, 'a resolvable active file supplies browsing context without inventing insertion support');
  assert.strictEqual(editorTarget(luaVscode, {}), null, 'opening from Lua remains browse-only');

  const picked = 'C:/game/chars/Ken/Ken.def';
  const pickerVscode = { window: {}, Uri: { file: (fsPath) => ({ fsPath }) } };
  const unresolvedService = { scope: () => ({ def: '', resolved: false }) };
  assert.deepStrictEqual(await visibleBrowserSeed(pickerVscode, unresolvedService, undefined, async () => picked), { seed: { fsPath: picked }, cancelled: false }, 'missing context offers explicit character selection');
  assert.deepStrictEqual(await visibleBrowserSeed(pickerVscode, unresolvedService, undefined, async () => ''), { seed: undefined, cancelled: true });

  const readmeUri = { fsPath: 'C:/game/README.md' }, changedUri = { fsPath: 'C:/other/chars/Other/Other.zss' };
  const commandVscode = { window: { activeTextEditor: { document: { uri: readmeUri, fileName: readmeUri.fsPath, languageId: 'markdown' } } }, Uri: pickerVscode.Uri };
  let opened = 0;
  await openVisibleBrowser(commandVscode, {}, unresolvedService, undefined, { chooseCharacter: async () => { commandVscode.window.activeTextEditor = { document: { uri: changedUri, fileName: changedUri.fsPath, languageId: 'zss' } }; return ''; }, openBrowser: async () => { opened += 1; } });
  assert.strictEqual(opened, 0, 'cancelling context selection must not recapture an editor that became active while the picker was open');

  let captured;
  await openVisibleBrowser(luaVscode, {}, unresolvedService, undefined, { chooseCharacter: async () => picked, openBrowser: async (_vscode, _context, seed, target) => { captured = { seed, target }; } });
  assert.strictEqual(captured.seed.fsPath, picked, 'an unresolved active Lua file must offer explicit character context');
  assert.strictEqual(captured.target, null, 'selected character context must not convert Lua into an insertion destination');

  const provider = fs.readFileSync(path.join(__dirname, '..', 'src', 'zss_registry_provider.js'), 'utf8');
  assert.ok(provider.includes('scoped multi-format Project Maps browser'), 'the tree must distinguish the scoped browser from the workspace-wide ZSS logger');

  console.log('Map registry hub/tree access, empty inventory and browse-only routing tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
