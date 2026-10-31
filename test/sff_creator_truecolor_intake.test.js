'use strict';
const assert = require('assert'), fs = require('fs'), vm = require('vm'), Module = require('module');
const original = Module._load;
Module._load = function(request, parent, main) {
  if (request === 'vscode') return { Uri: { file: fsPath => ({ fsPath, toString: () => fsPath }), parse: value => ({ fsPath: value }) }, ViewColumn: { Active: 1 }, workspace: { workspaceFolders: [], getConfiguration: () => ({ get: (_name, fallback) => fallback }) }, window: {} };
  return original.call(this, request, parent, main);
};
const creator = require('../src/sff_creator_workspace'), compact = require('../src/sff_add_sprites_workspace'); Module._load = original;
const draft = creator.defaultDraft(); draft.configuration.cropMode = 'after-axis';
const selected = creator.configureTrueColorIntake(draft, 'ikemaker');
assert.strictEqual(selected.configuration.paletteMode, 'true-color');
assert.strictEqual(selected.configuration.cropMode, 'none');
assert.notStrictEqual(draft.configuration.paletteMode, 'true-color', 'selection prepares a copy without mutating the retained draft');
assert.strictEqual(creator.configureTrueColorIntake(draft, 'sprmake2').configuration.paletteMode, 'true-color');
assert.throws(() => creator.configureTrueColorIntake(draft, 'both'), /Both writers comparison.*writer was not changed/);
const old = creator.defaultDraft(); old.configuration.newArchiveVersion = '2.0';
assert.throws(() => creator.configureTrueColorIntake(old, 'ikemaker'), /requires SFF 2.1/);
const source = fs.readFileSync(require.resolve('../src/sff_creator_workspace'), 'utf8');
assert(source.includes('<button id="addFiles">Add PNG Files…</button><button id="addTrueColorFiles"'));
assert(source.includes("addTrueColorFiles.onclick=()=>vscode.postMessage({type:'addTrueColorFiles'})"));
const handler = source.slice(source.indexOf("if (message.type === 'addFiles' || message.type === 'addTrueColorFiles')"), source.indexOf("if (message.type === 'addFolder')"));
assert.strictEqual((handler.match(/writerPreference.settledSnapshot/g) || []).length, 2, 'shared writer is rechecked after the file picker');
assert(handler.includes('if (!picked?.length) return;'), 'cancel does not alter the palette choice');
assert(!handler.includes('writerPreference.handle'), 'intake never changes the selected writer');
assert(source.includes("if (reviewed.configuration.paletteMode === 'true-color') configureTrueColorIntake(reviewed, selected.mode);"), 'selected-writer builds enforce the same truecolor boundary');
const sync = source.match(/function syncArchiveVersionControls\(\)\{[^\n]+?\}newArchiveVersion/)[0].replace(/newArchiveVersion$/, '');
for (const [version, mode, disabled] of [['2.1', 'ikemaker', false], ['2.0', 'ikemaker', true], ['2.1', 'sprmake2', false], ['2.1', 'both', true]]) {
  const context = { draft: { target: null }, newArchiveVersion: { value: version }, writerMode: mode, addTrueColorFiles: {}, trueColorIntakeStatus: {}, newArchiveVersionField: {}, buildV21: {}, buildV20: {} };
  vm.runInNewContext(sync + ';syncArchiveVersionControls()', context);
  assert.strictEqual(context.addTrueColorFiles.disabled, disabled);
  assert(context.trueColorIntakeStatus.textContent.includes(disabled ? version === '2.0' ? 'requires SFF 2.1' : 'Both writers comparison' : 'RGB24 / RGBA32'));
}
for (const mode of ['ikemaker', 'sprmake2', 'both']) {
  const available = compact.addSpritesControlAvailability({ sourceCount: 1, trueColor: true, paletteChoice: 'true-color', targetVersion: '2.1', coordinatesValid: true, writerMode: mode });
  assert.strictEqual(available.stage.disabled, mode === 'both');
  assert.strictEqual(available.advanced.disabled, mode === 'both');
  if (mode === 'both') assert.match(available.stage.reason, /Both writers comparison/);
}
const compactSource = fs.readFileSync(require.resolve('../src/sff_add_sprites_workspace'), 'utf8');
assert.strictEqual((compactSource.match(/palette === 'true-color' && capturedWriter.mode === 'both'/g) || []).length, 3);
assert(source.includes("selected.mode === 'sprmake2' ? 'build'"), 'SprMake2 remains on its existing build route');
assert(source.includes("version === '2.0' ? 'buildBuiltInV20' : 'buildBuiltInV21Single'"), 'IKEMaker selection never invokes the dual writer test route');
assert(source.includes("const dual = message.type === 'buildBuiltInV21'"));
assert(!source.includes('SprMake2 true-color output has not been certified'));
const paletteLabelExpression = source.match(/paletteLabel=(.+?);review.insertAdjacentHTML/)[1];
for (const [writerMode, label] of [['ikemaker', 'IKEMaker native PNG24/PNG32'], ['sprmake2', 'SprMake2 true color'], ['both', 'Both writers comparison blocked']]) {
  assert(vm.runInNewContext(paletteLabelExpression, { c: { paletteMode: 'true-color' }, writerMode }).includes(label));
}
const dialog = fs.readFileSync(require.resolve('../src/sff_add_sprites_dialog'), 'utf8');
assert(dialog.includes("isTrue&&sffAddModel.writerMode==='both'"));
assert(dialog.includes('True Color uses the selected SprMake2 writer'));
// Run the actual intake branch in isolation to exercise cancellation and
// all-or-nothing source admission without opening an operating-system picker.
(async () => {
  for (const picked of [null, [{ fsPath: 'rgb' }, { fsPath: 'indexed' }], [{ fsPath: 'rgb' }, { fsPath: 'rgba' }]]) {
    let merged = 0, posted = null;
    const context = { message: { type: 'addTrueColorFiles' }, drafts: { read: () => draft }, key: 'test', recovered: draft, configureTrueColorIntake: creator.configureTrueColorIntake, safeDraft: creator.safeDraft, writerPreference: { settledSnapshot: async () => ({ mode: 'sprmake2' }) }, vscode: { window: { showOpenDialog: async () => picked } }, sourceFromFile: name => ({ name, bitDepth: 8, colorType: name === 'indexed' ? 3 : name === 'rgb' ? 2 : 6 }), mergeCreatorSources: () => { merged++; }, postState: async value => { posted = value; } };
    const operation = vm.runInNewContext('(async () => {' + handler + '})()', context);
    if (picked?.some(row => row.fsPath === 'indexed')) { await assert.rejects(operation, /only 8-bit RGB24 or RGBA32/); assert.strictEqual(merged, 0); assert.strictEqual(posted, null); }
    else { await operation; assert.strictEqual(merged, picked ? 1 : 0); assert.strictEqual(posted?.configuration.paletteMode || null, picked ? 'true-color' : null); }
    assert.notStrictEqual(draft.configuration.paletteMode, 'true-color');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
console.log('Creator explicit True Color intake honors archive version and shared writer without switching writers');
