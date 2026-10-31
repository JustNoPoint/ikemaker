'use strict';

const assert = require('assert');
const vm = require('vm');
const Module = require('module');

const original = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return { ViewColumn: { Active: 1 }, window: {}, workspace: { textDocuments: [] }, languages: { getDiagnostics: () => [] } };
  return original.call(this, request, parent, main);
};
const workspace = require('../src/move_lab_workspace');
Module._load = original;

const empty = workspace.moveLabControlAvailability({});
assert.match(empty.editSelectedSource.reason, /Select a connected file/);
assert.match(empty.filePrevious.reason, /No connected character file/);
assert.match(empty.movePlay.reason, /usable AIR and SFF preview/);

const oneFile = workspace.moveLabControlAvailability({ fileCount: 1, fileIndex: 0, hasSource: true });
assert.match(oneFile.filePrevious.reason, /Only one connected character file/);
assert.match(oneFile.fileNext.reason, /Only one connected character file/);
assert.strictEqual(oneFile.fileSelect.disabled, false);
assert.strictEqual(oneFile.editSelectedSource.disabled, false);

const pending = workspace.moveLabControlAvailability({ fileCount: 3, fileIndex: 1, pendingNavigation: true, hasSource: true });
assert.match(pending.filePrevious.reason, /Wait for the current connected-file navigation/);
assert.strictEqual(pending.fileSelect.disabled, true);

const ownerBusyNavigation = workspace.moveLabControlAvailability({ fileCount: 3, fileIndex: 1, navigationBusy: true, hasSource: true });
assert.strictEqual(ownerBusyNavigation.filePrevious.disabled, true);
assert.strictEqual(ownerBusyNavigation.fileNext.disabled, true);
assert.match(ownerBusyNavigation.fileNext.reason, /current Move Lab operation/);

const preview = workspace.moveLabControlAvailability({ previewReady: true, hasActions: true, totalTicks: 12, tick: 0 });
assert.strictEqual(preview.movePlay.disabled, false);
assert.strictEqual(preview.movePrevious.disabled, true);
assert.match(preview.movePrevious.reason, /first preview tick/);
assert.strictEqual(preview.moveNext.disabled, false);
assert.strictEqual(preview.moveP1.disabled, false);

const busy = workspace.moveLabControlAvailability({ busy: true, hasSource: true });
assert.strictEqual(busy.choose.disabled, true);
assert.strictEqual(busy.refresh.disabled, true);
assert.strictEqual(busy.editSelectedSource.disabled, true);
assert.match(busy.refresh.reason, /finish/);

assert.strictEqual(workspace.moveLabListNavigation(0, 'ArrowRight', 3), 1);
assert.strictEqual(workspace.moveLabListNavigation(0, 'ArrowLeft', 3), 2);
assert.strictEqual(workspace.moveLabListNavigation(2, 'Home', 3), 0);
assert.strictEqual(workspace.moveLabListNavigation(0, 'End', 3), 2);
assert.strictEqual(workspace.moveLabListNavigation(0, 'Enter', 3), -1);

const html = workspace.page({
  defPath: 'Hero.def', context: { project: 'Game', character: 'Hero' }, files: [], sources: [], diagnostics: [],
  totals: { states: 0, controllers: 0, functions: 0, diagnostics: 0 }, attacks: { controllers: [], constantProfiles: [] }, throws: { plans: [], templates: [] },
  visual: { state: 'ready', actions: [{ number: 0, frames: 1, ticks: 1 }], p1Action: 0, p2Action: 0, p1: { frames: [] }, p2: { frames: [] } },
  eventTimeline: { availableScopes: [], tracks: [] }, navigation: { visibleItems: [], slider: {} }
});
assert.match(html, /id="modeCollection" role="tablist"/);
assert.match(html, /id="content" role="tabpanel" tabindex="0"/);
assert.match(html, /role="tab" aria-controls="content"/);
assert.match(html, /moveLabListTarget\(tabs\.indexOf\(tab\),event\.key,tabs\.length\)/);
assert.match(html, /id="moveLabFileCollection" role="listbox"/);
assert.match(html, /role="option" aria-selected=/);
assert.match(html, /moveLabPendingFileFocus=options\[target\]\.dataset\.moveLabFile/);
assert.match(html, /No connected character files are available/);
assert.match(html, /id="moveLabStatus" role="status" aria-live="polite"/);
assert.match(html, /id="moveCanvas"[^>]*tabindex="0"[^>]*aria-label="Move preview/);
assert.match(html, /class="timeline" role="listbox"/);
assert.match(html, /setAttribute\('aria-description',explanation\)/);
assert.match(html, /@media\(max-width:520px\)/);
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);

