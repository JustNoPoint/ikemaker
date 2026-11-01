'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {
    env: { uiKind: 1 }, UIKind: { Web: 2 },
    Uri: { file: fsPath => ({ fsPath }) },
    workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) }
  };
  return originalLoad.call(this, request, parent, isMain);
};
const { viewerHtml } = require('../src/sff_viewer');
Module._load = originalLoad;

const html = viewerHtml({}, {
  filename: 'Accessibility.sff',
  header: { version: [2, 1, 0, 0] },
  sprites: [], palettes: []
}, new Map(), [], { sprites: {} });
const client = html.match(/<script nonce="[^"]+">([\s\S]*)<\/script>/)[1];
assert(client.includes('retainedMarks=Array.isArray(model.retainedState?.marked)') && client.includes('sprite.index===Number(identity.physicalIndex)&&sprite.group===Number(identity.group)&&sprite.number===Number(identity.number)'), 'structural refresh rebuilds marked sprites from exact retained identities instead of stale numeric webview positions');
assert(client.includes("if(action.dataset.action==='deleteSprite')requestSpriteDeletion()") && client.includes('selectedSprites:[...selectedIndices].map'), 'the compact delete icon uses the same exact-identity deletion request as the Delete key');

class FakeClassList {
  constructor(values = []) { this.values = new Set(values); }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  contains(value) { return this.values.has(value); }
  toggle(value, force) {
    const on = force === undefined ? !this.values.has(value) : Boolean(force);
    if (on) this.values.add(value); else this.values.delete(value);
    return on;
  }
}

function tabHarness() {
  const document = { activeElement: null, byId: new Map() };
  class Element {
    constructor(tag, id = '') { this.tag = tag; this.id = id; this.attrs = {}; this.children = []; this.classList = new FakeClassList(); this.tabIndex = 0; this.hidden = false; }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    append(child) { this.children.push(child); child.parentElement = this; }
    before(child) { this.beforeNode = child; child.parentElement = this.parentElement; }
    focus() { document.activeElement = this; }
  }
  const tabs = ['spritePanel', 'reviewPanel', 'displayPanel', 'layersPanel', 'referencesPanel'].map((panel, index) => {
    const tab = new Element('button'); tab.dataset = { panel }; if (index === 0) tab.classList.add('active'); return tab;
  });
  const panels = tabs.map((tab, index) => { const panel = new Element('section', tab.dataset.panel); if (index === 0) panel.classList.add('active'); document.byId.set(panel.id, panel); return panel; });
  document.querySelectorAll = selector => selector === '.tabs .tab' ? tabs : [];
  document.getElementById = id => document.byId.get(id) || null;
  document.createElement = tag => new Element(tag);
  const start = client.indexOf('const inspectorTabs=');
  const end = client.indexOf("document.getElementById('namingProfile')", start);
  assert(start >= 0 && end > start, 'generated inspector-tab client slice is discoverable');
  const context = { document };
  vm.createContext(context);
  vm.runInContext(client.slice(start, end), context);
  return { document, tabs, panels, tablist: tabs[0].parentElement };
}

const tabbed = tabHarness();
assert.strictEqual(tabbed.tablist.attrs.role, 'tablist');
assert.strictEqual(tabbed.tabs[0].attrs['aria-selected'], 'true');
assert.strictEqual(tabbed.tabs[0].tabIndex, 0);
assert.strictEqual(tabbed.tabs[1].attrs['aria-selected'], 'false');
assert.strictEqual(tabbed.tabs[1].tabIndex, -1);
let prevented = 0;
tabbed.tabs[0].onkeydown({ key: 'ArrowRight', preventDefault: () => prevented++ });
assert.strictEqual(prevented, 1);
assert.strictEqual(tabbed.document.activeElement, tabbed.tabs[1]);
assert.strictEqual(tabbed.tabs[1].attrs['aria-selected'], 'true');
assert.strictEqual(tabbed.tabs[0].attrs['aria-selected'], 'false');
assert.strictEqual(tabbed.panels[1].hidden, false);
assert.strictEqual(tabbed.panels[0].hidden, true);
tabbed.tabs[1].onkeydown({ key: 'End', preventDefault: () => prevented++ });
assert.strictEqual(tabbed.document.activeElement, tabbed.tabs.at(-1));
tabbed.tabs.at(-1).onkeydown({ key: 'Home', preventDefault: () => prevented++ });
assert.strictEqual(tabbed.document.activeElement, tabbed.tabs[0]);

