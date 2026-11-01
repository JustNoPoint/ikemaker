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
const { stageComparisonAvailability, stageRigControlAvailability } = require('../src/stage_workspace');
Module._load = originalLoad;

assert.deepStrictEqual(stageComparisonAvailability('', ''), {
  disabled: true,
  reason: 'Capture both A and B before comparing them.'
});
assert.strictEqual(stageComparisonAvailability('A', '').reason, 'Capture B before comparing.');
assert.strictEqual(stageComparisonAvailability('', 'B').reason, 'Capture A before comparing.');
assert.deepStrictEqual(stageComparisonAvailability('A', 'B'), {
  disabled: false,
  reason: 'Compare the two in-memory stage captures.'
});

assert.deepStrictEqual(stageRigControlAvailability({ speed: '', fineSpeed: 0.2, fastSpeed: 4 }), {
  disabled: true,
  invalidId: 'rigSpeed',
  reason: 'Enter a normal speed greater than 0 and no more than 100.'
});
assert.strictEqual(stageRigControlAvailability({ speed: 1, fineSpeed: 101, fastSpeed: 4 }).invalidId, 'rigFine');
assert.strictEqual(stageRigControlAvailability({ speed: 1, fineSpeed: 0.2, fastSpeed: Number.NaN }).invalidId, 'rigFast');
assert.strictEqual(stageRigControlAvailability({ speed: 1, fineSpeed: 0.2, fastSpeed: 4 }).disabled, false);

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'stage_workspace.js'), 'utf8');
assert(source.includes("stageComparisonState=(${stageComparisonAvailability.toString()})"), 'generated Stage client must consume the tested comparison state model');
assert(source.includes("stageRigState=(${stageRigControlAvailability.toString()})"), 'generated Stage client must consume the tested Stage Rig state model');
assert(source.includes("for(const id of ['stageRig','stageRigPanel'])"), 'both Stage Rig launch affordances must share the tested availability');
assert(source.includes("for(const id of ['rigSpeed','rigFine','rigFast'])document.getElementById(id).addEventListener('input',syncStageRigAvailability)"), 'Stage Rig availability must refresh as every speed changes');
assert(source.includes("document.getElementById(current.state.invalidId)?.focus()"), 'an invalid Stage Rig launch must focus its exact field instead of posting a rejected no-op');
assert(source.includes('aria-label="Camera preview preset"'), 'the camera preset must have a programmatic name');
assert(source.includes('<output id="timelineValue" for="timeline">0</output>'), 'the BGCtrl readout must be associated with its timeline control');
assert(source.includes('id="stageRigReason" class="small" role="status" aria-live="polite"'), 'Stage Rig validation guidance must be live and shared by both launch buttons');

console.log('Stage comparison and Stage Rig actionable states passed');