function generatedFunction(name) {
  const start = script.indexOf(`function ${name}(`);
  assert(start >= 0, `generated ${name} exists`);
  const body = script.indexOf('{', start);
  let depth = 0;
  for (let index = body; index < script.length; index++) {
    if (script[index] === '{') depth += 1;
    if (script[index] === '}' && --depth === 0) return script.slice(start, index + 1);
  }
  throw new Error(`unterminated generated ${name}`);
}
function clientElement(id, dataset = {}) {
  return { id, dataset, disabled: false, value: '', min: 0, max: 0, title: '', textContent: '', innerHTML: '', attributes: {},
    classList: { toggle() {} }, setAttribute(name, value) { this.attributes[name] = String(value); },
    focus() { clientDocument.activeElement = this; }
  };
}
const clientIds = ['moveLabFilePrevious','moveLabFileNext','moveLabFileSlider','moveLabFileReadout','moveLabFileSelect','moveLabFileCollection','editSelectedSource','openFullTextNative','returnToMove','moveLabStatus'];
const clientElements = Object.fromEntries(clientIds.map(id => [id, clientElement(id)]));
const choose = clientElement('choose'), refresh = clientElement('refresh'), unrelatedFocus = clientElement('unrelated');
const layoutButtons = ['tabs','list','cards'].map(mode => clientElement(`layout-${mode}`, { moveLabNavMode: mode }));
const clientDocument = {
  activeElement: unrelatedFocus,
  getElementById: id => clientElements[id] || null,
  querySelector(selector) {
    if (selector === '[data-action="choose"]') return choose;
    if (selector === '[data-action="refresh"]') return refresh;
    return null;
  },
  querySelectorAll(selector) {
    if (selector === '[data-move-lab-file]') return [];
    if (selector === '[data-move-lab-nav-mode]') return layoutButtons;
    return [];
  }
};
const listeners = {};
const boundaryContext = {
  document: clientDocument, moveLabAvailability: workspace.moveLabControlAvailability, moveLabListTarget: workspace.moveLabListNavigation,
  moveLabNavigation: { currentId: 'connected-0', mode: 'tabs', slider: { min: 1, max: 2, value: 1, title: '1 of 2' }, visibleItems: [{ id: 'connected-0', label: 'A' }, { id: 'connected-1', label: 'B' }] },
  moveLabNavRequest: 0, moveLabHasSource: false, moveLabPendingFileFocus: '', moveLabBusy: false, generation: 7, selectionEpoch: 0,
  esc: value => String(value), window: { addEventListener(type, listener) { listeners[type] = listener; } }, console
};
const listenerMarker = script.indexOf("message.type==='moveLabNavigation'");
const listenerStart = script.lastIndexOf("window.addEventListener('message',event=>", listenerMarker);
const listenerEnd = script.indexOf(');updateMoveLabToolbar', listenerStart) + 2;
assert(listenerStart >= 0 && listenerEnd > listenerStart, 'generated Move Lab boundary listener exists');
vm.createContext(boundaryContext);
vm.runInContext([
  generatedFunction('setMoveLabState'), generatedFunction('renderMoveLabNavigation'), generatedFunction('applyMoveLabChromeAvailability'), generatedFunction('updateMoveLabToolbar'),
  script.slice(listenerStart, listenerEnd)
].join('\n'), boundaryContext);
const emitBoundary = data => listeners.message({ data });
emitBoundary({ type: 'moveLabToolbarState', generation: 7, selectionEpoch: 1, model: { slots: [] }, hasSource: true, busy: true });
for (const control of [choose, refresh, clientElements.editSelectedSource, clientElements.openFullTextNative, clientElements.returnToMove]) assert.strictEqual(control.disabled, true);
for (const control of [clientElements.moveLabFilePrevious, clientElements.moveLabFileNext, clientElements.moveLabFileSlider, clientElements.moveLabFileSelect]) {
  assert.strictEqual(control.disabled, true);
  assert.match(control.title, /current Move Lab operation/);
}
assert.strictEqual(clientElements.moveLabStatus.textContent, 'Working…');
assert.strictEqual(clientDocument.activeElement, unrelatedFocus, 'busy start does not steal unrelated focus');
emitBoundary({ type: 'moveLabToolbarState', generation: 7, selectionEpoch: 2, model: { slots: [] }, hasSource: true, busy: false });
for (const control of [choose, refresh, clientElements.editSelectedSource, clientElements.openFullTextNative, clientElements.returnToMove]) assert.strictEqual(control.disabled, false);
assert.strictEqual(clientElements.moveLabFilePrevious.disabled, true, 'ready state restores the exact first-file boundary');
assert.strictEqual(clientElements.moveLabFileNext.disabled, false);
assert.strictEqual(clientElements.moveLabFileSlider.disabled, false);
assert.strictEqual(clientElements.moveLabFileSelect.disabled, false);
assert.strictEqual(clientElements.moveLabStatus.textContent, 'Ready.');
assert.strictEqual(clientDocument.activeElement, unrelatedFocus, 'ready completion does not steal unrelated focus');

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
(async () => {
  const gate = deferred(), messages = [], owner = {
    defPath: 'Hero.def', generation: 1, selectionEpoch: 0, busy: 0, disposed: false, tombstone: false, source: null,
    queue: Promise.resolve(), navigation: workspace.moveLabNavigation([], ''), panel: { webview: { postMessage: message => messages.push(message) } },
    isCurrent: () => true
  };
  const running = workspace.enqueueOwner(owner, () => gate.promise);
  await Promise.resolve();
  assert(messages.some(message => message.type === 'moveLabToolbarState' && message.busy === true));
  gate.resolve(true);
  await running;
  assert(messages.some(message => message.type === 'moveLabToolbarState' && message.busy === false));
  console.log('Move Lab actionable states, semantic navigation, focus alternatives, busy lifecycle, and narrow contract passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
