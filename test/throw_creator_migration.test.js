'use strict';
const assert = require('assert');
const Module = require('module');
const original = Module._load;
Module._load = function(request, parent, main) {
  if (request === 'vscode') return { workspace: { textDocuments: [] }, Uri: { file: fsPath => ({ fsPath, toString: () => `file:${fsPath}` }) } };
  return original.call(this, request, parent, main);
};
const workspace = require('../src/throw_creator_workspace');
const { newPlan } = require('../src/throw_creator_model');
Module._load = original;

const air = '; lead\n[Begin Action 10]\n0,0,0,0,3\n0,1,0,0,4\n\n[Begin Action 20]\n1,0,0,0,5\n';
const blocks = workspace.airActionBlocks(air);
assert.deepStrictEqual(blocks.map(item => item.action), [10, 20]);
const reference = workspace.actionReference(air, 20, 'p2');
assert.strictEqual(workspace.locateActionReference(`; moved\n${air}`, reference).action, 20, 'raw block identity relocates after unrelated prefix edits');
assert.strictEqual(workspace.locateActionReference(air.replace('1,0,0,0,5', '1,0,0,0,6'), reference), null, 'changed action cannot reuse stale identity');
assert.deepStrictEqual(workspace.durationTokens(air, blocks[0]).map(item => item.value), [3, 4]);

const duplicate = '[Begin Action 1]\n0,0,0,0,1\n[Begin Action 1]\n0,0,0,0,1\n';
const second = workspace.airActionBlocks(duplicate)[1], duplicateReference = { action: 1, role: 'p1', signature: second.signature, occurrence: 1, matchCount: 2 };
assert.strictEqual(workspace.actionReference(duplicate, 1, 'p1'), null, 'duplicate action numbers are rejected even when their bodies match');
assert.strictEqual(workspace.locateActionReference(duplicate, duplicateReference), null);
assert.strictEqual(workspace.actionReference('[Begin Action 1]\n0,0,0,0,1\n[Begin Action 1]\n0,1,0,0,2\n', 1, 'p1'), null, 'different-body duplicate action numbers are also ambiguous');

const model = { character: 'Test', files: {}, plan: newPlan('Test'), plans: [], actions: [{ action: 10, elements: 2, ticks: 7 }], p1: null, p2: null, partTracks: {}, issues: [], eventTypes: [], lanes: [], templates: [] };
const rendered = workspace.html(model);
assert.strictEqual((rendered.match(/<button[^>]+data-universal-slot=/g) || []).length, 29, 'canonical toolbar has exactly 29 slots');
assert.strictEqual((rendered.match(/acquireVsCodeApi\(\)/g) || []).length, 1, 'Throw Creator uses one webview bridge');
assert.match(rendered, /class="throw-content"/);
assert.match(rendered, /p1ActionSlider/);
assert.match(rendered, /p2ActionSlider/);
assert.doesNotMatch(rendered, /class="launch-controls"/, 'duplicate generic launch chrome is absent');
const toolbar = workspace.throwToolbarModel({ model, selectedRole: 'p1', descriptor: { type: 'project' } });
assert.strictEqual(toolbar.slots.find(slot => slot.id === 'save').enabled, false, 'universal Save cannot alias five independent Throw write authorities');
assert.strictEqual(toolbar.slots.find(slot => slot.id === 'connected-resources').enabled, false, 'private context does not claim a connected character resource set');

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
assert(workspace.validPngDataUri(png));
assert.strictEqual(workspace.validPngDataUri('data:image/png;base64,AAAA'), null);
assert.strictEqual(workspace.validPngDataUri(`${png}extra`), null);

assert(workspace.validThrowMessage({ type: 'selectRole', role: 'p1' }));
assert(!workspace.validThrowMessage({ type: 'selectRole', role: 'p1', forged: true }));
assert(!workspace.validThrowMessage({ type: 'contactSheet', dataUri: 'x'.repeat(24 * 1024 * 1024 + 1), plan: newPlan() }));
assert(!workspace.validThrowMessage({ type: 'actionNavigate', role: 'p1', action: 'select-index', index: -1 }));
const validPlan = newPlan('Bounded plan');
assert(workspace.validPlanValue(validPlan), 'the normalized closed plan schema is accepted');
assert(!workspace.validPlanValue({ ...validPlan, extra: true }), 'unknown top-level plan keys are rejected');
assert(!workspace.validPlanValue({ ...validPlan, version: 2 }), 'unknown plan versions are rejected');
assert(!workspace.validPlanValue({ ...validPlan, events: [{ ...validPlan.events[0], extra: true }] }), 'unknown nested event keys are rejected');
assert(!workspace.validPlanValue({ ...validPlan, events: 'not-an-array' }), 'malformed nested collections are rejected');
assert(!workspace.validPlanValue(Object.assign(Object.create({ inherited: true }), validPlan)), 'non-plain plan objects are rejected');
const eventLimit = Array.from({ length: 512 }, (_, index) => ({ ...validPlan.events[0], id: `event-${index}` }));
assert(workspace.validPlanValue({ ...validPlan, events: eventLimit }), 'the documented event limit edge is accepted');
assert(!workspace.validPlanValue({ ...validPlan, events: Array.from({ length: 513 }, (_, index) => ({ ...validPlan.events[0], id: `event-${index}` })) }), 'event count is bounded');
const part = { id: 'part-1', name: 'Part', owner: 'P1', lane: 'Between Players', bank: 1, anim: 0, explodId: 0, sprPriority: 0, layerNo: 0, syncId: 0, syncLayer: false, createTick: 0, removeTick: 1 };
assert(workspace.validPlanValue({ ...validPlan, parts: Array.from({ length: 128 }, (_, index) => ({ ...part, id: `part-${index}` })) }), 'the documented part limit edge is accepted');
assert(!workspace.validPlanValue({ ...validPlan, parts: Array.from({ length: 129 }, (_, index) => ({ ...part, id: `part-${index}` })) }), 'part count is bounded');
assert(workspace.validThrowMessage({ type: 'selectRole', role: 'p2' }), 'a rejected message does not poison the following valid message');
console.log('Throw Creator migration chrome, exact AIR identity, duration targeting, PNG bounds, and strict protocol tests passed');
