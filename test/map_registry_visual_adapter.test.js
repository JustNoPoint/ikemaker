'use strict';

const assert = require('assert');
const vm = require('vm');
const { TextEncoder } = require('util');
const { clientScript } = require('../src/map_registry_client');

const messages = [], listeners = {}, mapButton = { dataset: { ikemenMapSurface: 'helper' } };
let setMode = 'normal', eventMode = 'normal', eventCount = 0;
const field = {
  id: 'maps', tagName: 'TEXTAREA', type: 'textarea', disabled: false, readOnly: false, isConnected: true,
  dataset: {}, value: 'power = 1', selectionStart: 9, selectionEnd: 9,
  hasAttribute(name) { return name === 'data-ikemen-map-field' ? Boolean(this.dataset.ikemenMapField) : name === 'data-ikemen-map-id' ? Boolean(this.dataset.ikemenMapId) : false; },
  focus() {}, matches() { return false; }, closest() { return null; },
  setRangeText(text, start, end) { if (setMode === 'wrong') { this.value += 'wrong'; return; } if (setMode === 'throw') { this.value += 'partial'; throw new Error('injected'); } this.value = this.value.slice(0, start) + text + this.value.slice(end); },
  setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
  dispatchEvent(event) { eventCount++; if (eventMode === 'transform' && event.type === 'input') this.value += 'external'; }
};
let observer;
const document = {
  body: { dataset: {} },
  querySelectorAll(selector) { if (selector === '[data-ikemen-maps]') return [mapButton]; if (selector === '[data-ikemen-map-id]') return [field]; return []; },
  getElementById(id) { return id === 'language' ? { value: 'cns' } : null; },
  addEventListener(type, handler) { listeners[type] = handler; }
};
const context = {
  document, listeners, TextEncoder, vscode: { postMessage(message) { messages.push(message); } }, globalThis: {},
  MutationObserver: class { constructor(callback) { observer = callback; } observe() {} },
  Event: class { constructor(type) { this.type = type; } },
  addEventListener(type, handler) { listeners[type] = handler; }
};
vm.runInNewContext(clientScript(), context);
const host = message => vm.runInNewContext(`listeners.message({data:JSON.parse(${JSON.stringify(JSON.stringify(message))})})`, context);
listeners.focusin({ target: field }); mapButton.onclick();
const request = messages.pop();
assert.strictEqual(request.type, 'ikemenMaps');
assert.strictEqual(request.target.grammar, 'map-table');
assert.strictEqual(request.target.language, 'ikemen-cns');
host({ type: 'ikemenMapInsertPrepare', requestId: 1, bridgeEpoch: request.target.bridgeEpoch, target: request.target, text: 'meter = 2' });
assert.deepEqual(messages.pop(), { type: 'ikemenMapInsertReady', requestId: 1, bridgeEpoch: request.target.bridgeEpoch, ok: true, code: 'ok' });
host({ type: 'ikemenMapInsertCommit', requestId: 1, bridgeEpoch: request.target.bridgeEpoch });
assert.strictEqual(field.value, 'power = 1meter = 2');
assert.strictEqual(messages.pop().ok, true);

listeners.focusin({ target: field }); mapButton.onclick(); const stale = messages.pop(); observer();
host({ type: 'ikemenMapInsertPrepare', requestId: 2, bridgeEpoch: stale.target.bridgeEpoch, target: stale.target, text: 'unsafe' });
assert.ok(!field.value.includes('unsafe'));
assert.strictEqual(messages.pop().ok, false);

field.value = 'base'; field.selectionStart = field.selectionEnd = 4; setMode = 'wrong'; eventCount = 0; listeners.focusin({ target: field }); mapButton.onclick(); const wrong = messages.pop();
host({ type: 'ikemenMapInsertPrepare', requestId: 3, bridgeEpoch: wrong.target.bridgeEpoch, target: wrong.target, text: 'x' }); messages.pop();
host({ type: 'ikemenMapInsertCommit', requestId: 3, bridgeEpoch: wrong.target.bridgeEpoch });
assert.equal(field.value, 'base', 'wrong synchronous setRangeText result rolls back to exact original'); assert.equal(field.selectionStart, 4); assert.equal(eventCount, 0); assert.equal(messages.pop().code, 'write-failed');

setMode = 'throw'; listeners.focusin({ target: field }); mapButton.onclick(); const thrown = messages.pop();
host({ type: 'ikemenMapInsertPrepare', requestId: 4, bridgeEpoch: thrown.target.bridgeEpoch, target: thrown.target, text: 'x' }); messages.pop();
host({ type: 'ikemenMapInsertCommit', requestId: 4, bridgeEpoch: thrown.target.bridgeEpoch });
assert.equal(field.value, 'base', 'thrown synchronous mutation rolls back safely'); assert.equal(messages.pop().code, 'write-failed');

setMode = 'normal'; eventMode = 'transform'; eventCount = 0; listeners.focusin({ target: field }); mapButton.onclick(); const transformed = messages.pop();
host({ type: 'ikemenMapInsertPrepare', requestId: 5, bridgeEpoch: transformed.target.bridgeEpoch, target: transformed.target, text: 'x' }); messages.pop();
host({ type: 'ikemenMapInsertCommit', requestId: 5, bridgeEpoch: transformed.target.bridgeEpoch });
assert.equal(field.value, 'basexexternal', 'concurrent event transforms are never overwritten by rollback'); assert.equal(eventCount, 2, 'input/change dispatch exactly once'); assert.equal(messages.pop().code, 'conflict');

console.log('Map registry visual adapters preserve grammar and reject replaced render epochs');
