'use strict';
const assert = require('assert');
const vm = require('vm');
const {
  sourceHtml,
  palettePrimaryActionAvailability,
  paletteLibraryControlAvailability,
  templateKeyboardPosition,
  templateCurrentPosition,
  templateExactRegionRect
} = require('../src/palette_workspace_view');

const staleSession = { stale: true, staleReasons: ['source', 'target'], context: { kind: 'existing-sff' } };
assert.deepStrictEqual(palettePrimaryActionAvailability(staleSession, 'edit', 'Edit Colors'), {
  disabled: true,
  reason: 'Reload or resolve the changed source, target before using Edit Colors.'
});
assert.deepStrictEqual(palettePrimaryActionAvailability({ stale: false, context: { kind: 'source' } }, 'add', 'Add / Insert Palettes…'), {
  disabled: true,
  reason: 'Choose an exact SFF target before changing embedded palettes.'
});
assert.strictEqual(palettePrimaryActionAvailability({ stale: false, context: { kind: 'existing-sff' } }, 'edit', 'Edit Colors').disabled, false);

const emptyLibrary = { stale: false, count: 0, active: false, recoverable: false, root: false, libraryOwned: false };
assert.match(paletteLibraryControlAvailability(emptyLibrary, 'candidateNext').reason, /Add or discover/);
assert.match(paletteLibraryControlAvailability(emptyLibrary, 'chooseCandidate').reason, /Preview one exact candidate/);
assert.match(paletteLibraryControlAvailability(emptyLibrary, 'restoreCandidate').reason, /No prior retained draft/);
assert.match(paletteLibraryControlAvailability(emptyLibrary, 'saveLibraryPalette').reason, /Choose a Palette Library folder/);
const staleLibrary = { ...emptyLibrary, stale: true, count: 2, active: true, recoverable: true, root: true, libraryOwned: true };
for (const control of ['chooseFiles', 'candidateBack', 'previewCandidate', 'chooseCandidate', 'saveLibraryPalette', 'row']) {
  const availability = paletteLibraryControlAvailability(staleLibrary, control);
  assert.strictEqual(availability.disabled, true, control + ' must disable for stale authority');
  assert.match(availability.reason, /Reload this changed candidate or restore the prior draft/);
}
assert.strictEqual(paletteLibraryControlAvailability({ ...emptyLibrary, count: 2, active: true, recoverable: true, root: true, libraryOwned: true }, 'chooseCandidate').disabled, false);

assert.deepStrictEqual(templateKeyboardPosition({ x: 4, y: 9 }, 'ArrowLeft', false), { x: 3, y: 9 });
assert.deepStrictEqual(templateKeyboardPosition({ x: 4, y: 9 }, 'ArrowDown', true), { x: 4, y: 19 });
assert.deepStrictEqual(templateKeyboardPosition({ x: 0, y: 0 }, 'ArrowUp', true), { x: 0, y: 0 });
assert.strictEqual(templateKeyboardPosition({ x: 4, y: 9 }, 'Enter', false), null);
assert.deepStrictEqual(templateCurrentPosition({ left: '0px', top: '0px' }, { x: 7, y: 8 }), { x: 0, y: 0 }, 'a legitimate zero style coordinate never falls back to the original nonzero item coordinate');
let repeated = { x: 2, y: 1 };
for (let index = 0; index < 4; index += 1) repeated = templateKeyboardPosition(repeated, 'ArrowLeft', false);
assert.deepStrictEqual(repeated, { x: 0, y: 1 }, 'repeated keyboard movement reaches zero and remains bounded beyond it');
assert.deepStrictEqual(templateExactRegionRect({ x: 9, y: 7, width: 20, height: 20 }, 16, 12), { x: 9, y: 7, width: 7, height: 5 });
assert.deepStrictEqual(templateExactRegionRect({ x: -5, y: -4, width: 0, height: 0 }, 16, 12), { x: 0, y: 0, width: 1, height: 1 });
assert.throws(() => templateExactRegionRect({}, 0, 0), /known dimensions/);

