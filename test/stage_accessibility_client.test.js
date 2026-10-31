'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const Module = require('module');

const load = Module._load;
Module._load = function patched(request, parent, main) { if (request === 'vscode') return {}; return load.call(this, request, parent, main); };
const { stagePayload, stageHtml } = require('../src/stage_workspace');
Module._load = load;

function functionSource(text, name) {
  const start = text.indexOf(`function ${name}(`);
  assert(start >= 0, `${name} should exist in the generated client`);
  const open = text.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let index = open; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
    if (char === '{') depth++;
    else if (char === '}' && --depth === 0) return text.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-stage-a11y-'));
try {
  const filename = path.join(directory, 'stage.def');
  fs.writeFileSync(filename, '[Info]\nname=Accessibility Stage\n[StageInfo]\nlocalcoord=320,240\nzoffset=220\n[BGDef]\n[BG One]\ntype=normal\nstart=0,0\n[BG Two]\ntype=normal\nstart=10,10\n[BG Three]\ntype=normal\nstart=20,20\n');
  const html = stageHtml(stagePayload(filename));

  const document = { activeElement: null };
  const makeButton = (local = '', action = '') => ({
    dataset: { local, action },
    focus() { document.activeElement = this; this.focusCount = (this.focusCount || 0) + 1; }
  });
  const menu = {
    hidden: true, style: {}, items: [],
    set innerHTML(value) { this.items = [makeButton('preview'), makeButton('lock')]; if (value.includes('data-action=')) this.items.push(makeButton('', 'open-source')); },
    querySelector(selector) { if (selector === 'button') return this.items[0]; if (selector.includes('preview')) return this.items[0]; if (selector.includes('lock')) return this.items[1]; return null; },
    querySelectorAll(selector) { return selector === '[data-action]' ? this.items.filter(item => item.dataset.action) : this.items; },
    setAttribute() {},
    contains(target) { return target === this || this.items.includes(target); }
  };
  const opener = { isConnected: true, focus() { document.activeElement = this; this.focusCount = (this.focusCount || 0) + 1; } };
  const fallback = { focus() { document.activeElement = this; this.focusCount = (this.focusCount || 0) + 1; } };
  document.getElementById = id => id === 'backgroundContext' ? menu : null;
  document.querySelector = selector => selector.includes('data-stage-index') ? fallback : null;
  const context = {
    document, innerWidth: 800, innerHeight: 600,
    model: { backgrounds: [{ name: 'One', hidden: false }] },
    locked: new Set(), data: { backgroundBrowser: { binding: 'stage:test' } },
    escapeHtml: value => value, saveView() {}, render() {}, inspect() {}, post() {},
    list() { opener.isConnected = false; },
    console
  };
  vm.createContext(context);
  vm.runInContext([
    'let backgroundContextOpener=null,backgroundContextIndex=-1;',
    functionSource(html, 'closeBackgroundContext'),
    functionSource(html, 'handleBackgroundContextKey'),
    functionSource(html, 'dismissBackgroundContextFromPointer'),
    functionSource(html, 'openBackgroundContext')
  ].join('\n'), context);
  const row = { ordinal: 0, actions: [{ id: 'open-source', label: 'Open source' }] };
  context.openBackgroundContext(row, 10, 10, opener);
  assert.strictEqual(document.activeElement, menu.items[0], 'opening focuses the first menu item');
  const key = value => ({ key: value, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } });
  let event = key('ArrowDown'); context.handleBackgroundContextKey(event); assert.strictEqual(document.activeElement, menu.items[1]); assert(event.prevented);
  event = key('End'); context.handleBackgroundContextKey(event); assert.strictEqual(document.activeElement, menu.items.at(-1));
  event = key('Home'); context.handleBackgroundContextKey(event); assert.strictEqual(document.activeElement, menu.items[0]);
  event = key('Escape'); context.handleBackgroundContextKey(event); assert(menu.hidden); assert.strictEqual(document.activeElement, opener); assert(event.stopped);
  context.openBackgroundContext(row, 10, 10, opener); context.dismissBackgroundContextFromPointer({ target: {} }); assert(menu.hidden, 'outside pointer dismissal closes the menu');
  context.openBackgroundContext(row, 10, 10, opener); menu.items[0].onclick(); assert.strictEqual(document.activeElement, fallback, 'rerendered local actions restore the replacement row');

  const align = [{}, {}], distribute = [{}, {}];
  const arrangeContext = { selectedSet: new Set([0]), selected: 0, bounds: [{ x: 0 }], document: { querySelectorAll: selector => selector === '[data-stage-align]' ? align : distribute } };
  vm.createContext(arrangeContext); vm.runInContext(functionSource(html, 'syncArrangeAvailability'), arrangeContext);
  arrangeContext.syncArrangeAvailability(); assert(align.every(button => button.disabled)); assert(distribute.every(button => button.disabled)); assert.match(align[0].title, /at least two/);
  arrangeContext.selectedSet = new Set([0, 1]); arrangeContext.bounds = [{ x: 0 }]; arrangeContext.syncArrangeAvailability(); assert(align.every(button => button.disabled)); assert.match(align[0].title, /finish rendering/);
  arrangeContext.bounds = [{ x: 0 }, { x: 1 }]; arrangeContext.syncArrangeAvailability(); assert(align.every(button => !button.disabled)); assert(distribute.every(button => button.disabled));
  arrangeContext.selectedSet = new Set([0, 1, 2]); arrangeContext.bounds = [{ x: 0 }, { x: 1 }, { x: 2 }]; arrangeContext.syncArrangeAvailability(); assert(distribute.every(button => !button.disabled));
  console.log('Stage executable accessibility client states passed');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
