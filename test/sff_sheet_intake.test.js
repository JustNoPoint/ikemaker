'use strict';

const assert = require('assert');
const { indexedSourcePng } = require('../src/sff_reader');
const { readIndexedPng8 } = require('../src/sff_png8_source');
const { sha256, analyzeIndexedGutters, analyzeIndexedComponents, gridProposal, extractIndexedGrid, baseSession, replaySession, reviewAction, componentAttachmentProposal, componentAttachmentSuggestions, creatorHandoff, validateJournal } = require('../src/sff_sheet_intake');

const colors = Array.from({ length: 256 }, (_, index) => [index, 255 - index, index ^ 85, index === 0 ? 0 : 255]);
const width = 7, height = 4, indices = Buffer.from([
  1, 2, 0, 3, 4, 0, 9,
  5, 6, 0, 7, 8, 0, 9,
  10, 11, 0, 12, 13, 0, 9,
  14, 15, 0, 16, 17, 0, 9
]);
const sheet = indexedSourcePng(width, height, indices, colors), sourceHash = sha256(sheet);
const gutters = analyzeIndexedGutters(sheet, { mode: 'palette-index', backgroundIndex: 0 });
assert.deepStrictEqual(gutters.emptyColumns.map(run => [run.start, run.end]), [[2, 2], [5, 5]], 'explicit background index must reveal exact empty column ranges');
assert.deepStrictEqual(gutters.occupiedColumns.map(run => [run.start, run.end]), [[0, 1], [3, 4], [6, 6]]);
assert.strictEqual(gutters.foregroundPixelCount + gutters.backgroundPixelCount, width * height, 'gutter evidence accounts for every source pixel');
assert.strictEqual(gutters.suggestedGrid, null, 'irregular occupied runs must not invent a regular grid');
const alphaGutters = analyzeIndexedGutters(sheet, { mode: 'alpha' });
assert.deepStrictEqual(alphaGutters.emptyColumns.map(run => [run.start, run.end]), [[2, 2], [5, 5]], 'alpha is an explicit alternative background rule');
assert.throws(() => analyzeIndexedGutters(sheet, { mode: 'palette-index', backgroundIndex: 256 }), /between 0 and 255/);
const regularIndices = Buffer.from([
  1, 1, 0, 1, 1,
  1, 1, 0, 1, 1,
  0, 0, 0, 0, 0,
  1, 1, 0, 1, 1,
  1, 1, 0, 1, 1
]);
const regularGutters = analyzeIndexedGutters(indexedSourcePng(5, 5, regularIndices, colors), { mode: 'palette-index', backgroundIndex: 0 });
assert.deepStrictEqual({ ...regularGutters.suggestedGrid }, { cellWidth: 2, cellHeight: 2, offsetX: 0, offsetY: 0, gapX: 1, gapY: 1, columns: 2, rows: 2, confidence: 'high', interpretation: 'tight occupied runs; transparent padding outside each run is not included' });
const crossingSheet = indexedSourcePng(5, 2, Buffer.alloc(10, 1), colors), crossingHash = sha256(crossingSheet);
const crossingGrid = gridProposal({ width: 5, height: 2, sourceHash: crossingHash }, { cellWidth: 2, cellHeight: 2, columns: 2, rows: 1, gapX: 1 });
const componentAudit = analyzeIndexedComponents(crossingSheet, { mode: 'palette-index', backgroundIndex: 0, connectivity: 4, proposal: crossingGrid });
assert.strictEqual(componentAudit.components.length, 1);
assert.strictEqual(componentAudit.crossingComponentCount, 1, 'one connected silhouette spanning both cells must be reported as crossing a reviewed cut');
assert.strictEqual(componentAudit.unassignedForegroundPixels, 2, 'foreground pixels in a reviewed gutter must remain visible as unassigned evidence');
assert.deepStrictEqual(componentAudit.components[0].frameIds, crossingGrid.frames.map(frame => frame.frameId));
assert.match(componentAudit.components[0].componentId, /^component-[a-f0-9]{20}$/);
const diagonalSheet = indexedSourcePng(2, 2, Buffer.from([1, 0, 0, 1]), colors);
assert.strictEqual(analyzeIndexedComponents(diagonalSheet, { mode: 'palette-index', backgroundIndex: 0, connectivity: 4 }).components.length, 2);
assert.strictEqual(analyzeIndexedComponents(diagonalSheet, { mode: 'palette-index', backgroundIndex: 0, connectivity: 8 }).components.length, 1);
const proposal = gridProposal({ width, height, sourceHash }, { cellWidth: 2, cellHeight: 2, columns: 2, rows: 2, gapX: 1, order: 'snake' });
assert.deepStrictEqual(proposal.frames.map(frame => [frame.row, frame.column]), [[0, 0], [0, 1], [1, 1], [1, 0]]);
const customProposal = gridProposal({ width, height, sourceHash }, { cellWidth: 2, cellHeight: 2, columns: 2, rows: 2, gapX: 1, order: 'custom', customOrder: [4, 1, 3, 2] });
assert.deepStrictEqual(customProposal.frames.map(frame => [frame.row, frame.column]), [[1, 1], [0, 0], [1, 0], [0, 1]], 'custom order uses the exact reviewed row-major cell permutation');
assert.deepStrictEqual(customProposal.settings.customOrder, [4, 1, 3, 2]);
assert.throws(() => gridProposal({ width, height, sourceHash }, { cellWidth: 2, cellHeight: 2, columns: 2, rows: 2, gapX: 1, order: 'custom', customOrder: [1, 1, 2, 3] }), /exactly once/);
assert(proposal.warnings.some(message => /remain after the final column/.test(message)), 'unused sheet edges must stay visible');
const extracted = extractIndexedGrid(sheet, proposal);
assert.deepStrictEqual([...readIndexedPng8(extracted[0].buffer).indices], [1, 2, 5, 6], 'grid cuts preserve exact source indices');
assert.deepStrictEqual([...readIndexedPng8(extracted[2].buffer).indices], [12, 13, 16, 17], 'snake order must not change cut pixels');
assert.deepStrictEqual(readIndexedPng8(extracted[0].buffer).colors, colors, 'grid cuts preserve the complete 256-color table');
assert.throws(() => extractIndexedGrid(Buffer.from(sheet).fill(0, 40, 41), proposal), /changed|invalid/i);

