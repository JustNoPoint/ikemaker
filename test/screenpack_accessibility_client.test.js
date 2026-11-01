'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const Module = require('module');

const load = Module._load;
Module._load = function patched(request, parent, main) { if (request === 'vscode') return {}; return load.call(this, request, parent, main); };
const { uiPayload, uiHtml } = require('../src/screenpack_workspace');
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

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-screenpack-a11y-'));
try {
  const filename = path.join(directory, 'system.def');
  fs.writeFileSync(filename, '[Info]\nname=Accessibility UI\nlocalcoord=320,240\n[Files]\nspr=missing.sff\n[Title Info]\np1.face.pos=10,20\np1.face.spr=1,0\np2.face.pos=300,20\np2.face.spr=1,0\n');
  const html = uiHtml(uiPayload(filename));
  const document = { activeElement: null };
  const makeButton = () => ({ dataset: {}, setAttribute(name, value) { this[name] = value; }, focus() { document.activeElement = this; this.focusCount = (this.focusCount || 0) + 1; } });
  const menu = {
    hidden: true, style: {}, items: [], innerHTML: '', offsetHeight: 80,
    appendChild(button) { this.items.push(button); },
    querySelector(selector) { return selector === 'button' ? this.items[0] : null; },
    querySelectorAll(selector) { return selector === '[role=menuitem]' ? this.items : this.items.filter(item => item.dataset.action); }
  };
  const opener = { isConnected: true, focus() { document.activeElement = this; } };
  const fallback = { focus() { document.activeElement = this; } };
  document.getElementById = id => id === 'elementMenu' ? menu : null;
  document.querySelector = selector => selector.includes('data-element-index') ? fallback : null;
  document.createElement = () => makeButton();
  const context = {
    document, window: { innerWidth: 800, innerHeight: 600 }, screenIndex: 0,
    previewHidden: new Set(), editorLocks: new Set(), elementStateKey: (screen, index) => `${screen}:${index}`,
    elementBrowser: { binding: 'screenpack:test' }, togglePreview() {}, toggleEditorLock() {}, post() {}, console
  };
  vm.createContext(context);
  vm.runInContext([
    'let elementMenuOpener=null,elementMenuIndex=-1;',
    functionSource(html, 'closeElementMenu'), functionSource(html, 'handleElementMenuKey'),
    functionSource(html, 'dismissElementMenuFromPointer'), functionSource(html, 'openElementMenu')
  ].join('\n'), context);
  context.openElementMenu({ ordinal: 0, actions: [{ id: 'open-source', label: 'Open source' }] }, { left: 10, top: 10 }, opener);
  assert.strictEqual(document.activeElement, menu.items[0]);
  const key = value => ({ key: value, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } });
  let event = key('ArrowDown'); context.handleElementMenuKey(event); assert.strictEqual(document.activeElement, menu.items[1]);
  event = key('End'); context.handleElementMenuKey(event); assert.strictEqual(document.activeElement, menu.items.at(-1));
  event = key('Home'); context.handleElementMenuKey(event); assert.strictEqual(document.activeElement, menu.items[0]);
  event = key('Escape'); context.handleElementMenuKey(event); assert(menu.hidden); assert.strictEqual(document.activeElement, opener); assert(event.stopped);
  context.openElementMenu({ ordinal: 0, actions: [] }, { left: 10, top: 10 }, opener); context.dismissElementMenuFromPointer({ target: { closest: () => null } }); assert(menu.hidden);

  const mirror = {}, sprite = {}; let elements = [], currentItem = null;
  const availabilityContext = { document: { getElementById: id => id === 'mirror' ? mirror : sprite }, current: () => ({ elements }), element: () => currentItem, data: { sffPath: '', sffError: '' } };
  vm.createContext(availabilityContext);
  vm.runInContext(functionSource(html, 'syncScreenpackMirrorAvailability') + '\n' + functionSource(html, 'syncScreenpackSpriteAvailability'), availabilityContext);
  availabilityContext.syncScreenpackMirrorAvailability(); assert.strictEqual(mirror.disabled, true); assert.match(mirror.title, /No matched/);
  elements = [{ name: 'p1.face' }, { name: 'p2.face' }]; availabilityContext.syncScreenpackMirrorAvailability(); assert.strictEqual(mirror.disabled, false); assert.match(mirror.title, /Mirror all 1 matched/);
  availabilityContext.syncScreenpackSpriteAvailability(); assert.strictEqual(sprite.disabled, true); assert.match(sprite.title, /Add or select/);
  currentItem = { assetSprite: [1, 0] }; availabilityContext.syncScreenpackSpriteAvailability(); assert.match(sprite.title, /No screenpack SFF is assigned/);
  availabilityContext.data.sffPath = 'missing.sff'; availabilityContext.data.sffError = 'file missing'; availabilityContext.syncScreenpackSpriteAvailability(); assert.match(sprite.title, /unavailable: file missing/);
  availabilityContext.data.sffError = ''; availabilityContext.syncScreenpackSpriteAvailability(); assert.strictEqual(sprite.disabled, false); assert.match(sprite.title, /Open sprite 1,0 in missing\.sff/);
  currentItem = null; availabilityContext.syncScreenpackSpriteAvailability(); assert.match(sprite.title, /Add or select/, 'empty selection replaces the prior enabled title instead of leaving stale guidance');
  console.log('Screenpack executable accessibility client states passed');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
