'use strict';

const assert = require('assert');
const Module = require('module');
const vm = require('vm');

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'vscode') return { window: {}, commands: {}, ViewColumn: { Active: -1 } };
  if (request === './viewer_group') return { trackViewerPanel: panel => panel, preferredViewerColumn: () => 1, revealInViewerGroup() {} };
  return originalLoad.call(this, request, parent, isMain);
};
const { HELP_TAB_IDS, html } = require('../src/help_workspace');
Module._load = originalLoad;

const page = html();
const match = page.match(/;\(\(\)=>\{const tabs=\["helpTab-start"[\s\S]*?\}\)\(\);/);
assert(match, 'the emitted Help tab client is available for execution');
assert.deepStrictEqual(HELP_TAB_IDS, ['helpTab-start','helpTab-screens','helpTab-migration','helpTab-docs','helpTab-compatibility']);

function classes(initial = []) {
  const values = new Set(initial);
  return {
    contains(value) { return values.has(value); },
    toggle(value, force) { force ? values.add(value) : values.delete(value); }
  };
}
function node(id, active = false) {
  return {
    id, dataset: {}, classList: classes(active ? ['active'] : []), attrs: {}, tabIndex: active ? 0 : -1,
    disabled: false, hidden: !active, title: '', textContent: '', value: '', focused: 0,
    setAttribute(name, value) { this.attrs[name] = String(value); },
    removeAttribute(name) { delete this.attrs[name]; },
    getAttribute(name) { return this.attrs[name] ?? ''; },
    focus() { this.focused += 1; context.document.activeElement = this; },
    addEventListener() {}, close() {}, showModal() {}
  };
}
const ids = ['start','screens','migration','docs','compatibility'];
const nodes = new Map();
for (const [index, name] of ids.entries()) {
  const tab = node('helpTab-' + name, index === 0); tab.dataset.tab = name; nodes.set(tab.id, tab);
  nodes.set(name, node(name, index === 0));
}
for (const id of ['helpActionStatus','screenDialog','closeScreenshot','largeScreenshot','screenCaption','screenSearch','screenCount']) nodes.set(id, node(id));
const saved = [];
const context = {
  document: {
    activeElement: null,
    querySelectorAll(selector) {
      if (selector === '.screen-card' || selector.includes('data-command') || selector.includes('data-doc') || selector === '[data-enlarge]') return [];
      return [];
    }
  },
  $: id => nodes.get(id),
  vscode: { setState(value) { saved.push(value); }, postMessage() {} },
  addEventListener() {},
  getComputedStyle() { return { display: 'block' }; },
  globalThis: {}
};
vm.createContext(context);
vm.runInContext(match[0], context);

for (const id of HELP_TAB_IDS) assert.strictEqual(typeof nodes.get(id).onclick, 'function', id + ' receives the emitted generic tab binding');
nodes.get('helpTab-screens').onclick();
assert.strictEqual(nodes.get('helpTab-screens').attrs['aria-selected'], 'true');
assert.strictEqual(nodes.get('screens').hidden, false);
assert.strictEqual(nodes.get('start').hidden, true);
assert.deepStrictEqual(JSON.parse(JSON.stringify(saved.at(-1))), { tab: 'screens' });

let prevented = 0;
nodes.get('helpTab-screens').onkeydown({ key: 'End', preventDefault() { prevented += 1; } });
assert.strictEqual(nodes.get('helpTab-compatibility').attrs['aria-selected'], 'true');
assert.strictEqual(nodes.get('helpTab-compatibility').focused, 1);
nodes.get('helpTab-compatibility').onkeydown({ key: 'Home', preventDefault() { prevented += 1; } });
assert.strictEqual(nodes.get('helpTab-start').attrs['aria-selected'], 'true');
assert.strictEqual(nodes.get('helpTab-start').focused, 1);
assert.strictEqual(prevented, 2);

console.log('Help Start and sibling tabs receive executable click and keyboard bindings');
