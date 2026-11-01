'use strict';

const assert = require('assert');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return { window: {}, workspace: {}, commands: {}, languages: {}, Uri: {}, ViewColumn: {}, DiagnosticSeverity: {}, Diagnostic: class {}, Range: class {}, Position: class {} };
  return originalLoad.call(this, request, parent, main);
};
const health = require('../src/character_health_workspace');
Module._load = originalLoad;

let state = health.healthControlAvailability({ count: 0, current: -1, selected: 0, safe: 0, extras: 0, canUndo: false });
for (const key of ['previous', 'next', 'position']) assert.deepStrictEqual(state[key], { disabled: true, reason: 'No audited findings are available.' });
assert.match(state.safe.reason, /No behavior-preserving repairs/);
assert.match(state.clear.reason, /No repairs are selected/);
assert.match(state.preview.reason, /Select one or more repairable findings/);
assert.match(state.undo.reason, /No completed cleanup/);
assert.match(state.clearExtras.reason, /No manually added audit files/);

state = health.healthControlAvailability({ count: 3, current: 0, selected: 2, safe: 1, extras: 1, canUndo: true });
assert.equal(state.previous.disabled, true);
assert.match(state.previous.reason, /first audited finding/);
for (const key of ['next', 'position', 'safe', 'clear', 'preview', 'apply', 'undo', 'clearExtras', 'sessionAction']) assert.deepStrictEqual(state[key], { disabled: false, reason: '' }, key);
state = health.healthControlAvailability({ count: 3, current: 2, selected: 1, safe: 1, extras: 1, canUndo: true });
assert.equal(state.next.disabled, true);
assert.match(state.next.reason, /last audited finding/);

state = health.healthControlAvailability({ count: 3, current: 1, selected: 1, safe: 1, extras: 1, canUndo: true, busy: true });
for (const key of ['previous', 'next', 'position', 'safe', 'clear', 'preview', 'apply', 'undo', 'clearExtras', 'sessionAction']) {
  assert.equal(state[key].disabled, true, key);
  assert.match(state[key].reason, /current cleanup operation/, key);
}

const model = {
  character: 'Hero', profile: 'ikemen-1.0', profileLabel: 'IKEMEN GO 1.0', defPath: 'C:/Hero.def',
  counts: { error: 0, warning: 0, convention: 0, suggestion: 0, fixable: 0, safe: 0 },
  dependency: { summary: { files: 1, missing: 0 }, nodes: [], edges: [] },
  files: [{ filename: 'C:/Hero.cns', uri: 'file:///Hero.cns', relative: 'Hero.cns', extension: '.cns', hash: 'x', findings: 0 }],
  findings: [], canUndo: false, undoId: ''
};
const page = health.healthHtml(model);
for (const fragment of [
  'role="navigation" aria-label="Audited findings"',
  'id="healthReadout" role="status" aria-live="polite"',
  'id="selection" class="muted" role="status" aria-live="polite"',
  'id="healthStatus" class="muted" role="status" aria-live="polite"',
  'id="findings" role="list" aria-label="Character health findings"',
  'aria-label="Filter character health findings"',
  'healthControlAvailability=(',
  "previous.onclick=()=>go(selectedSlot-1)",
  "next.onclick=()=>go(selectedSlot+1)",
  "document.getElementById('healthStatus').textContent=message.message",
  "if(message?.type==='healthBusy'&&message.generation===generation){busy=message.busy===true;refreshHealthControls()}"
]) assert(page.includes(fragment), fragment);
assert.match(page, /No findings match this filter\. Clear the search or change the severity\/file filter\./);
assert.match(page, /@media\(max-width:920px\)/);
assert.match(page, /aside\{display:block;max-height:30vh/);
assert.doesNotMatch(page, /aside\{display:none\}/, 'narrow layout must retain file-filter access');

console.log('Character Health availability, live status, boundary, empty, and narrow-layout tests passed');