function contextMenuHarness() {
  const document = { activeElement: null, menu: null };
  class Element {
    constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.style = {}; this.dataset = {}; this.isConnected = false; this.offsetWidth = 300; this.offsetHeight = 260; this.classList = new FakeClassList(); this.listeners = new Map(); this.captured = new Set(); }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(listener); }
    setPointerCapture(id) { this.captured.add(id); }
    releasePointerCapture(id) { this.captured.delete(id); }
    hasPointerCapture(id) { return this.captured.has(id); }
    getBoundingClientRect() { return { left: Number.parseFloat(this.style.left) || 0, top: Number.parseFloat(this.style.top) || 0, width: this.offsetWidth, height: this.offsetHeight }; }
    append(...children) { for (const child of children) { this.children.push(child); if (child && typeof child === 'object') child.parentElement = this; } }
    focus() { document.activeElement = this; }
    remove() { this.isConnected = false; if (document.menu === this) document.menu = null; }
    contains(target) { return target === this || this.children.some(child => child && typeof child.contains === 'function' && child.contains(target)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    querySelectorAll() {
      const output = [];
      const visit = node => { for (const child of node.children || []) { if (child && typeof child === 'object') { if (['button', 'input', 'select'].includes(child.tag) && !child.disabled) output.push(child); visit(child); } } };
      visit(this); return output;
    }
  }
  document.createElement = tag => new Element(tag);
  document.createTextNode = text => ({ tag: '#text', textContent: text, children: [] });
  document.body = new Element('body');
  document.body.isConnected = true;
  document.body.append = child => { child.parentElement = document.body; child.isConnected = true; document.body.children.push(child); if (child.id === 'sffMoveMenu') document.menu = child; };
  const canvas = new Element('canvas'); canvas.isConnected = true; canvas.handlers = {}; canvas.addEventListener = (type, handler) => { canvas.handlers[type] = handler; }; canvas.getBoundingClientRect = () => ({ left: 10, top: 20, width: 600, height: 400 });
  const sandbox = {
    document, canvas, menu: null, innerWidth: 1000, innerHeight: 700,
    availableTargets: () => [{ key: 'base', label: 'Base sprite', sprite: { group: 0, number: 0, index: 0 } }],
    moveTargets: new Set(['base']), moveTarget: 'base', showTargetBounds: true,
    syncStatus() {}, redraw() {}, saveViewState() {}, chooseTarget() {},
    vscode: { postMessage() {} }
  };
  sandbox.window = sandbox;
  const definitionsStart = client.indexOf('let menuReturnFocus=null;');
  const definitionsEnd = client.indexOf('targetSelect.onchange=', definitionsStart);
  const bindingStart = client.indexOf('canvas.oncontextmenu=', definitionsEnd);
  const bindingEnd = client.indexOf("addEventListener('pointerdown'", bindingStart);
  assert(definitionsStart >= 0 && definitionsEnd > definitionsStart && bindingStart > definitionsEnd && bindingEnd > bindingStart, 'generated context-menu client slices are discoverable');
  vm.createContext(sandbox);
  vm.runInContext(client.slice(definitionsStart, definitionsEnd) + client.slice(bindingStart, bindingEnd), sandbox);
  return { document, canvas };
}

const contextMenu = contextMenuHarness();
let contextPrevented = 0;
contextMenu.canvas.handlers.keydown({ key: 'ContextMenu', shiftKey: false, preventDefault: () => contextPrevented++ });
assert.strictEqual(contextPrevented, 1);
let dialog = contextMenu.document.menu;
assert(dialog && dialog.attrs.role === 'dialog');
const focusable = dialog.querySelectorAll();
assert.strictEqual(contextMenu.document.activeElement, focusable[0], 'keyboard open enters the first dialog control');
contextMenu.document.activeElement = focusable.at(-1);
dialog.onkeydown({ key: 'Tab', shiftKey: false, preventDefault: () => contextPrevented++, stopPropagation() {} });
assert.strictEqual(contextMenu.document.activeElement, focusable[0], 'Tab wraps from the last dialog control to the first');
contextMenu.document.activeElement = focusable[0];
dialog.onkeydown({ key: 'Tab', shiftKey: true, preventDefault: () => contextPrevented++, stopPropagation() {} });
assert.strictEqual(contextMenu.document.activeElement, focusable.at(-1), 'Shift+Tab wraps from the first dialog control to the last');
dialog.onkeydown({ key: 'Escape', shiftKey: false, preventDefault: () => contextPrevented++, stopPropagation() {} });
assert.strictEqual(contextMenu.document.menu, null);
assert.strictEqual(contextMenu.document.activeElement, contextMenu.canvas, 'Escape closes the dialog and restores the canvas opener');
contextMenu.canvas.handlers.keydown({ key: 'F10', shiftKey: true, preventDefault: () => contextPrevented++ });
dialog = contextMenu.document.menu;
assert(dialog && contextMenu.document.activeElement === dialog.querySelectorAll()[0], 'Shift+F10 reopens and enters the same dialog');

console.log('SFF viewer keyboard context menu and inspector tab behavior passed');
