'use strict';

const assert = require('assert');
const { parseAir, updateCollisionBlock, updateCollisionBlocks, updateFrameElement, updateFrameDirectives, insertFrameElement, deleteFrameElement, frameElementRanges, moveFrameElementPatch, actionSourceRanges, createActionPatch, duplicateActionPatch, deleteActionPatches, applyActionPatches, requireActionMutationBaseline, deleteActions, actionAtLine, selectionAtLine } = require('../src/air_preview_model');

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
assert.deepStrictEqual(actions[0].frames[0].clsn1Records, [{ index: 0, rect: [1, -15, 20, -5], line: 6, authoredIndex: 0, allocation: 'authored' }]);
assert.strictEqual(actions[0].frames[0].clsn1Source, 'element');
assert.strictEqual(actions[0].frames[0].clsn2Ownership, 'default-declared-for-this-element', 'a default declaration is active on the immediately following element as well as becoming persistent');
assert.deepStrictEqual(actions[0].frames[1].clsn1, []);
assert.strictEqual(actions[0].frames[1].clsn2Source, 'default');
assert.strictEqual(actions[0].frames[1].clsn2Ownership, 'inherited-default', 'later elements identify inherited default ownership without breaking the legacy source label');
assert.deepStrictEqual(actions[0].frames[2].clsn2, [[-5, -5, 5, 5]]);
assert.strictEqual(actions[0].frames[2].clsn2Source, 'element');

