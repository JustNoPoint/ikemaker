'use strict';

const assert = require('assert');
const Module = require('module');
const original = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return { window: {}, workspace: { textDocuments: [] }, commands: {}, Uri: { file: value => ({ fsPath: value }) }, ViewColumn: {} };
  return original.call(this, request, parent, main);
};
const workspace = require('../src/throw_creator_workspace');
Module._load = original;

const frame = { element: 1, group: 800, index: 0, x: 0, y: 0, time: 4, start: 0, end: 4, flags: '', image: null };
const plan = require('../src/throw_creator_model').newPlan('Test Throw'); plan.p1Action = 800; plan.p2Action = 801; plan.endTick = 4;
const page = workspace.html({ character: 'Ryu', files: {}, plan, plans: [], actions: [{ action: 800, elements: 1, ticks: 4 }, { action: 801, elements: 1, ticks: 4 }], p1: { action: 800, totalTicks: 4, frames: [frame] }, p2: { action: 801, totalTicks: 4, frames: [{ ...frame, group: 801 }] }, issues: [], eventTypes: ['grab', 'bind', 'bind-release', 'cleanup'], lanes: ['P1', 'Between Players', 'P2'], templates: [{ id: 'stationary', label: 'Stationary grab' }] });
assert.match(page, /IKEMaker Throw Creator/);
assert.match(page, /Match P1 ticks/);
assert.match(page, /Interaction events/);
assert.match(page, /Parts and drawing order/);
assert.match(page, /Preview ZSS scaffold/);
assert.match(page, /Install\/refresh bridge/);
assert.match(page, /Live Authoring Preview/);
assert.match(page, /Discard recovered work/);
assert.match(page, /ikemenNavigationSelection/);
assert.match(page, /ikemenPresetCapture/);
assert.match(page, /id="viewZoom"/);
assert.match(page, /onwheel/);
assert.match(page, /mode=b&&overP2\(e\)\?'bind':'pan'/);
const profile = workspace.previewProfileSource(plan, true);
assert.match(profile, /gameMode = "training"/);
assert.match(profile, /playerNo = 1/);
assert.match(profile, /playerNo = 2/);
assert.match(workspace.previewProfileSource(plan, false), /ignoreHitPause if 0/);
assert.doesNotThrow(() => new Function(page.match(/<script>([\s\S]*)<\/script>/)[1]));
console.log('Throw Creator workspace tests passed');
