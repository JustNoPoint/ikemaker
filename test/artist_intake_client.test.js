'use strict';
const assert = require('assert');
const vm = require('vm');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function(request, parent, main) {
  if (request === 'vscode') return { workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) } };
  return originalLoad.call(this, request, parent, main);
};
const workspace = require('../src/artist_intake_workspace');
Module._load = originalLoad;

const labelById = { category: 'Category', name: 'IKEMaker sequence name', group: 'SFF group', start: 'First image index', axisX: 'Axis X', axisY: 'Axis Y' };
let document;
class Element {
  constructor(id = '', text = '') { this.id = id; this.textContent = text; this.value = ''; this.dataset = {}; this.attributes = {}; this.disabled = false; this.hidden = false; this.tabIndex = 0; this._innerHTML = ''; }
  set innerHTML(value) { this._innerHTML = String(value); if (this.id === 'frames') parseFrames(this._innerHTML); if (this.id === 'assignments') parseAssignments(this._innerHTML); }
  get innerHTML() { return this._innerHTML; }
  setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'tabindex') this.tabIndex = Number(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  closest(selector) { return selector === 'label' && labelById[this.id] ? { textContent: labelById[this.id] } : null; }
  focus() { document.activeElement = this; }
}
const elements = new Map(), frameButtons = [], removeButtons = [], sourceButtons = ['gif', 'sheet', 'folder'].map(kind => { const button = new Element(`source-${kind}`, `Open ${kind}`); button.dataset.source = kind; return button; });
for (const id of ['header','frames','assignments','category','name','group','start','axisX','axisY','assign','all','none','package','discardDraft','draftStatus','actionStatus']) elements.set(id, new Element(id, ({ assign:'Assign selection',all:'Select all',none:'Clear selection',package:'Create Temporary SFF Package',discardDraft:'Discard recovered assignments' })[id] || ''));
elements.get('category').value = 'Required'; for (const id of ['group','start','axisX','axisY']) elements.get(id).value = '0';
elements.get('header').insertBefore = () => {};
function attr(source, name) { return (new RegExp(`${name}="([^"]*)"`).exec(source) || [])[1] || ''; }
function parseFrames(html) {
  frameButtons.splice(0); for (const match of html.matchAll(/<button[^>]*class="frame [^"]*"[^>]*data-i="(\d+)"[^>]*>/g)) {
    const source = match[0], button = new Element(`frame-${match[1]}`, `Frame ${Number(match[1]) + 1}`); button.dataset.i = match[1]; button.setAttribute('aria-pressed', attr(source, 'aria-pressed')); button.setAttribute('aria-label', attr(source, 'aria-label')); button.setAttribute('tabindex', attr(source, 'tabindex')); frameButtons.push(button);
  }
}
function parseAssignments(html) {
  removeButtons.splice(0); for (const match of html.matchAll(/<button[^>]*data-remove="(\d+)"[^>]*>/g)) { const source = match[0], button = new Element(`remove-${match[1]}`, 'Remove'); button.dataset.remove = match[1]; button.setAttribute('aria-label', attr(source, 'aria-label')); removeButtons.push(button); }
}
document = {
  activeElement: null,
  getElementById(id) { return elements.get(id); },
  createElement() { return new Element(); },
  querySelector(selector) { if (selector === 'header') return elements.get('header'); const match = /^\.frame\[data-i="(\d+)"\]$/.exec(selector); return match ? frameButtons.find(button => button.dataset.i === match[1]) || null : null; },
  querySelectorAll(selector) {
    if (selector === '[data-source]') return sourceButtons;
    if (selector === '.frame') return frameButtons;
    if (selector === '[data-remove]') return removeButtons;
    if (selector === 'aside input,aside select') return ['category','name','group','start','axisX','axisY'].map(id => elements.get(id));
    if (selector === '.frame,[data-remove]') return [...frameButtons, ...removeButtons];
    return [];
  }
};

