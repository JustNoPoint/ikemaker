'use strict';

const assert = require('assert');
const Module = require('module');
const original = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return { window: {}, workspace: { textDocuments: [] }, commands: {}, Uri: { file: value => ({ fsPath: value }) }, ViewColumn: {} };
  return original.call(this, request, parent, main);
};
const workspace = require('../src/throw_creator_workspace');
const { newPlan } = require('../src/throw_creator_model');
Module._load = original;

const actions = [{ action: 800, elements: 1, ticks: 4 }, { action: 801, elements: 1, ticks: 4 }, { action: 802, elements: 1, ticks: 4 }];
const plan = newPlan('Accessible Throw');
plan.p1Action = 800;
plan.p2Action = 801;
plan.events = [];

let state = workspace.throwControlAvailability({ actions, plan, issues: [], savedPlan: '' });
assert.strictEqual(state.loadPlan.enabled, false);
assert.match(state.loadPlan.reason, /Choose a saved throw plan first/);
assert.strictEqual(state.p1Previous.enabled, false);
assert.match(state.p1Previous.reason, /first available AIR action/);
assert.strictEqual(state.p1Next.enabled, true);
assert.strictEqual(state.p2Previous.enabled, true);
assert.strictEqual(state.p2Next.enabled, true);
assert.strictEqual(state.eventNavigation.enabled, false);
assert.match(state.eventNavigation.reason, /Add an interaction event/);
assert.strictEqual(state.output.enabled, true);
assert.strictEqual(state.actionSelection.enabled, true);
assert.strictEqual(state.timing.enabled, false);
assert.match(state.timing.reason, /Match P1 ticks or Match P1 boundaries/);
assert.strictEqual(state.disablePreview.enabled, false);
assert.match(state.disablePreview.reason, /Launch Live Authoring Preview/);

state = workspace.throwControlAvailability({ actions, plan: { ...plan, timingMode: 'match-p1-ticks' }, issues: [], savedPlan: '', previewArmed: true });
assert.strictEqual(state.timing.enabled, true);
assert.strictEqual(state.disablePreview.enabled, true);

state = workspace.throwControlAvailability({ actions, plan: { ...plan, p1Action: 802, p2Action: 802, events: [{ id: 'bind-1' }] }, issues: [{ level: 'error', message: 'Missing state' }], savedPlan: 'throw-plan.json' });
assert.strictEqual(state.loadPlan.enabled, true);
assert.strictEqual(state.p1Next.enabled, false);
assert.strictEqual(state.p2Next.enabled, false);
assert.match(state.p2Next.reason, /last available AIR action/);
assert.strictEqual(state.eventNavigation.enabled, true);
assert.strictEqual(state.output.enabled, false);
assert.match(state.output.reason, /Resolve 1 validation error/);

state = workspace.throwControlAvailability({ actions: [], plan, issues: [], savedPlan: '' });
assert.strictEqual(state.p1Previous.enabled, false);
assert.match(state.p1Previous.reason, /Choose an available P1 AIR action/);
assert.strictEqual(state.actionSelection.enabled, false);
assert.match(state.actionSelection.reason, /no available actions/);
assert.strictEqual(state.timing.enabled, false);
assert.match(state.timing.reason, /Choose available P1 and P2 AIR actions/);

const frame = { element: 1, group: 800, index: 0, x: 0, y: 0, time: 4, start: 0, end: 4, flags: '', image: null };
const page = workspace.html({ character: 'Ryu', files: {}, plan, plans: [], actions, p1: { action: 800, totalTicks: 4, frames: [frame] }, p2: { action: 801, totalTicks: 4, frames: [{ ...frame, group: 801 }] }, issues: [], eventTypes: ['bind'], lanes: ['Between Players'], templates: [{ id: 'stationary', label: 'Stationary grab' }] });
assert.match(page, /id="canvas"[^>]*tabindex="0"[^>]*aria-label="Throw preview/);
assert.match(page, /id="events"[^>]*role="list"[^>]*aria-label="Interaction events"/);
assert.match(page, /role="listitem" tabindex="0" aria-current=/);
assert.match(page, /\['Enter',' '\]\.includes\(e\.key\)/);
assert.match(page, /id="issues" role="status" aria-live="polite"/);
assert.match(page, /id="status" role="status" aria-live="polite"/);
assert.match(page, /id="timingReadout"[^>]*role="status" aria-live="polite"/);
assert.match(page, /id="showClsn1"[^>]*aria-pressed="true"/);
assert.match(page, /function setToggle\(id,value\)/);
assert.match(page, /id="viewZoomValue" for="viewZoom"/);
assert.match(page, /id="p1Track"[^>]*role="group" aria-label="P1 animation frames"/);
assert.match(page, /aria-label="Runtime part /);
assert.match(page, /<label>Owner<select data-part-owner=/);
assert.match(page, /<label>Drawing lane<select data-part-lane=/);
assert.match(page, /previousEvent'\)\.onclick=.*selectThrowEvent/s);
assert.match(page, /m\.type==='previewState'.*refreshThrowControlAvailability/s);
assert.match(page, /function stageThrowDraft\(\).*type:'validate'/s);
assert.match(page, /data-event-tick.*stageThrowDraft\(\)/s);
assert.match(page, /data-event-note.*stageThrowDraft\(\)/s);
assert.match(page, /data-part-.*stageThrowDraft\(\)/s);
assert.match(page, /endDrag=.*stageThrowDraft\(\)/s);
assert.match(page, /else \$\('addEvent'\)\.focus\(\)/);
assert.match(page, /function refreshThrowControlAvailability\(\)/);
assert.match(page, /savedPlan'\)\.onchange=refreshThrowControlAvailability/);
assert.match(page, /m\.type==='validation'.*refreshThrowControlAvailability/s);
assert.match(page, /@media\(max-width:600px\).*grid-template-columns:minmax\(0,1fr\)/s);
assert.match(page, /@media\(max-width:600px\).*throw-content>header \.actions/s);

console.log('Throw Creator actionable availability, labels, event keyboard semantics, and narrow layout passed');
