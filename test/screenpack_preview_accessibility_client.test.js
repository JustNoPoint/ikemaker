'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const Module = require('module');

const load = Module._load;
Module._load = function patched(request, parent, main) { if (request === 'vscode') return {}; return load.call(this, request, parent, main); };
const { uiPayload, uiHtml, screenpackPreviewControlAvailability } = require('../src/screenpack_workspace');
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

const empty = screenpackPreviewControlAvailability({});
assert(empty.apply.disabled && empty.copy.disabled && empty.discard.disabled && empty.position.disabled);
assert.match(empty.apply.reason, /Add or select/);
const selected = screenpackPreviewControlAvailability({ hasItem: true });
assert.strictEqual(selected.copy.disabled, false); assert(selected.apply.disabled); assert.match(selected.apply.reason, /Move the selected/); assert(selected.discard.disabled);
const changed = screenpackPreviewControlAvailability({ hasItem: true, hasOverride: true });
assert.strictEqual(changed.apply.disabled, false); assert.strictEqual(changed.discard.disabled, false); assert.strictEqual(changed.position.disabled, false);
const locked = screenpackPreviewControlAvailability({ hasItem: true, hasOverride: true, locked: true });
assert(locked.apply.disabled && locked.position.disabled); assert.match(locked.apply.reason, /Unlock every selected/); assert.strictEqual(locked.discard.disabled, false);
assert.match(screenpackPreviewControlAvailability({ gridMode: true, gridValid: true, gridChanged: false }).grid.reason, /Change at least one/);
assert.match(screenpackPreviewControlAvailability({ gridMode: true, gridValid: false, gridChanged: true }).grid.reason, /must be positive/);
assert.strictEqual(screenpackPreviewControlAvailability({ gridMode: true, gridValid: true, gridChanged: true }).grid.disabled, false);

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-screenpack-preview-a11y-'));
try {
  const filename = path.join(directory, 'system.def');
  fs.writeFileSync(filename, '[Info]\nname=Preview\nlocalcoord=320,240\n[Files]\nspr=missing.sff\nfight=fight.def\n[Select Info]\nrows=2\ncolumns=2\npos=10,20\ncell.size=30,40\ncell.spacing=2,3\n[Title Info]\nlogo.pos=10,20\nlogo.spr=1,0\n');
  const html = uiHtml(uiPayload(filename, undefined, 'select-layout'));
  const controls = Object.fromEntries(['copy','apply','discard','x','y','applyGrid'].map(id => [id, { disabled: false, title: '', setAttribute(name, value) { this[name] = value; } }]));
  let item = null, lockedState = false, grid = { gridRows: 2, gridColumns: 2, gridX: 10, gridY: 20, cellW: 30, cellH: 40, spaceX: 2, spaceY: 3 };
  const context = {
    document: { getElementById: id => controls[id] || null }, element: () => item,
    selectedIndices: new Set([0]), selected: 0, overrides: {}, screenIndex: 0, selectedIsLocked: () => lockedState,
    model: { selectGrid: {} }, data: { workspaceMode: 'select-layout' }, gridState: () => ({ ...grid }), baseGrid: { ...grid }, screenpackPreviewControlAvailability
  };
  vm.createContext(context);
  vm.runInContext([
    functionSource(html, 'setScreenpackControlState'),
    functionSource(html, 'currentScreenpackPreviewAvailability'), functionSource(html, 'syncScreenpackPreviewAvailability'),
    functionSource(html, 'currentScreenpackGridAvailability'), functionSource(html, 'syncScreenpackGridAvailability')
  ].join('\n'), context);
  context.syncScreenpackPreviewAvailability(); assert(controls.apply.disabled && controls.copy.disabled); assert.match(controls.apply.title, /Add or select/);
  item = { name: 'logo' }; context.syncScreenpackPreviewAvailability(); assert.strictEqual(controls.copy.disabled, false); assert(controls.apply.disabled); assert.match(controls.apply.title, /Move the selected/);
  context.overrides['0:0'] = [14, 24]; context.syncScreenpackPreviewAvailability(); assert.strictEqual(controls.apply.disabled, false); assert.strictEqual(controls.discard.disabled, false);
  lockedState = true; context.syncScreenpackPreviewAvailability(); assert(controls.apply.disabled && controls.x.disabled); assert.match(controls.x.title, /Unlock every selected/);
  context.syncScreenpackGridAvailability(); assert(controls.applyGrid.disabled); assert.match(controls.applyGrid.title, /Change at least one/);
  grid.gridColumns = 3; context.syncScreenpackGridAvailability(); assert.strictEqual(controls.applyGrid.disabled, false);
  grid.cellW = 0; context.syncScreenpackGridAvailability(); assert(controls.applyGrid.disabled); assert.match(controls.applyGrid.title, /must be positive/);
  console.log('Screenpack preview position and grid availability transitions passed');
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
