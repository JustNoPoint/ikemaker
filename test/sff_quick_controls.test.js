'use strict';
const assert = require('assert');
const vm = require('vm');
const { clientScript } = require('../src/sff_quick_controls');
const generatedClient = clientScript({});
assert(generatedClient.includes('sessionOwnershipVersion:1'), 'SFF webview state must persist the session ownership schema even for standalone viewers');
assert(generatedClient.includes('if(model.restoredUnowned)persistLegacyOwnership()'), 'legacy restored ownership must remain legacy across reloads until the user makes the one-time choice');
assert(generatedClient.includes("if(!model.sprites.length){scroll.disabled=true")&&generatedClient.includes("textContent='0 / 0'"), 'an empty SFF disables physical-position navigation and announces zero sprites');

const elements = {};
function node(id = '') {
  return {
    id, value: '0', max: '0', textContent: '', children: [], listeners: {}, dataset: {}, style: {},
    classList: { values: [], add(value) { this.values.push(value); } },
    cloneNode() { const copy = node(this.id); copy.value = this.value; copy.max = this.max; return copy; },
    remove() { this.removed = true; if (elements[this.id] === this) delete elements[this.id]; },
    replaceWith(replacement) { replacement.parentElement = this.parentElement; elements[this.id] = replacement; if (replacement.id) elements[replacement.id] = replacement; },
    addEventListener(type, listener) { this.listeners[type] = listener; },
    fire(type, value) { this.value = String(value); this.listeners[type]({ currentTarget: this }); },
    querySelector(selector) { return selector === '.palette-workshop-actions' ? iconBar : elements[selector.slice(1)]; },
    append(child) { this.children.push(child); }, prepend(child) { this.children.unshift(child); },
    prepend(child) { this.children.unshift(child); },
  };
}
const iconBar = node('icons');
iconBar.querySelector = () => null;
elements.quickSpriteScroll = node('quickSpriteScroll');
const navigationRow = node('navigationRow');
elements.quickSpriteScroll.parentElement = navigationRow;
elements.spritePosition = node('spritePosition');
let legacySelections = 0;
elements.spritePosition.oninput = () => { legacySelections += 1; };
elements.spritePositionReadout = node('spritePositionReadout');
elements.quickSpritePosition = node('quickSpritePosition');
elements.left1 = node('left1');
elements.onionSkin = node('onionSkin');
elements.groupValue = node('groupValue');
elements.indexValue = node('indexValue');
const sprites = [{ index: 7, group: 0, number: 0 }, { index: 19, group: 1, number: 4 }, { index: 42, group: 8, number: 2 }];
const calls = [];
const messages = [];
const windowListeners = {};
const animationFrames = new Map();
let savedState = {};
let nextFrame = 1;
const sandbox = {
  model: { sprites, fullPath: 'shared.sff', sessionOwnerDefs: [], sessionOwnershipVersion: 1, restoredUnowned: false }, selected: sprites[0], selectedIndices: new Set(),
  document: { getElementById: id => elements[id] || null, createElement: () => node() },
  vscode: { postMessage(message) { messages.push(message); }, getState(){return savedState;}, setState(state){savedState=state;} },
  selectSprite(item, scale) {
    calls.push([item, scale]); sandbox.selected = item;
    elements.groupValue.value = String(item.group); elements.indexValue.value = String(item.number);
    sandbox.currentSpriteRequest += 1; sandbox.canvasRequests = (sandbox.canvasRequests || 0) + 1;
  },
  requestAnimationFrame(callback) { const id = nextFrame++; animationFrames.set(id, callback); return id; },
  cancelAnimationFrame(id) { animationFrames.delete(id); },
  requestOnion() { sandbox.onionRequests = (sandbox.onionRequests || 0) + 1; },
  requestCurrentSprite() { throw new Error('onion toggle must not reload or clear the base sprite'); },
  currentSpriteRequest: 2, image: null, redraws: 0, redraw() { sandbox.redraws += 1; }, error: { textContent: '' },
  Image: class { set src(value) { this.value = value; this.onload(); } },
  addEventListener(type, listener) { (windowListeners[type] ||= []).push(listener); },
};
vm.createContext(sandbox);
sandbox.ikemenSffSelectSprite = sandbox.selectSprite;
vm.runInContext(clientScript(), sandbox);
assert.strictEqual(savedState.sessionOwnershipVersion,1,'a modern standalone viewer persists as intentional standalone');
for (const listener of windowListeners.message) listener({data:{type:'sessionOwners',ownerDefs:['Ryu.def','Ken.def']}});
assert.deepStrictEqual(JSON.parse(JSON.stringify(savedState.sessionOwnerDefs)),['Ryu.def','Ken.def'],'host owner changes persist the complete owner set');
for (const listener of windowListeners.message) listener({data:{type:'sessionOwners',ownerDefs:['Ken.def']}});
assert.deepStrictEqual(JSON.parse(JSON.stringify(savedState.sessionOwnerDefs)),['Ken.def'],'releasing one owner persists the final owner and cannot resurrect the removed owner after restart');
const slider = elements.spritePosition;
assert.deepStrictEqual(slider.style, { flex: '1 1 0', width: 'auto', minWidth: '0', maxWidth: '100%', margin: '0' }, 'the authoritative range must not inherit the global full-width input rule');
assert(slider.classList.values.includes('sff-authoritative-position'));
assert.deepStrictEqual(navigationRow.style, { display: 'flex', flexWrap: 'nowrap', alignItems: 'center', minWidth: '0', width: '100%' }, 'the navigation row remains usable in a narrow control rail');
for (const listener of windowListeners.message) listener({ data: { type: 'paletteWorkspaceSession', session: { selection: { sprite: { physicalIndex: 42, group: 8, number: 2 } } } } });
for (const listener of windowListeners.message) listener({ data: { type: 'image', index: 42, group: 8, number: 2, baseRequestId: 1, onionFor: null, dataUri: 'data:image/png;base64,stale' } });
assert.strictEqual(sandbox.selected, sprites[0], 'idle Palette Workspace and stale image messages cannot navigate an untouched viewer');
assert.strictEqual(calls.length, 0, 'idle startup messages do not invoke sprite selection');
assert.strictEqual(sandbox.image, null, 'a stale base image cannot replace the untouched selection preview');
slider.fire('input', 1);
slider.fire('input', 2);
assert.strictEqual(calls.length, 0, 'dragging previews positions without selecting intermediate sprites');
assert.strictEqual(legacySelections, 0, 'the authoritative range is a clean clone with no legacy selection handlers');
assert.strictEqual(slider.value, 2);
assert.strictEqual(elements.quickSpritePosition.textContent, '3 / 3');
assert.strictEqual(elements.spritePositionReadout.textContent, '3 / 3', 'the universal context strip must show the same physical position as Sprite Controls');
assert.strictEqual(sandbox.canvasRequests, undefined, 'dragging does not schedule sprite image requests');
slider.fire('change', 2);
assert.strictEqual(calls.length, 1, 'release commits one exact physical sprite through the generated viewer selector');
assert.strictEqual(calls[0][0], sprites[2], 'slider position must address sprite-list position, not archive index');
assert.strictEqual(sandbox.selected, sprites[2]);
assert.strictEqual(elements.groupValue.value, '8', 'the selected Group field advances with the slider');
assert.strictEqual(elements.indexValue.value, '2', 'the selected Index field advances with the slider');
assert.strictEqual(sandbox.canvasRequests, 1, 'the selected sprite schedules a new canvas image request');
slider.fire('change', 2);
assert.strictEqual(calls.length, 1, 'release at the committed position does not snap back or request the sprite twice');
assert.strictEqual(slider.value, 2);
assert.strictEqual(elements.quickSpritePosition.textContent, '3 / 3');
assert.strictEqual(elements.spritePositionReadout.textContent, '3 / 3');
for (const listener of windowListeners.message) listener({ data: { type: 'image', index: 42, group: 8, number: 2, baseRequestId: 3, onionFor: null, dataUri: 'data:image/png;base64,third' } });
assert.strictEqual(sandbox.image.value, 'data:image/png;base64,third', 'the current selected sprite response must replace the base image');
assert.strictEqual(sandbox.redraws, 1, 'accepting the selected sprite must redraw the canvas');
elements.onionSkin.onchange();
assert.strictEqual(sandbox.onionRequests, 1, 'onion toggle must update only the overlay');
const generatedBar = elements.left1.children[0], writer = generatedBar.children[0].children[0], shader = generatedBar.children.find(button => button.title.includes('Shader Workshop'));
assert.strictEqual(writer.disabled, true, 'the SFF writer selector waits for its saved preference');
assert.match(writer.title, /Loading the saved SFF output writer preference/, 'the initially disabled writer selector explains what is loading');
for (const listener of windowListeners.message) listener({ data: { type: 'sffWriterPreferenceState', mode: 'sprmake2' } });
assert.strictEqual(writer.disabled, false, 'the exact preference response enables the writer selector');
assert.match(writer.title, /Choose which reviewed writer handles SFF-building actions/, 'the enabled writer selector restores its actual purpose');
writer.value = 'both'; writer.onchange();
assert.strictEqual(writer.disabled, true, 'changing the writer disables the selector until acknowledgement');
assert.match(writer.title, /Saving the SFF output writer preference/, 'the pending writer selector gives an actionable wait reason');
for (const listener of windowListeners.message) listener({ data: { type: 'sffWriterPreferenceState', mode: 'both' } });
assert.strictEqual(writer.disabled, false, 'the saved writer acknowledgement re-enables the selector');
const paletteSync = generatedBar.children.find(button => button.title.includes('Two-Way Sync'));
const deletion = generatedBar.children.find(button => button.dataset.sffRequirement === 'batch');
const addSprites = generatedBar.children.find(button => button.title === 'Add sprites');
assert(paletteSync, 'SFF quick controls expose character palette Import, Export, and Two-Way Sync');
assert.strictEqual(generatedBar.children.at(-1), paletteSync, 'palette sync is the final quick action after the sprite tools');
paletteSync.onclick();
assert.strictEqual(messages.at(-1).action, 'paletteSync');
assert(shader, 'SFF quick controls include the body-owned Shader Workshop action');
shader.onclick();
assert.deepStrictEqual(JSON.parse(JSON.stringify(messages.at(-1))), { type: 'sffAction', action: 'shaderPreview', selectedIndex: 42, selectedIndices: [], group: 8 }, 'the client sends only selection tokens; the host derives source paths, identities, and authoritative writer preference');
sandbox.selected = null; sandbox.selectedIndices.clear(); sandbox.ikemenSyncSffQuickAvailability();
assert.strictEqual(shader.disabled, true, 'an exact-sprite action is disabled when no sprite is selected');
assert.match(shader.title, /Select an exact sprite/, 'the disabled exact-sprite action gives an actionable reason');
assert.strictEqual(deletion.disabled, true, 'batch deletion is disabled without a selected or marked sprite');
assert.match(deletion.title, /Select or mark one or more sprites/, 'the disabled batch action explains how to enable it');
assert.strictEqual(addSprites.disabled, false, 'archive-wide creation remains available without a selected sprite');
assert.strictEqual(paletteSync.disabled, false, 'archive-wide palette sync remains available without a selected sprite');
sandbox.selectedIndices.add(19); sandbox.ikemenSyncSffQuickAvailability();
assert.strictEqual(deletion.disabled, false, 'a marked physical sprite enables the batch action without inventing an exact selection');
assert.strictEqual(shader.disabled, true, 'a marked batch does not incorrectly enable an exact-sprite action');
sandbox.selected = sprites[0]; sandbox.ikemenSyncSffQuickAvailability();
assert.strictEqual(shader.disabled, false, 'restoring an exact sprite re-enables exact-sprite actions');
console.log('SFF quick slider previews cheaply and commits one exact viewer selection');
