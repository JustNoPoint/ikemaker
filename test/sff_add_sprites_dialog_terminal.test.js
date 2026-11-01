'use strict';

const assert = require('assert');
const vm = require('vm');
const dialog = require('../src/sff_add_sprites_dialog');

function element(id) {
  return { id, value: '', checked: false, disabled: false, hidden: false, textContent: '', innerHTML: '', className: '', selectedIndex: 0, options: [{ text: 'Use image palette' }], open: false,
    setAttribute(name, value) { this[name] = value; }, focus() { this.focused = true; }, addEventListener(type, listener) { this[type] = listener; }, showModal() { this.open = true; }, close() { this.open = false; } };
}
const ids = ['sffAddSpritesDialog','sffAddTarget','sffAddClose','sffAddChoose','sffAddClear','sffAddWriter','sffAddFiles','sffAddFormat','sffAddGroup','sffAddIndex','sffAddDetect','sffAddNumbering','sffAddCollision','sffAddX','sffAddY','sffAddCrop','sffAddPalette','sffAddReversed','sffAddShare','sffAddTilingField','sffAddTiling','sffAddPaletteNote','sffAddReview','sffAddStage','sffAddPaletteWorkshop','sffAddAdvanced','sffAddCancel','sffAddStatus'];
const elements = Object.fromEntries(ids.map(id => [id, element(id)]));
elements.sffAddPalette.value = 'image'; elements.sffAddNumbering.value = 'consecutive'; elements.sffAddCollision.value = 'stop'; elements.sffAddCrop.value = 'none'; elements.sffAddTiling.value = 'single-palette';
const anchor = element('anchor-center'); anchor.value = 'center'; anchor.checked = true;
const controls = [...Object.values(elements).filter(item => item.id !== 'sffAddSpritesDialog'), anchor];
elements.sffAddSpritesDialog.querySelectorAll = selector => selector === 'button,input,select' ? controls : [];
elements.sffAddSpritesDialog.querySelector = selector => selector === '.sff-add-body' ? element('sff-add-body') : null;
const listeners = {}, posted = [], timeouts = [];
const document = {
  getElementById: id => elements[id],
  querySelector: selector => selector.includes(':checked') || selector.includes('[value=') ? anchor : null,
  querySelectorAll: selector => selector.includes('input[name=sffAddAnchor]') ? [anchor] : []
};
const context = { document, vscode: { postMessage: message => posted.push(message) }, addEventListener: (type, listener) => { listeners[type] = listener; }, setTimeout: listener => { timeouts.push(listener); }, console };
vm.createContext(context); vm.runInContext(dialog.clientScript(), context);
const emit = data => listeners.message({ data });
const model = { targetName: 'Ryu.sff', targetVersion: '2.1', writerMode: 'built-in', writerLabel: 'Built-in reviewed writer', palettes: [], defaults: { group: 200, startIndex: 4, offsetX: 2, offsetY: 3, anchor: 'center' }, occupiedIndexesByGroup: { '200': [0, 1, 3, 4], '201': [0] } };
emit({ type: 'sffAddSpritesOpen', model });
assert.strictEqual(elements.sffAddChoose.disabled, false); assert.strictEqual(elements.sffAddGroup.value, 200);
assert.match(elements.sffAddReview.textContent, /Group 200 is already used/); assert.match(elements.sffAddReview.textContent, /Next open at or after 4: 5/); assert.match(elements.sffAddReview.textContent, /Next unused group: 202/);
elements.sffAddGroup.value = 300; elements.sffAddGroup.oninput(); assert.match(elements.sffAddReview.textContent, /Group 300 is unused/); assert.match(elements.sffAddReview.textContent, /Next unused group after it: 301/);
elements.sffAddGroup.value = 200; elements.sffAddGroup.oninput();
emit({ type: 'sffAddSpritesFiles', sources: [{ id: 'one', name: 'one.png', width: 20, height: 30, indexed: true }] });
const filesBeforeCancel = elements.sffAddFiles.innerHTML;
emit({ type: 'sffAddSpritesFiles', sources: null });
assert.strictEqual(elements.sffAddFiles.innerHTML, filesBeforeCancel, 'file-picker cancel preserves the reviewed source list');
elements.sffAddStage.onclick();
assert.strictEqual(elements.sffAddStage.disabled, true); assert.strictEqual(posted.at(-1).action, 'stage');
emit({ type: 'sffAddSpritesResult', ok: false, terminal: true, message: 'The source changed.' });
for (const control of controls) if (!['sffAddClose','sffAddCancel'].includes(control.id)) assert.strictEqual(control.disabled, true, `${control.id} must not imply the consumed session can retry`);
assert.strictEqual(elements.sffAddClose.disabled, false); assert.strictEqual(elements.sffAddCancel.disabled, false);
assert.strictEqual(elements.sffAddStatus.role, 'alert'); assert.match(elements.sffAddStatus.textContent, /Close this popup and reopen Add Sprites to try again/);
const beforeIgnoredFiles = elements.sffAddFiles.innerHTML;
emit({ type: 'sffAddSpritesFiles', sources: [{ id: 'forged', name: 'forged.png', width: 1, height: 1, indexed: true }] });
assert.strictEqual(elements.sffAddFiles.innerHTML, beforeIgnoredFiles, 'terminal dialog ignores late file results from the consumed session');
emit({ type: 'sffAddSpritesOpen', model });
assert.strictEqual(elements.sffAddChoose.disabled, false, 'a genuinely fresh host session re-enables the dialog'); assert.strictEqual(elements.sffAddStatus.textContent, '');
emit({ type: 'sffAddSpritesFiles', sources: [{ id: 'two', name: 'two.png', width: 20, height: 30, indexed: true }] }); elements.sffAddStage.onclick();
emit({ type: 'sffAddSpritesResult', ok: true, terminal: true, message: 'Staged.' });
assert.strictEqual(elements.sffAddStage.disabled, true, 'success stays terminal until the popup closes'); assert.strictEqual(timeouts.length, 1);

console.log('Embedded Add Sprites preserves picker cancel, exposes terminal retry guidance, locks consumed sessions, and re-enables only on a fresh open');
