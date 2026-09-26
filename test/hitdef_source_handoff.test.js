'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-hitdef-source-'));
const def = path.join(root, 'Hero.def'), code = path.join(root, 'attack.zss');
fs.writeFileSync(def, '[Files]\nst = attack.zss\nst1 = absent.zss\n');
fs.writeFileSync(code, '[StateDef 200]\nhitDef { attr: S, NA; damage: 20, 0; }\n');
let choice, shown = [], pickerCalls = 0;
const unrelated = { document: { fileName: 'OtherCharacter.zss' } };
const vscode = {
  ViewColumn: { Active: 1 }, Uri: { file: (fsPath) => ({ fsPath }) },
  window: {
    activeTextEditor: unrelated,
    showQuickPick: async (items) => { choice = items; return choice.cancel ? undefined : items[0]; },
    showTextDocument: async (document) => { shown.push(document.fileName); return { document }; },
    showWarningMessage: () => {}
  },
  workspace: { openTextDocument: async (uri) => ({ fileName: uri.fsPath, languageId: 'zss', getText: () => fs.readFileSync(uri.fsPath, 'utf8') }) }, languages: {}
};
const original = Module._load;
Module._load = function(request, parent, isMain) { if(request === 'vscode')return vscode;const loaded=original.call(this, request, parent, isMain);if(request === './character_picker')return {...loaded,chooseCharacterDef:async()=>{pickerCalls++;return def;}};return loaded; };
const { resolveHitDefSource } = require('../src/hitdef_workspace');
Module._load = original;
(async () => {
  assert.strictEqual((await resolveHitDefSource()).editor, unrelated);
  const resolved = await resolveHitDefSource({ fsPath: def });
  assert.strictEqual(resolved.defPath, def);
  assert.strictEqual(resolved.editor.document.fileName, code);
  assert.strictEqual(choice.length, 1);
  assert.match(choice[0].description, /^1 HitDef · attack.zss$/);
  assert.deepStrictEqual(shown, [code]);
  vscode.window.activeTextEditor = undefined;
  const fromHelp = await resolveHitDefSource();
  assert.strictEqual(pickerCalls, 1);
  assert.strictEqual(fromHelp.defPath, def);
  assert.strictEqual(fromHelp.editor.document.fileName, code);
  shown = [code];
  vscode.window.showQuickPick = async () => undefined;
  assert.strictEqual(await resolveHitDefSource({ fsPath: def }), null);
  assert.deepStrictEqual(shown, [code], 'Cancel must not open a source or use the unrelated active character');
  assert.strictEqual(fs.readFileSync(code, 'utf8'), '[StateDef 200]\nhitDef { attr: S, NA; damage: 20, 0; }\n');
  console.log('HitDef connected-source handoff tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => fs.rmSync(root, { recursive: true, force: true }));
