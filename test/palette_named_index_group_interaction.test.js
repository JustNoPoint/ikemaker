'use strict';

const assert = require('assert');
const model = require('../src/palette_workshop_interaction_model');

const colors = Array.from({ length: 256 }, (_, index) => [index, 255 - index, index % 29, index === 0 ? 0 : 255]);
const palette = { physicalIndex: 2, group: 1, number: 1 };
const otherPalette = { physicalIndex: 3, group: 1, number: 2 };
const hash = 'a'.repeat(64);
const skin = model.createNamedGroupAuthority({ id: 'skin', name: 'Skin', authorityHash: hash, memberIndexes: [7, 0, 5] }, palette);
const skinOther = model.createNamedGroupAuthority({ id: 'skin', name: 'Skin', authorityHash: hash, memberIndexes: [0, 5, 7] }, otherPalette);

assert.deepStrictEqual(skin.indexes, [0, 5, 7], 'trusted membership receives one deterministic index order');
assert.deepStrictEqual(model.publicNamedGroup(skin, palette), { ...skin.ref, name: 'Skin', count: 3 }, 'browser projection contains no authoritative indexes');
assert(!Object.prototype.hasOwnProperty.call(model.publicNamedGroup(skin, palette), 'indexes'));

let state = model.selectNamedGroup(model.normalizeInteraction({ lockedIndexes: [0, 7] }), skin.ref, palette, { namedGroupAuthorities: [skin] });
assert.strictEqual(state.scope, 'group');
assert.deepStrictEqual(state.namedGroupRef, skin.ref);
assert(!JSON.stringify(state).includes('"indexes"'), 'retained selection persists only the exact group reference');
assert.deepStrictEqual(model.scopeIndexes(state, { palette, namedGroupAuthorities: [skin], domainIndexes: [99] }), [0, 5, 7], 'browser-like index arrays cannot change host-resolved scope');
assert.deepStrictEqual(model.editableIndexes(state, { palette, namedGroupAuthorities: [skin] }), [5], 'locked members and transparent index zero are protected');

const focused = model.focusPalette(colors, 5, 'dim', { interaction: state, palette, namedGroupAuthorities: [skin] });
assert.deepStrictEqual(focused[0], colors[0]);
assert.deepStrictEqual(focused[5], colors[5]);
assert.deepStrictEqual(focused[7], colors[7]);
assert(focused[8][0] < colors[8][0], 'focus dims only indexes outside the exact resolved group');

const copied = model.copyScope(colors, state, palette, { namedGroupAuthorities: [skin] });
assert.strictEqual(copied.clipboard.scope, 'group');
assert.deepStrictEqual(copied.clipboard.indexes, [], 'group clipboard does not persist client-replayable index membership');
assert.deepStrictEqual(copied.clipboard.sourceNamedGroupRef, skin.ref);
const changed = colors.map(color => color.slice()); changed[0] = [90, 90, 90, 90]; changed[5] = [91, 91, 91, 91]; changed[7] = [92, 92, 92, 92];
const pasted = model.pasteScope(changed, copied, palette, { namedGroupAuthorities: [skin] });
assert.deepStrictEqual(pasted.colors[0], changed[0]);
assert.deepStrictEqual(pasted.colors[7], changed[7]);
assert.deepStrictEqual(pasted.colors[5], [colors[5][0], colors[5][1], colors[5][2], changed[5][3]], 'RGB is pasted while the working alpha remains exact');
assert.deepStrictEqual(pasted.summary, { scopeCount: 3, appliedCount: 1, skippedLockedCount: 2 });
assert.match(pasted.interaction.status, /Applied|Pasted 1 exact color; skipped 2 locked\/protected/);
assert.deepStrictEqual(model.undo(pasted.colors, pasted.interaction).colors, changed, 'group paste creates one exact undo checkpoint');

