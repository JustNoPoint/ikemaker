'use strict';

const assert = require('assert');
const model = require('../src/palette_workshop_interaction_model');

const colors = Array.from({ length: 256 }, (_, index) => [index, 255 - index, index % 31, index === 0 ? 0 : 255]);
const palette = { physicalIndex: 3, group: 1, number: 1 };
let state = model.normalizeInteraction();
assert.deepStrictEqual(state.lockedIndexes, [0]);
assert.strictEqual(state.activeIndex, 0);
assert.strictEqual(state.focusMode, 'off', 'a new palette opens at full brightness');
assert.deepStrictEqual(model.focusPalette(colors, 7), colors, 'focus is opt-in');
assert.strictEqual(model.normalizeInteraction({ focusMode: 'dim' }).focusMode, 'off', 'legacy implicit dim state is cleared');
assert.strictEqual(model.normalizeInteraction({ focusMode: 'dim', focusExplicit: true }).focusMode, 'dim', 'an explicit user focus choice may be retained');

state = model.normalizeInteraction({ ...state, activeIndex: 7 });
state = model.copyScope(colors, state, palette);
assert.strictEqual(state.clipboard.scope, 'color');
state = model.normalizeInteraction({ ...state, activeIndex: 8 });
let pasted = model.pasteScope(colors, state, palette);
assert.deepStrictEqual(pasted.colors[8], [7, 248, 7, 255]);
assert.strictEqual(pasted.interaction.checkpoints.length, 1);
assert.throws(() => model.pasteScope(colors, pasted.interaction, { physicalIndex: 4, group: 1, number: 2 }), /another exact palette/);

const transparentPaste = model.normalizeInteraction({ ...state, activeIndex: 0, lockedIndexes: [] });
const withAlpha = colors.map(color => color.slice()); withAlpha[0] = [3, 4, 5, 99];
const alphaResult = model.pasteScope(withAlpha, transparentPaste, palette);
assert.strictEqual(alphaResult.colors[0][3], 99, 'alpha is preserved by default');

const restoreState = model.normalizeInteraction({ activeIndex: 9, lockedIndexes: [0] });
const modified = colors.map(color => color.slice()); modified[9] = [1, 2, 3, 4];
const restored = model.restoreScope(modified, colors, restoreState);
assert.deepStrictEqual(restored.colors[9], colors[9]);

let randomState = model.normalizeInteraction({ scope: 'palette', lockedIndexes: [0], preserveAlpha: true });
let randomized = model.randomize(colors, randomState, () => 12);
assert.strictEqual(randomized.armedOnly, true);
randomized = model.randomize(colors, randomized.interaction, () => 12);
assert.deepStrictEqual(randomized.colors[0], colors[0], 'locked transparency is unchanged');
assert.deepStrictEqual(randomized.colors[1], [12, 12, 12, 255]);
const undone = model.undo(randomized.colors, randomized.interaction);
assert.deepStrictEqual(undone.colors, colors, 'randomization Undo restores the exact palette');

let bounded = model.normalizeInteraction();
for (let index = 0; index < 40; index += 1) bounded = model.pushCheckpoint(bounded, colors, `edit ${index}`);
assert.strictEqual(bounded.checkpoints.length, model.MAX_CHECKPOINTS);

const quantized = model.quantize(colors, 'rgb444');
assert.strictEqual(quantized.profile.bits[0], 4);
assert.deepStrictEqual(colors[7], [7, 248, 7, 255], 'quantization never mutates its source');
assert(quantized.changedCount > 0);
const focused = model.focusPalette(colors, 7, 'dim');
assert.deepStrictEqual(focused[7], colors[7]);
assert(focused[8][0] < colors[8][0]);
assert.throws(()=>model.restoreScope(colors,colors,model.normalizeInteraction({activeIndex:0,lockedIndexes:[0]})),/no unlocked palette indexes/);
assert.throws(()=>model.randomize(colors,model.normalizeInteraction({activeIndex:0,lockedIndexes:[0],randomArmed:true}),()=>12),/no unlocked palette indexes/);
const candidateColors=colors.map(color=>color.slice()),retainedColors=colors.map(color=>color.slice());candidateColors[7]=[90,80,70,60];retainedColors[7]=[1,2,3,4];const reverted=model.revertExactIndex(candidateColors,retainedColors,model.normalizeInteraction({activeIndex:7}),7,'retained');assert.deepStrictEqual(reverted.colors[7],[1,2,3,4],'single-index revert copies exact RGBA including alpha');assert.deepStrictEqual(model.undo(reverted.colors,reverted.interaction).colors,candidateColors,'single-index revert creates exactly one Undo checkpoint');assert.throws(()=>model.revertExactIndex(candidateColors,retainedColors,model.normalizeInteraction({lockedIndexes:[7]}),7,'embedded'),/locked/);
const batchSource=candidateColors.map(color=>color.slice());batchSource[8]=[8,8,8,8];const batchBase=retainedColors.map(color=>color.slice());batchBase[8]=[4,3,2,1];const batch=model.revertExactIndexes(batchSource,batchBase,model.normalizeInteraction({lockedIndexes:[0]}),[8,7,8],'embedded');assert.deepStrictEqual(batch.indexes,[7,8]);assert.deepStrictEqual(batch.colors[7],batchBase[7]);assert.deepStrictEqual(batch.colors[8],batchBase[8]);assert.strictEqual(batch.interaction.checkpoints.length,1,'a multi-index/group revert creates one checkpoint');assert.deepStrictEqual(model.undo(batch.colors,batch.interaction).colors,batchSource);assert.throws(()=>model.revertExactIndexes(batchSource,batchBase,model.normalizeInteraction({lockedIndexes:[8]}),[7,8],'embedded'),/8.*locked/,'a locked member rejects the full batch before mutation');assert.deepStrictEqual(batchSource[7],candidateColors[7],'batch failure and success leave their input immutable');
const copied=model.copyScope(colors,model.normalizeInteraction({activeIndex:7}),palette),tampered={...copied,clipboard:{...copied.clipboard,colors:[[99,99,99,255]]}};
assert.strictEqual(model.normalizeInteraction(tampered).clipboard,null,'tampered persisted clipboard evidence is rejected');
assert.strictEqual(model.normalizeInteraction({focusMode:'pulse',focusExplicit:true}).focusMode,'off','unimplemented focus modes are not advertised or retained');
assert.strictEqual(model.normalizeInteraction({candidateBaseline:{unbounded:'payload'}}).candidateBaseline,null,'candidate baseline remains closed until its reviewed schema exists');
for(const scope of ['selection','domain']){const normalized=model.normalizeInteraction({scope,selectedIndexes:[7,8]});assert.strictEqual(normalized.scope,'index');assert.deepStrictEqual(normalized.selectedIndexes,[],'hidden scopes cannot survive without visible authority controls')}

console.log('Palette Workshop live interaction model tests passed');
