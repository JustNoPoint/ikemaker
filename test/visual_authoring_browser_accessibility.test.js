'use strict';

const assert = require('assert');
const vm = require('vm');
const { renderVisualAuthoringBrowserCompanionHtml } = require('../src/visual_authoring_browser_companion');

const page = renderVisualAuthoringBrowserCompanionHtml({ sessionId: 'accessibility', model: null });
const scripts = [...page.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]);
assert.strictEqual(scripts.length, 4, 'the visual browser keeps separate base, thumbnail-animation, accessibility, and operation-state clients');
const [base, animation, accessibility, operation] = scripts;

const modeStart = base.indexOf('const selectionMode='), modeEnd = base.indexOf('function selectRow', modeStart);
const keyStart = base.indexOf('function handleRowKeydown'), keyEnd = base.indexOf('function render()', keyStart);
assert(modeStart >= 0 && modeEnd > modeStart && keyStart >= 0 && keyEnd > keyStart, 'actual row keyboard helpers must be extractable');
const selected = [];
const keyContext = { selectRow(node, event) { selected.push({ node, event }); } };
vm.createContext(keyContext);
vm.runInContext(base.slice(modeStart, modeEnd) + ';this.selectionMode=selectionMode;' + base.slice(keyStart, keyEnd) + ';this.handleRowKeydown=handleRowKeydown;', keyContext);
assert.strictEqual(keyContext.selectionMode({ shiftKey: true }), 'range');
assert.strictEqual(keyContext.selectionMode({ ctrlKey: true }), 'toggle');
assert.strictEqual(keyContext.selectionMode({ metaKey: true }), 'toggle');
assert.strictEqual(keyContext.selectionMode({}), 'replace');
const row = { dataset: { row: 'row-logo' } }, childButton = { dataset: { action: 'open-source' } };
let prevented = 0;
assert.strictEqual(keyContext.handleRowKeydown(row, { target: childButton, key: 'Enter', preventDefault() { prevented += 1; } }), false, 'nested action buttons keep native keyboard activation');
assert.strictEqual(prevented, 0); assert.strictEqual(selected.length, 0, 'a nested action key does not select the row');
const rowEvent = { target: row, key: ' ', shiftKey: true, preventDefault() { prevented += 1; } };
assert.strictEqual(keyContext.handleRowKeydown(row, rowEvent), true); assert.strictEqual(prevented, 1); assert.strictEqual(selected[0].event, rowEvent, 'row keyboard selection preserves Shift/Ctrl/Meta intent instead of dropping modifiers through click()');