const authoredIndices = parseAir('[Begin Action 4]\nClsn2: 2\nClsn2[7] = -5,-6,7,8\nClsn2[2] = 1,2,3,4\n4,0,0,0,1\n')[0].frames[0];
assert.deepStrictEqual(authoredIndices.clsn2, [[-5, -6, 7, 8], [1, 2, 3, 4]], 'invalid authored labels fall back to the first free effective slots');
assert.deepStrictEqual(authoredIndices.clsn2Records.map(({ index, authoredIndex, allocation, rect }) => ({ index, authoredIndex, allocation, rect })), [{ index: 0, authoredIndex: 7, allocation: 'invalid-index-fallback', rect: [-5, -6, 7, 8] }, { index: 1, authoredIndex: 2, allocation: 'invalid-index-fallback', rect: [1, 2, 3, 4] }], 'effective slots and authored labels remain distinct');
assert.deepStrictEqual(authoredIndices.clsn2AuthoredRecords.map(({ index, effectiveIndex }) => ({ index, effectiveIndex })), [{ index: 7, effectiveIndex: 0 }, { index: 2, effectiveIndex: 1 }], 'raw authoring evidence remains available separately');
assert.deepStrictEqual(authoredIndices.clsn2StableRecords.map(({ index, authoredIndex, allocation }) => ({ index, authoredIndex, allocation })), [{ index: 0, authoredIndex: 7, allocation: 'source-order' }, { index: 1, authoredIndex: 2, allocation: 'source-order' }], 'stable projection retains source-order slots independently of authored labels');
assert.deepStrictEqual(authoredIndices.clsn2IndexedRecords.map(({ index, authoredIndex, allocation }) => ({ index, authoredIndex, allocation })), [{ index: 0, authoredIndex: 7, allocation: 'invalid-index-fallback' }, { index: 1, authoredIndex: 2, allocation: 'invalid-index-fallback' }], 'indexed projection retains the verified authored-index fallback allocation');
const absentCollisionIndex = parseAir('[Begin Action 8]\nClsn1: 1\nClsn1 = 9,8,1,2\n8,0,0,0,1\n')[0].frames[0];
assert.deepStrictEqual(absentCollisionIndex.clsn1AuthoredRecords[0], { index: null, indexText: '', rawRect: [9, 8, 1, 2], rect: [1, 2, 9, 8], line: 3, stableSlot: 0, indexedSlot: 0, effectiveIndex: 0, allocation: 'absent-index-fallback', authoredKind: 'clsn1', authoredGroupToken: 'Clsn1' }, 'raw authored evidence preserves absent labels, exact group token, source-order coordinates, and normalized geometry separately');
assert.deepStrictEqual(absentCollisionIndex.clsn1IndexedRecords.map(({ index, allocation }) => ({ index, allocation })), [{ index: 0, allocation: 'absent-index-fallback' }], 'an absent label uses the verified indexed first-free fallback');
const copiedActions = parseAir('[Begin Action 20]\nClsn1: 1\nClsn1[7] = -5,-6,7,8\n20,0,0,0,2\n[Begin Action 100]\nCopy Action 20\n');
const copiedAction = copiedActions.find((item) => item.number === 100);
assert.strictEqual(copiedAction.readOnly, true, 'Copy Action geometry is explicitly inherited and read-only');
assert.strictEqual(copiedAction.resolvedFrom, 20);
assert.deepStrictEqual(copiedAction.frames[0].clsn1Records.map((record) => record.index), [0], 'Copy Action inherits effective collision slots');
assert.deepStrictEqual(copiedAction.frames[0].clsn1AuthoredRecords.map((record) => record.index), [7], 'Copy Action retains raw authored collision labels separately');
assert.deepStrictEqual(copiedAction.frames[0].clsn1StableRecords.map((record) => record.index), [0], 'Copy Action clones stable target projection evidence');
assert.deepStrictEqual(copiedAction.frames[0].clsn1IndexedRecords.map((record) => record.index), [0], 'Copy Action clones indexed target projection evidence');
assert.strictEqual(copiedAction.frames[0].authorityAction, 20);
assert.throws(() => updateCollisionBlock('[Begin Action 20]\n20,0,0,0,2\n[Begin Action 100]\nCopy Action 20\n', { action: 100, frameIndex: 0, kind: 'clsn1', scope: 'element', boxes: [] }), /inherits collision/);
const brokenCopy = parseAir('[Begin Action 100]\nCopy Action 999\n')[0];
assert.match(brokenCopy.copyError, /could not be resolved/, 'unresolved copies remain visible as errors instead of disappearing');
assert.strictEqual(brokenCopy.copyResolution, 'unresolved-without-common-context', 'single-file resolution does not mislabel an unknown common-AIR target as definitely missing');
const negativeCopy = parseAir('[Begin Action 102]\nCopy Action -1\n')[0];
assert.strictEqual(negativeCopy.copyResolution, 'invalid-negative-target');
assert.match(negativeCopy.copyError, /invalid.*non-negative/i, 'negative Copy Action targets are invalid, not potentially resolvable in common AIR');
const copyCycle = parseAir('[Begin Action 100]\nCopy Action 101\n[Begin Action 101]\nCopy Action 100\n');
assert(copyCycle.every(item => /cycle/i.test(item.copyError)), 'Copy Action cycles remain visible and never recurse indefinitely');
const engineCollision = parseAir('[Begin Action 9]\nClsn2: 3\n; comment between declaration and data\nClsn2[1] = 9,8,1,2\n\nClsn1[1] = -3,-4,3,4\nClsn2[99] = 5,6,7,8\n9,0,0,0,1\n')[0].frames[0];
assert.deepStrictEqual(engineCollision.clsn2, [[-3, -4, 3, 4], [1, 2, 9, 8], [5, 6, 7, 8]], 'effective collision slots honor valid indices, normalize endpoints, accept header-directed assignment names, and fall back invalid labels');
assert.deepStrictEqual(engineCollision.clsn2Records.map(record => [record.index, record.authoredIndex, record.allocation]), [[0, 1, 'duplicate-fallback'], [1, 1, 'authored'], [2, 99, 'invalid-index-fallback']]);
assert.deepStrictEqual(engineCollision.clsn2StableRecords.map(record => [record.index, record.authoredIndex, record.allocation]), [[0, 1, 'source-order'], [1, 1, 'source-order'], [2, 99, 'source-order']], 'stable slots follow assignment source order even when the assignment prefix differs from the owning header');
assert.deepStrictEqual(engineCollision.clsn2IndexedRecords.map(record => [record.index, record.authoredIndex, record.allocation]), [[0, 1, 'duplicate-fallback'], [1, 1, 'authored'], [2, 99, 'invalid-index-fallback']], 'indexed slots use the verified unique-valid-label then first-free fallback algorithm');
assert.deepStrictEqual(engineCollision.clsn2AuthoredRecords[0].rawRect, [9, 8, 1, 2], 'raw evidence retains source coordinate order before endpoint normalization');
for (const malformedLine of ['Clsn1 bogus', 'Clsn1[0] = 1,2,3', 'Clsn2: 1']) {
  const malformed = parseAir(`[Begin Action 13]\nClsn1: 2\n${malformedLine}\nClsn1[0] = 1,2,3,4\n13,0,0,0,1\n`)[0];
  assert.strictEqual(malformed.frames[0].clsn1CompilerInvalid, true, `indexed projection is compiler-invalid after ${malformedLine}`);
  assert.deepStrictEqual(malformed.frames[0].clsn1IndexedRecords.map(record => record.allocation), ['missing', 'missing'], 'the indexed projection stops at the first malformed assignment and never exposes later rectangles');
  assert(malformed.diagnostics.some(item => item.kind === 'malformed-collision-assignment') && malformed.diagnostics.some(item => item.kind === 'collision-count-mismatch'));
}
const backedUpHeader = parseAir('[Begin Action 16]\nClsn1: 2\nClsn2: 1\nClsn1[0] = 9,8,1,2\n16,0,0,0,1\n')[0].frames[0];
assert.strictEqual(backedUpHeader.clsn1CompilerInvalid, true, 'the interrupted first collision group remains independently invalid');
assert.strictEqual(backedUpHeader.clsn2CompilerInvalid, false, 'the outer parser reprocesses the backed-up valid collision header');
assert.deepStrictEqual(backedUpHeader.clsn2, [[1, 2, 9, 8]], 'the next group is normalized and retained instead of being swallowed by the malformed prior block');
assert.strictEqual(backedUpHeader.clsn2AuthoredRecords[0].authoredKind, 'clsn1', 'the new header owns a following mismatched assignment prefix without losing raw evidence');
assert.strictEqual(backedUpHeader.clsn2Ownership, 'element');
const elementThenDefault = parseAir('[Begin Action 14]\nClsn1: 1\nClsn1[0] = 1,1,2,2\nClsn1Default: 1\nClsn1[0] = 3,3,4,4\n14,0,0,0,1\n14,1,0,0,1\n')[0];
assert.deepStrictEqual(elementThenDefault.frames.map(frame => frame.clsn1), [[[3, 3, 4, 4]], [[3, 3, 4, 4]]], 'a later Default wins for the next element and persists afterward');
assert.deepStrictEqual(elementThenDefault.frames.map(frame => frame.clsn1Ownership), ['default-declared-for-this-element', 'inherited-default']);
const defaultThenElement = parseAir('[Begin Action 15]\nClsn2Default: 1\nClsn2[0] = 1,1,2,2\nClsn2: 1\nClsn2[0] = 3,3,4,4\n15,0,0,0,1\n15,1,0,0,1\n')[0];
assert.deepStrictEqual(defaultThenElement.frames.map(frame => frame.clsn2), [[[3, 3, 4, 4]], [[1, 1, 2, 2]]], 'a later element block wins once while the earlier Default remains the fallback');
assert.deepStrictEqual(defaultThenElement.frames.map(frame => frame.clsn2Ownership), ['element', 'inherited-default']);
const missingCollision = parseAir('[Begin Action 10]\nClsn1: 2\nClsn1[0] = 1,2,3,4\n10,0,0,0,1\n')[0];
assert.deepStrictEqual(missingCollision.frames[0].clsn1, [[1, 2, 3, 4], [0, 0, 0, 0]], 'declared but missing collision assignments retain allocated zero entries');
assert(missingCollision.diagnostics.some(item => item.kind === 'collision-count-mismatch'));
const boundedCollision = parseAir('[Begin Action 11]\nClsn1: 999999999\n11,0,0,0,1\n')[0];
assert.strictEqual(boundedCollision.frames[0].clsn1.length, 4096, 'malformed huge declarations remain responsive under the preview safety bound');
assert(boundedCollision.diagnostics.some(item => item.kind === 'collision-count-limit'));
const unsafeCountCollision = parseAir('[Begin Action 12]\nClsn1: 999999999999999999999999999999999999\n12,0,0,0,1\n')[0];
assert.strictEqual(unsafeCountCollision.frames[0].clsn1.length, 4096, 'unsafe integer declarations use the same bounded malformed preview rather than silently becoming zero');
assert(unsafeCountCollision.diagnostics.some(item => item.kind === 'collision-count-limit'));
const copyIgnoresLocal = parseAir('[Begin Action 1]\n1,1,0,0,1\n[Begin Action 2]\nCopy Action 1\n9,9,0,0,1\n').find(item => item.number === 2);
assert.deepStrictEqual(copyIgnoresLocal.frames.map(frame => [frame.group, frame.index]), [[1, 1]], 'Copy Action terminates local action parsing like the pinned engine');
const emptyFallthrough = parseAir('[Begin Action 3]\n; intentionally empty\n[Begin Action 4]\n4,0,0,0,1\n');
assert.strictEqual(emptyFallthrough[0].fallthroughAction, 4, 'empty actions preserve the legacy fallthrough relationship');
assert.strictEqual(emptyFallthrough[0].readOnly, true);
const duplicateActions = parseAir('[Begin Action 5]\n5,0,0,0,1\n[Begin Action 5]\n5,1,0,0,1\n');
assert.strictEqual(duplicateActions.length, 2, 'raw duplicate declarations remain visible');
assert.strictEqual(duplicateActions[1].shadowedDuplicate, true, 'later duplicate declarations are marked shadowed by first-wins runtime authority');
assert.strictEqual(parseAir('[Begin Action 6]\n6,0,0,0,1\nLoopStart\n6,1,0,0,1\nLoopStart\n')[0].loopStart, 1, 'a trailing LoopStart falls back to the prior valid marker');
const commentCollisionSource = '[Begin Action 7]\nClsn2: 2 ; retain header\n; retain between records\nClsn2[0] = 0,0,5,5 ; retain first\n\nClsn2[1] = 6,6,9,9\n7,0,0,0,1\n';
const commentCollisionEdit = updateCollisionBlock(commentCollisionSource, { action: 7, frameIndex: 0, kind: 'clsn2', scope: 'element', boxes: [[1, 2, 5, 6], [7, 8, 9, 10]] });
assert(commentCollisionEdit.includes('; retain between records') && commentCollisionEdit.includes('; retain first') && commentCollisionEdit.includes('Clsn2: 2 ; retain header'), 'visual edits preserve comment and blank-line trivia inside a complete collision block');
assert.throws(() => updateCollisionBlock(commentCollisionSource, { action: 7, frameIndex: 0, kind: 'clsn2', scope: 'element', boxes: [[1, 2, 5, 6]] }), /trivia is not discarded/, 'count-changing edits fail closed when collision-block trivia has ambiguous ownership');
assert.throws(() => updateFrameElement('[Begin Action 5]\n5,0,0,0,1\n[Begin Action 5]\n5,1,0,0,1\n', { action: 5, frameIndex: 0, group: 5, index: 2, x: 0, y: 0, time: 1 }), /defined more than once/, 'visual frame edits reject duplicate authored Action IDs');
const authoredIndexEdit = updateCollisionBlock('[Begin Action 4]\nClsn2: 2\nClsn2[7] = -5,-6,7,8\nClsn2[2] = 1,2,3,4\n4,0,0,0,1\n', { action: 4, frameIndex: 0, kind: 'clsn2', scope: 'element', boxes: [[-9, -6, 7, 8], [1, 2, 8, 9]] });
assert(authoredIndexEdit.includes('Clsn2[0] = -9, -6, 7, 8'), 'visual edits canonicalize fallback-allocated boxes to their effective index');
assert(authoredIndexEdit.includes('Clsn2[1] = 1, 2, 8, 9'), 'visual edits emit the effective second slot instead of preserving an invalid authored label');
assert.throws(() => updateCollisionBlock(authoredIndexEdit, { action: 4, frameIndex: 0, kind: 'clsn2', scope: 'element', boxes: [[0, 0, 4, 4]], records: [{ index: 12, rect: [0, 0, 4, 4] }] }), /between 0 and 0/, 'strict visual authoring rejects indexes that permissive playback would remap');
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
const directiveSource = '[Begin Action 60]\r\nLoopStart ; old loop note\r\nInterpolate Offset ; old offset note\r\nClsn2: 1\r\nClsn2[0] = -5,-6,7,8\r\n60,0,1,2,3\r\nInterpolate Angle\r\n60,1,4,5,6\r\n';
const directed = updateFrameDirectives(directiveSource, { action: 60, frameIndex: 1, loopStart: true, interpolate: ['blend', 'scale', 'angle'] });
const directedAction = parseAir(directed)[0];
assert.deepStrictEqual(directedAction.loopMarkers, [1], 'visual LoopStart authoring moves the single marker to the selected frame');
assert.deepStrictEqual(directedAction.frames[1].interpolate, ['blend', 'scale', 'angle'], 'visual interpolation authoring uses a canonical stable order');
assert.deepStrictEqual(directedAction.frames[0].clsn2, [[-5, -6, 7, 8]], 'directive editing preserves collision geometry');
assert(directed.includes('; old loop note') && directed.includes('; old offset note'), 'comments attached to replaced directives are retained as standalone comments');
const clearedDirectives = updateFrameDirectives(directed, { action: 60, frameIndex: 1, loopStart: false, interpolate: [] });
assert.deepStrictEqual(parseAir(clearedDirectives)[0].loopMarkers, [], 'clearing the selected LoopStart does not invent another marker');
assert.deepStrictEqual(parseAir(clearedDirectives)[0].frames[1].interpolate, [], 'all selected interpolation toggles can be cleared');
assert.throws(() => updateFrameDirectives(directiveSource, { action: 60, frameIndex: 0, loopStart: false, interpolate: ['position'] }), /only Offset, Blend, Scale, and Angle/);
const inserted = insertFrameElement(edited, { action: 50, frameIndex: 0, copy: true });
assert.strictEqual(parseAir(inserted)[0].frames.length, 3);
const added = insertFrameElement(edited, { action: 50, frameIndex: 0, copy: false });
const addedAction = parseAir(added)[0];
assert.deepStrictEqual(
  [addedAction.frames[1].group, addedAction.frames[1].index, addedAction.frames[1].x, addedAction.frames[1].y],
  [addedAction.frames[0].group, addedAction.frames[0].index + 1, addedAction.frames[0].x, addedAction.frames[0].y],
  'a new AIR frame inherits the selected frame group and offsets while proposing the next sprite index'
);
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
const createdReviewed = applyActionPatches(lifecycle, [createActionPatch(lifecycle, { action: 31, comment: 'Air dash startup', group: 42, index: 7, x: 2, y: -3, time: 5, flags: 'HV', loopStart: true })]);
assert(createdReviewed.endsWith('; Air dash startup\r\n[Begin Action 31]\r\nLoopStart\r\n42, 7, 2, -3, 5, HV'), 'reviewed new action options preserve EOL and emit an optional comment, LoopStart, and flags');
assert.throws(() => createActionPatch(lifecycle, { action: 32, comment: 'bad\ncomment', group: 0, index: 0 }), /one line/);
assert.throws(() => createActionPatch(lifecycle, { action: 32, flags: 'H,V', group: 0, index: 0 }), /one AIR flags field/);
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