const html = sourceHtml({ session: { context: { kind: 'source', section: 'organize' }, sources: [], target: null, facts: { preview: 'draft', staged: 'none', embedded: 'saved', builtOutput: 'none', adoption: 'none' }, stale: false, staleReasons: [], organizer: { semanticEntries: [] } } });
const inline = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert(inline);
assert.doesNotThrow(() => new vm.Script(inline), 'the generated client with accessibility routes must parse');
assert.match(inline, /installTemplateCanvasAccessibility/);
assert.match(inline, /role','listbox'/);
assert.match(inline, /image\.addEventListener\('keydown'/);
assert.match(inline, /templateKeyPosition/);
assert.match(inline, /applyTemplateImagePosition/);
assert.match(inline, /reviewExactTemplateRegion/);
assert.match(inline, /exactRegionRect\(values,sourceWidth,sourceHeight\)/);
assert.match(inline, /primaryActionAvailability\(session,id,label\)/);
assert.match(inline, /libraryControlAvailability\(libraryAvailabilityState,key\)/);
assert.match(inline, /paletteTemplateLayout'\)acceptTemplatePlacementLayout\(event\.data\.model\)/, 'the real layout-response route consumes the correlated placement refresh');
assert.match(inline, /renderContact=model=>\{captureTemplatePlacementBeforeContact\(\);renderContactWithoutPlacementCapture\(model\);sealTemplatePlacementAfterContact\(\)/, 'the real Contact route captures focus ownership before destroying the canvas and seals the post-render focus guard');
assert.match(inline, /paletteTemplatePlacementResult'&&event\.data\.ok===false\)rejectTemplatePlacement\(event\.data\)/, 'the real placement-result route clears a correlated rejected request');

function clientFunctionSource(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert(start >= 0, 'missing generated client function ' + name);
  const brace = source.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error('unterminated generated client function ' + name);
}
let activeDocument = null;
function image(id, left, top) {
  const listeners = {};
  return {
    dataset: { imageId: id }, alt: id, tabIndex: -1, attributes: {}, listeners,
    style: { left: left + 'px', top: top + 'px', setProperty(name, value) { this[name] = value; } },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    addEventListener(name, handler) { listeners[name] = handler; },
    focus() { this.focused = true; if (activeDocument) activeDocument.activeElement = this; }
  };
}
let firstImage = image('first', 2, 3), secondImage = image('second', 8, 9);
const imageMap = new Map([['first', firstImage], ['second', secondImage]]), posted = [], after = [];
const selectedOutput = { textContent: '' }, xField = { value: '' }, yField = { value: '' }, applyButton = {}, fields = {
  disabled: false, innerHTML: '',
  querySelector(selector) { return ({ '#templateSelectedImage': selectedOutput, '#templateImageX': xField, '#templateImageY': yField, '#applyTemplateImagePosition': applyButton })[selector]; }
};
const status = { textContent: '', setAttribute() {} }, board = {
  attributes: {}, parentElement: { after(...items) { after.push(...items); } },
  setAttribute(name, value) { this.attributes[name] = String(value); },
  querySelectorAll(selector) { assert.strictEqual(selector, 'img[data-image-id]'); return [...imageMap.values()]; }
};
const accessibilityDocument = {
  activeElement: null,
  createElement(tag) { return tag === 'fieldset' ? fields : status; },
  querySelector(selector) { const match = /img\[data-image-id="([^"]+)"\]/.exec(selector); return match ? imageMap.get(match[1]) || null : null; },
  getElementById(id) { return ({ templateImageX: xField, templateImageY: yField, applyTemplateImagePosition: applyButton, templateImagePositionStatus: status })[id] || null; }
};
activeDocument = accessibilityDocument;
const accessibilityContext = {
  templateLayout: { layoutHash: 'LAYOUT', items: [{ imageId: 'first', name: 'First', x: 2, y: 3 }, { imageId: 'second', name: 'Second', x: 8, y: 9 }] },
  templateSelectedImageId: '', templatePlacementPending: null, templatePlacementQueue: [], templatePlacementRefreshTicket: null, templatePlacementSequence: 0,
  templateKeyPosition: templateKeyboardPosition, templateImagePosition: templateCurrentPosition,
  board,
  document: accessibilityDocument, CSS: { escape(value) { return String(value); } },
  post(action, payload) { posted.push({ action, payload }); }
};
vm.createContext(accessibilityContext);
const placementClient = ['templatePlacementFocusKey', 'templatePlacementFocusElement', 'sendQueuedTemplatePlacement', 'queueTemplatePlacement', 'beginTemplatePlacementResponse', 'finishTemplatePlacementResponse', 'rejectTemplatePlacement', 'captureTemplatePlacementBeforeContact', 'sealTemplatePlacementAfterContact', 'acceptTemplatePlacementLayout', 'installTemplateCanvasAccessibility'].map(name => clientFunctionSource(inline, name)).join('\n');
vm.runInContext(placementClient + ';renderTemplateCanvas=()=>installTemplateCanvasAccessibility({},board);installTemplateCanvasAccessibility({},board)', accessibilityContext);
assert.strictEqual(board.attributes.role, 'listbox');
assert.strictEqual(firstImage.attributes.role, 'option');
assert.strictEqual(firstImage.attributes['aria-selected'], 'true');
assert.strictEqual(firstImage.tabIndex, 0);
assert.strictEqual(secondImage.tabIndex, 0, 'Tab can reach and select every template image');
let prevented = 0;
firstImage.focus();
firstImage.listeners.keydown({ key: 'ArrowRight', shiftKey: false, preventDefault() { prevented += 1; } });
firstImage.listeners.keydown({ key: 'ArrowRight', shiftKey: false, preventDefault() { prevented += 1; } });
secondImage.focus();
secondImage.listeners.keydown({ key: 'ArrowRight', shiftKey: false, preventDefault() { prevented += 1; } });
assert.strictEqual(posted.length, 1, 'rapid keys keep only one layout-hash request in flight');
assert.strictEqual(prevented, 3);
assert.deepStrictEqual(JSON.parse(JSON.stringify(posted.at(-1))), { action: 'templatePlaceImage', payload: { requestId: 'template-placement-1', layoutHash: 'LAYOUT', imageId: 'first', x: 3, y: 3 } });
vm.runInContext('captureTemplatePlacementBeforeContact()', accessibilityContext); // Exact paletteCollectiveContact route, before renderContact destroys the board.
accessibilityDocument.activeElement = null;
vm.runInContext('sealTemplatePlacementAfterContact()', accessibilityContext);
assert.strictEqual(vm.runInContext('sendQueuedTemplatePlacement()', accessibilityContext), false, 'queued edits remain blocked throughout the split Contact-to-Layout response');
assert.strictEqual(posted.length, 1, 'no queued edit escapes with the old layout hash between Contact and Layout');
const firstLayout = { layoutHash: 'LAYOUT2', assetPageCount: 0, items: [{ imageId: 'first', name: 'First', x: 3, y: 3 }, { imageId: 'second', name: 'Second', x: 8, y: 9 }] };
firstImage = image('first', 3, 3); secondImage = image('second', 8, 9); imageMap.set('first', firstImage); imageMap.set('second', secondImage);
accessibilityContext.firstLayout = firstLayout;
vm.runInContext('acceptTemplatePlacementLayout(firstLayout)', accessibilityContext);
assert.strictEqual(secondImage.focused, true, 'the real Contact-before-Layout order restores the image the user switched to before acknowledgement');
assert.deepStrictEqual(JSON.parse(JSON.stringify(posted.at(-1))), { action: 'templatePlaceImage', payload: { requestId: 'template-placement-2', layoutHash: 'LAYOUT2', imageId: 'first', x: 4, y: 3 } }, 'the coalesced first-image position uses the fresh response layout hash');
vm.runInContext('captureTemplatePlacementBeforeContact()', accessibilityContext);
accessibilityDocument.activeElement = null;
vm.runInContext('sealTemplatePlacementAfterContact()', accessibilityContext);
const secondLayout = { layoutHash: 'LAYOUT3', assetPageCount: 0, items: [{ imageId: 'first', name: 'First', x: 4, y: 3 }, { imageId: 'second', name: 'Second', x: 8, y: 9 }] };
firstImage = image('first', 4, 3); secondImage = image('second', 8, 9); imageMap.set('first', firstImage); imageMap.set('second', secondImage);
accessibilityContext.secondLayout = secondLayout;
vm.runInContext('acceptTemplatePlacementLayout(secondLayout)', accessibilityContext);
assert.deepStrictEqual(JSON.parse(JSON.stringify(posted.at(-1))), { action: 'templatePlaceImage', payload: { requestId: 'template-placement-3', layoutHash: 'LAYOUT3', imageId: 'second', x: 9, y: 9 } }, 'switching images retains both images’ edits instead of replacing one shared queued slot');
vm.runInContext('captureTemplatePlacementBeforeContact()', accessibilityContext);
accessibilityDocument.activeElement = null;
vm.runInContext('sealTemplatePlacementAfterContact()', accessibilityContext);
const thirdLayout = { layoutHash: 'LAYOUT4', assetPageCount: 0, items: [{ imageId: 'first', name: 'First', x: 4, y: 3 }, { imageId: 'second', name: 'Second', x: 9, y: 9 }] };
firstImage = image('first', 4, 3); secondImage = image('second', 9, 9); imageMap.set('first', firstImage); imageMap.set('second', secondImage);
accessibilityContext.thirdLayout = thirdLayout;
vm.runInContext('acceptTemplatePlacementLayout(thirdLayout)', accessibilityContext);
firstImage.focus();
firstImage.listeners.keydown({ key: 'ArrowLeft', shiftKey: true, preventDefault() {} });
assert.deepStrictEqual(JSON.parse(JSON.stringify(posted.at(-1))), { action: 'templatePlaceImage', payload: { requestId: 'template-placement-4', layoutHash: 'LAYOUT4', imageId: 'first', x: 0, y: 3 } }, 'a second keyboard action after the real response order reaches zero without falling back to the original coordinate');
const unrelated = { focus() { accessibilityDocument.activeElement = this; } };
vm.runInContext('captureTemplatePlacementBeforeContact()', accessibilityContext);
accessibilityDocument.activeElement = null;
vm.runInContext('sealTemplatePlacementAfterContact()', accessibilityContext);
unrelated.focus();
const noStealLayout = { layoutHash: 'LAYOUT5', assetPageCount: 0, items: [{ imageId: 'first', name: 'First', x: 0, y: 3 }, { imageId: 'second', name: 'Second', x: 9, y: 9 }] };
firstImage = image('first', 0, 3); secondImage = image('second', 9, 9); imageMap.set('first', firstImage); imageMap.set('second', secondImage);
accessibilityContext.noStealLayout = noStealLayout;
vm.runInContext('acceptTemplatePlacementLayout(noStealLayout)', accessibilityContext);
assert.strictEqual(accessibilityDocument.activeElement, unrelated, 'rerender never steals focus after the user moved elsewhere');
secondImage.listeners.focus();
assert.strictEqual(secondImage.attributes['aria-selected'], 'true');
assert.strictEqual(firstImage.attributes['aria-selected'], 'false');
xField.value = '12'; yField.value = '14'; applyButton.onclick();
assert.deepStrictEqual(JSON.parse(JSON.stringify(posted.at(-1))), { action: 'templatePlaceImage', payload: { requestId: 'template-placement-5', layoutHash: 'LAYOUT5', imageId: 'second', x: 12, y: 14 } });
firstImage.focus();
firstImage.listeners.keydown({ key: 'ArrowRight', shiftKey: false, preventDefault() {} });
const rejectedRequestId = accessibilityContext.templatePlacementPending.requestId;
assert.strictEqual(vm.runInContext(`rejectTemplatePlacement({requestId:'wrong',message:'wrong request'})`, accessibilityContext), false, 'an unrelated failure cannot clear the active request');
accessibilityContext.rejectedRequestId = rejectedRequestId;
assert.strictEqual(vm.runInContext(`rejectTemplatePlacement({requestId:rejectedRequestId,message:'layout changed'})`, accessibilityContext), true);
assert.strictEqual(accessibilityContext.templatePlacementPending, null, 'a correlated host rejection clears the pending request');
assert.strictEqual(accessibilityContext.templatePlacementQueue.length, 0, 'a correlated host rejection discards stale queued edits instead of replaying them');
assert.match(status.textContent, /not applied: layout changed/);
firstImage.listeners.keydown({ key: 'ArrowRight', shiftKey: false, preventDefault() {} });
assert.strictEqual(posted.at(-1).payload.requestId, 'template-placement-6', 'keyboard placement can recover with a fresh correlated request after rejection');

console.log('Palette Workspace actionable disabled states and keyboard coordinate transitions passed');