const messages = [], listeners = {};
const context = { document, acquireVsCodeApi: () => ({ postMessage: message => messages.push(message) }), addEventListener: (type, listener) => { (listeners[type] ||= []).push(listener); } };
const page = workspace.html({ frames: [], sourceFiles: [] }), fullScript = page.match(/<script>([\s\S]*)<\/script>/)[1], marker = 'globalThis.ikemenNavigationSelection';
const specialistScript = fullScript.slice(0, fullScript.indexOf(marker));
vm.runInNewContext(specialistScript, context);
const byId = id => elements.get(id), receive = data => listeners.message.forEach(listener => listener({ data }));

assert(byId('assign').disabled && /Select one or more/.test(byId('assign').title));
assert(byId('all').disabled && /Open source frames/.test(byId('all').title));
assert(byId('none').disabled && /No source frames/.test(byId('none').title));
assert(byId('package').disabled && /Open source frames/.test(byId('package').title));

const identity = 'b'.repeat(64), model = { identity, frames: [
  { sourceLabel: '000.png', uri: 'data:image/png;base64,AA==', duplicateOf: null },
  { sourceLabel: '001.png', uri: 'data:image/png;base64,AQ==', duplicateOf: 0 }
] };
receive({ type: 'model', model });
assert.strictEqual(byId('name').value, 'Required 00', 'new sources receive an actionable default sequence name');
assert.strictEqual(byId('group').value, 0, 'new sources receive the category default group');
assert.strictEqual(frameButtons.length, 2); assert(frameButtons.every(button => button.getAttribute('aria-pressed') === 'true'));
assert.strictEqual(frameButtons[0].tabIndex, 0); assert.strictEqual(frameButtons[1].tabIndex, -1);
frameButtons[0].onkeydown({ key: 'ArrowRight', preventDefault() {} }); assert.strictEqual(document.activeElement, frameButtons[1], 'ArrowRight moves the one roving frame tab stop');
frameButtons[0].onclick(); assert.strictEqual(frameButtons[0].getAttribute('aria-pressed'), 'false'); assert.strictEqual(document.activeElement, frameButtons[0], 'frame rerender restores initiating focus');
byId('none').onclick(); assert(byId('assign').disabled && !byId('all').disabled);
byId('all').onclick(); assert(!byId('assign').disabled && byId('all').disabled && !byId('none').disabled);
byId('assign').onclick();
const firstDraft = messages.filter(message => message.type === 'artistDraft').at(-1); assert(firstDraft && firstDraft.revision >= 1 && firstDraft.draft.assignments.length === 1);
assert(byId('package').disabled && /draft/.test(byId('package').title), 'package waits for exact draft persistence');
receive({ type: 'artistDraftStored', identity, revision: firstDraft.revision }); assert(!byId('package').disabled);

byId('all').onclick(); const selectionDraft = messages.filter(message => message.type === 'artistDraft').at(-1); receive({ type: 'artistDraftStored', identity, revision: selectionDraft.revision });
const beforeDuplicate = messages.length; byId('assign').onclick(); assert.strictEqual(messages.length, beforeDuplicate, 'overlapping group/index assignment never stages'); assert(/overlaps/.test(byId('actionStatus').textContent)); assert.strictEqual(document.activeElement, byId('group'));
assert(!byId('package').disabled); byId('package').onclick();
const packageMessage = messages.at(-1), plainAssignments = JSON.parse(JSON.stringify(firstDraft.draft.assignments)); assert.deepStrictEqual(JSON.parse(JSON.stringify(packageMessage)), { type:'package', identity, revision:selectionDraft.revision, assignments:plainAssignments });
assert(byId('group').disabled && frameButtons.every(button => button.disabled)); assert(/Wait for/.test(byId('group').title));
receive({ type:'artistActionState', busy:false, status:'Package workflow closed.' }); assert(!byId('group').disabled && frameButtons.every(button => !button.disabled));
removeButtons[0].onclick(); assert.strictEqual(document.activeElement, byId('assign'), 'removing an assignment restores focus to Assign selection');

console.log('Artist Intake generated client executes boundary reasons, defaults, frame keyboard/focus, draft gating, duplicate prevention, busy state, and exact package messages');
