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

const html = viewerHtml({
  title: 'Anim.air', airPath: 'Anim.air', sffPath: 'Sprite.sff', palettes: [],
  actions: [{ number: 0, line: 1, sourceOrder: 0, category: 'Test', name: 'Standing', aliases: [], frames: [] }]
});
const scriptStart = html.lastIndexOf('<script nonce="');
const client = html.slice(html.indexOf('>', scriptStart) + 1, html.indexOf('</script>', scriptStart));

function clientFunctionSource(source, name) {
  const start = source.indexOf(`function ${name}(`), open = source.indexOf('{', start);
  assert(start >= 0 && open > start, `missing generated client function ${name}`);
  let depth = 0;
  for (let at = open; at < source.length; at += 1) {
    if (source[at] === '{') depth += 1;
    if (source[at] === '}' && --depth === 0) return source.slice(start, at + 1);
  }
  throw new Error(`unterminated generated client function ${name}`);
}

assert(client.includes("for(const type of ['pointerdown','click','wheel','selectstart'])collisionContextMenu.addEventListener(type,protectCollisionContextInteraction)"), 'the generated menu owns pointer, click, wheel, and text-selection interaction');
assert(client.includes("document.addEventListener('pointerdown',dismissCollisionContextFromPointer)") && client.includes("document.addEventListener('click',dismissCollisionContextFromPointer)"), 'genuine outside pointer and click routes use one guarded dismissal function');
assert(client.includes('openCollisionContextFocus();positionCollisionContext(event.clientX,event.clientY)'), 'opening at the pointer retains focus ownership before clamped positioning');
assert(!client.includes("addEventListener('scroll',closeCollisionContext") && !client.includes("addEventListener('resize',closeCollisionContext"), 'interior scroll/focus movement and window resizing cannot silently dismiss the panel');
assert(client.includes("document.getElementById('collisionContextAppearance').onclick=focusCollisionAppearanceFromContext"), 'Color & thickness routes to the real appearance focus function');
assert(!client.includes("document.getElementById('collisionContextCut').onclick=()=>{cutCollisionSelection();closeCollisionContext()}") && !client.includes("document.getElementById('collisionContextPaste').onclick=()=>{pasteCollisionSelection();closeCollisionContext()}"), 'cut and paste no longer close the menu before showing their result');
assert(!client.includes("applyModel=(...args)=>{closeCollisionContext();return applyModelBeforeCollisionContext") && client.includes("applyModel=(...args)=>{const snapshot=collisionContextSelectionSnapshot(),result=applyModelBeforeCollisionContext(...args);restoreCollisionContextAfterSelection(snapshot);return result}"), 'an asynchronous model response retains or invalidates the menu instead of unconditionally closing it');
assert(client.includes("selectAction=(...args)=>{const snapshot=collisionContextSelectionSnapshot()") && client.includes("selectFrame=(...args)=>{const snapshot=collisionContextSelectionSnapshot()"), 'internal action and frame selection routes preserve the open panel through their refresh');
assert(client.includes("collisionContextStatus.textContent='Collision appearance screen opened."), 'the appearance route reports that its dedicated screen opened');
assert(client.includes("Collision appearance screen is unavailable. Reopen the AIR Viewer"), 'the appearance route reports failure without dismissing the panel');
assert(client.includes("collisionAppearanceDialog.showModal()") && client.includes('syncCollisionAppearanceDialog()'), 'the context action opens a synchronized modal screen instead of exposing covered sidebar controls');
assert(client.includes("applyCollisionAppearance(appearanceDialogValue())"), 'dialog changes reuse the persisted live-preview appearance path');
assert(html.includes('id="collisionContextDragHandle" class="collision-context-title" role="group"') && html.includes('Drag to move this panel'), 'the generated panel exposes a discoverable named drag handle');

const interior = { id: 'interior' };
const opener = { isConnected: true, focused: 0, focus() { this.focused += 1; } };
const menu = {
  hidden: false,
  classList: { remove() {} },
  contains(target) { return target === interior; }
};
let draws = 0;
const dismissalContext = {
  collisionContextMenu: menu,
  collisionContextHover: { box: [0, 0, 1, 1] },
  collisionContextReturnFocus: opener,
  collisionContextDrag: null,
  document: { activeElement: interior, getElementById() { return null; } },
  draw() { draws += 1; }
};
vm.createContext(dismissalContext);
vm.runInContext([
  clientFunctionSource(client, 'clearCollisionAppearanceDestination'),
  clientFunctionSource(client, 'closeCollisionContext'),
  clientFunctionSource(client, 'collisionContextEventInside'),
  clientFunctionSource(client, 'protectCollisionContextInteraction'),
  clientFunctionSource(client, 'dismissCollisionContextFromPointer')
].join(';'), dismissalContext);