const restored = model.restoreScope(changed, colors, state, { palette, namedGroupAuthorities: [skin] });
assert.deepStrictEqual(restored.colors[5], colors[5]);
assert.deepStrictEqual(restored.colors[0], changed[0]);
assert.deepStrictEqual(restored.colors[7], changed[7]);
assert.deepStrictEqual(restored.summary, { scopeCount: 3, appliedCount: 1, skippedLockedCount: 2 });
const reset = model.resetScope(changed, colors, state, { palette, namedGroupAuthorities: [skin] });
assert.deepStrictEqual(reset.colors, restored.colors, 'named-group reset uses the same exact scoped restore and not a whole-palette clear');
assert.match(reset.interaction.status, /Reset 1 exact color; skipped 2 locked\/protected/);
assert.deepStrictEqual(model.undo(reset.colors, reset.interaction).colors, changed);

let random = model.randomize(colors, state, () => 33, { palette, namedGroupAuthorities: [skin] });
assert(random.armedOnly);
random = model.randomize(colors, random.interaction, () => 33, { palette, namedGroupAuthorities: [skin] });
assert.deepStrictEqual(random.colors[5], [33, 33, 33, 255]);
assert.deepStrictEqual(random.colors[0], colors[0]);
assert.deepStrictEqual(random.colors[7], colors[7]);
assert.deepStrictEqual(random.summary, { scopeCount: 3, appliedCount: 1, skippedLockedCount: 2 });
assert.deepStrictEqual(model.undo(random.colors, random.interaction).colors, colors);

const face = model.createNamedGroupAuthority({ id: 'face', name: 'Face', authorityHash: hash, indexes: [0, 5, 7] }, palette);
const faceState = model.selectNamedGroup(copied, face.ref, palette, { namedGroupAuthorities: [face] });
assert.throws(() => model.pasteScope(colors, faceState, palette, { namedGroupAuthorities: [face] }), /differs from the current exact group/,'same-size different groups cannot receive a copied named scope');
const staleSkin = model.createNamedGroupAuthority({ id: 'skin', name: 'Skin', authorityHash: hash, indexes: [0, 5, 8] }, palette);
assert.throws(() => model.resolveNamedGroup(state, palette, { namedGroupAuthorities: [staleSkin] }), /authority or membership changed/);
assert.throws(() => model.scopeIndexes(state, { palette, namedGroupAuthorities: [] }), /no longer available/);
assert.throws(() => model.resolveNamedGroup(state, null, { namedGroupAuthorities: [skin] }), /exact current palette identity/);
assert.throws(() => model.resolveNamedGroup(state, palette, { namedGroupAuthorities: [skin, skin] }), /duplicate group identities/);

const crossState = model.selectNamedGroup(model.normalizeInteraction({ scope: 'group', namedGroupRef: skinOther.ref, clipboard: copied.clipboard }), skinOther.ref, otherPalette, { namedGroupAuthorities: [skinOther] });
assert.throws(() => model.pasteScope(colors, crossState, otherPalette, { namedGroupAuthorities: [skinOther] }), /another exact palette/);
const cross = model.pasteScope(colors, crossState, otherPalette, { namedGroupAuthorities: [skinOther], allowCrossPalette: true, sourceNamedGroupAuthority: skin });
assert.strictEqual(cross.summary.appliedCount, 2, 'explicit cross-palette paste keeps exact group membership while index zero stays protected');

assert.throws(() => model.createNamedGroupAuthority({ id: 'bad', authorityHash: hash, indexes: [5, 5] }, palette), /duplicate/);
assert.throws(() => model.createNamedGroupAuthority({ id: 'bad', authorityHash: hash, indexes: [256] }, palette), /out-of-range/);
assert.throws(() => model.createNamedGroupAuthority({ id: 'bad', authorityHash: 'bad', indexes: [5] }, palette), /identity or authority hash/);
assert.throws(() => model.namedGroupAuthority({ ...skin, indexes: [0, 5, 7, 8] }, palette), /membership evidence changed/);
assert.throws(() => model.namedGroupAuthority(skin, otherPalette), /exact source palette/);

console.log('Palette Workshop named index-group authority/model tests passed');
