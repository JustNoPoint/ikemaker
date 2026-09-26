'use strict';

const assert = require('assert');
const vm = require('vm');
const { clientScript } = require('../src/map_registry_client');

const messages = [], listeners = {}, mapButton = { dataset: { ikemenMapSurface: 'helper' } };
const field = {
  id: 'maps', tagName: 'TEXTAREA', type: 'textarea', disabled: false, readOnly: false, isConnected: true,
  dataset: {}, value: 'power = 1', selectionStart: 9, selectionEnd: 9,
  hasAttribute(name) { return name === 'data-ikemen-map-field' ? Boolean(this.dataset.ikemenMapField) : name === 'data-ikemen-map-id' ? Boolean(this.dataset.ikemenMapId) : false; },
  focus() {}, matches() { return false; }, closest() { return null; },
  setRangeText(text, start, end) { this.value = this.value.slice(0, start) + text + this.value.slice(end); },
  dispatchEvent() {}
};
let observer;
const document = {
  body: { dataset: {} },
  querySelectorAll(selector) { if (selector === '[data-ikemen-maps]') return [mapButton]; if (selector === '[data-ikemen-map-id]') return [field]; return []; },
  getElementById(id) { return id === 'language' ? { value: 'cns' } : null; },
  addEventListener(type, handler) { listeners[type] = handler; }
};
const context = {
  document, vscode: { postMessage(message) { messages.push(message); } }, globalThis: {},
  MutationObserver: class { constructor(callback) { observer = callback; } observe() {} },
  Event: class { constructor(type) { this.type = type; } },
  addEventListener(type, handler) { listeners[type] = handler; }
};
vm.runInNewContext(clientScript(), context);
listeners.focusin({ target: field }); mapButton.onclick();
const request = messages.pop();
assert.strictEqual(request.type, 'ikemenMaps');
assert.strictEqual(request.target.grammar, 'map-table');
assert.strictEqual(request.target.language, 'ikemen-cns');
listeners.message({ data: { type: 'ikemenMapInsert', target: request.target, text: 'meter = 2' } });
assert.strictEqual(field.value, 'power = 1meter = 2');
assert.strictEqual(messages.pop().ok, true);

listeners.focusin({ target: field }); mapButton.onclick(); const stale = messages.pop(); observer();
listeners.message({ data: { type: 'ikemenMapInsert', target: stale.target, text: 'unsafe' } });
assert.ok(!field.value.includes('unsafe'));
assert.strictEqual(messages.pop().ok, false);

console.log('Map registry visual adapters preserve grammar and reject replaced render epochs');
