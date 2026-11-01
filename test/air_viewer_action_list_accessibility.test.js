'use strict';

const assert = require('assert');
const vm = require('vm');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {};
  return originalLoad.call(this, request, parent, isMain);
};
const { viewerHtml, airActionListAvailability, airActionFocusIndex } = require('../src/air_viewer');
Module._load = originalLoad;

let state = airActionListAvailability({ hasAction: false, visibleCount: 0, markedCount: 0 });
assert(state.previous.disabled && /Select or create/.test(state.previous.reason), 'navigation explains that an AIR animation is required');
assert(state.markVisible.disabled && /no visible animations/.test(state.markVisible.reason), 'Mark Visible explains an empty result set');
assert(state.clearMarks.disabled && /No animations are marked/.test(state.clearMarks.reason), 'Clear explains an empty marked selection');

state = airActionListAvailability({ hasAction: true, visibleCount: 3, markedCount: 0, currentVisible: true });
assert.strictEqual(state.previous.disabled, false, 'Previous is available for a visible current animation');
assert.strictEqual(state.next.disabled, false, 'Next is available for a visible current animation');
assert.strictEqual(state.markVisible.disabled, false, 'Mark Visible is available while visible animations remain unmarked');
assert.strictEqual(state.clearMarks.disabled, true, 'Clear remains unavailable until an animation is marked');

state = airActionListAvailability({ hasAction: true, visibleCount: 2, markedCount: 1, currentVisible: false });
assert(state.next.disabled && /Clear the filter or select a visible animation/.test(state.next.reason), 'filtered-out navigation has a direct recovery reason');

state = airActionListAvailability({ hasAction: true, visibleCount: 2, markedCount: 2, currentVisible: true, allVisibleMarked: true });
assert(state.markVisible.disabled && /already marked/.test(state.markVisible.reason), 'Mark Visible explains its completed state');
assert.strictEqual(state.clearMarks.disabled, false, 'Clear is available when marks exist');

state = airActionListAvailability({ busy: true, hasAction: true, visibleCount: 2, markedCount: 1, currentVisible: true });
for (const control of ['previous', 'next', 'markVisible', 'clearMarks']) {
  assert(state[control].disabled && /current animation edit/.test(state[control].reason), `${control} serializes while an animation edit is pending`);
}

assert.strictEqual(airActionFocusIndex(3, 0, 'ArrowDown'), 1);
assert.strictEqual(airActionFocusIndex(3, 2, 'ArrowRight'), 0, 'forward action-list navigation wraps');
assert.strictEqual(airActionFocusIndex(3, 0, 'ArrowUp'), 2, 'backward action-list navigation wraps');
assert.strictEqual(airActionFocusIndex(3, 2, 'Home'), 0);
assert.strictEqual(airActionFocusIndex(3, 0, 'End'), 2);
assert.strictEqual(airActionFocusIndex(3, 1, 'Enter'), -1, 'unrelated keys remain untouched');
assert.strictEqual(airActionFocusIndex(0, 0, 'ArrowDown'), -1, 'an empty action list has no keyboard destination');

const model = {
  title: 'Anim.air', airPath: 'Anim.air', sffPath: 'Sprite.sff', palettes: [],
  actions: [5, 7, 9].map((number) => ({ number, line: number, sourceOrder: number, category: 'Test', name: `Action ${number}`, aliases: [], frames: [] }))
};
const html = viewerHtml(model);
for (const fragment of [
  '<label class="block" for="actionSort">Sort animations</label>',
  '<label class="block" for="search">Find animation</label>',
  'id="search" aria-label="Find AIR animation"',
  'id="actionSelectionStatus" class="muted" role="status" aria-live="polite"',
  'id="actions" role="group" aria-label="AIR animations"',
  'id="newActionDialog" aria-labelledby="newActionDialogTitle"',
  'id="airTextDialog" aria-labelledby="airTextTitle"'
]) assert(html.includes(fragment), `generated AIR viewer is missing ${fragment}`);
assert(html.includes('No animations match the current filter. Clear or change the filter.'), 'a filtered-empty action list has visible recovery guidance');
assert(html.includes('No AIR animations exist yet. Use New Action to create one.'), 'an empty AIR source has creation guidance');

function clientFunctionSource(source, name) {
  const start = source.indexOf(`function ${name}(`), open = source.indexOf('{', start);
  assert(start >= 0 && open > start, `missing generated client function ${name}`);
  let depth = 0;
  for (let at = open; at < source.length; at += 1) {
    if (source[at] === '{') depth += 1;
    if (source[at] === '}' && --depth === 0) return source.slice(start, at + 1);
  }
  throw new Error(`unterminated generated client function ${name}`);
}

const scriptStart = html.lastIndexOf('<script nonce="');
const client = html.slice(html.indexOf('>', scriptStart) + 1, html.indexOf('</script>', scriptStart));
const focused = [];
function fakeButton(number) {
  const listeners = {};
  return {
    dataset: { action: String(number) }, attributes: {}, listeners,
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(type, listener) { (listeners[type] ||= []).push(listener); },
    focus() { focused.push(number); }
  };
}
const buttons = [5, 7, 9].map(fakeButton);
const root = { appended: [], queried: false, querySelectorAll() { this.queried = true; return buttons; }, append(node) { this.appended.push(node); } };
const context = {
  action: { number: 7 }, selectedActions: new Set([5, 7]), model,
  airActionFocusIndex, focusActionButton(number) { focused.push(`click:${number}`); },
  document: {
    getElementById(id) { assert.strictEqual(id, 'actions'); return root; },
    createElement(tag) { return { tag, className: '', attributes: {}, textContent: '', setAttribute(name, value) { this.attributes[name] = value; } }; }
  }
};
vm.createContext(context);
vm.runInContext(`${clientFunctionSource(client, 'decorateActionListAccessibility')};decorateActionListAccessibility();`, context);
assert.strictEqual(root.queried, true, 'action-list decoration reaches the generated action container');
assert.deepStrictEqual(buttons.map((button) => button.attributes['aria-current']), ['false', 'true', 'false'], 'current animation semantics follow the exact selected action');
assert.deepStrictEqual(buttons.map((button) => button.attributes['aria-pressed']), ['true', 'true', 'false'], 'marked animation semantics follow the exact batch selection');

let prevented = false;
buttons[2].listeners.keydown[0]({ key: 'ArrowDown', preventDefault() { prevented = true; } });
assert(prevented, 'handled action-list navigation prevents browser scrolling');
assert.strictEqual(focused.at(-1), 5, 'keyboard navigation wraps to the first visible action');
buttons[1].listeners.keydown[0]({ key: 'Home', preventDefault() {} });
assert.strictEqual(focused.at(-1), 5, 'Home focuses the first visible action');
buttons[0].listeners.keydown[0]({ key: 'End', preventDefault() {} });
assert.strictEqual(focused.at(-1), 9, 'End focuses the last visible action');
buttons[1].listeners.click[0]();
assert.strictEqual(focused.at(-1), 'click:7', 'click focus restoration targets the exact animation after rerender');

console.log('AIR viewer action-list accessibility tests passed');