assert.strictEqual(dismissalContext.dismissCollisionContextFromPointer({ target: interior }), false, 'an interior pointer does not dismiss the menu');
assert.strictEqual(menu.hidden, false);
assert.strictEqual(dismissalContext.dismissCollisionContextFromPointer({ target: {}, composedPath: () => [interior, menu] }), false, 'a composed event path owned by the menu is treated as interior');
let propagationStopped = false;
dismissalContext.protectCollisionContextInteraction({ stopPropagation() { propagationStopped = true; } });
assert.strictEqual(propagationStopped, true, 'interior interaction is prevented from reaching outside-dismiss handlers');
assert.strictEqual(dismissalContext.dismissCollisionContextFromPointer({ target: { id: 'host-action' }, isTrusted: false, composedPath: () => [] }), false, 'a programmatic host/review action cannot masquerade as a genuine outside click');
assert.strictEqual(menu.hidden, false);
assert.strictEqual(dismissalContext.dismissCollisionContextFromPointer({ target: { id: 'outside' }, composedPath: () => [] }), true, 'a genuine outside pointer dismisses the menu');
assert.strictEqual(menu.hidden, true);
assert.strictEqual(opener.focused, 1, 'explicit outside dismissal restores the invoking control when focus was inside');
assert.strictEqual(draws, 1, 'outside dismissal redraws once to clear the hover preview');

const retainedMenu = { hidden: false };
const retainedStatus = { textContent: '' };
const retainedSource = { value: 'old', disabled: false };
const retainedSelect = { disabled: false };
const retainedStage = { disabled: false };
const retentionContext = {
  collisionContextMenu: retainedMenu, collisionContextItem: { kind: 'clsn1' }, collisionContextHover: { kind: 'clsn1' }, collisionContextPending: {},
  collisionContextSource: retainedSource, collisionContextStatus: retainedStatus,
  action: { number: 9 }, frameIndex: 0, draw() {},
  document: { getElementById(id) { return id === 'collisionContextSelect' ? retainedSelect : retainedStage; } }
};
vm.createContext(retentionContext);
vm.runInContext([
  clientFunctionSource(client, 'invalidateCollisionContext'),
  clientFunctionSource(client, 'restoreCollisionContextAfterSelection')
].join(';'), retentionContext);
retentionContext.restoreCollisionContextAfterSelection({ action: 8, frameIndex: 0, item: null });
assert.strictEqual(retainedMenu.hidden, false, 'an asynchronous selection/model change invalidates stale content without dismissing the panel');
assert.match(retainedStatus.textContent, /animation or frame changed/, 'selection invalidation leaves visible refresh guidance');
assert(retainedSource.disabled && retainedSelect.disabled && retainedStage.disabled, 'stale source actions fail closed while the panel remains available');

