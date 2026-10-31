'use strict';

const assert = require('assert');
const vm = require('vm');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) { if (request === 'vscode') return {}; return originalLoad.call(this, request, parent, isMain); };
const { organizedViewerHtml } = require('../src/snd_viewer');
Module._load = originalLoad;
const model = { basename: 'main.snd', filename: 'main.snd', version: '2.1', entries: [], groups: [], issues: [], connectedSnds: [{ id: 'main', label: 'Main SND', current: true }, { id: 'voice', label: 'Voice SND', current: false }], profile: {} };
const html = organizedViewerHtml(model), scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
assert.strictEqual(scripts.length, 1);
const client = scripts[0][1];
const messageStart = client.indexOf("window.addEventListener('message',event=>{const m=event.data;if((Object.prototype.hasOwnProperty.call(m,'generation')");
const messageEnd = client.indexOf('      const stepSound=', messageStart);
const connectedStart = client.indexOf('const sndArchiveSelect=', messageEnd);
const connectedEnd = client.indexOf('renderConnectedSnds();', connectedStart);
assert(messageStart >= 0 && messageEnd > messageStart && connectedStart > messageEnd && connectedEnd > connectedStart, 'generated connected-SND client blocks must remain extractable');
const messageBridge = client.slice(messageStart, messageEnd);
const connectedClient = client.slice(connectedStart, connectedEnd + 'renderConnectedSnds();'.length);

class Element {
  constructor(id = '') { this.id = id; this.value = ''; this.title = ''; this.disabled = false; this.textContent = ''; this.dataset = {}; this.attributes = {}; this.children = []; }
  append(child) { this.children.push(child); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
}

const ids = ['sndArchiveSelect', 'sndArchiveOpen', 'sndArchivePrevious', 'sndArchiveNext', 'sndArchiveStatus'];
const elements = Object.fromEntries(ids.map(id => [id, new Element(id)]));
elements.sndArchiveOpen.title = 'Open selected connected SND';
const listeners = {}, posted = [];
const sandbox = {
  model: { ...model, generation: 4, sourceFingerprint: 'fingerprint' },
  saved: {}, selected: null,
  save() {}, renderConnectedSnds: undefined,
  document: { getElementById(id) { return elements[id]; }, createElement() { return new Element(); } },
  window: { addEventListener(type, handler) { listeners[type] = handler; } },
  vscode: { postMessage(message) { posted.push(message); } },
  Date: { now() { return 12345; } }, Array, Boolean, String, Object
};
vm.runInNewContext(`${messageBridge}\n${connectedClient}`, sandbox, { filename: 'snd-viewer-connected-generated-client.js' });

assert.strictEqual(elements.sndArchiveSelect.value, 'main');
elements.sndArchiveSelect.value = 'voice';
elements.sndArchiveSelect.onchange();
assert.strictEqual(posted.length, 0, 'changing the selector reviews a target but does not open it');
assert.strictEqual(elements.sndArchiveOpen.disabled, false);
assert.match(elements.sndArchiveStatus.textContent, /choose Open/i);

elements.sndArchiveOpen.onclick();
assert.strictEqual(posted.length, 1, 'explicit Open posts exactly one request');
assert.strictEqual(posted[0].type, 'openConnectedSnd');
assert.strictEqual(posted[0].id, 'voice');
const requestId = posted[0].requestId;
elements.sndArchiveOpen.onclick();
assert.strictEqual(posted.length, 1, 'a repeated activation is suppressed while the exact request is pending');
assert.strictEqual(elements.sndArchiveOpen.disabled, true);

listeners.message({ data: { type: 'connectedSndOpenResult', generation: 4, sourceFingerprint: 'fingerprint', requestId, ok: false } });
assert.strictEqual(elements.sndArchiveSelect.value, 'main', 'failed acknowledgement returns to authoritative current file');
elements.sndArchiveSelect.value = 'voice';
elements.sndArchiveSelect.onchange();
elements.sndArchiveOpen.onclick();
assert.strictEqual(posted.length, 2, 'failure acknowledgement unlocks an explicit retry');

console.log('Generated SND connected-file client reviews selection, commits once, suppresses pending repeats, and unlocks retry');
