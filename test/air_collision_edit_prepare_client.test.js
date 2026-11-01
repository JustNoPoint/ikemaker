'use strict';

const assert = require('assert');
const vm = require('vm');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {};
  return originalLoad.call(this, request, parent, isMain);
};
const { viewerHtml } = require('../src/air_viewer');
Module._load = originalLoad;

const html = viewerHtml({ title: 'A.air', airPath: 'A.air', sffPath: '', palettes: [], palettePreview: { assignedDefault: { group: 1, number: 1 }, screenPaletteIndex: 0 }, actions: [{ number: 100, line: 1, frames: [{ group: 0, index: 0, x: 0, y: 0, rawTime: 1, line: 2, clsn1: [], clsn2: [] }] }] });
const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)][0][1];
function functionSource(name) {
  const start = script.indexOf(`function ${name}(`), open = script.indexOf('{', start);
  assert(start >= 0 && open > start, `missing ${name}`);
  let depth = 0;
  for (let at = open; at < script.length; at += 1) {
    if (script[at] === '{') depth += 1;
    if (script[at] === '}' && --depth === 0) return script.slice(start, at + 1);
  }
  throw new Error(`unterminated ${name}`);
}

const elements = new Map(), messages = [];
for (const id of ['editStatus', 'beginBoxEdit', 'addBox', 'deleteBox', 'applyBoxEdit', 'editKind', 'editScope', 'collisionOwnershipChip', 'collisionAffectedStatus']) elements.set(id, { disabled: false, value: '', textContent: '', hidden: true });
const cards = [0, 1, 2].map(index => ({ index, classes: new Set(), attributes: {}, classList: { add(name) { cards[index].classes.add(name); }, remove(name) { cards[index].classes.delete(name); } }, setAttribute(name, value) { this.attributes[name] = value; }, removeAttribute(name) { delete this.attributes[name]; } }));
const context = {
  action: { number: 100 }, frameIndex: 1, collisionEditPrepareRequest: 0, collisionViewerEditEpoch: 0, collisionEditPreparePending: null,
  edit: null, pendingCollisionPick: null, playing: true, canvas: { classList: { add() {} } },
  document: { getElementById(id) { if (!elements.has(id)) elements.set(id, { disabled: false, value: '', textContent: '', hidden: false }); return elements.get(id); }, querySelectorAll() { return cards; }, querySelector(selector) { const match = /data-frame-card="(\d+)"/.exec(selector); return match ? cards[Number(match[1])] : null; } },
  vscode: { postMessage(message) { messages.push(message); } }, clearCollisionEditReview() {}, renderBoxEditor() {}, draw() { context.drawn = true; }, requestCollisionReview() {}, switchRightPanel(panel) { context.openPanel = panel; }, current() { return { clsn1Records: [{ index: 7 }] }; },
  normalized(box) { return [Math.min(box[0], box[2]), Math.min(box[1], box[3]), Math.max(box[0], box[2]), Math.max(box[1], box[3])]; }
};
vm.createContext(context);
vm.runInContext([functionSource('collisionOwnershipLabel'), functionSource('renderCollisionOwnership'), functionSource('applyCollisionEditSeed'), functionSource('requestCollisionEditSeed'), functionSource('beginCanvasCollisionSelection')].join('\n'), context);

assert.strictEqual(context.beginCanvasCollisionSelection({ kind: 'clsn1', index: 0, box: [10, 20, -10, -20] }), true, 'a primary canvas hit begins exact collision selection');
assert.strictEqual(context.playing, false, 'canvas selection pauses animation so the prepared response remains bound to the clicked frame');
assert.strictEqual(elements.get('play').textContent, 'Play');
assert.strictEqual(context.openPanel, 'collisionPanel', 'left-click exposes the collision editor instead of silently preparing in a hidden panel');
assert.deepStrictEqual(JSON.parse(JSON.stringify(context.pendingCollisionPick)), { kind: 'clsn1', index: 0, slot: 7, box: [-10, -20, 10, 20] }, 'left-click paints an immediate exact-box selection while host preparation completes');
assert.strictEqual(messages[0].slot, 7, 'left-click uses the authored collision slot rather than a visual-array guess');
messages.length = 0; context.collisionEditPreparePending = null; context.collisionEditPrepareRequest = 0; context.collisionViewerEditEpoch = 0;