function classList(...initial) {
  const values = new Set(initial);
  return { add(...names) { names.forEach((name) => values.add(name)); }, remove(...names) { names.forEach((name) => values.delete(name)); }, toggle(name, force) { if (force === undefined ? !values.has(name) : force) values.add(name); else values.delete(name); return values.has(name); }, contains(name) { return values.has(name); } };
}
function tab(panel, active = false) {
  return { dataset: { panel }, classList: classList('tab', ...(active ? ['active'] : [])), attrs: {}, tabIndex: active ? 0 : -1, setAttribute(name, value) { this.attrs[name] = value; } };
}
const status = { textContent: '' };
const frameTab = tab('framePanel', true), collisionTab = tab('collisionPanel');
const framePanel = { hidden: false, classList: classList('panel', 'active') };
const collisionPanel = { hidden: true, classList: classList('panel') };
const appearance = { hidden: true, classList: classList('collision-appearance'), scrolled: 0, scrollIntoView(options) { this.scrolled += 1; this.options = options; } };
const opacity = { focused: 0, focus(options) { this.focused += 1; this.options = options; } };
const appearanceButton = { textContent: 'Color & thickness…', focus() {} };
const dialogLineWidth = { focused: 0, focus() { this.focused += 1; } };
const dialogStatus = { textContent: '' };
const appearanceDialog = { open: false, offsetWidth: 300, offsetHeight: 240, style: {}, classList: classList('collision-appearance-dialog'), closeCalls: [], showModal() { this.open = true; }, close(value) { this.closeCalls.push(value); this.open = false; }, getBoundingClientRect() { return { left: Number.parseFloat(this.style.left) || 250, top: Number.parseFloat(this.style.top) || 180 }; } };
const dragHandle = { captured: [], released: [], setPointerCapture(id) { this.captured.push(id); }, releasePointerCapture(id) { this.released.push(id); } };
const appearanceDragHandle = { captured: [], released: [], setPointerCapture(id) { this.captured.push(id); }, releasePointerCapture(id) { this.released.push(id); } };
const appearanceClose = {}, appearanceDone = {};
const routedMenu = { hidden: false, offsetWidth: 310, offsetHeight: 300, style: {}, classList: classList('collision-context-menu'), getBoundingClientRect() { return { left: Number.parseFloat(this.style.left) || 100, top: Number.parseFloat(this.style.top) || 100 }; } };
const nodes = { collisionPanel, framePanel, collisionAppearanceControls: appearance, collisionOpacityValue: opacity, collisionContextAppearance: appearanceButton, collisionAppearanceDialogClose: appearanceClose, appearanceDialogDone: appearanceDone, appearanceDialogStatus: dialogStatus, appearanceDialogLineWidth: dialogLineWidth };
const appearanceDocument = {
  getElementById(id) { return nodes[id] || null; },
  querySelector(selector) { return selector === '.tab[data-panel="collisionPanel"]' ? collisionTab : null; },
  querySelectorAll(selector) { if (selector === '.tab[data-panel]') return [frameTab, collisionTab]; if (selector === '.panel') return [framePanel, collisionPanel]; return []; }
};
let dialogSyncs = 0;
const appearanceState = {};
const appearanceContext = { collisionAppearanceDialog: appearanceDialog, collisionAppearanceDialogDragHandle: appearanceDragHandle, collisionAppearanceDialogPosition: null, collisionAppearanceDialogDrag: null, vscode: { getState() { return appearanceState; }, setState(value) { Object.assign(appearanceState, value); } }, innerWidth: 800, innerHeight: 600, syncCollisionAppearanceDialog() { dialogSyncs += 1; }, requestAnimationFrame(callback) { callback(); }, collisionContextStatus: status, collisionContextMenu: routedMenu, collisionContextPosition: null, collisionContextDrag: null, collisionContextDragHandle: dragHandle, document: appearanceDocument, window: { innerWidth: 800, innerHeight: 600 } };
vm.createContext(appearanceContext);
vm.runInContext([
  clientFunctionSource(client, 'switchRightPanel'),
  clientFunctionSource(client, 'clampCollisionContextPosition'),
  clientFunctionSource(client, 'positionCollisionContext'),
  clientFunctionSource(client, 'beginCollisionContextDrag'),
  clientFunctionSource(client, 'moveCollisionContextDrag'),
  clientFunctionSource(client, 'finishCollisionContextDrag'),
  clientFunctionSource(client, 'clampCollisionAppearanceDialogPosition'),
  clientFunctionSource(client, 'positionCollisionAppearanceDialog'),
  clientFunctionSource(client, 'placeCollisionAppearanceDialog'),
  clientFunctionSource(client, 'beginCollisionAppearanceDialogDrag'),
  clientFunctionSource(client, 'moveCollisionAppearanceDialogDrag'),
  clientFunctionSource(client, 'finishCollisionAppearanceDialogDrag'),
  clientFunctionSource(client, 'focusCollisionAppearanceFromContext'),
  "document.getElementById('collisionContextAppearance').onclick=focusCollisionAppearanceFromContext",
  "document.getElementById('collisionAppearanceDialogClose').onclick=()=>collisionAppearanceDialog.close('close')",
  "document.getElementById('appearanceDialogDone').onclick=()=>collisionAppearanceDialog.close('done')"
].join(';'), appearanceContext);
assert.strictEqual(appearanceButton.onclick(), true, 'clicking the generated Color & thickness button reports a successful route');
assert.strictEqual(appearanceDialog.open, true, 'the dedicated collision appearance screen is modal and visible');
assert.strictEqual(dialogSyncs, 1, 'the dedicated screen starts from the current persisted appearance');
assert.strictEqual(dialogLineWidth.focused, 1, 'the line-thickness control receives initial focus');
assert.match(status.textContent, /Collision appearance screen opened/, 'the context panel reports the dedicated screen destination');
assert.strictEqual(appearanceDialog.style.left, '250px');
assert.strictEqual(appearanceDialog.style.top, '180px');
appearanceClose.onclick();assert.deepStrictEqual(appearanceDialog.closeCalls, ['close'], 'the top-right X explicitly closes the appearance dialog');
appearanceDialog.showModal();appearanceDone.onclick();assert.deepStrictEqual(appearanceDialog.closeCalls, ['close','done'], 'Done explicitly closes the appearance dialog');

