'use strict';

const assert = require('assert');
const Module = require('module');
const original = Module._load;
Module._load = function (request, parent, main) {
  if (request === 'vscode') return { ViewColumn: { Active: 1 }, window: {} };
  return original.call(this, request, parent, main);
};
const { sheetReviewControlAvailability, html } = require('../src/sff_sheet_workspace');
Module._load = original;

const enabled = state => assert.strictEqual(state.disabled, false, state.reason);
const disabled = (state, phrase) => {
  assert.strictEqual(state.disabled, true);
  assert.match(state.reason, phrase);
};

let state = sheetReviewControlAvailability({ phase: 'review', rectangleValid: true, componentCount: 3, selectedComponents: 1, suggestedComponents: 1 });
for (const id of ['keep', 'newGroup', 'exclude', 'back', 'problem', 'applyRectangle', 'suggestComponents', 'attachComponents', 'detachComponents', 'saveClose']) enabled(state[id]);
disabled(state.continueGroup, /Finish the current logical group/);
disabled(state.axisSuggest, /saved group checkpoint/);
disabled(state.handoff, /Complete frame and axis review/);

state = sheetReviewControlAvailability({ phase: 'review', rectangleValid: false, componentCount: 0, selectedComponents: 0, suggestedComponents: 0 });
disabled(state.applyRectangle, /positive Width\/Height/);
disabled(state.suggestComponents, /No audited component candidates/);
disabled(state.attachComponents, /Select one or more/);
disabled(state.detachComponents, /Select one or more/);

state = sheetReviewControlAvailability({ phase: 'group-complete' });
for (const id of ['continueGroup', 'axisStop', 'checkpointBack', 'saveClose']) enabled(state[id]);
disabled(state.keep, /while reviewing/);

state = sheetReviewControlAvailability({ phase: 'axis-review', axisInputValid: false });
disabled(state.axisSuggest, /whole-number/);
disabled(state.axisRefine, /Generate initial/);
disabled(state.axisSave, /Generate initial/);
state = sheetReviewControlAvailability({ phase: 'axis-review', axisInputValid: true, axisReview: true, axisDecisionValid: false, trustedReferences: 1 });
enabled(state.axisSuggest);
disabled(state.axisRefine, /Every axis decision/);
disabled(state.axisSave, /Every axis decision/);
state = sheetReviewControlAvailability({ phase: 'axis-review', axisReview: true, axisDecisionValid: true, trustedReferences: 0 });
disabled(state.axisRefine, /trusted reference/);
disabled(state.axisSave, /trusted reference/);
state = sheetReviewControlAvailability({ phase: 'axis-review', axisReview: true, axisDecisionValid: true, trustedReferences: 1, unresolvedAxes: 2 });
enabled(state.axisRefine);
enabled(state.axisSave);
disabled(state.axisContinue, /2 unresolved/);
state = sheetReviewControlAvailability({ phase: 'axis-review', axisReview: true, axisDecisionValid: true, trustedReferences: 1, unresolvedAxes: 0 });
enabled(state.axisContinue);

state = sheetReviewControlAvailability({ phase: 'complete', unresolvedProblems: 1 });
disabled(state.handoff, /Resolve 1 recorded frame problem/);
state = sheetReviewControlAvailability({ phase: 'complete', invalidAxes: 1 });
disabled(state.handoff, /Review 1 unresolved/);
state = sheetReviewControlAvailability({ phase: 'complete' });
enabled(state.handoff);

state = sheetReviewControlAvailability({ phase: 'review', rectangleValid: true, componentCount: 1, selectedComponents: 1, suggestedComponents: 1, busy: true });
for (const [id, value] of Object.entries(state)) {
  assert.strictEqual(value.disabled, true, `${id} must lock while a persisted action is pending`);
  assert.match(value.reason, /Wait for the current/);
}

const model = {
  sessionId: 'a11y', sourceName: 'sheet.png', sourceDataUri: 'data:image/png;base64,', total: 1, currentDataUri: 'data:image/png;base64,', pageStart: 0, thumbs: [], componentAuditAvailable: false, componentCandidates: [], attachmentSuggestions: null,
  state: { phase: 'review', cursor: 0, logicalGroup: 0, currentFrame: { frameId: 'f1', ordinal: 0, sourceRectangle: { x: 0, y: 0, width: 1, height: 1 } }, classifications: [], componentAttachments: [], problems: [], unresolvedProblems: [], axisReviews: [] }
};
const markup = html(model);
assert.match(markup, /id="progress" role="status" aria-live="polite"/);
assert.match(markup, /id="contact"[^>]+role="list"[^>]+aria-label="Contact Sheet"/);
assert.match(markup, /id="problems"[^>]+role="region"[^>]+aria-label="Problems"/);
assert.match(markup, /axisVisual\.setAttribute\('role','dialog'\)/);
assert.match(markup, /axisVisual\.setAttribute\('aria-modal','true'\)/);
assert.match(markup, /function closeAxisVisual\(\).*target\.focus\(\)/);
assert.match(markup, /event\.key!=='Tab'/);
assert.match(markup, /reviewBusy=true;refreshAvailability\(\)/);
assert.match(markup, /if\(event\.data\?\.type==='error'\)\{reviewBusy=false/);

console.log('Focused SFF sheet-review availability, keyboard, focus, and accessibility-state tests passed');
