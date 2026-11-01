'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const Module = require('module');

const load = Module._load;
Module._load = function patched(request, parent, main) { if (request === 'vscode') return {}; return load.call(this, request, parent, main); };
const { uiPayload, uiHtml, screenpackWorkspaceControlAvailability } = require('../src/screenpack_workspace');
Module._load = load;

function functionSource(text, name) {
  const start = text.indexOf(`function ${name}(`); assert(start >= 0, `${name} should exist`);
  const open = text.indexOf('{', start); let depth = 0, quote = '', escaped = false;
  for (let index = open; index < text.length; index++) {
    const char = text[index];
    if (quote) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === quote) quote = ''; continue; }
    if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
    if (char === '{') depth++; else if (char === '}' && --depth === 0) return text.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

const empty = screenpackWorkspaceControlAvailability({});
assert(empty.screen.disabled && empty.screenAction.disabled && empty.elementAction.disabled && empty.elementBrowser.disabled && empty.action.disabled && empty.luaStructure.disabled);
assert.match(empty.screenAction.reason, /Add or select a screenpack screen/);
const screenOnly = screenpackWorkspaceControlAvailability({ hasScreen: true });
assert.strictEqual(screenOnly.screen.disabled, false); assert.strictEqual(screenOnly.screenAction.disabled, false); assert(screenOnly.elementBrowser.disabled);
const itemWithoutAction = screenpackWorkspaceControlAvailability({ hasScreen: true, hasItem: true, hasItems: true });
assert.strictEqual(itemWithoutAction.elementAction.disabled, false); assert.strictEqual(itemWithoutAction.elementBrowser.disabled, false); assert(itemWithoutAction.action.disabled); assert.match(itemWithoutAction.action.reason, /does not use an embedded/);
const complete = screenpackWorkspaceControlAvailability({ hasScreen: true, hasItem: true, hasItems: true, hasAction: true, hasModule: true });
assert.strictEqual(complete.action.disabled, false); assert.strictEqual(complete.luaStructure.disabled, false);

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-screenpack-control-availability-'));
try {
  const filename = path.join(directory, 'system.def');
  fs.writeFileSync(filename, '[Info]\nname=Controls\nlocalcoord=320,240\n[Files]\nspr=missing.sff\n[Title Info]\nlogo.pos=10,20\nlogo.spr=1,0\n');
  const html = uiHtml(uiPayload(filename));
  const ids = ['screen','addElement','layeredPsd','insertUiComponent','manageUiComponents','source','editPreferred','duplicateUiElement','saveUiComponent','elementSearch','elementKind','elementView','assetAction','luaStructure'];
  const controls = Object.fromEntries(ids.map(id => [id, { disabled: false, title: '', setAttribute(name, value) { this[name] = value; } }]));
  let screen = { elements: [] }, item = null;
  const context = {
    document: { getElementById: id => controls[id] || null }, current: () => screen, element: () => item,
    model: { screens: [screen] }, data: { moduleExists: false }, screenpackWorkspaceControlAvailability,
    setScreenpackControlState(id, state, title) { const control = controls[id]; if (!control) return; control.disabled = state.disabled; control.title = state.disabled ? state.reason : title; control.setAttribute('aria-description', control.title); }
  };
  vm.createContext(context);
  vm.runInContext(functionSource(html, 'syncScreenpackWorkspaceAvailability'), context);
  context.syncScreenpackWorkspaceAvailability();
  assert.strictEqual(controls.addElement.disabled, false); assert(controls.source.disabled); assert(controls.elementSearch.disabled); assert(controls.assetAction.disabled);
  item = { actionLine: null }; screen.elements.push(item); context.syncScreenpackWorkspaceAvailability();
  assert.strictEqual(controls.source.disabled, false); assert.strictEqual(controls.elementSearch.disabled, false); assert(controls.assetAction.disabled); assert.match(controls.assetAction.title, /does not use an embedded/);
  item.actionLine = 42; context.data.moduleExists = true; context.syncScreenpackWorkspaceAvailability();
  assert.strictEqual(controls.assetAction.disabled, false); assert.strictEqual(controls.luaStructure.disabled, false);
  context.model.screens.length = 0; screen = null; item = null; context.syncScreenpackWorkspaceAvailability();
  assert(controls.screen.disabled && controls.addElement.disabled && controls.layeredPsd.disabled); assert.match(controls.addElement.title, /Add or select a screenpack screen/);
  console.log('Screenpack workspace control availability transitions passed');
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
