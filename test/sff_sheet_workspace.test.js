'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const original = Module._load;
Module._load = function (request, parent, main) {
  if (request === 'vscode') return { ViewColumn: { Active: 1 }, window: {} };
  return original.call(this, request, parent, main);
};
const { viewModel, axisReviewPlan, refineAxisReviewPlan, editedAxisReviewPlan, html } = require('../src/sff_sheet_workspace');
Module._load = original;
const { indexedSourcePng } = require('../src/sff_reader');
const { sha256, gridProposal, extractIndexedGrid } = require('../src/sff_sheet_intake');
const { createStoredSession, persistReviewAction } = require('../src/sff_sheet_session_store');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-sheet-workspace-'));
const colors = Array.from({ length: 256 }, (_, index) => [index, index, index, index ? 255 : 0]);
const source = indexedSourcePng(6, 2, Buffer.from([1, 1, 2, 2, 3, 3, 1, 1, 2, 2, 3, 3]), colors), sourceHash = sha256(source);
const proposal = gridProposal({ width: 6, height: 2, sourceHash }, { cellWidth: 2, cellHeight: 2 });
let stored = createStoredSession(fs, root, source, proposal, { sessionId: 'visual-review', sourceName: 'fighter sheet.png', firstNumericGroup: 20, extractedFrames: extractIndexedGrid(source, proposal) });
let model = viewModel(stored);
assert.strictEqual(model.total, 3); assert.strictEqual(model.thumbs.length, 3); assert(model.currentDataUri.startsWith('data:image/png;base64,'));
const markup = html(model);
for (const id of ['preview', 'contact', 'keep', 'newGroup', 'exclude', 'back', 'problem', 'rectX', 'rectY', 'rectWidth', 'rectHeight', 'applyRectangle', 'componentControls', 'componentList', 'suggestComponents', 'componentOwnership', 'componentNote', 'attachComponents', 'detachComponents', 'continueGroup', 'axisStop', 'checkpointBack', 'axisX', 'axisY', 'axisSuggest', 'axisResults', 'axisRefine', 'axisSave', 'axisContinue', 'axisVisual', 'axisVisualMode', 'axisVisualCanvas', 'axisVisualClose', 'saveClose', 'handoff']) assert(markup.includes(`id='${id}'`) || markup.includes(`id="${id}"`), `sheet review is missing ${id}`);
assert(markup.includes("event.repeat") && markup.includes("['INPUT','TEXTAREA','SELECT','BUTTON']"), 'keyboard review must ignore repeats and form controls');
assert(markup.includes("phase==='group-complete'?['axisStop','stop-axis-review']"), 'Right must mean axis stop only at the distinct group checkpoint');
assert(markup.includes("type:'adjustRectangle'") && markup.includes("event.key==='Enter'"), 'rectangle correction must have a visible action and the documented Enter focus route');
assert(markup.includes("type:'attachComponents'") && markup.includes("type:'detachComponents'"), 'floating component attachment must expose visible reversible actions');
assert(markup.includes('uniquely-nearest unassigned') && markup.includes("option.dataset.suggested==='1'"), 'floating-part suggestions must remain conservative and selection-only');
assert(markup.includes("type:'axisPreview'") && markup.includes('Aligned onion overlay') && markup.includes('Side by side'), 'axis review must expose on-demand side-by-side and aligned onion comparison');
assert(markup.includes('Cut changed · review or re-run required') && markup.includes('cut-invalidated axis decision'), 'cut-dependent axis evidence must be visible and block handoff until reviewed');
stored = persistReviewAction(fs, stored, 'keep'); stored = persistReviewAction(fs, stored, 'keep'); stored = persistReviewAction(fs, stored, 'new-group'); model = viewModel(stored);
assert.strictEqual(model.state.phase, 'group-complete'); assert(markup.includes('Every action is persisted before advancing'));
stored = persistReviewAction(fs, stored, 'stop-axis-review'); assert.strictEqual(viewModel(stored).state.phase, 'axis-review');
const axes = axisReviewPlan(stored, 1, 2); assert.strictEqual(axes.decisions.length, 3); assert.deepStrictEqual([axes.decisions[0].axisX, axes.decisions[0].axisY], [1, 2]);
stored = persistReviewAction(fs, stored, 'save-axis-review', axes); assert.strictEqual(viewModel(stored).state.axisReviews.length, 1);
assert.throws(() => persistReviewAction(fs, stored, 'continue'), /unresolved axis suggestion/);
const submitted = { referenceFrameIds: [proposal.frames[0].frameId, proposal.frames[1].frameId], rerunFrameIds: [proposal.frames[2].frameId], decisions: axes.decisions.map((decision, index) => ({ frameId: decision.frameId, axisX: decision.axisX, axisY: decision.axisY, status: index < 2 ? 'accepted' : decision.status })) };
const refined = refineAxisReviewPlan(stored, submitted); assert.strictEqual(refined.referenceFrameIds.length, 2); assert.strictEqual(refined.decisions[2].method, 'multi-reference-consensus');
stored = persistReviewAction(fs, stored, 'save-axis-review', refined);
const editedValues = refined.decisions.map(decision => ({ frameId: decision.frameId, axisX: decision.axisX + (decision.frameId === proposal.frames[2].frameId ? 1 : 0), axisY: decision.axisY, status: decision.status }));
const edited = editedAxisReviewPlan(stored, { referenceFrameIds: refined.referenceFrameIds, decisions: editedValues }); assert.strictEqual(edited.decisions[2].method, 'reviewed-edit');
stored.lock.release();

console.log('Focused SFF sprite-sheet contact sheet and keyboard review workspace tests passed');