const syncStart = animation.indexOf('function sync()'), syncEnd = animation.indexOf('button.onclick', syncStart);
assert(syncStart >= 0 && syncEnd > syncStart, 'actual animation availability transition must be extractable');
const button = { disabled: false, title: '', textContent: '', attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
const status = { textContent: '' };
let hasVisibleThumbnail = true, visibleRowId = 'row-logo';
const animationContext = {
  model: { thumbnailAnimations: { 'row-logo': { frames: [{ thumbnailKey: 'one', durationMs: 50 }, { thumbnailKey: 'two', durationMs: 50 }] } } },
  prefs: { view: 'list' }, rows: { querySelectorAll: () => [{ dataset: { row: visibleRowId }, querySelector: () => hasVisibleThumbnail ? {} : null }] },
  button, status, enabled: true, reset() {}, document:{body:{dataset:{}}}, performance: { now: () => 0 }, clock: new Map(), setInterval: () => 1
};
vm.createContext(animationContext);
vm.runInContext(animation.slice(syncStart, syncEnd) + ';this.sync=sync;', animationContext);
animationContext.sync();
assert.strictEqual(button.disabled, true, 'animation is unavailable in list view where no thumbnail can visibly animate');
assert.match(status.textContent, /Switch to Thumbnails view/); assert.strictEqual(animationContext.enabled, false, 'leaving thumbnail view stops animation instead of silently resuming later');
animationContext.prefs.view = 'thumbnails'; animationContext.sync();
assert.strictEqual(button.disabled, false, 'animation enables when animated thumbnail rows are visible'); assert.strictEqual(status.textContent, '');
hasVisibleThumbnail = false; animationContext.sync();
assert.strictEqual(button.disabled, true); assert.match(status.textContent, /Clear the filters or choose a row with an animated thumbnail/);
hasVisibleThumbnail = true; visibleRowId = 'static-visible'; animationContext.model.thumbnailAnimations = { 'animated-hidden': { frames: [{ thumbnailKey: 'one', durationMs: 50 }, { thumbnailKey: 'two', durationMs: 50 }] } }; animationContext.sync();
assert.strictEqual(button.disabled, true, 'a visible static thumbnail cannot enable animation when the animated row is filtered out'); assert.match(status.textContent, /animated thumbnail/);
animationContext.model.thumbnailAnimations = {}; animationContext.sync();
assert.match(status.textContent, /No multi-frame thumbnail animations/);
animationContext.document.body.dataset.visualBrowserBusy='true';animationContext.sync();assert.strictEqual(button.disabled,true);assert.match(status.textContent,/Wait for the current visual-browser action/,'thumbnail animation exposes the shared in-progress reason and stops while owner work is pending');
assert(page.includes('aria-describedby="animationStatus"') && page.includes('role="status" aria-live="polite"'), 'disabled animation reasons are visible and associated with the control');

assert(accessibility.includes("query.setAttribute('aria-label','Search visual rows')"), 'search receives a persistent accessible name instead of relying on its placeholder');
assert(accessibility.includes("rows.setAttribute('role','list')") && accessibility.includes("node.setAttribute('role','listitem')"), 'dynamic rows expose list semantics');
assert(accessibility.includes("node.setAttribute('aria-current'"), 'selected rows expose their state without invalid option/button nesting');
assert(accessibility.includes("action.setAttribute('aria-label'"), 'repeated row actions include their owning row in the accessible name');
assert(accessibility.includes('document.activeElement===document.body') && accessibility.includes('(action||tabStop).focus()'), 'a model rerender restores the exact row action or visible fallback when Chromium drops focus to the body');
const decorateStart=accessibility.indexOf('function decorate'),decorateEnd=accessibility.indexOf('function handleRovingKey',decorateStart);assert(decorateStart>=0&&decorateEnd>decorateStart);
let fallbackFocused='';const body={},fallbackRows=['visible-one','visible-two'].map(id=>({dataset:{row:id},tabIndex:-1,classList:{contains:()=>false},setAttribute(){},querySelector:()=>({textContent:id}),querySelectorAll:()=>[],focus(){fallbackFocused=id;}})),fallbackContext={rows:{querySelectorAll:()=>fallbackRows},lastRow:'filtered-away',lastAction:'old-action',document:{body,activeElement:body}};
vm.createContext(fallbackContext);vm.runInContext(accessibility.slice(decorateStart,decorateEnd)+';this.decorate=decorate;',fallbackContext);fallbackContext.decorate();assert.strictEqual(fallbackRows[0].tabIndex,0,'when the remembered row is filtered out, the first visible row becomes the one keyboard tab stop');assert.strictEqual(fallbackRows[1].tabIndex,-1);assert.strictEqual(fallbackContext.lastRow,'visible-one');assert.strictEqual(fallbackContext.lastAction,'');assert.strictEqual(fallbackFocused,'visible-one','body focus recovers to the first visible row instead of becoming unreachable');
const rovingStart=accessibility.indexOf('function handleRovingKey'),rovingEnd=accessibility.indexOf("rows.addEventListener('keydown'",rovingStart);
assert(rovingStart>=0&&rovingEnd>rovingStart,'the real roving-row handler is extractable');
let focused='',navPrevented=0;
const navRows=['one','two','three'].map(id=>({dataset:{row:id},tabIndex:-1,focus(){focused=id;},closest(selector){return selector==='[data-row]'?this:null;}}));
const navContext={rows:{querySelectorAll:()=>navRows},lastRow:'',lastAction:''};
vm.createContext(navContext);vm.runInContext(accessibility.slice(rovingStart,rovingEnd)+';this.handleRovingKey=handleRovingKey;',navContext);
navContext.handleRovingKey({target:navRows[0],key:'ArrowDown',preventDefault(){navPrevented+=1;}});assert.strictEqual(focused,'two');assert.strictEqual(navRows[1].tabIndex,0);
navContext.handleRovingKey({target:navRows[1],key:'End',preventDefault(){navPrevented+=1;}});assert.strictEqual(focused,'three');
navContext.handleRovingKey({target:navRows[2],key:'Home',preventDefault(){navPrevented+=1;}});assert.strictEqual(focused,'one');assert.strictEqual(navPrevented,3);
navContext.handleRovingKey({target:{closest:selector=>selector==='[data-action]'?{}:navRows[0]},key:'ArrowDown',preventDefault(){navPrevented+=1;}});assert.strictEqual(navPrevented,3,'nested action buttons retain native arrow-key behavior');
assert(page.includes('id="browserStatus"')&&page.includes('Visual Browser controls are ready.'),'the shared owner-operation state has a visible live region');
assert(operation.includes("message.type==='visualBrowserBusy'")&&operation.includes('message.sessionId===sessionId'),'busy transitions are accepted only for the exact companion session');
assert(operation.includes("['placement','scope','query','kind','view']")&&operation.includes("control.disabled=busy")&&operation.includes("action.disabled=busy")&&operation.includes("row.setAttribute('aria-disabled'"),'pending owner or placement work visibly and semantically disables every conflicting control while Close remains available');
assert(operation.includes("rows.addEventListener('click',block,true)")&&operation.includes("rows.addEventListener('keydown',block,true)"),'row mouse and keyboard intents are capture-blocked while the owner is busy');

console.log('Visual Browser names, list semantics, roving focus, rerender recovery, operation gating, nested-action keyboard handling, modifier selection, and actionable animation availability passed');
