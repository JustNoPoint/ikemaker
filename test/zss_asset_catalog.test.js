'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { literalAssetReferences, buildZssAssetCatalog, assetReferenceFindings } = require('../src/zss_asset_catalog');

const source = `# playSnd{value: 9,9}\nlet note = "changeAnim{value: 999}";\nchangeAnim{value: 20}\nexplod{anim: 30; sprite: 1,2}\nplaySnd{value: 2, 1}\nplaySnd{value: S3,4}\nplaySnd{value: F5,6}\nhitDef{hitsound: 7,8; guardsound: S9,10; sparkno: 11}`;
assert.deepStrictEqual(literalAssetReferences(source, 'custom.txt').map(item => [item.kind, item.group, item.number]), [
  ['air', 20, undefined], ['air', 30, undefined], ['sff', 1, 2], ['snd', 2, 1], ['snd', 3, 4], ['snd', 9, 10]
], 'only exact character-owned literals survive comments, strings, common-FX prefixes, and default-common fields');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-zss-assets-')), def = path.join(root, 'Test.def'), zss = path.join(root, 'states.zss'), air = path.join(root, 'Test.air'), sff = path.join(root, 'Test.sff'), snd = path.join(root, 'Test.snd');
fs.writeFileSync(def, '[Files]\nst = states.zss\nanim = Test.air\nsprite = Test.sff\nsound = Test.snd\n'); fs.writeFileSync(zss, source); fs.writeFileSync(air, '[Begin Action 20]\n0,0,0,0,1\n'); fs.writeFileSync(sff, 'fixture'); fs.writeFileSync(snd, 'fixture');
const uri = fsPath => ({ fsPath, scheme: 'file', toString: () => fsPath });
const scope = { def, characterName: 'Test', scopeFiles: { assigned: [zss] } }, service = { scope: () => scope };
const vscode = { Uri: { file: uri }, workspace: { textDocuments: [], openTextDocument: async value => ({ fileName: value.fsPath, uri: value, languageId: /\.air$/i.test(value.fsPath) ? 'ikemen-air' : 'zss', version: 1, isDirty: false, getText: () => fs.readFileSync(value.fsPath, 'utf8') }) } };
const adapters = { resolveAssigned: () => ({ air, sff, snd }), readSff: () => ({ sprites: [{ group: 0, number: 0 }] }), readSnd: () => ({ entries: [{ group: 2, index: 1 }, { group: 3, index: 4 }] }), allowVirtualFiles: true };

(async () => {
  let catalog = await buildZssAssetCatalog(vscode, uri(zss), service, adapters);
  assert(catalog.kinds.air.complete && catalog.kinds.sff.complete && catalog.kinds.snd.complete);
  assert.deepStrictEqual(assetReferenceFindings(catalog, source, zss).map(item => item.code), ['missing-air-action', 'missing-sprite', 'missing-sound'], 'only exact missing assigned assets are reported; common/dynamic references remain silent');
  vscode.workspace.textDocuments = [{ fileName: air, uri: uri(air), languageId: 'ikemen-air', version: 2, isDirty: true, getText: () => '[Begin Action 20]\n0,0,0,0,1\n[Begin Action 30]\n0,0,0,0,1' }];
  catalog = await buildZssAssetCatalog(vscode, uri(zss), service, adapters);
  assert.deepStrictEqual(assetReferenceFindings(catalog, source, zss).map(item => item.code), ['missing-sprite', 'missing-sound'], 'unsaved assigned AIR text is authoritative');
  vscode.workspace.textDocuments.push({ fileName: snd, uri: uri(snd), languageId: 'plaintext', version: 2, isDirty: true, getText: () => '' });
  catalog = await buildZssAssetCatalog(vscode, uri(zss), service, adapters);
  assert.strictEqual(catalog.kinds.snd.complete, false);
  assert.deepStrictEqual(assetReferenceFindings(catalog, source, zss).map(item => item.code), ['missing-sprite'], 'an unsaved binary SND fails closed while independently complete asset kinds remain useful');
  vscode.workspace.textDocuments.pop();
  vscode.workspace.textDocuments.push({ fileName: def, uri: uri(def), languageId: 'ikemen-def', version: 2, isDirty: true, getText: () => fs.readFileSync(def, 'utf8') + 'anim = Other.air\n' });
  catalog = await buildZssAssetCatalog(vscode, uri(zss), service, adapters);
  assert.strictEqual(catalog.kinds.air.complete, false); assert.deepStrictEqual(assetReferenceFindings(catalog, source, zss), [], 'a dirty DEF suppresses every asset absence claim');
  scope.scopeFiles.assigned = []; vscode.workspace.textDocuments = [];
  catalog = await buildZssAssetCatalog(vscode, uri(zss), service, adapters);
  assert.strictEqual(catalog.complete, false, 'an unassigned ZSS source never borrows another character asset catalog');
  const outside = path.join(root, 'outside.txt'), outsideUri = uri(outside);
  service.context = { workspaceState: { get: () => ({ [outsideUri.toString()]: 'zss' }) } };
  vscode.workspace.textDocuments = [{ fileName: outside, uri: outsideUri, languageId: 'plaintext', version: 1, isDirty: false, getText: () => 'changeAnim{value: 999}' }];
  catalog = await buildZssAssetCatalog(vscode, outsideUri, service, adapters);
  assert.strictEqual(catalog.complete, false, 'an explicitly classified custom-extension ZSS outside the DEF assignment fails closed even when its editor language is plaintext');
  console.log('Owner-scoped ZSS AIR/SFF/SND asset catalog and literal-reference safety tests passed');
})().finally(() => fs.rmSync(root, { recursive: true, force: true })).catch(error => { console.error(error); process.exit(1); });
