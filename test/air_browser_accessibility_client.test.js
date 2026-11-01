'use strict';

const assert = require('assert');
const vm = require('vm');
const Module = require('module');
const path = require('path');
const realParseAir = require('../src/air_preview_model').parseAir;

const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {};
  if (request === './air_viewer' && /air_docking_workspace\.js$/.test(parent?.filename || '')) return {
    parseAir: realParseAir, inferCharacterFiles: () => ({}), collisionRuntimeOptions: () => ({}), collisionRuntimeDraftEntries: () => []
  };
  return originalLoad.call(this, request, parent, isMain);
};
const { html } = require('../src/air_docking_workspace');
Module._load = originalLoad;

const page = html({
  airPath: path.resolve('/char/main.air'), sourceFingerprint: 'A'.repeat(64),
  actions: [{ number: 0, name: 'Standing', category: 'idle', aliases: [], sourceOrder: 0, line: 1, frames: [{ group: 0, index: 0 }] }],
  spriteExplorer: { available: false, reason: 'The connected SFF is unavailable.', sprites: [], groups: [], omitted: 0 },
  references: { available: false, reason: 'test', items: [], occurrences: [], collisions: { available: false, reason: 'test', items: [] } },
  initialView: 'actions', initialCollisionMode: 'inspect', initialTransform: {}, initialProperty: {},
  initialAssistance: { referenceElementIndex: 0, targetElementIndices: [], groups: { clsn1: { enabled: true, cap: 4 }, clsn2: { enabled: true, cap: 4 } }, locks: { frames: [], boxes: [] }, targetPosition: 0 }
});
const client = page.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1] || '';

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`), open = source.indexOf('{', start);
  assert(start >= 0 && open > start, `missing generated client function ${name}`);
  let depth = 0;
  for (let at = open; at < source.length; at += 1) {
    if (source[at] === '{') depth += 1;
    if (source[at] === '}' && --depth === 0) return source.slice(start, at + 1);
  }
  throw new Error(`unterminated generated client function ${name}`);
}

function control(text = '') {
  return {
    textContent: text, title: '', disabled: false, dataset: {}, attributes: {},
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name] || ''; },
    removeAttribute(name) { delete this.attributes[name]; }
  };
}

const actionControls = {
  newAction: control('New Action…'), duplicateAction: control('Duplicate Action…'), deleteActions: control('Delete Selected…'),
  markVisible: control('Mark Visible'), clearMarks: control('Clear'), selectionStatus: control()
};
const actionContext = {
  selectionStatus: actionControls.selectionStatus, newAction: actionControls.newAction, duplicateAction: actionControls.duplicateAction,
  deleteActions: actionControls.deleteActions, markVisible: actionControls.markVisible, clearMarks: actionControls.clearMarks,
  marked: new Set(), selected: null, mutationBusy: false
};
vm.createContext(actionContext);
vm.runInContext(functionSource(client, 'setActionableDisabled') + functionSource(client, 'updateControls'), actionContext);
const labelledInput = control(); labelledInput.tagName = 'INPUT';
actionContext.setActionableDisabled(labelledInput, true, 'Choose a frame first.', 'Choose a frame');
assert.strictEqual(labelledInput.getAttribute('aria-label'), '', 'disabled fields retain their visible label association');
assert.strictEqual(labelledInput.getAttribute('aria-description'), 'Choose a frame first.', 'disabled fields expose the actionable reason without replacing their label');
actionContext.updateControls();
assert.strictEqual(actionControls.duplicateAction.disabled, true);
assert.strictEqual(actionControls.duplicateAction.title, 'Select an AIR Action to duplicate.');
assert.strictEqual(actionControls.deleteActions.title, 'Mark one or more Actions to delete.');
actionContext.selected = { number: 0 }; actionContext.marked.add(0); actionContext.updateControls();
assert.strictEqual(actionControls.duplicateAction.disabled, false);
assert.strictEqual(actionControls.deleteActions.disabled, false);
assert.match(actionControls.selectionStatus.textContent, /Action 0 current/);

const focused = [];
const focusTargets = [
  { dataset: { action: '0', actionKind: 'list' }, focus() { focused.push('list'); } },
  { dataset: { action: '0', actionKind: 'grid' }, focus() { focused.push('grid'); } }
];
const focusContext = { requestAnimationFrame(callback) { callback(); } };
vm.createContext(focusContext); vm.runInContext(functionSource(client, 'restoreBrowserItemFocus'), focusContext);
focusContext.restoreBrowserItemFocus({ querySelectorAll() { return focusTargets; } }, 'action', 0, 'actionKind', 'grid');
assert.deepStrictEqual(focused, ['grid'], 'focus restoration returns to the exact combined-view card representation');

const deferredFocus = [], dialogNode = {}, bodyNode = {}, focusDocument = { activeElement: dialogNode, body: bodyNode };
const dialogFocusContext = { document: focusDocument, spriteDialog: dialogNode, requestAnimationFrame(callback) { deferredFocus.push(callback); } };
vm.createContext(dialogFocusContext); vm.runInContext(functionSource(client, 'restoreSpriteDialogFocus'), dialogFocusContext);
let dialogRestores = 0;
const connectedOpener = { isConnected: true, disabled: false, focus() { dialogRestores += 1; focusDocument.activeElement = this; } };
dialogFocusContext.restoreSpriteDialogFocus(connectedOpener, dialogNode); deferredFocus.shift()();
assert.strictEqual(dialogRestores, 1, 'ordinary connected Sprite modal opener regains focus');
const detachedOpener = { isConnected: false, disabled: false, focus() { dialogRestores += 1; } };
focusDocument.activeElement = dialogNode; dialogFocusContext.restoreSpriteDialogFocus(detachedOpener, dialogNode); deferredFocus.shift()();
assert.strictEqual(dialogRestores, 1, 'detached Sprite modal opener is never focused');
const movedElsewhere = {};
focusDocument.activeElement = dialogNode; dialogFocusContext.restoreSpriteDialogFocus(connectedOpener, dialogNode); focusDocument.activeElement = movedElsewhere; deferredFocus.shift()();
assert.strictEqual(dialogRestores, 1, 'deferred Sprite modal restoration does not steal focus after the user or host moved it elsewhere');

let restored = null, rendered = 0, published = 0;
const chooseContext = {
  visible: () => [{ number: 0 }], selected: null, anchor: null, marked: new Set(), publishSelection() { published += 1; },
  render() { rendered += 1; }, restoreBrowserItemFocus(_root, key, value, secondaryKey, secondaryValue) { restored = { key, value, secondaryKey, secondaryValue }; }, list: {}
};
vm.createContext(chooseContext); vm.runInContext(functionSource(client, 'choose'), chooseContext);
chooseContext.choose({ number: 0 }, { shiftKey: false, ctrlKey: false, metaKey: false }, 'grid');
assert.strictEqual(rendered, 1); assert.strictEqual(published, 1);
assert.deepStrictEqual({ ...restored }, { key: 'action', value: 0, secondaryKey: 'actionKind', secondaryValue: 'grid' }, 'Action selection requests focus on its replacement card after rerender');

const spriteControls = new Map([
  ['spriteSelectGroup', control('Select Visible')], ['spriteClear', control('Clear')],
  ['spriteCreate', control('Create New Animation…')], ['spriteAppend', control('Append to Current Action…')]
]);
const spriteContext = {
  spriteExplorerModel: { available: false, reason: 'The connected SFF is unavailable.' }, mutationBusy: false, spriteSelection: [], selected: null,
  document: { getElementById(id) { return spriteControls.get(id); } }
};
vm.createContext(spriteContext); vm.runInContext(functionSource(client, 'setActionableDisabled') + functionSource(client, 'updateSpriteAvailability'), spriteContext);
spriteContext.updateSpriteAvailability([]);
for (const id of ['spriteSelectGroup', 'spriteCreate', 'spriteAppend']) assert.strictEqual(spriteControls.get(id).disabled, true, `${id} disables when the SFF is unavailable`);
assert.match(spriteControls.get('spriteCreate').title, /SFF is unavailable/);
spriteContext.spriteExplorerModel = { available: true, reason: '' }; spriteContext.spriteSelection = [4]; spriteContext.selected = { number: 200 };
spriteContext.updateSpriteAvailability([{ physicalIndex: 4 }]);
assert.strictEqual(spriteControls.get('spriteCreate').disabled, false);
assert.strictEqual(spriteControls.get('spriteAppend').disabled, false);
assert.strictEqual(spriteControls.get('spriteClear').disabled, false);

const alignmentControls = new Map([
  ['alignmentAdd', control('Add element')], ['alignmentSelectVisible', control('Select visible')], ['alignmentBaseOnly', control('Base only')],
  ['alignmentClear', control('Remove added layers')], ['alignmentRefresh', control('Refresh preview')], ['alignmentApplyMove', control('Review & move selected…')],
  ['alignmentNudgeLeft', control('←')], ['alignmentNudgeUp', control('↑')], ['alignmentNudgeDown', control('↓')], ['alignmentNudgeRight', control('→')]
]);
const alignmentAction = control(); alignmentAction.value = '0';
const alignmentElement = control();
const alignmentBefore = control(); alignmentBefore.value = '0';
const alignmentAfter = control(); alignmentAfter.value = '0';
const alignmentContext = {
  selected: null, model: { actions: [{ number: 0, frames: [{}] }] }, alignmentAction, alignmentElement, alignmentBefore, alignmentAfter,
  alignmentProjection: null, alignmentRefs: [], alignmentStates: [], document: { getElementById(id) { return alignmentControls.get(id); } }
};
vm.createContext(alignmentContext); vm.runInContext(functionSource(client, 'setActionableDisabled') + functionSource(client, 'updateAlignmentAvailability'), alignmentContext);
alignmentContext.updateAlignmentAvailability();
assert.strictEqual(alignmentControls.get('alignmentSelectVisible').disabled, true);
assert.strictEqual(alignmentControls.get('alignmentApplyMove').title, 'Refresh the exact alignment preview first.');
alignmentContext.selected = { frames: [{}] };
alignmentContext.alignmentProjection = { layers: [{ key: 'base' }], moveTargetKeys: ['base'] };
alignmentContext.updateAlignmentAvailability();
assert.strictEqual(alignmentControls.get('alignmentSelectVisible').disabled, false);
assert.strictEqual(alignmentControls.get('alignmentApplyMove').disabled, false);
assert.strictEqual(alignmentControls.get('alignmentNudgeRight').disabled, false);

const collisionControls = new Map([
  ['collisionElement', control()], ['collisionGroup', control()], ['collisionPrevElement', control('◀')], ['collisionNextElement', control('▶')],
  ['collisionRecord', control()], ['collisionPrevRecord', control('◀')], ['collisionNextRecord', control('▶')],
  ['collisionSlot', control()], ['collisionPrevSlot', control('◀')], ['collisionNextSlot', control('▶')]
]);
const collisionContext = {
  selected: null, collisionInspection: null, collisionGroup: 'clsn1', collisionElement: 0, collisionRecord: 0, collisionSlot: 0,
  collisionElementInput: collisionControls.get('collisionElement'), collisionGroupInput: collisionControls.get('collisionGroup'),
  collisionPrevElementButton: collisionControls.get('collisionPrevElement'), collisionNextElementButton: collisionControls.get('collisionNextElement'),
  collisionRecordInput: collisionControls.get('collisionRecord'), collisionPrevRecordButton: collisionControls.get('collisionPrevRecord'), collisionNextRecordButton: collisionControls.get('collisionNextRecord'),
  collisionSlotInput: collisionControls.get('collisionSlot'), collisionPrevSlotButton: collisionControls.get('collisionPrevSlot'), collisionNextSlotButton: collisionControls.get('collisionNextSlot')
};
vm.createContext(collisionContext); vm.runInContext(functionSource(client, 'setActionableDisabled') + functionSource(client, 'updateCollisionNavigationAvailability'), collisionContext);
collisionContext.updateCollisionNavigationAvailability();
assert.strictEqual(collisionControls.get('collisionGroup').disabled, true);
assert.strictEqual(collisionControls.get('collisionNextElement').title, 'Choose an AIR Action with at least one frame first.');
assert.strictEqual(collisionControls.get('collisionNextSlot').title, 'No effective collision slots are available for this frame and group.');
collisionContext.selected = { frames: [{}, {}] }; collisionContext.collisionInspection = { groups: { clsn1: { authored: { assignments: [{}, {}] }, projection: { candidates: [{ slots: [{}, {}] }] } } } };
collisionContext.updateCollisionNavigationAvailability();
assert.strictEqual(collisionControls.get('collisionGroup').disabled, false);
assert.strictEqual(collisionControls.get('collisionNextElement').disabled, false);
assert.strictEqual(collisionControls.get('collisionNextRecord').disabled, false);
assert.strictEqual(collisionControls.get('collisionNextSlot').disabled, false);

assert(page.includes('id="actionsPanel" role="tabpanel" aria-labelledby="airBrowserActionsTab"'));
assert(page.includes('id="spriteAnimationDialog" aria-labelledby="spriteDialogTitle" aria-describedby="spriteDialogSummary"'));
assert(page.includes('id="spriteStatus" class="status muted" role="status" aria-live="polite"'));
assert(page.includes('.list.mode-combined{grid-template-columns:1fr;min-width:0;overflow:auto}'));
assert(client.includes("button.setAttribute('aria-current',a===selected?'true':'false')"), 'current Action is exposed independently of marked aria-pressed state');
assert(client.includes("spriteDialog.addEventListener('close'"), 'Sprite modal restores focus to its connected opener on every close path');
assert(page.includes('id="spriteDialogCancel" type="button"') && client.includes("document.getElementById('spriteDialogCancel').onclick=()=>spriteDialog.close('cancel')"), 'Sprite modal Cancel closes explicitly even after shared button normalization');
assert(client.includes("panel.id='collisionInspectPanel'"), 'Inspect task owns one complete named tabpanel instead of mislabeling the persistent summary');
assert(client.includes("assistPreview.setAttribute('role','img')"), 'read-only assistance canvas is exposed as an explained image rather than a pointer-only control');

console.log('AIR Browser actionable states, focus restoration, semantics, and narrow layout passed');
