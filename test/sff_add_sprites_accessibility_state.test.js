'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return { Uri: { file: fsPath => ({ fsPath }) }, ViewColumn: { Active: 1 }, window: {}, workspace: { workspaceFolders: [] }, commands: {} };
  return originalLoad.call(this, request, parent, isMain);
};
const { addSpritesControlAvailability } = require('../src/sff_add_sprites_workspace');
Module._load = originalLoad;

const base = { sourceCount: 1, nonPng: false, trueColor: false, paletteChoice: 'image', targetVersion: '2.1', coordinatesValid: true, writerStale: false, pending: false, terminal: false };
let state = addSpritesControlAvailability({ ...base, sourceCount: 0 });
assert.strictEqual(state.choose.disabled, false, 'an empty intake can still choose PNGs');
assert.strictEqual(state.clear.disabled, true); assert.match(state.clear.reason, /no selected images/i);
assert.strictEqual(state.stage.disabled, true); assert.match(state.stage.reason, /Choose at least one PNG/i);
assert.strictEqual(state.advanced.disabled, true); assert.strictEqual(state.paletteWorkshop.disabled, true);

state = addSpritesControlAvailability(base);
assert.strictEqual(state.stage.disabled, false, 'a valid indexed source can stage');
assert.strictEqual(state.advanced.disabled, false, 'a valid indexed source can transfer to Advanced');
assert.strictEqual(state.paletteWorkshop.disabled, true); assert.match(state.paletteWorkshop.reason, /Choose Needs Palette/i);

state = addSpritesControlAvailability({ ...base, paletteChoice: 'needs-palette' });
assert.strictEqual(state.stage.disabled, true); assert.match(state.stage.reason, /Palette Workshop or Advanced/i);
assert.strictEqual(state.advanced.disabled, false);
assert.strictEqual(state.paletteWorkshop.disabled, false, 'Needs Palette enables the exact Palette Workshop handoff');

state = addSpritesControlAvailability({ ...base, trueColor: true });
assert.strictEqual(state.stage.disabled, true); assert.match(state.stage.reason, /Choose True Color or Needs Palette/i);
state = addSpritesControlAvailability({ ...base, trueColor: true, paletteChoice: 'true-color', targetVersion: '2.0' });
assert.strictEqual(state.stage.disabled, true); assert.match(state.stage.reason, /cannot store true-color/i);

state = addSpritesControlAvailability({ ...base, coordinatesValid: false });
assert.strictEqual(state.stage.disabled, true); assert.strictEqual(state.advanced.disabled, true); assert.match(state.stage.reason, /whole-number group, index, and axis/i);
state = addSpritesControlAvailability({ ...base, writerStale: true });
assert.strictEqual(state.stage.disabled, true); assert.strictEqual(state.advanced.disabled, true); assert.match(state.stage.reason, /writer changed/i);

state = addSpritesControlAvailability({ ...base, pending: true });
for (const key of ['choose', 'clear', 'stage', 'advanced', 'paletteWorkshop', 'cancel', 'reviewFields']) assert.strictEqual(state[key].disabled, true, `${key} must lock during the exact pending action`);
assert.match(state.cancel.reason, /Wait for the current/i);
state = addSpritesControlAvailability({ ...base, terminal: true });
assert.strictEqual(state.choose.disabled, true); assert.strictEqual(state.reviewFields.disabled, true); assert.strictEqual(state.cancel.disabled, false, 'Cancel remains the terminal close route');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'sff_add_sprites_workspace.js'), 'utf8');
for (const contract of [
  'aria-label="Selected sprite images"',
  'aria-label="Needs Palette tiling options"',
  'id="review" class="muted" role="status" aria-live="polite"',
  'function setControlState(control,state)',
  "globalThis.ikemenIsBusy=()=>pending",
  "type: 'files', sources: null, cancelled: true"
]) assert(source.includes(contract), `missing generated Add Sprites accessibility contract: ${contract}`);
assert(source.includes("if(m.type==='files'){pending=false"), 'picker completion and cancellation both release the pending gate');
assert(source.includes("if(beginPending('Opening Palette Workshop…'))") && source.includes("if(!beginPending('Transferring this reviewed batch to Advanced…'))return"), 'handoff routes use the same single-flight gate as staging');
assert(source.includes("executeCommand('ikemen.palette.openWorkspace'") && source.includes("panel.dispose(); return;"), 'successful Needs Palette handoff closes the consumed Add Sprites surface instead of leaving it permanently pending');

console.log('Add Sprites actionable prerequisites, pending lock, semantic status, and cancellation recovery passed');