const sheetComponentAudit = analyzeIndexedComponents(sheet, { mode: 'palette-index', backgroundIndex: 0, proposal });
const floatingComponent = sheetComponentAudit.components.find(component => !component.frameIds.length);
assert(floatingComponent, 'fixture must contain an audited foreground component outside the reviewed grid');
let attachmentSession = baseSession({ sourceHash, sourceName: 'sheet.png', width, height, intakeEvidence: { sourceHash, componentAudit: sheetComponentAudit }, frames: proposal.frames });
const attachmentPlan = componentAttachmentProposal(attachmentSession, proposal.frames[0].frameId, [floatingComponent.componentId], 'exclusive', 'floating weapon');
assert.strictEqual(attachmentPlan.unionRectangle.width, 7, 'a reviewed attachment expands the frame rectangle to include the disconnected component');
assert(attachmentPlan.crossedFrameIds.includes(proposal.frames[1].frameId), 'union rectangles crossing another reviewed frame must be reported');
attachmentSession = reviewAction(attachmentSession, 'attach-components', { componentIds: [floatingComponent.componentId], ownership: 'exclusive', note: 'floating weapon' });
assert.strictEqual(replaySession(attachmentSession).componentAttachments[0].componentId, floatingComponent.componentId);
assert.strictEqual(replaySession(attachmentSession).frameRectangles[proposal.frames[0].frameId].width, 7);
attachmentSession = reviewAction(attachmentSession, 'detach-components', { componentIds: [floatingComponent.componentId] });
assert.strictEqual(replaySession(attachmentSession).componentAttachments.length, 0);
assert.strictEqual(replaySession(attachmentSession).frameRectangles[proposal.frames[0].frameId].width, 2, 'detaching restores the reviewed base rectangle');
const suggestionFrames = [
  { frameId: 'near-frame', ordinal: 0, x: 0, y: 0, width: 2, height: 2, method: 'reviewed' },
  { frameId: 'far-frame', ordinal: 1, x: 10, y: 0, width: 2, height: 2, method: 'reviewed' }
];
const suggestionAudit = { sourceHash, evidenceHash: 'component-evidence', components: [
  { componentId: 'near-part', area: 2, bounds: { x: 3, y: 0, width: 1, height: 2 }, pixelMaskHash: 'near-mask', frameIds: [], crossesCuts: false, belowMinimumArea: false },
  { componentId: 'tied-part', area: 2, bounds: { x: 5, y: 0, width: 2, height: 1 }, pixelMaskHash: 'tie-mask', frameIds: [], crossesCuts: false, belowMinimumArea: false }
] };
const suggestionSession = baseSession({ sourceHash, sourceName: 'suggestions.png', width: 12, height: 2, intakeEvidence: { sourceHash, componentAudit: suggestionAudit }, frames: suggestionFrames });
const suggestions = componentAttachmentSuggestions(suggestionSession, 'near-frame', { maxGap: 5 });
assert.deepStrictEqual(suggestions.suggestions.map(item => item.componentId), ['near-part'], 'only a uniquely-nearest unassigned component is suggested');
assert.deepStrictEqual(suggestions.ambiguousNearby.map(item => item.componentId), ['tied-part'], 'equidistant components remain explicitly ambiguous and unselected');
assert.match(suggestions.evidenceHash, /^[a-f0-9]{64}$/, 'component suggestions retain deterministic evidence');
let exclusionSession = baseSession({ sourceHash, sourceName: 'sheet.png', width, height, frames: proposal.frames });
exclusionSession = reviewAction(exclusionSession, 'exclude', { note: 'blank padding cell' });
for (let index = 1; index < proposal.frames.length; index += 1) exclusionSession = reviewAction(exclusionSession, 'keep');
const exclusionHandoff = creatorHandoff(exclusionSession, extracted);
assert.strictEqual(exclusionHandoff.length, proposal.frames.length - 1, 'reviewed excluded cells never enter the Creator handoff');
assert(!exclusionHandoff.some(item => item.frameId === proposal.frames[0].frameId), 'the exact excluded frame stays omitted');
let emptySession = baseSession({ sourceHash, sourceName: 'sheet.png', width, height, frames: proposal.frames });
for (let index = 0; index < proposal.frames.length; index += 1) emptySession = reviewAction(emptySession, 'exclude');
assert.throws(() => creatorHandoff(emptySession, extracted), /At least one reviewed/);
let session = baseSession({ sourceHash, sourceName: 'sheet.png', width, height, firstNumericGroup: 200, intakeEvidence: { sourceHash, componentAudit: sheetComponentAudit }, frames: proposal.frames });
session = reviewAction(session, 'keep');
session = reviewAction(session, 'incorrect-cut', { code: 'missing-floating-portion', note: 'Sword pommel is detached.' });
assert.strictEqual(replaySession(session).cursor, 1, 'problems never advance the slideshow');
session = reviewAction(session, 'resolve-problem', { problemId: replaySession(session).problems[0].problemId });
session = reviewAction(session, 'new-group');
assert.strictEqual(replaySession(session).phase, 'group-complete');
session = reviewAction(session, 'stop-axis-review');
assert.strictEqual(replaySession(session).phase, 'axis-review', 'Right at a group checkpoint pauses for axis review');
session = reviewAction(session, 'save-axis-review', { referenceFrameId: proposal.frames[0].frameId, decisions: [
  { frameId: proposal.frames[0].frameId, axisX: 1, axisY: 2, status: 'accepted', confidence: 1, method: 'authored-reference' },
  { frameId: proposal.frames[1].frameId, axisX: 1, axisY: 2, status: 'accepted', confidence: .7, method: 'reference-silhouette' }
] });
session = reviewAction(session, 'continue');
assert.strictEqual(replaySession(session).logicalGroup, 1);
session = reviewAction(session, 'keep');
session = reviewAction(session, 'back');
assert.strictEqual(replaySession(session).cursor, 2, 'Left reopens the complete prior classification event');
session = reviewAction(session, 'keep');
session = reviewAction(session, 'keep');
assert.strictEqual(replaySession(session).phase, 'complete');
const handoff = creatorHandoff(session, extracted);
assert.deepStrictEqual(handoff.map(item => item.numericGroupSuggestion), [200, 200, 201, 201]);
assert.deepStrictEqual(handoff.slice(0, 2).map(item => [item.axisSuggestion.axisX, item.axisSuggestion.axisY]), [[1, 2], [1, 2]]);
assert(handoff.every(item => item.sourceSheet.sha256 === sourceHash && item.extractedByteHash && item.decodedPixelHash));
assert(handoff.every(item => item.componentAuditEvidenceHash === sheetComponentAudit.evidenceHash && Array.isArray(item.componentIds)), 'reviewed component memberships flow into Creator handoff provenance');
validateJournal(session);
const corrupt = JSON.parse(JSON.stringify(session)); corrupt.journal[1].payload.note = 'changed';
assert.throws(() => validateJournal(corrupt), /failed its hash check/);
assert.throws(() => creatorHandoff(reviewAction(baseSession({ sourceHash, sourceName: 'sheet.png', width, height, frames: proposal.frames }), 'keep'), extracted), /Review every/);
let rectangleSession = baseSession({ sourceHash, sourceName: 'sheet.png', width, height, frames: proposal.frames });
rectangleSession = reviewAction(rectangleSession, 'adjust-rectangle', { x: 1, y: 0, width: 1, height: 2 });
assert.deepStrictEqual(replaySession(rectangleSession).currentFrame.sourceRectangle, { x: 1, y: 0, width: 1, height: 2 });
assert(replaySession(rectangleSession).adjustedFrameIds.includes(proposal.frames[0].frameId));
assert.throws(() => reviewAction(rectangleSession, 'adjust-rectangle', { x: 6, y: 0, width: 2, height: 2 }), /inside the immutable sprite sheet/);