const appearanceDragStart = { button: 0, pointerId: 9, clientX: 260, clientY: 190, target: { closest() { return null; } }, preventDefault() {}, stopPropagation() {} };
appearanceDialog.showModal();appearanceContext.beginCollisionAppearanceDialogDrag(appearanceDragStart);assert.deepStrictEqual(appearanceDragHandle.captured,[9]);assert(appearanceDialog.classList.contains('dragging'));
appearanceContext.moveCollisionAppearanceDialogDrag({pointerId:9,clientX:2000,clientY:2000,preventDefault(){},stopPropagation(){}});assert.strictEqual(appearanceDialog.style.left,'492px','appearance dragging clamps the full dialog inside the viewport');assert.strictEqual(appearanceDialog.style.top,'352px');
appearanceContext.finishCollisionAppearanceDialogDrag({pointerId:9,preventDefault(){},stopPropagation(){}});assert.deepStrictEqual(appearanceDragHandle.released,[9]);assert.strictEqual(appearanceState.collisionAppearanceDialogPosition.left,492);assert.strictEqual(appearanceState.collisionAppearanceDialogPosition.top,352,'the moved appearance position is remembered');
appearanceContext.beginCollisionAppearanceDialogDrag({...appearanceDragStart,pointerId:10,target:{closest(selector){return selector==='button'?appearanceClose:null}}});assert.deepStrictEqual(appearanceDragHandle.captured,[9],'pressing the X never starts panel dragging');

let prevented = 0, stopped = 0;
const dragStart = { button: 0, pointerId: 4, clientX: 110, clientY: 110, target: { closest() { return null; } }, preventDefault() { prevented += 1; }, stopPropagation() { stopped += 1; } };
assert.strictEqual(appearanceContext.beginCollisionContextDrag(dragStart), true, 'the generated header starts pointer-captured dragging');
assert.deepStrictEqual(dragHandle.captured, [4]);
assert(routedMenu.classList.contains('dragging'));
assert.strictEqual(appearanceContext.moveCollisionContextDrag({ pointerId: 4, clientX: 2000, clientY: 2000, preventDefault() { prevented += 1; }, stopPropagation() { stopped += 1; } }), true);
assert.strictEqual(routedMenu.style.left, '482px', 'dragging clamps the complete panel within the viewport horizontally');
assert.strictEqual(routedMenu.style.top, '292px', 'dragging clamps the complete panel within the viewport vertically');
assert.strictEqual(appearanceContext.finishCollisionContextDrag({ pointerId: 4, preventDefault() { prevented += 1; }, stopPropagation() { stopped += 1; } }), true);
assert.deepStrictEqual(dragHandle.released, [4]);
assert(!routedMenu.classList.contains('dragging') && prevented === 3 && stopped === 3, 'dragging ends cleanly without leaking canvas/outside-dismiss interaction');
assert.strictEqual(appearanceContext.beginCollisionContextDrag({ ...dragStart, pointerId: 5, target: { closest(selector) { return selector === 'button' ? appearanceButton : null; } } }), false, 'header buttons preserve click behavior instead of starting a drag');
assert(client.includes("addEventListener('resize',()=>{if(!collisionContextMenu.hidden&&collisionContextPosition)positionCollisionContext"), 'resize reapplies and clamps the retained open-panel position');

appearanceContext.collisionAppearanceDialog = null;
status.textContent = '';
assert.strictEqual(appearanceButton.onclick(), false, 'a missing appearance destination fails closed');
assert.match(status.textContent, /unavailable/, 'a missing destination leaves visible recovery feedback');

console.log('AIR collision context-menu client tests passed');
