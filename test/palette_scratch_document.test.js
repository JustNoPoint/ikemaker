'use strict';

const assert = require('assert');
const model = require('../src/palette_scratch_document');

const DRAFT_ID = '12345678-1234-4abc-8def-1234567890ab';
const draft = model.createScratchPaletteDocument({ draftId: DRAFT_ID, name: '  Ryu base  ' });

assert.strictEqual(draft.schema, model.SCHEMA);
assert.strictEqual(draft.version, model.VERSION);
assert.strictEqual(draft.draftId, DRAFT_ID);
assert.strictEqual(draft.name, 'Ryu base');
assert.strictEqual(draft.colors.length, 256);
assert.deepStrictEqual(draft.colors[0], [0, 0, 0, 0]);
assert.deepStrictEqual(draft.lockedIndexes, [0]);
assert.deepStrictEqual(draft.colors[1], [0, 0, 0, 255]);
assert.deepStrictEqual(draft.colors[255], [0, 0, 0, 255]);
assert.deepStrictEqual(model.defaultColors(), model.defaultColors(), 'scratch defaults are deterministic');

const serialized = model.serializeScratchPaletteDocument(draft);
assert.ok(serialized.endsWith('\n'));
assert.deepStrictEqual(model.parseScratchPaletteDocument(serialized), draft, 'the native document round-trips without loss');
assert.deepStrictEqual(model.parseScratchPaletteDocument(`\uFEFF${serialized}`), draft, 'a UTF-8 BOM is accepted without altering data');

const copied = JSON.parse(JSON.stringify(draft));
assert.strictEqual(model.isScratchPaletteDirty(copied, draft), false);
copied.colors[9] = [1, 2, 3, 255];
const edited = model.sealScratchPaletteDocument(copied);
assert.strictEqual(model.isScratchPaletteDirty(edited, draft), true);
assert.notStrictEqual(edited.semanticHash, draft.semanticHash);

const translucent = JSON.parse(JSON.stringify(draft));
translucent.colors[12] = [4, 5, 6, 128];
const translucentDocument = model.sealScratchPaletteDocument(translucent);
assert.deepStrictEqual(model.actAlphaLossEligibility(draft), { eligible: true, requiresAlphaLoss: false, lossyIndexes: [], reason: '' });
assert.deepStrictEqual(model.actAlphaLossEligibility(translucentDocument), {
  eligible: false,
  requiresAlphaLoss: true,
  lossyIndexes: [12],
  reason: 'ACT cannot preserve alpha outside transparent index 0.'
});

const tampered = JSON.parse(serialized);
tampered.colors[4] = [12, 34, 56, 255];
assert.throws(() => model.normalizeScratchPaletteDocument(tampered), /semanticHash does not match/);
assert.throws(() => model.parseScratchPaletteDocument('{bad json'), /not valid JSON/);
assert.throws(() => model.parseScratchPaletteDocument('[]'), /document must be an object/);
assert.throws(() => model.normalizeScratchPaletteDocument({ ...draft, surprise: true }), /unsupported fields/);
assert.throws(() => model.normalizeScratchPaletteDocument({ ...draft, version: 2 }), /version must be 1/);
assert.throws(() => model.normalizeScratchPaletteDocument({ ...draft, draftId: 'not-an-id' }), /UUID-style/);
assert.throws(() => model.normalizeScratchPaletteDocument({ ...draft, semanticHash: draft.semanticHash.toUpperCase() }), /lowercase SHA-256/);

for (const invalidColors of [draft.colors.slice(0, 255), [...draft.colors, [0, 0, 0, 255]]]) {
  assert.throws(() => model.sealScratchPaletteDocument({ ...draft, colors: invalidColors }), /exactly 256/);
}
assert.throws(() => model.sealScratchPaletteDocument({ ...draft, colors: [[1, 2, 3, 4], ...draft.colors.slice(1)] }), /index 0 must remain transparent/);
assert.throws(() => model.sealScratchPaletteDocument({ ...draft, colors: draft.colors.map((color, index) => index === 3 ? [0, 0, 0, 256] : color) }), /integer from 0 through 255/);
const sparseColors = [...draft.colors];
delete sparseColors[27];
assert.throws(() => model.sealScratchPaletteDocument({ ...draft, colors: sparseColors }), /color 27 must contain exactly four/);
const sparseTuple = [...draft.colors];
sparseTuple[27] = new Array(4);
assert.throws(() => model.sealScratchPaletteDocument({ ...draft, colors: sparseTuple }), /color 27 channel 0/);
assert.throws(() => model.sealScratchPaletteDocument({ ...draft, lockedIndexes: [0, 1] }), /only index 0/);
assert.throws(() => model.createScratchPaletteDocument({ draftId: DRAFT_ID, name: '   ' }), /cannot be empty/);

console.log('palette scratch document tests passed');
