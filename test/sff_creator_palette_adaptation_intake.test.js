'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { encodeIndexedPng } = require('../src/palette_indexed_png');
const { createSffBuildSpecification } = require('../src/sff_build_specification');
const { createSffV21Png8Bytes } = require('../src/sff_v21_png8_writer');
const { readSff } = require('../src/sff_reader');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'vscode') return { workspace: { workspaceFolders: [], getConfiguration: () => ({ get: (_key, fallback) => fallback }) }, window: {}, Uri: { file: fsPath => ({ fsPath, toString: () => `file://${fsPath}` }) }, ViewColumn: { Active: 1 } };
  return originalLoad.call(this, request, parent, isMain);
};
const { defaultDraft, targetFromFile, paletteAdaptationInvocationBinding, bindPaletteAdaptationInvocation } = require('../src/sff_creator_workspace');
Module._load = originalLoad;

const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const colors = seed => Array.from({ length: 256 }, (_, index) => [(index + seed) & 255, (index * 3 + seed) & 255, (255 - index + seed) & 255, index === 0 ? 0 : 255]);

function fixture(root) {
  const sourceColors = colors(0), targetColors = colors(29), pixels = Buffer.from([0, 1, 2, 3]), png = encodeIndexedPng({ width: 2, height: 2 }, pixels, sourceColors), targetPng = encodeIndexedPng({ width: 2, height: 2 }, pixels, targetColors);
  const source = relativePath => ({ relativePath, byteHash: sha(png), decodedHash: sha(pixels), width: 2, height: 2 });
  const sprites = [
    { entryId: 'sprite:owner', group: 20, number: 0, axisX: 4, axisY: 8, colorDepth: 8, format: 'png8', compression: 'png8', paletteId: 'palette:source', duplicatePolicy: 'preserve-separate', crop: { mode: 'none', axisDeltaX: 0, axisDeltaY: 0 }, source: source('owner.png') },
    { entryId: 'sprite:linked', group: 20, number: 1, axisX: 5, axisY: 9, colorDepth: 8, format: 'png8', compression: 'png8', paletteId: 'palette:source', duplicatePolicy: 'share-identical', linkTargetEntryId: 'sprite:owner', crop: { mode: 'none', axisDeltaX: 0, axisDeltaY: 0 }, source: source('linked.png') },
    { entryId: 'sprite:independent', group: 21, number: 0, axisX: 1, axisY: 2, colorDepth: 8, format: 'png8', compression: 'png8', paletteId: 'palette:source', duplicatePolicy: 'preserve-separate', crop: { mode: 'none', axisDeltaX: 0, axisDeltaY: 0 }, source: source('independent.png') }
  ];
  const palettes = [
    { entryId: 'palette:source', group: 1, number: 1, colors: sourceColors, tableOrder: 'sff', duplicatePolicy: 'preserve-separate', source: source('owner.png') },
    { entryId: 'palette:target', group: 2, number: 1, colors: targetColors, tableOrder: 'sff', duplicatePolicy: 'preserve-separate', source: { relativePath: 'target.png', byteHash: sha(targetPng), decodedHash: sha(pixels), width: 2, height: 2 } }
  ];
  const specification = createSffBuildSpecification({ planId: 'palette-adaptation-intake', sourceRoot: 'input', target: { archiveIdentity: 'active.sff', archiveFingerprint: null, sffVersion: '2.1' }, requirements: ['sff-v2.1', 'preserve-authored-physical-order', 'immutable-source-snapshots', 'candidate-before-adoption', 'sprite-png8', 'embedded-palettes'], sprites, palettes, decisions: [], options: { shared: { fullRebuild: true }, backends: {} } });
  const bytes = createSffV21Png8Bytes(specification, { sources: new Map([['owner.png', png], ['linked.png', png], ['independent.png', png]]) }), filename = path.join(root, 'active.sff');
  fs.writeFileSync(filename, bytes); return { filename, bytes };
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-palette-adapt-'));
try {
  const input = fixture(root), target = targetFromFile(input.filename), archive = readSff(input.filename), targetPalette = target.palettes.find(item => item.id === '2,1');
  const unsafeBinding = paletteAdaptationInvocationBinding(archive, [0], targetPalette.physicalIndex), unsafe = bindPaletteAdaptationInvocation(root, defaultDraft(), target, [0], targetPalette.physicalIndex, archive, [], unsafeBinding);
  assert.strictEqual(unsafe.blocked, true, 'editing a stored owner cannot silently change linked destinations');
  assert.match(unsafe.message, /materialize the unselected links/);

  const detachedBinding = paletteAdaptationInvocationBinding(archive, [1], targetPalette.physicalIndex), detached = bindPaletteAdaptationInvocation(root, defaultDraft(), target, [1], targetPalette.physicalIndex, archive, [], detachedBinding);
  assert.strictEqual(detached.blocked, false, 'an explicitly selected linked destination can be materialized as an independent reviewed replacement');
  assert.deepStrictEqual(detached.draft.replaceSpriteIdentities, ['20,1']);

  const preservedBinding = paletteAdaptationInvocationBinding(archive, [0], targetPalette.physicalIndex, [1]), preserved = bindPaletteAdaptationInvocation(root, defaultDraft(), target, [0], targetPalette.physicalIndex, archive, [1], preservedBinding);
  assert.strictEqual(preserved.blocked, false, 'an owner edit is safe when every unselected dependent is materialized with original colors');
  assert.deepStrictEqual(preserved.draft.replaceSpriteIdentities.sort(), ['20,0', '20,1']);
  const rows = new Map(preserved.draft.sources.map(item => [item.provenance.sourceIdentity, preserved.draft.configuration.overrides[item.id].paletteId]));
  assert.strictEqual(rows.get('20,0'), '2,1', 'the edited owner targets the chosen palette');
  assert.strictEqual(rows.get('20,1'), '1,1', 'the unselected linked destination retains its original palette');
  assert.deepStrictEqual(fs.readFileSync(input.filename), input.bytes, 'staging adaptation never changes the active SFF');
  const forged = { ...preservedBinding, requested: preservedBinding.requested.map(row => ({ ...row, group: row.group + 1 })) };
  const rejected = bindPaletteAdaptationInvocation(root, defaultDraft(), target, [0], targetPalette.physicalIndex, archive, [1], forged);
  assert.strictEqual(rejected.blocked, true, 'forged or stale sprite/link evidence fails closed');
  assert.match(rejected.message, /changed before Creator opened/);
  const invalidRoot = path.join(root, 'invalid-preserved'), invalidArchive = { ...archive, sprites: archive.sprites.map(sprite => ({ ...sprite })) };
  invalidArchive.sprites[1].paletteIndex = 99;
  const invalidBinding = paletteAdaptationInvocationBinding(invalidArchive, [0], targetPalette.physicalIndex, [1]), invalid = bindPaletteAdaptationInvocation(invalidRoot, defaultDraft(), target, [0], targetPalette.physicalIndex, invalidArchive, [1], invalidBinding);
  assert.strictEqual(invalid.blocked, true, 'a preserved sprite with a missing original palette is rejected before staging');
  assert.strictEqual(fs.existsSync(path.join(invalidRoot, '.ikemen-tools')), false, 'late validation failure creates no cache files');
  assert.strictEqual(invalid.draft.sources.length, 0, 'late validation failure leaves the draft unchanged');

  const oversized = { buffer: Buffer.from('oversized'), palettes: [{ index: 0, group: 1, number: 1, dataSize: 1024, colorsRgba: colors(0) }], sprites: Array.from({ length: 5001 }, (_, index) => ({ index, group: 30, number: index, dataSize: index ? 0 : 4, link: 0, colorDepth: 8, paletteIndex: 0, axisX: 0, axisY: 0 })) };
  assert.throws(() => paletteAdaptationInvocationBinding(oversized, [0], 0, Array.from({ length: 5000 }, (_, index) => index + 1)), /1 through 5000 total/, 'preserved dependents count toward the complete bounded intake');
} finally { fs.rmSync(root, { recursive: true, force: true }); }

const viewer = fs.readFileSync(path.join(__dirname, '..', 'src', 'sff_viewer.js'), 'utf8');
for (const label of ['Adapt Other Indexed Sprites…', 'No — Current Selection Only', 'All — Replace Every Linked Sprite', 'Select Linked Sprites…']) assert(viewer.includes(label), `${label} must remain visible in the linked-sprite review flow`);
assert.match(viewer, /preservePhysicalIndices/, 'unselected dependents must be explicitly materialized rather than changing through their source');
console.log('Reviewed indexed palette adaptation and linked-sprite no/all/select intake passed');