context.requestCollisionEditSeed('clsn1', 'append-next', 'add');
assert.deepStrictEqual(JSON.parse(JSON.stringify(messages[0])), { type: 'prepareCollisionEdit', request: 1, viewerEditEpoch: 1, action: 100, actionOccurrence: 0, elementIndex: 1, groupKey: 'clsn1', slot: 'append-next', intent: 'add' });
for (const forbidden of ['boxes', 'scope', 'owner', 'affected', 'replacement']) assert(!Object.prototype.hasOwnProperty.call(messages[0], forbidden), `client must not send ${forbidden} as authority`);
assert.match(elements.get('editStatus').textContent, /authoritative collision ownership/i);

const seed = {
  selection: { groupKey: 'clsn1', slot: 2 }, binding: { sourceFingerprint: 'A'.repeat(64) },
  ownership: { kind: 'inherited-default', materializationOnEdit: true, materializesCount: 2, affected: { count: 3, frames: [{ elementIndex: 0 }, { elementIndex: 1 }], omitted: 1 } },
  records: [
    { slot: 0, filled: true, normalizedRect: [-10, -20, 10, 20], sourceLine: 2, allocation: 'source-order' },
    { slot: 1, filled: false, normalizedRect: [0, 0, 0, 0], sourceLine: null, allocation: 'unfilled' }
  ], returnToDefaultsAvailable: false
};
context.applyCollisionEditSeed(seed, { intent: 'add' });
assert.deepStrictEqual(JSON.parse(JSON.stringify(context.edit.boxes)), [[-10, -20, 10, 20], [0, 0, 0, 0]], 'the client seeds every effective same-group box, including allocated/unfilled zeros');
assert.deepStrictEqual(context.edit.records.map(item => item.filled), [true, false]);
assert.strictEqual(context.edit.ownership, 'inherited-default');
assert.strictEqual(context.edit.scope, 'element', 'an inherited set is an operative frame-local materialization draft, never a shared-default edit');
assert.strictEqual(context.edit.visualScope, 'default', 'the untouched effective inherited geometry remains visually identifiable as inherited');
assert.strictEqual(context.edit.pendingAddSlot, 2);
assert.strictEqual(context.edit.drawNew, true);
assert.strictEqual(elements.get('collisionOwnershipChip').textContent, 'Inherited Default');
assert.match(elements.get('collisionAffectedStatus').textContent, /Selected frame only.*shared source used by 3 frames/);
assert(cards.every(card => !card.classes.has('collision-affected')), 'inherited materialization must not imply collateral edits on shared-default consumers');
context.renderCollisionOwnership({ ownership: { kind: 'default-owner', affected: { count: 3, frames: [{ elementIndex: 0, ownership: 'default-declared-for-this-element' }, { elementIndex: 1, ownership: 'inherited-default' }], omitted: 1 } } });
assert(cards[0].classes.has('collision-affected') && cards[1].classes.has('collision-affected') && !cards[2].classes.has('collision-affected'), 'only a true shared-default owner edit highlights its proven affected frame list');
assert.match(elements.get('collisionAffectedStatus').textContent, /3 affected frames.*1 omitted/);

assert(script.includes("pending.viewerEditEpoch!==collisionViewerEditEpoch"), 'late prepared responses are rejected against the current client edit epoch');
assert(script.includes("pending.action!==action?.number||pending.elementIndex!==frameIndex"), 'prepared responses are bound to the visible Action and element');
assert(script.includes("requestCollisionEditSeed(kind,record.index,'indexed-edit')"), 'indexed Edit uses the same host-prepared seed');
assert(script.includes("requestCollisionEditSeed(kind,'append-next','add')"), 'Add asks the host to derive the authoritative append slot');
assert(script.includes("requestCollisionEditSeed(edit.kind,slot,'return-to-default')"), 'Return to defaults re-prepares ownership before review');
assert(!script.includes("type:'prepareCollisionEdit',boxes"), 'preparation never includes client-owned geometry arrays');

console.log('AIR collision editor client requests host-owned seeds and preserves complete prepared geometry');
