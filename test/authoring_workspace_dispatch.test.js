'use strict';

const assert = require('assert');
const workspace = require('../src/authoring_workspace');
const { SLOTS } = require('../src/viewer_toolbar_contract');
const { validateToolbarModel, MESSAGE_TYPE } = require('../src/universal_toolbar_webview');

const first = workspace.toolbarModel(), second = workspace.toolbarModel();
assert.strictEqual(validateToolbarModel(first, 'code.authoring-workspace'), first);
assert.deepStrictEqual(first.slots.map((slot) => slot.id), SLOTS.map((slot) => slot.id));
assert.notStrictEqual(first, second, 'the host can fetch a fresh canonical projection for every universal invocation');
assert(first.slots.every((slot) => slot.enabled && slot.dispatch), 'every enabled Coding Viewer slot has an explicit host route');
assert.strictEqual(workspace.canonicalToolbarDispatch, undefined, 'the dispatch-bearing legacy protocol is removed');
assert.strictEqual(MESSAGE_TYPE, 'ikemaker.universal-toolbar.invoke');

console.log('Coding Viewer exposes a fresh canonical toolbar model and no legacy client-dispatch resolver');