let invalidationSession = baseSession({ sourceHash, sourceName: 'sheet.png', width, height, frames: proposal.frames });
invalidationSession = reviewAction(invalidationSession, 'keep');
invalidationSession = reviewAction(invalidationSession, 'new-group');
invalidationSession = reviewAction(invalidationSession, 'stop-axis-review');
invalidationSession = reviewAction(invalidationSession, 'save-axis-review', { referenceFrameIds: [proposal.frames[0].frameId], decisions: [
  { frameId: proposal.frames[0].frameId, axisX: 1, axisY: 2, status: 'accepted', confidence: 1, method: 'authored-reference' },
  { frameId: proposal.frames[1].frameId, axisX: 1, axisY: 2, status: 'accepted', confidence: .7, method: 'reference-silhouette' }
] });
invalidationSession = reviewAction(invalidationSession, 'continue');
invalidationSession = reviewAction(invalidationSession, 'back');
invalidationSession = reviewAction(invalidationSession, 'back');
invalidationSession = reviewAction(invalidationSession, 'adjust-rectangle', { x: 1, y: 0, width: 1, height: 2 });
const invalidatedReview = replaySession(invalidationSession).axisReviews[0];
assert(invalidatedReview.decisions.every(decision => decision.reviewRequired), 'changing a trusted-reference cut must invalidate that reference and its dependent suggestions');
assert(invalidatedReview.decisions.every(decision => decision.invalidation.changedFrameId === proposal.frames[0].frameId));
invalidationSession = reviewAction(invalidationSession, 'keep');
invalidationSession = reviewAction(invalidationSession, 'new-group');
invalidationSession = reviewAction(invalidationSession, 'continue');
invalidationSession = reviewAction(invalidationSession, 'keep');
invalidationSession = reviewAction(invalidationSession, 'keep');
assert.throws(() => creatorHandoff(invalidationSession, extracted), /cut-invalidated axis decision/);
assert.throws(() => gridProposal({ width: 10, height: 10 }, { cellWidth: 8, cellHeight: 8, columns: 2, rows: 2 }), /does not fit/);

console.log('SFF sprite-sheet grid, exact indexed extraction, keyboard review, recovery chain, and Creator handoff tests passed');
