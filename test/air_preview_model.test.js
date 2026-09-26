'use strict';

const assert = require('assert');
const { parseAir, updateCollisionBlock, updateCollisionBlocks, updateFrameElement, insertFrameElement, deleteFrameElement, frameElementRanges, moveFrameElementPatch, actionSourceRanges, createActionPatch, duplicateActionPatch, deleteActionPatches, applyActionPatches, requireActionMutationBaseline, deleteActions, actionAtLine, selectionAtLine } = require('../src/air_preview_model');

const actions = parseAir(`
[Begin Action 200]
Clsn2Default: 1
 Clsn2[0] = -10, -20, 10, 0
Clsn1: 1
 Clsn1[0] = 1, -15, 20, -5
200, 0, 2, 3, 4
LoopStart
200, 1, 0, 0, 2, H
Clsn2: 1
 Clsn2[0] = -5, -5, 5, 5
200, 2, 0, 0, 1
`);

assert.strictEqual(actions.length, 1);
assert.strictEqual(actions[0].number, 200);
assert.strictEqual(actions[0].loopStart, 1);
assert.strictEqual(actions[0].frames.length, 3);
assert.deepStrictEqual(actions[0].frames[0].clsn1, [[1, -15, 20, -5]]);
assert.strictEqual(actions[0].frames[0].clsn1Source, 'element');
assert.deepStrictEqual(actions[0].frames[1].clsn1, []);
assert.strictEqual(actions[0].frames[1].clsn2Source, 'default');
assert.deepStrictEqual(actions[0].frames[2].clsn2, [[-5, -5, 5, 5]]);
assert.strictEqual(actions[0].frames[2].clsn2Source, 'element');
assert.strictEqual(actions[0].frames[0].line, 7);
const changedElement = updateCollisionBlock(`[Begin Action 0]\nClsn2Default: 1\nClsn2[0] = -5, -5, 5, 5\n0,0,0,0,1\n`, { action: 0, frameIndex: 0, kind: 'clsn1', scope: 'element', boxes: [[1, 2, 3, 4]] });
assert(changedElement.includes('Clsn1: 1\nClsn1[0] = 1, 2, 3, 4\n0,0,0,0,1'));
const clearedDefault = updateCollisionBlock(changedElement, { action: 0, frameIndex: 0, kind: 'clsn2', scope: 'default', boxes: [] });
assert(clearedDefault.includes('Clsn2Default: 0'));
assert.strictEqual(parseAir(clearedDefault)[0].frames[0].clsn2Source, 'default');
const scopedSource = `[Begin Action 10]\n10,0,0,0,1\n10,1,0,0,1\n10,2,0,0,1\n`;
const selected = updateCollisionBlocks(scopedSource, { action: 10, frameIndex: 0, frameIndices: [0, 2], kind: 'clsn1', scope: 'selected', boxes: [[-1, -2, 3, 4]] });
const selectedAction = parseAir(selected)[0];
assert.strictEqual(selectedAction.frames[0].clsn1Source, 'element');
assert.strictEqual(selectedAction.frames[1].clsn1Source, 'none');
assert.strictEqual(selectedAction.frames[2].clsn1Source, 'element');
const wholeAction = updateCollisionBlocks(scopedSource, { action: 10, frameIndex: 0, kind: 'clsn2', scope: 'action', boxes: [[-4, -3, 2, 1]] });
assert(parseAir(wholeAction)[0].frames.every((frame) => frame.clsn2Source === 'element'));
const removed = deleteActions('; keep file header\n[Begin Action 10]\n10,0,0,0,1\n\n[Begin Action 20]\n20,0,0,0,1\n\n[Begin Action 30]\n30,0,0,0,1\n', [10, 30]);
assert.deepStrictEqual(removed.deleted, [10, 30]);
assert.deepStrictEqual(parseAir(removed.text).map(action => action.number), [20]);
const editable = '[Begin Action 50]\r\nClsn2: 1\r\nClsn2[0] = -5, -6, 7, 8\r\n50, 0, 1, 2, 3, H, AS128D128, 1.5, .5, 20 ; keep\r\n50, 1, 0, 0, 4\r\n';
const edited = updateFrameElement(editable, { action: 50, frameIndex: 0, group: 51, index: 9, x: -3, y: 4, time: 6, flags: 'V', blend: 'A1', scaleX: 2, scaleY: 1, angle: -10 });
assert(edited.includes('51, 9, -3, 4, 6, V, A1, 2, 1, -10 ; keep'));
assert.strictEqual(parseAir(edited)[0].frames[0].index, 9);
const inserted = insertFrameElement(edited, { action: 50, frameIndex: 0, copy: true });
assert.strictEqual(parseAir(inserted)[0].frames.length, 3);
const deleted = deleteFrameElement(inserted, { action: 50, frameIndex: 0 });
assert.strictEqual(parseAir(deleted)[0].frames.length, 2);
assert(!deleted.includes('Clsn2: 1'), 'deleting an element removes its explicit collision block');
assert.throws(() => deleteFrameElement('[Begin Action 1]\n1,0,0,0,1\n', { action: 1, frameIndex: 0 }), /at least one frame/);
const reorderSource = '[Begin Action 0]\r\nClsn2Default: 1\nClsn2[0] = -5, -6, 7, 8\r\n0, 0, 0, 0, 2 ; first\n; second element note\r\nLoopStart\nInterpolate Offset\r\nClsn1: 0\n0, 1, 3, 4, -1, H, AS128D128, 1.5, .5, 20 ; second';
const reorderRanges = frameElementRanges(reorderSource, 0);
assert.strictEqual(reorderRanges.blocks.length, 2);
assert(reorderRanges.blocks[1].text.startsWith('LoopStart\nInterpolate Offset\r\nClsn1: 0\n'), 'the second raw block owns its loop, interpolation and explicit zero-count collision block while standalone notes remain anchored');
const movedEarlierPatch = moveFrameElementPatch(reorderSource, { action: 0, frameIndex: 1, direction: 'earlier' }), movedEarlier = applyActionPatches(reorderSource, [movedEarlierPatch]);
assert.deepStrictEqual(parseAir(movedEarlier)[0].frames.map((frame) => frame.index), [1, 0], 'Move Earlier swaps exactly one adjacent frame');
assert.strictEqual(parseAir(movedEarlier)[0].loopStart, 0, 'LoopStart travels with its marked frame');
assert.deepStrictEqual(parseAir(movedEarlier)[0].frames[0].interpolate, ['offset'], 'interpolation travels with its target frame');
assert.strictEqual(parseAir(movedEarlier)[0].frames[0].clsn1Source, 'element', 'an explicit zero-count collision block travels with its frame');
assert.deepStrictEqual(parseAir(movedEarlier)[0].frames.map((frame) => frame.clsn2), [[[-5, -6, 7, 8]], [[-5, -6, 7, 8]]], 'effective default collision remains unchanged for both reordered frames');
assert(movedEarlier.includes('0, 1, 3, 4, -1, H, AS128D128, 1.5, .5, 20 ; second\n; second element note\r\n0, 0, 0, 0, 2 ; first'), 'standalone comments stay anchored between element positions instead of being guessed as frame-owned');
assert(movedEarlier.endsWith('0, 0, 0, 0, 2 ; first'), 'mixed EOL separators and final no-newline status are preserved without reconstructing the moved frame');
const movedBackPatch = moveFrameElementPatch(movedEarlier, { action: 0, frameIndex: 0, direction: 'later' });
assert.strictEqual(applyActionPatches(movedEarlier, [movedBackPatch]), reorderSource, 'moving the same raw block back restores every byte');
const leadingCommentSource = '[Begin Action 6]\r\n; action-level note stays at the top\nClsn1: 0\r\nLoopStart\nInterpolate Angle\r\n6,0,0,0,-1\n6,1,0,0,2';
const leadingMove = moveFrameElementPatch(leadingCommentSource, { action: 6, frameIndex: 0, direction: 'later' }), leadingMoved = applyActionPatches(leadingCommentSource, [leadingMove]);
assert(leadingMoved.startsWith('[Begin Action 6]\r\n; action-level note stays at the top\n6,1,0,0,2\n'), 'action-leading comments stay anchored even when the first element owns collision, LoopStart and interpolation directives');
assert.deepStrictEqual(leadingMove.movingInterpolation, ['angle']);
assert.deepStrictEqual(leadingMove.neighborInterpolation, []);
assert.deepStrictEqual({ before: leadingMove.holdBefore, after: leadingMove.holdAfter, reachableBefore: leadingMove.reachableBefore, reachableAfter: leadingMove.reachableAfter }, { before: 0, after: 1, reachableBefore: 1, reachableAfter: 2 }, 'the move reports changed first-hold reachability without rewriting timing');
const leadingBack = moveFrameElementPatch(leadingMoved, { action: 6, frameIndex: 1, direction: 'earlier' });
assert.strictEqual(applyActionPatches(leadingMoved, [leadingBack]), leadingCommentSource, 'first-element comments and directives round-trip byte exactly');
assert.throws(() => moveFrameElementPatch(reorderSource, { action: 0, frameIndex: 0, direction: 'earlier' }), /already the first/);
assert.throws(() => moveFrameElementPatch(reorderSource, { action: 0, frameIndex: 1, direction: 'later' }), /already the last/);
const defaultBoundary = '[Begin Action 1]\n1,0,0,0,1\nClsn2Default: 1\nClsn2[0] = 0,0,5,5\n1,1,0,0,1\n';
assert.throws(() => moveFrameElementPatch(defaultBoundary, { action: 1, frameIndex: 1, direction: 'earlier' }), /clsn2Default changes/i);
const unknownBoundary = '[Begin Action 2]\n2,0,0,0,1\nUnsupported Directive = keep\n2,1,0,0,1\n';
assert.throws(() => moveFrameElementPatch(unknownBoundary, { action: 2, frameIndex: 0, direction: 'later' }), /unsupported directive/);
const unknownBeforeFirst = '[Begin Action 2]\nUnsupported Target = uncertain\n2,0,0,0,1\n2,1,0,0,1\n';
assert.throws(() => moveFrameElementPatch(unknownBeforeFirst, { action: 2, frameIndex: 0, direction: 'later' }), /unsupported directive/);
assert.throws(() => moveFrameElementPatch('[Begin Action 3]\n3,0,0,0,1\nClsn1: 2\nClsn1[0] = 0,0,1,1\n3,1,0,0,1\n', { action: 3, frameIndex: 0, direction: 'later' }), /Malformed clsn1 block/);
assert.throws(() => moveFrameElementPatch('[Begin Action 4]\n4,0,0,0,1\n4,1,0,0,1\n[Begin Action 4]\n4,2,0,0,1\n', { action: 4, frameIndex: 0, direction: 'later' }), /defined more than once/);
assert(removed.text.includes('; keep file header'));
const lifecycle = '; file header\r\n[Begin Action 10] ; walk\r\n; owned because content follows\nInterpolate Offset\r\n10, 0, 1, 2, 3\r\nUnknownDirective = keep, exact\n; notes for the next section\r\n\r\n[Begin Action 20] ; idle\n20, 0, 0, 0, 1';
const lifecycleRanges = actionSourceRanges(lifecycle);
assert.deepStrictEqual(lifecycleRanges.map(item => item.number), [10, 20], 'commented action headers share one boundary parser');
assert(lifecycleRanges[0].text.includes('UnknownDirective = keep, exact\n'), 'unknown action body lines remain owned verbatim');
assert(!lifecycleRanges[0].text.includes('notes for the next section'), 'a trailing standalone comment block remains outside the prior action');
const duplicatePatch = duplicateActionPatch(lifecycle, 10, 11), duplicatedLifecycle = applyActionPatches(lifecycle, [duplicatePatch]);
assert(duplicatedLifecycle.includes('[Begin Action 11] ; walk\r\n; owned because content follows\nInterpolate Offset\r\n10, 0, 1, 2, 3\r\nUnknownDirective = keep, exact\n'), 'duplication changes only the header number and preserves mixed-EOL body bytes');
assert(duplicatedLifecycle.includes('; notes for the next section\r\n\r\n[Begin Action 20]'), 'duplication does not consume neighboring standalone comments');
const finalCommentSource = '[Begin Action 0]\n0,0,0,0,1\n; final action note\n', finalCommentCopy = applyActionPatches(finalCommentSource, [duplicateActionPatch(finalCommentSource, 0, 1)]);
assert(finalCommentCopy.includes('[Begin Action 1]\n0,0,0,0,1\n; final action note\n'), 'EOF comments remain owned by and copied with the final action');
const commentOnlyFinal = '[Begin Action 5] ; intentionally empty\r\n; retained final-action note\r\n';
assert.strictEqual(actionSourceRanges(commentOnlyFinal)[0].text, commentOnlyFinal, 'a comment-only final action owns its EOF notes');
assert.throws(() => duplicateActionPatch(lifecycle, 10, 20), /already exists/);
assert.throws(() => duplicateActionPatch('[Begin Action 1]\n1,0,0,0,1\n[Begin Action 1]\n1,1,0,0,1', 1, 2), /defined more than once/);
const createdLifecycle = applyActionPatches(lifecycle, [createActionPatch(lifecycle, { action: 30, group: 999, index: 0, x: -2, y: 3, time: 4 })]);
assert(createdLifecycle.endsWith('[Begin Action 30]\r\n999, 0, -2, 3, 4'), 'new action uses the established EOL and does not require an existing SFF sprite');
assert.throws(() => createActionPatch(lifecycle, { action: 31, group: 0, index: 0, x: 0, y: 0, time: -2 }), /-1 \(hold\)/, 'new action duration rejects values below the native hold sentinel');
const deletePatches = deleteActionPatches(lifecycle, [10, 20]), deletedLifecycle = applyActionPatches(lifecycle, deletePatches);
assert(deletedLifecycle.includes('; file header\r\n'), 'narrow deletion preserves the file header');
assert(deletedLifecycle.includes('; notes for the next section\r\n'), 'narrow deletion preserves trailing standalone section notes');
assert(!deletedLifecycle.includes('[Begin Action 10]') && !deletedLifecycle.includes('[Begin Action 20]'), 'commented and final no-newline actions delete by exact ranges');
assert.strictEqual(requireActionMutationBaseline({ version: 4, text: lifecycle }, { version: 4, text: lifecycle }), true);
assert.throws(() => requireActionMutationBaseline({ version: 4, text: lifecycle }, { version: 5, text: lifecycle + '\n; external edit' }), /changed while the action edit was being reviewed/, 'source changes during confirmation reject the mutation before any patch is applied');
const cursorSource = '; header\n[Begin Action 10]\n10,0,0,0,1\n\n[Begin Action 20]\n20,0,0,0,1\n';
assert.strictEqual(actionAtLine(cursorSource, 0), null);
assert.strictEqual(actionAtLine(cursorSource, 2), 10);
assert.strictEqual(actionAtLine(cursorSource, 5), 20);
const elementCursorSource = '[Begin Action 10]\n10,0,0,0,1\nClsn1: 1\nClsn1[0] = 0,0,5,5\n10,1,0,0,1\n10,2,0,0,1\n';
assert.deepStrictEqual(selectionAtLine(elementCursorSource, 1), { action: 10, frameIndex: 0 });
assert.deepStrictEqual(selectionAtLine(elementCursorSource, 2), { action: 10, frameIndex: 1 });
assert.deepStrictEqual(selectionAtLine(elementCursorSource, 4), { action: 10, frameIndex: 1 });
assert.deepStrictEqual(selectionAtLine(elementCursorSource, 5), { action: 10, frameIndex: 2 });
console.log('AIR preview model tests passed');
