'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');

const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return { workspace: { textDocuments: [] } };
  return originalLoad.call(this, request, parent, isMain);
};
const { handleAirDocumentChange } = require('../src/air_viewer');
const { handleMenuDocumentChange } = require('../src/menu_modes_workspace');
const { handleStoryDocumentChange } = require('../src/story_dialogue_workspace');
Module._load = originalLoad;

function uri(filename) { return { fsPath: filename, toString: () => `file:///${filename.replace(/\\/g, '/')}` }; }
function document(filename) { return { fileName: filename, uri: uri(filename), isDirty: false }; }
function panel() { return { webview: { html: 'unfinished viewer form', messages: [], postMessage(message) { this.messages.push(message); return true; } } }; }

const airDocument = document('C:\\fixture\\Anim.air'), airPanel = panel();
const airKey = (process.platform === 'win32' ? path.resolve(airDocument.fileName).toLowerCase() : path.resolve(airDocument.fileName));
handleAirDocumentChange({ document: airDocument, contentChanges: [] }, new Map([[airKey, { airPath: airDocument.fileName, panel: airPanel }]]));
assert.deepStrictEqual(airPanel.webview.messages.map((message) => message.type), ['sourceSaveStatus'], 'AIR dirty-state-only changes publish status without a model rebuild');
assert.strictEqual(airPanel.webview.html, 'unfinished viewer form', 'AIR dirty-state-only changes retain unfinished viewer fields');

const systemDocument = document('C:\\fixture\\system.def'), selectDocument = document('C:\\fixture\\select.def'), menuPanel = panel();
handleMenuDocumentChange({ document: systemDocument, contentChanges: [] }, [{ systemDocument, selectDocument, panel: menuPanel }]);
assert.deepStrictEqual(menuPanel.webview.messages.map((message) => [message.type, message.key]), [['sourceSaveStatus', 'system']], 'Menu dirty-state-only changes update only the matching source status');
assert.strictEqual(menuPanel.webview.html, 'unfinished viewer form', 'Menu dirty-state-only changes do not replace the page');

const storyPanel = panel(), storyOwner = { document: selectDocument, lastInsertedDocument: null, panel: storyPanel };
handleStoryDocumentChange({ document: selectDocument, contentChanges: [] }, [storyOwner]);
assert.deepStrictEqual(storyPanel.webview.messages.map((message) => [message.type, message.key]), [['sourceSaveStatus', 'select']], 'Story dirty-state-only changes update only select.def status');
assert.strictEqual(storyPanel.webview.html, 'unfinished viewer form', 'Story dirty-state-only changes do not replace unfinished dialogue fields');

console.log('Save dirty-state-only host events preserve AIR, Menu and Story viewer forms');
