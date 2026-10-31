'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { literalSharedAssetReferences, buildZssAssetCatalog, sharedAssetSource, assetReferenceFindings } = require('../src/zss_asset_catalog');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-zss-commonfx-'));
const mkdir = directory => fs.mkdirSync(directory, { recursive: true });
const write = (filename, text = 'fixture') => { mkdir(path.dirname(filename)); fs.writeFileSync(filename, text); return filename; };
const uri = fsPath => ({ fsPath, scheme: 'file', toString: () => fsPath });

try {
  write(path.join(root, 'Ikemen_GO.exe'));
  const character = path.join(root, 'chars', 'Test'), def = path.join(character, 'Test.def'), zss = path.join(character, 'states.zss');
  const ownAir = write(path.join(character, 'Test.air'), '[Begin Action 1]\n0,0,0,0,1\n');
  const ownSff = write(path.join(character, 'Test.sff')), ownSnd = write(path.join(character, 'Test.snd'));
  const charFxDef = path.join(character, 'charfx.def'), charAir = write(path.join(character, 'charfx.air'), '[Begin Action 40]\n0,0,0,0,1\n'), charSnd = write(path.join(character, 'charfx.snd'));
  write(charFxDef, '[Info]\nprefix = CHARFX\n[Files]\nair = charfx.air\nsnd = charfx.snd\n');
  write(def, '[Info]\nfightfx.prefix = CHARFX\n[Files]\nst = states.zss\nanim = Test.air\nsprite = Test.sff\nsound = Test.snd\nfx = charfx.def\n');
  write(zss, 'changeAnim{value: F41}\nhitDef{hitsound: 2,9}\nplaySnd{value: GO3,9}\n');
  const config = write(path.join(root, 'save', 'config.ini'), '[Config]\nMotif = data/system.def\n[Common]\nFx = data/global.def\n');
  const system = write(path.join(root, 'data', 'system.def'), '[Files]\nfight = fight.def\n');
  const fight = write(path.join(root, 'data', 'fight.def'), '[Files]\nfightfx.air = fightfx.air\ncommon.snd = common.snd\nfx1 = fight-extra.def\n');
  const fightAir = write(path.join(root, 'data', 'fightfx.air'), '[Begin Action 10]\n0,0,0,0,1\n'), fightSnd = write(path.join(root, 'data', 'common.snd'));
  const globalDef = path.join(root, 'data', 'global.def'), globalAir = write(path.join(root, 'data', 'global.air'), '[Begin Action 20]\n0,0,0,0,1\n'), globalSnd = write(path.join(root, 'data', 'global.snd'));
  write(globalDef, '[Info]\nprefix = GO\n[Files]\nair = global.air\nsnd = global.snd\n');
  const extraDef = path.join(root, 'data', 'fight-extra.def'), extraAir = write(path.join(root, 'data', 'fight-extra.air'), '[Begin Action 30]\n0,0,0,0,1\n');
  write(extraDef, '[Info]\nprefix = EXTRA\n[Files]\nair = fight-extra.air\n');

  const source = 'hitDef{sparkno: 41; hitsound: 2,9; guardsound: S1,1}\nchangeAnim{value: F40}\nplaySnd{value: GO3,9}\nplaySnd{value: 1,1}\nchangeAnim{value: ifelse(1, F40, F41)}\nchangeAnim{value: F-1}';
  assert.deepStrictEqual(literalSharedAssetReferences(source, zss).map(item => [item.kind, item.selector, item.group, item.number]), [
    ['air', 'f', 41, undefined], ['snd', 'f', 2, 9], ['air', 'f', 40, undefined], ['snd', 'go', 3, 9]
  ], 'only literal shared AIR/SND references are classified; S, character-owned, dynamic, and negative references remain outside shared claims');

  const scope = { def, characterName: 'Test', scopeFiles: { assigned: [zss] } }, service = { scope: () => scope };
  const open = [];
  const vscode = { Uri: { file: uri }, workspace: { textDocuments: open, openTextDocument: async value => ({ fileName: value.fsPath, uri: value, languageId: /\.air$/i.test(value.fsPath) ? 'ikemen-air' : 'zss', version: 1, isDirty: false, getText: () => fs.readFileSync(value.fsPath, 'utf8') }) } };
  const sounds = new Map([[ownSnd, [[1, 1]]], [fightSnd, [[2, 1]]], [globalSnd, [[3, 4]]], [charSnd, [[2, 2]]]]);
  const adapters = {
    resolveAssigned: () => ({ air: ownAir, sff: ownSff, snd: ownSnd }),
    readSff: () => ({ sprites: [{ group: 0, number: 0 }] }),
    readSnd: filename => ({ entries: (sounds.get(filename) || []).map(([group, index]) => ({ group, index })) })
  };

  (async () => {
    let catalog = await buildZssAssetCatalog(vscode, uri(zss), service, adapters);
    assert.strictEqual(catalog.shared.complete, true);
    assert(sharedAssetSource(catalog, 'f', 'air').ids.has('40'), 'F follows the owning character fightfx.prefix override instead of the motif core archive');
    assert(sharedAssetSource(catalog, 'go', 'air').ids.has('20'), 'game CommonFX prefixes resolve to their exact runtime AIR');
    assert(sharedAssetSource(catalog, 'extra', 'air').ids.has('30'), 'fight DEF fxN archives are included in runtime completion');
    assert.deepStrictEqual(assetReferenceFindings(catalog, source, zss).filter(item => /commonfx/.test(item.code)).map(item => item.code), ['missing-commonfx-action', 'missing-commonfx-sound', 'missing-commonfx-sound']);

    open.push({ fileName: config, uri: uri(config), languageId: 'ini', version: 2, isDirty: true, getText: () => fs.readFileSync(config, 'utf8') });
    catalog = await buildZssAssetCatalog(vscode, uri(zss), service, adapters);
    assert.strictEqual(catalog.shared.complete, false, 'dirty runtime config assignments suppress all shared code claims');
    assert.deepStrictEqual(assetReferenceFindings(catalog, source, zss).filter(item => /commonfx/.test(item.code)), []);
    open.pop();

    open.push({ fileName: charAir, uri: uri(charAir), languageId: 'ikemen-air', version: 2, isDirty: true, getText: () => '[Begin Action 41]\n0,0,0,0,1\n' });
    catalog = await buildZssAssetCatalog(vscode, uri(zss), service, adapters);
    assert(sharedAssetSource(catalog, 'f', 'air').ids.has('41'), 'dirty runtime AIR text is authoritative just like assigned character AIR text');
    open.pop();

    open.push({ fileName: charSnd, uri: uri(charSnd), languageId: 'plaintext', version: 2, isDirty: true, getText: () => '' });
    catalog = await buildZssAssetCatalog(vscode, uri(zss), service, adapters);
    assert.strictEqual(sharedAssetSource(catalog, 'f', 'snd'), null, 'dirty binary CommonFX SND fails closed');
    open.pop();

    const duplicateDef = path.join(root, 'data', 'duplicate.def'), duplicateAir = write(path.join(root, 'data', 'duplicate.air'), '[Begin Action 99]\n0,0,0,0,1\n');
    write(duplicateDef, '[Info]\nprefix = GO\n[Files]\nair = duplicate.air\n');
    write(config, '[Config]\nMotif = data/system.def\n[Common]\nFx = data/global.def, data/duplicate.def\n');
    catalog = await buildZssAssetCatalog(vscode, uri(zss), service, adapters);
    assert.strictEqual(sharedAssetSource(catalog, 'go', 'air'), null, 'duplicate runtime prefixes with different AIR targets are never silently selected');
    assert(!assetReferenceFindings(catalog, 'changeAnim{value: GO404}', zss).some(item => item.code === 'missing-commonfx-action'), 'ambiguity suppresses absence claims');

    const toolingCatalog = await buildZssAssetCatalog(vscode, uri(zss), service, { ...adapters, collectRegistry: () => ({ fightPrefix: '', runtime: { complete: true, diagnostics: [], controlFiles: [def] }, candidates: [{ prefix: 'tool', displayPrefix: 'TOOL', runtime: false, originKind: 'configured-navigation', source: 'Configured shared FX', def: extraDef, air: extraAir, snd: '' }] }) });
    assert.strictEqual(toolingCatalog.shared.archives.length, 0, 'viewer configuration and profile-only archives cannot become runtime code claims');
    console.log('Exact runtime CommonFX AIR/SND catalog, override, ambiguity, dirty-source, and tooling-exclusion tests passed');
  })().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => fs.rmSync(root, { recursive: true, force: true }));
} catch (error) {
  fs.rmSync(root, { recursive: true, force: true }); throw error;
}
