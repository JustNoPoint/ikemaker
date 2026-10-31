'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return {};
  return originalLoad.call(this, request, parent, main);
};
const { stagePreviewSelectionAvailability, stagePreviewFitScale } = require('../src/stage_workspace');
Module._load = originalLoad;

assert.deepStrictEqual(stagePreviewSelectionAvailability(), {
  positionDisabled: true,
  copyDisabled: true,
  applyDisabled: true,
  discardDisabled: true,
  applySelectedDisabled: true,
  selectionReason: 'Add or select a stage background to edit its preview position.',
  currentDirtyReason: 'Add or select a stage background to enable this action.',
  selectionDirtyReason: 'Add or select a stage background to enable this action.',
  applySelectedReason: 'Select at least two stage backgrounds to apply their reviewed positions together.'
});
const clean = stagePreviewSelectionAvailability({ hasSelection: true, selectionCount: 2, currentDirty: false, selectionDirty: false });
assert.strictEqual(clean.positionDisabled, false);
assert.strictEqual(clean.copyDisabled, false);
assert.strictEqual(clean.applyDisabled, true);
assert.strictEqual(clean.discardDisabled, true);
assert.strictEqual(clean.applySelectedDisabled, true);
assert.match(clean.currentDirtyReason, /Move the current background/);
const secondaryChanged = stagePreviewSelectionAvailability({ hasSelection: true, selectionCount: 2, currentDirty: false, selectionDirty: true });
assert.strictEqual(secondaryChanged.applyDisabled, true, 'a changed secondary selection must not enable single Apply');
assert.strictEqual(secondaryChanged.discardDisabled, false);
assert.strictEqual(secondaryChanged.applySelectedDisabled, false);
const changed = stagePreviewSelectionAvailability({ hasSelection: true, selectionCount: 2, currentDirty: true, selectionDirty: true });
assert.strictEqual(changed.applyDisabled, false);
assert.strictEqual(changed.discardDisabled, false);
assert.strictEqual(changed.applySelectedDisabled, false);

assert.strictEqual(stagePreviewFitScale(800, 600, 320, 240), 2.375);
assert.strictEqual(stagePreviewFitScale(10, 10, 320, 240), 0.1, 'very narrow previews must retain a positive usable scale');
assert.strictEqual(stagePreviewFitScale(Number.NaN, 600, 320, 240), 1, 'invalid geometry must fail to a stable scale');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'stage_workspace.js'), 'utf8');
assert(source.includes('stagePreviewSelectionState=(${stagePreviewSelectionAvailability.toString()})'), 'generated client must consume the tested selection state model');
assert(source.includes('stageFitScale=(${stagePreviewFitScale.toString()})'), 'generated client must consume the tested narrow-fit model');
assert(source.includes("if(!rows.length){host.innerHTML='<div class=\"issue info\" role=\"status\">'"), 'empty and filtered background lists must render visible status guidance');
assert(source.includes("document.getElementById('startX').value='';document.getElementById('startY').value='';document.getElementById('patch').value=''"), 'empty selection must clear stale position output');
assert(source.includes("['apply',state.applyDisabled,state.currentDirtyReason],['discard',state.discardDisabled,state.selectionDirtyReason]"), 'single Apply and selected-set Discard must consume their exact executable dirty scopes');

for (const route of [
  "post('addBackground')", "post('openLayeredPsd')", "post('duplicateBackground'", "post('removeBackground'",
  "post('inheritBackgroundProperties'", "post('saveStageComponent'", "post('insertStageComponent')", "post('manageStageComponents')",
  "post('openExactBackground'", "post('editPreferred'", "post('openStageSprite'", "post('openSource'",
  "post('copyPatch'", "post('applyStart'", "post('applyStarts'", "post('previewDraft'",
  "post('stageBackgroundDrop'", "post('visualBrowserAction'"
]) assert(source.includes(route), `Stage client must expose route ${route}`);

for (const hostRoute of [
  "message.type==='openLayeredPsd'", "message.type === 'openStageSprite'", "message.type === 'copyPatch'",
  "message.type==='inheritBackgroundProperties'", "message.type==='saveStageComponent'", "message.type==='insertStageComponent'",
  "message.type==='manageStageComponents'", "message.type === 'addBackground'", "message.type === 'duplicateBackground'",
  "message.type === 'removeBackground'", "message.type==='applyStarts'", "message.type !== 'applyStart'"
]) assert(source.includes(hostRoute), `Stage host must own route ${hostRoute}`);

assert(source.includes('aria-label="Stage local coordinate size"'), 'the coordinate badge must name its value');
assert(source.includes('<label>Camera Y '), 'the Y camera control must retain a complete visible label');
assert(source.includes('<label>Camera zoom '), 'the zoom control must retain a complete visible label');

console.log('Stage Workspace route closeout states and destinations passed');
