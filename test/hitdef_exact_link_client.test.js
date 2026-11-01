'use strict';

const assert = require('assert');
const vm = require('vm');
const Module = require('module');

const original = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'vscode') return {};
  return original.call(this, request, parent, isMain);
};
const { page } = require('../src/hitdef_workspace');
Module._load = original;

const route1 = '1'.repeat(48);
const route2 = '2'.repeat(48);
const html = page({
  file: 'move.zss',
  syntax: 'zss',
  currentIndex: 0,
  blocks: [{}],
  duplicates: [],
  groups: [{
    label: 'States',
    open: true,
    parameters: [
      { name: 'p1stateno', key: 'p1stateno', value: '500', enabled: true, description: 'P1 state', state: { available: true, state: 500, file: 'states.zss', route: route1 } },
      { name: 'p2stateno', key: 'p2stateno', value: '600', enabled: true, description: 'P2 state', state: { available: true, state: 600, file: 'states.zss', route: route2 } }
    ]
  }],
  description: 'Attack',
  visual: { state: 'unavailable', detail: 'Choose character.' }
});

assert(html.includes('data-authored-enabled="'));
assert(html.includes('data-authored-value="'));
assert(html.includes('Apply or discard this field draft before exact source navigation.'));

const start = html.indexOf('function syncExactLinks(');
const end = html.indexOf('\nfunction render()', start);
assert(start >= 0 && end > start, 'exact-link synchronization helper is emitted');
const restore = html.indexOf('globalThis.ikemenRestoreHitdefDraft?.()');
const restoredSync = html.indexOf("document.querySelectorAll('.field').forEach(syncExactLinks)", restore);
assert(restore >= 0 && restoredSync > restore, 'render resynchronizes exact links after programmatic draft restoration');
const sandbox = {};
vm.runInNewContext(`${html.slice(start, end)}\nthis.syncExactLinks=syncExactLinks;`, sandbox);

function row(value, route, title) {
  const checkbox = { checked: true };
  const input = { value };
  const button = { disabled: false, title, dataset: { stateRoute: route } };
  return {
    checkbox,
    input,
    button,
    dataset: { authoredEnabled: '1', authoredValue: value },
    querySelector(selector) { return selector === 'input[type=checkbox]' ? checkbox : input; },
    querySelectorAll() { return [button]; }
  };
}

const p1 = row('500', route1, 'Open exact assigned StateDef 500');
const p2 = row('600', route2, 'Open exact assigned StateDef 600');
sandbox.syncExactLinks(p1);
sandbox.syncExactLinks(p2);
assert.strictEqual(p1.button.disabled, false);
assert.strictEqual(p2.button.disabled, false);

p1.input.value = '501';
// Draft restoration is programmatic and emits no input/change event. The
// render-level post-restore pass must still invalidate the authored route.
sandbox.syncExactLinks(p1);
assert.strictEqual(p1.button.disabled, true, 'a changed draft disables its authored exact route');
assert.strictEqual(p2.button.disabled, false, 'p1 draft changes do not affect p2 navigation');
assert.strictEqual(p1.button.dataset.stateRoute, route1, 'client never replaces or mints route authority');

p1.input.value = '500';
p1.checkbox.checked = false;
sandbox.syncExactLinks(p1);
assert.strictEqual(p1.button.disabled, true, 'unchecking an authored field disables its exact route');

p1.checkbox.checked = true;
sandbox.syncExactLinks(p1);
assert.strictEqual(p1.button.disabled, false, 'restoring the exact snapshot restores navigation');
assert.strictEqual(p1.button.title, 'Open exact assigned StateDef 500');
assert.strictEqual(p1.button.dataset.stateRoute, route1);

const exactRestore = row('500', route1, 'Open exact assigned StateDef 500');
exactRestore.input.value = '500';
sandbox.syncExactLinks(exactRestore);
assert.strictEqual(exactRestore.button.disabled, false, 'a no-draft or exact restored value remains enabled');

console.log('HitDef exact-link client draft invalidation tests passed');
