'use strict';

const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const realParseAir = require('../src/air_preview_model').parseAir;
const originalLoad = Module._load;

Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {};
  if (request === './air_viewer' && /air_docking_workspace\.js$/.test(parent?.filename || '')) return {
    parseAir: realParseAir,
    inferCharacterFiles: () => ({}),
    collisionRuntimeOptions: () => ({}),
    collisionRuntimeDraftEntries: () => []
  };
  return originalLoad.call(this, request, parent, isMain);
};
const { completeBrowserReady, html } = require('../src/air_docking_workspace');
Module._load = originalLoad;

const token = '0123456789abcdef'.repeat(3);
const output = html({
  airPath: path.resolve('/char/main.air'),
  sourceFingerprint: 'A'.repeat(64),
  browserRenderToken: token,
  actions: [],
  references: { available: false, reason: 'test', items: [], occurrences: [], collisions: { available: false, reason: 'test', items: [] } },
  initialView: 'actions', initialCollisionMode: 'inspect', initialTransform: {}, initialProperty: {},
  initialAssistance: { referenceElementIndex: 0, targetElementIndices: [], groups: { clsn1: { enabled: true, cap: 4 }, clsn2: { enabled: true, cap: 4 } }, locks: { frames: [], boxes: [] }, targetPosition: 0 }
});

assert(output.includes(`"browserRenderToken":"${token}"`), 'the exact browser render token reaches the replacement webview document');
assert(output.includes("vscode.postMessage({type:'browserReady',renderToken:model.browserRenderToken})"), 'the replacement document returns its own render token');
for (const id of ['browserUndo', 'browserRedo']) assert(output.includes(`id="${id}"`), `floating AIR browser header is missing ${id}`);
assert(output.includes("vscode.postMessage({type:'documentUndo'})") && output.includes("vscode.postMessage({type:'documentRedo'})"), 'floating AIR browser Undo and Redo controls must use explicit host messages');
assert(output.includes('id="browserHistoryStatus"')&&output.includes('Undo/Redo targets the exact AIR source editor'),'AIR history controls disclose their exact target in a live status region');

let resolved = 0;
const record = { browserRenderToken: token, resolveBrowserReady: () => { resolved += 1; } };
assert.strictEqual(completeBrowserReady(record, 'stale-render-token'), false, 'a pre-move or superseded webview cannot unlock the current render');
assert.strictEqual(resolved, 0, 'a stale ready event cannot resolve the current readiness promise');
assert.strictEqual(typeof record.resolveBrowserReady, 'function', 'the current readiness resolver remains armed after a stale event');
assert.strictEqual(completeBrowserReady(record, token), true, 'the exact replacement webview can report readiness');
assert.strictEqual(resolved, 1, 'the exact replacement resolves readiness once');
assert.strictEqual(record.resolveBrowserReady, null, 'the accepted readiness resolver is consumed');
assert.strictEqual(completeBrowserReady(record, token), true, 'a duplicate exact ready event is harmless');
assert.strictEqual(resolved, 1, 'duplicate exact ready events cannot resolve a later render');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'air_docking_workspace.js'), 'utf8');
assert(source.includes("await vscode.commands.executeCommand('workbench.action.moveEditorToNewWindow');") && source.includes('renderBrowser(record);'), 'floating rehydrates the browser after VS Code moves the tab to another window');
assert(source.includes("if (messageType === 'browserReady') { completeBrowserReady(record, message.renderToken); return; }"), 'the host validates readiness against the current render generation');
assert.strictEqual((source.match(/webview\.html\s*=\s*html/g) || []).length, 1, 'initial, refreshed, failed, and moved AIR browser documents all use the generation-safe renderer');

console.log('AIR floating browser rehydrates with generation-safe readiness and visible Undo/Redo controls');
