'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {};
  return originalLoad.call(this, request, parent, isMain);
};
const { viewerHtml, airRestoreStatusHtml, inferCharacterFiles, existingAirSourceColumn, previousCollisionCopyPlan, collisionClipboardMutationPlan, normalizeCollisionAppearancePreference, decodeCollisionAppearancePreference } = require('../src/air_viewer');
const { workspaceExperience } = require('../src/experience_model');
Module._load = originalLoad;
const viewerSource = fs.readFileSync(path.join(__dirname, '../src/air_viewer.js'), 'utf8');
const normalizedAppearance = normalizeCollisionAppearancePreference({ opacity: 2, lineWidth: 20, scaleWithZoom: true, colors: { clsn1: '#ABCDEF', clsn1Default: 'bad', clsn2: '#123456', clsn2Default: '#654321', push: '#00ff00' } });
assert.deepStrictEqual({ opacity: normalizedAppearance.opacity, lineWidth: normalizedAppearance.lineWidth, scaleWithZoom: normalizedAppearance.scaleWithZoom, colors: normalizedAppearance.colors }, { opacity: 1, lineWidth: 8, scaleWithZoom: true, colors: { clsn1: '#abcdef', clsn1Default: '#ffd84a', clsn2: '#123456', clsn2Default: '#654321', push: '#00ff00' } });
assert.strictEqual(decodeCollisionAppearancePreference({ schema: 'wrong', version: 99, value: normalizedAppearance }).configured, false, 'unknown stored appearance schemas safely fall back instead of breaking AIR startup');
const restoreLoading = airRestoreStatusHtml('Restoring AIR viewer…', 'Loading exact source state.');
const restoreFailure = airRestoreStatusHtml('AIR viewer could not be restored', 'Close and reopen.', true);
assert.match(restoreLoading, /role="status" aria-live="polite"/);
assert.match(restoreLoading, /Restoring AIR viewer/);
assert.match(restoreFailure, /vscode-errorForeground/);
assert(!restoreLoading.includes('<script'), 'the immediate AIR restoration surface remains independent of webview scripts');
assert(viewerSource.indexOf("panel.webview.html = airRestoreStatusHtml('Restoring AIR viewer") < viewerSource.indexOf('const airPath = state && state.airPath'), 'AIR restoration publishes a visible loading surface before resolving retained files');

const airPath = path.join('C:', 'game', 'chars', 'Ryu', 'Anim.air');
assert.strictEqual(existingAirSourceColumn(airPath, [{ document: { fileName: airPath }, viewColumn: 3 }], []), 3, 'an already visible AIR source must be reused');
assert.strictEqual(existingAirSourceColumn(airPath, [], [{ viewColumn: 4, tabs: [{ input: { uri: { fsPath: airPath } } }] }]), 4, 'an existing AIR tab must be reused even when it is not the active tab');
assert.strictEqual(existingAirSourceColumn(airPath, [], []), 0, 'a new source column is only chosen when the AIR has no existing tab');

const nested = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemen-air-nested-'));
try {
  const files = path.join(nested, 'Example', 'files');
  fs.mkdirSync(files, { recursive: true });
  const air = path.join(files, 'animation.air'), sff = path.join(files, 'sprite.sff');
  fs.writeFileSync(air, '[Begin Action 0]\n0,0,0,0,1\n');
  fs.writeFileSync(sff, 'fixture');
  fs.writeFileSync(path.join(nested, 'Example', 'Example.def'), '[Files]\nanim = files/animation.air\nsprite = files/sprite.sff\n');
  assert.strictEqual(inferCharacterFiles(air).sffPath, sff);
} finally { fs.rmSync(nested, { recursive: true, force: true }); }

const sharedFx = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemen-air-shared-fx-'));
try {
  const air = path.join(sharedFx, 'sf6.air'), sff = path.join(sharedFx, 'SF6.sff');
  fs.writeFileSync(air, '[Begin Action 8000]\n8000,0,0,0,2\n');
  fs.writeFileSync(sff, 'fixture');
  fs.writeFileSync(path.join(sharedFx, 'sf6fx.def'), '[Files]\nair = sf6.air\nsff = SF6.sff\n');
  assert.strictEqual(inferCharacterFiles(air).sffPath, sff, 'shared FX DEF air/sff keys should resolve like character anim/sprite keys');
} finally { fs.rmSync(sharedFx, { recursive: true, force: true }); }

const html = viewerHtml({ title: 'Anim.air', airPath: 'Anim.air', sffPath: 'Sprite.sff', palettes: [{ index: 0, group: 1, number: 1 }], actions: [{ number: 0, line: 1, loopStart: 0, frames: [{ group: 0, index: 0, x: 0, y: 0, time: 1, flags: '', line: 2, clsn1: [], clsn2: [], clsn1Source: 'none', clsn2Source: 'none', clsn1Line: null, clsn2Line: null }] }] });
assert(html.includes('compactActionScroll.onchange=')&&html.includes('compactFrameScroll.onchange='), 'discrete AIR action/frame sliders commit once after drag');
assert(html.includes('Connected AIR') && html.includes("type:'openConnectedAir'"), 'AIR exposes connected animation files through an explicit selector');
assert(html.includes('option.disabled=item.available===false')&&html.includes("readout.setAttribute('aria-live','polite')")&&html.includes("unavailable?' · '+unavailable.reason"),'unavailable connected AIR assignments expose their reason visibly and through a live status instead of only a disabled option tooltip');
assert(!html.includes('compactFrameScroll.oninput=event=>selectFrame'), 'AIR frame dragging must not repeatedly rebuild the preview');
assert(html.includes('<details id="actionReferences">') && html.includes('id="openAnimationReferences"') && html.includes('id="openCollisionReferences"'), 'selected-Action references stay compact and deep-link to either shared browser tab');
assert(html.includes('N/A means no connection was identified') && html.includes("referenceView:'animations'") && html.includes("referenceView:'collision'"), 'the compact summary uses honest N/A wording and explicit browser-tab routes');
assert(html.includes('Additional collision hints (heuristic)') && html.includes("!['overrideclsn','transformclsn'].includes") && !html.includes("open.textContent='Open source'"), 'reviewed collision families are removed from the heuristic duplicate list and its unvalidated source button is absent');
assert(html.includes('related collision') && html.includes('uncertain whole-character collision row(s) remain separate'), 'compact collision counts remain conservative and keep whole-character uncertainty separate');
assert(viewerSource.includes("ownerDef: session.defPath || ''") && viewerSource.includes("referenceView: message.referenceView === 'collision' ? 'collision' : 'animations'"), 'main AIR deep-links retain the exact owner DEF and explicit browser tab');
assert(viewerSource.includes('session.defPath && path.resolve(session.defPath) === changed') && viewerSource.includes('onDidDeleteFiles') && viewerSource.includes('onDidRenameFiles'), 'DEF/source changes, deletion, and rename refresh the compact immutable snapshot');
const nightlyHtml = viewerHtml({ title: 'Nightly.air', airPath: 'Nightly.air', sffPath: '', palettes: [], actions: [], dummyCollision: { enabled: true, reason: 'Nightly target.' } });
const indexedHtml = viewerHtml({ title: 'Indexed.air', airPath: 'Indexed.air', sffPath: '', palettes: [], actions: [], dummyCollision: { enabled: true, reason: 'Nightly target.' }, collisionCapabilities: { indexed: true, status: 'verified', reason: 'Verified Nightly target.', target: { buildId: 'nightly-test' }, fingerprint: 'fixture' } });
assert(!html.includes('<option>Dummy</option>'), 'stable/default AIR views must not expose Nightly-only Dummy collision choices');
assert(nightlyHtml.includes('<option>Dummy</option>'), 'Nightly AIR views expose Dummy in existing collision group dropdowns');
assert(nightlyHtml.includes('Nightly-only custom logic collision group'));
assert(!html.includes('id="indexedCollisionPanel"'), 'stable targets keep develop-only exact-index controls hidden');
for (const text of ['id="indexedCollisionPanel"', 'value="hitbyindex"', 'value="nothitbyindex"', 'value="reversaldef"', 'value="modifyreversaldef"', 'value="projectilecontact"', 'id="bridgeRequire"']) assert(indexedHtml.includes(text), `verified Nightly AIR view is missing ${text}`);
const indexedScript = [...indexedHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
assert.strictEqual(indexedScript.length, 1);
assert.doesNotThrow(() => new vm.Script(indexedScript[0][1]), 'verified indexed AIR client must remain valid JavaScript');
assert(html.includes('/^-?\\d+$/'), 'generated AIR viewer must preserve the numeric-validation regex backslash');
const allowedStyleNonce = /style-src 'nonce-([^']+)'/.exec(html)[1];
  for (const [, attrs] of html.matchAll(/<style\b([^>]*)>/g)) assert(attrs.includes('nonce=\"' + allowedStyleNonce + '\"'), 'shared styles must satisfy the rendered content security policy');
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
assert.strictEqual(scripts.length, 1);
assert.doesNotThrow(() => new vm.Script(scripts[0][1]));
for (const id of ['actionSort', 'showActionThumbs', 'newAction', 'newActionDialog', 'newActionNumber', 'newActionNextFree', 'newActionComment', 'newActionGroup', 'newActionIndex', 'newActionX', 'newActionY', 'newActionTime', 'newActionFlags', 'newActionLoop', 'newActionHint', 'newActionPreview', 'newActionReview', 'newActionCancel', 'duplicateAction', 'deleteSelectedActions', 'markVisibleActions', 'clearActionMarks', 'actionSelectionStatus', 'proofBackground', 'proofColor', 'exportPreview', 'exportActionSequence', 'canvas', 'strip', 'collisionPanel', 'inspectCollisions', 'collisionOpacity', 'collisionOpacityValue', 'collisionLineWidth', 'collisionLineWidthValue', 'collisionScaleWidth', 'collisionColorClsn1', 'collisionColorClsn1Default', 'collisionColorClsn2', 'collisionColorClsn2Default', 'collisionColorPush', 'resetCollisionAppearance', 'pushPanel', 'runtimePanel', 'sourcePanel', 'sourceConfidence', 'sourceFindings', 'rulesPanel', 'layerPanel', 'palette', 'shaderWorkshop', 'onion', 'goCode', 'frameGroup', 'frameIndexValue', 'frameX', 'frameY', 'frameTime', 'frameFlags', 'frameBlend', 'frameScaleX', 'frameScaleY', 'frameAngle', 'applyFrame', 'addFrame', 'duplicateFrame', 'moveFrameEarlier', 'moveFrameLater', 'deleteFrame', 'batchFrameProperties', 'editKind', 'editScope', 'addBox', 'deleteBox', 'applyBoxEdit', 'revertBoxEdit', 'collisionOwnershipChip', 'collisionAffectedStatus', 'collisionEditReview', 'collisionEditReviewSummary', 'collisionEditReviewBefore', 'collisionEditReviewReplacement', 'applyReviewedCollisionEdit', 'returnCollisionDefaults', 'cancelCollisionReview', 'showPush', 'editBaselinePush', 'editFramePush', 'bridgeKind', 'copyBridge', 'gifToAir', 'actionLog']) assert(html.includes(`id="${id}"`), `missing ${id}`);
assert(html.includes('Scale line width with zoom') && html.includes('appearance.scaleWithZoom?appearance.lineWidth:appearance.lineWidth/zoom'), 'collision outlines expose explicit fixed-screen or zoom-scaled thickness');
assert(html.includes("vscode.postMessage({type:'saveCollisionAppearance',value})") && html.includes('saved.collisionAppearance||model.collisionAppearance||collisionAppearanceDefaults'), 'collision appearance persists in both retained webview state and host-backed AIR preferences across reload or reopen');
assert(html.includes('appearance.colors.clsn1Default') && html.includes('appearance.colors.clsn2Default') && html.includes('appearance.colors.push'), 'authored, default, and push-box overlays use the selected preview colors');
assert(html.includes('Parsed AIR collision preview') && html.includes('Pre-runtime target projection') && html.includes("type:'openCollisionBrowser'"), 'the main AIR viewer labels the preview honestly and uses one compact handoff into the shared collision browser');
assert(!html.includes('data-panel="rulesPanel">Rules</button>'), 'the legacy broad Rules workflow is not a visible main-viewer tab');
assert(indexedHtml.includes("collisionMode:'properties'"), 'the exact indexed collision action hands off to the shared compact Properties subview');
assert(html.includes('class="launch-controls"'), 'AIR must retain the shared viewer toolbar before its client bindings initialize');
assert(html.includes('data-universal-slot="animations"'), 'AIR must retain connected-viewer navigation in its canonical primary slot');
assert(html.includes('data-ikemen-destination="sff" id="openSff"'));
assert(html.includes("document.getElementById('openSff').onclick="), 'Open SFF must retain its AIR viewer click binding');
assert(html.includes("vscode.postMessage({type:'shaderPreview',action:action.number,frameIndex})"), 'AIR Shader Workshop action sends only host-resolved selection coordinates');
assert(html.includes("manualPaletteIndex=null,onionDepth=Math.max(0,Math.min(2,Number(saved.onionDepth)||0))") && html.indexOf('onionDepth=Math.max') < html.indexOf('function saveAirView'), 'onion-skin state must be declared before startup persistence and initial AIR rendering');
assert(html.includes('data-ikemen-destination="palette" id="palFx"'));
assert(html.includes('data-ikemen-destination="code" id="airSource"'));
assert(html.includes("selectedActions:new Set") || html.includes('selectedActions:[...selectedActions]'));
assert(html.includes("type:'exportPreview'"));
assert(html.includes("type:'exportActionSequence'"));
assert(viewerSource.includes('planAirActionSequence') && viewerSource.includes('executeAirActionSequence'), 'AIR animation export uses a reviewed source-bound plan and transactional writer');
assert(!html.includes('id="deleteActions"'));
assert(html.includes('saved.sourceFingerprint===model.sourceFingerprint'));
assert(html.includes('sourceFingerprint:model.sourceFingerprint'));
assert(html.includes('chooseScope:true'));
assert(html.includes('visibleActions:visibleActions().map'));
assert(html.includes('webviewSection":"airActions'));
assert(html.includes("event.key!=='Delete'"));
assert(html.includes("event.target.closest('.frame')"), 'Delete on a timeline frame must not delete its whole animation');
assert(html.includes("event.ctrlKey||event.metaKey"));
assert(html.includes('event.shiftKey&&actionAnchor!==null'));
assert(html.includes("type:'actionThumbnails'"));
assert(html.includes("type:'batchClsn2'"), 'visual AIR bulk Clsn2 must use its own source-bound host request');
assert(html.includes("type:'batchFrameProperties'"), 'marked AIR element properties must use their own reviewed host request');
assert(html.includes('onionDepth?{action:action.number,frameIndex,depth:onionDepth}:null'), 'onion skin requests are bounded to the current action and element');
assert(html.includes("filter(e=>e.onion)"), 'onion frames render separately from the current element and optional sprite layers');
assert(html.includes('pendingGuardPassed:true'), 'visual AIR bulk Clsn2 must pass the shared pending-edit guard first');
assert(html.includes('actionText:action.sourceText'), 'visual AIR bulk Clsn2 must send the displayed action snapshot for host validation');
assert(!html.includes("getElementById('batchClsn2').onclick=()=>vscode.postMessage({type:'command',command:'air.batchApplyClsn2'})"), 'visual bulk Clsn2 must not borrow the active text editor command');
const client = scripts[0][1], mutationStart = client.indexOf('function beginActionMutation(message)'), mutationEnd = client.indexOf("document.getElementById('markVisibleActions')", mutationStart);
assert(mutationStart >= 0 && mutationEnd > mutationStart, 'action lifecycle dispatch block must be present in the generated client');
const lifecycleElements = new Map(), lifecycleMessages = [], lifecycleContext = {
  actionMutationBusy: false, actionMutationSerial: 0, action: { number: 0, frames: [{ group: 0, index: 0, x: 1, y: 2, rawTime: 3, flags: 'H' }] }, frameIndex: 0, model: { actions: [{ number: 0 }] }, playing: true,
  navigationAllowed: () => true, updateActionSelection() {}, requestActionDeletion() { this.deleted = true; },
  document: { getElementById(id) { if (!lifecycleElements.has(id)) lifecycleElements.set(id, { value: '', checked: false, disabled: false, textContent: '', focus() { this.focused = true; }, showModal() { this.open = true; }, close() { this.open = false; } }); return lifecycleElements.get(id); } },
  vscode: { postMessage(message) { lifecycleMessages.push(message); } }
};
vm.createContext(lifecycleContext); vm.runInContext(client.slice(mutationStart, mutationEnd), lifecycleContext);
lifecycleElements.get('newAction').onclick();
assert.strictEqual(lifecycleElements.get('newActionDialog').open, true, 'New Action opens one reviewed form instead of a chain of prompts');
assert.strictEqual(lifecycleElements.get('newActionGroup').value, '0', 'New Action starts from the current frame sprite when available');
assert.match(lifecycleElements.get('newActionPreview').textContent, /\[Begin Action 1\]\n0, 0, 1, 2, 3, H/, 'New Action shows the exact proposed AIR block before host confirmation');
lifecycleElements.get('newActionReview').onclick();
assert.strictEqual(lifecycleMessages.at(-1).type, 'createAction', 'reviewed New Action dispatches the create lifecycle request');
assert.deepStrictEqual({ number: lifecycleMessages.at(-1).draft.number, group: lifecycleMessages.at(-1).draft.group, flags: lifecycleMessages.at(-1).draft.flags }, { number: 1, group: 0, flags: 'H' }, 'reviewed New Action sends the exact form draft');
const afterCreate = lifecycleMessages.length; lifecycleElements.get('newAction').onclick();
assert.strictEqual(lifecycleMessages.length, afterCreate, 'a pending action lifecycle request serializes later button presses');
vm.runInContext('actionMutationBusy=false', lifecycleContext); lifecycleElements.get('duplicateAction').onclick();
assert.deepStrictEqual({ type: lifecycleMessages.at(-1).type, sourceAction: lifecycleMessages.at(-1).sourceAction }, { type: 'duplicateAction', sourceAction: 0 }, 'Duplicate targets the exact active action, including Action 0');
assert(client.includes("if(m.actionRequestId!==undefined&&Number(m.actionRequestId)===actionMutationSerial){actionMutationBusy=false;updateActionSelection()}"), 'host failure releases lifecycle busy state without altering selection');
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
const saveClientElements = new Map([
  ['airSaveStatus', { textContent: '', title: '' }],
  ['saveAir', { disabled: true }],
  ['frameGroup', { value: 'newer unapplied value' }]
]);
let saveStatusListener;
const saveClientContext = {
  model: { airPath: 'Anim.air' }, airSavePending: true,
  document: { getElementById(id) { return saveClientElements.get(id); } },
  window: { addEventListener(_type, callback) { saveStatusListener = callback; } },
  visibleActions: () => [], navigationAllowed: () => true
};
vm.createContext(saveClientContext);
vm.runInContext(clientFunctionSource(client, 'renderAirSaveState') + clientFunctionSource(client, 'stepAction') + "window.addEventListener('message',event=>{const message=event.data;if(message.type==='sourceSaveStatus'){airSavePending=false;renderAirSaveState(message.state,message.message||'')}if(message.type==='model'&&message.model?.sourceState)renderAirSaveState(message.model.sourceState)});", saveClientContext);
saveStatusListener({ data: { type: 'sourceSaveStatus', state: { available: true, dirty: false, filename: 'Anim.air' }, message: 'Anim.air saved to disk.' } });
assert.strictEqual(saveClientElements.get('frameGroup').value, 'newer unapplied value', 'a save-only status update must not rebuild or overwrite newer AIR frame fields');
assert.strictEqual(saveClientContext.airSavePending, false, 'the matching save acknowledgment releases the client save button');
assert.strictEqual(saveClientElements.get('saveAir').disabled, true, 'a clean AIR source keeps Save AIR disabled');
assert.match(saveClientElements.get('saveAir').title, /no unsaved document changes/i, 'a clean AIR source explains why Save AIR is disabled');

const availabilityElements = new Map();
for (const id of ['play', 'prev', 'next', 'exportActionSequence', 'shaderWorkshop', 'airSource', 'airTextEdit', 'openSff', 'saveAirGroupPalette', 'clearAirGroupPalette']) availabilityElements.set(id, { disabled: false, title: id, dataset: {} });
const availabilityContext = { action: null, frameIndex: 0, document: { getElementById(id) { return availabilityElements.get(id); } } };
vm.createContext(availabilityContext);
vm.runInContext(clientFunctionSource(client, 'current') + clientFunctionSource(client, 'setDisabledReason') + clientFunctionSource(client, 'updateActionAvailability'), availabilityContext);
availabilityContext.updateActionAvailability();
assert([...availabilityElements.values()].every(control => control.disabled), 'no-action AIR state disables every representative action/frame-dependent header route');
assert([...availabilityElements.values()].every(control => /Select or create an AIR animation first/.test(control.title)), 'no-action AIR state exposes one actionable enabling reason');
availabilityContext.action = { frames: [{ group: 0, index: 0 }] };
availabilityContext.updateActionAvailability();
assert([...availabilityElements.values()].every(control => !control.disabled), 'selecting a real AIR action/frame re-enables the representative header routes');
assert.strictEqual(availabilityElements.get('openSff').title, 'openSff', 're-enabled routes restore their original hover help instead of retaining the disabled reason');

function fakeTab(name) { return { name, attrs: {}, tabIndex: -1, clicked: 0, focused: 0, setAttribute(key, value) { this.attrs[key] = value; }, click() { this.clicked += 1; }, focus() { this.focused += 1; } }; }
const panelTabs = [fakeTab('Frame'), fakeTab('Collision'), fakeTab('Runtime')], panelTabContext = { airPanelTabs: panelTabs };
vm.createContext(panelTabContext); vm.runInContext(clientFunctionSource(client, 'activateAirPanelTab') + clientFunctionSource(client, 'navigateAirPanelTabs'), panelTabContext);
assert.strictEqual(panelTabContext.navigateAirPanelTabs(panelTabs[0], 'ArrowRight'), true, 'ArrowRight activates the next AIR side panel');
assert.deepStrictEqual(panelTabs.map(tab => [tab.attrs['aria-selected'], tab.tabIndex]), [['false', -1], ['true', 0], ['false', -1]], 'panel activation synchronizes aria-selected and the roving tab stop');
assert.strictEqual(panelTabs[1].focused, 1, 'keyboard panel navigation moves focus to the newly active tab');
panelTabContext.navigateAirPanelTabs(panelTabs[1], 'End');
assert.strictEqual(panelTabs[2].attrs['aria-selected'], 'true', 'End activates the final AIR side panel');
panelTabContext.navigateAirPanelTabs(panelTabs[2], 'Home');
assert.strictEqual(panelTabs[0].attrs['aria-selected'], 'true', 'Home returns to the first AIR side panel');
panelTabContext.navigateAirPanelTabs(panelTabs[0], 'ArrowLeft');
assert.strictEqual(panelTabs[2].attrs['aria-selected'], 'true', 'ArrowLeft wraps from the first to the final AIR side panel');

const opener = { isConnected: true, focused: 0, focus() { collisionFocusDocument.activeElement = this; this.focused += 1; } }, firstMenuAction = { hidden: false, focus() { collisionFocusDocument.activeElement = this; } }, lastMenuAction = { hidden: false, focus() { collisionFocusDocument.activeElement = this; } };
let collisionModalOpen = false;
const collisionFocusDocument = { activeElement: opener, getElementById() { return null; }, querySelector(selector) { return selector === 'dialog[open]' && collisionModalOpen ? {} : null; } }, collisionFocusMenu = { hidden: true, classList: { remove() {} }, contains(target) { return target === firstMenuAction || target === lastMenuAction; }, querySelectorAll() { return [firstMenuAction, lastMenuAction]; } }, collisionFocusContext = { collisionContextMenu: collisionFocusMenu, collisionContextBoxes: { querySelector() { return firstMenuAction; } }, document: collisionFocusDocument, requestAnimationFrame(callback) { callback(); }, draw() {} };
vm.createContext(collisionFocusContext); vm.runInContext('let collisionContextReturnFocus=null,collisionContextPending="pending",collisionContextHover={},collisionContextDrag=null;' + clientFunctionSource(client, 'collisionContextFocusables') + clientFunctionSource(client, 'openCollisionContextFocus') + clientFunctionSource(client, 'clearCollisionAppearanceDestination') + clientFunctionSource(client, 'closeCollisionContext') + clientFunctionSource(client, 'trapCollisionContextFocus'), collisionFocusContext);
collisionFocusContext.openCollisionContextFocus();
assert.strictEqual(collisionFocusMenu.hidden, false, 'opening the collision menu reveals the dialog');
assert.strictEqual(collisionFocusDocument.activeElement, firstMenuAction, 'opening the collision menu focuses its first usable action');
collisionFocusDocument.activeElement = lastMenuAction; let prevented = 0;
collisionFocusContext.trapCollisionContextFocus({ key: 'Tab', shiftKey: false, preventDefault() { prevented += 1; } });
assert.strictEqual(collisionFocusDocument.activeElement, firstMenuAction, 'Tab wraps from the last collision-menu action to the first');
collisionFocusContext.trapCollisionContextFocus({ key: 'Tab', shiftKey: true, preventDefault() { prevented += 1; } });
assert.strictEqual(collisionFocusDocument.activeElement, lastMenuAction, 'Shift+Tab wraps from the first collision-menu action to the last');
collisionModalOpen = true;
collisionFocusContext.trapCollisionContextFocus({ key: 'Escape', shiftKey: false, preventDefault() { prevented += 1; } });
assert.strictEqual(collisionFocusMenu.hidden, false, 'an open modal receives Escape without the underlying collision menu intercepting it');
assert.strictEqual(prevented, 2, 'the underlying collision menu does not suppress modal Escape dismissal');
collisionModalOpen = false;
collisionFocusContext.trapCollisionContextFocus({ key: 'Escape', shiftKey: false, preventDefault() { prevented += 1; } });
assert.strictEqual(collisionFocusMenu.hidden, true, 'Escape closes the collision context menu');
assert.strictEqual(collisionFocusDocument.activeElement, opener, 'Escape restores focus to the canvas/control that opened the collision menu');
assert.strictEqual(prevented, 3, 'wrapped Tab navigation and Escape suppress focus escape/default dismissal behavior');

const actionStatus = { textContent: '' };
const stepContext = { actionMutationBusy: true, action: { number: 0 }, document: { getElementById: () => actionStatus } };
vm.createContext(stepContext); vm.runInContext(clientFunctionSource(client, 'stepAction'), stepContext); stepContext.stepAction(1);
assert.match(actionStatus.textContent, /current animation edit/, 'Previous/Next Animation reports and blocks pending action mutations');
stepContext.actionMutationBusy = false; stepContext.navigationAllowed = () => false; stepContext.stepAction(1);
assert.match(actionStatus.textContent, /Finish or revert/, 'Previous/Next Animation gives actionable feedback for unfinished frame, box, or runtime drafts');
const navigationSource = clientFunctionSource(client, 'navigationAllowed'), navigationElements = new Map();
const navigationContext = {
  frameFormsDirty: () => false, frameFieldsTouched: false, frameAutoTimer: null,
  runtimeDrafts: { busy: () => false, dirty: () => true },
  runtimePrefix: () => 'anim.air|',
  editRequests: { busy: () => false },
  edit: null,
  document: { getElementById(id) { if (!navigationElements.has(id)) navigationElements.set(id, {}); return navigationElements.get(id); } }
};
vm.createContext(navigationContext); vm.runInContext(navigationSource, navigationContext);
assert.strictEqual(navigationContext.navigationAllowed(), true, 'recoverable saved frame-plan drafts must not trap the AIR viewer on one animation');
navigationContext.runtimeDrafts.busy = () => true;
assert.strictEqual(navigationContext.navigationAllowed(), false, 'an actively saving frame plan still serializes AIR navigation');
assert.match(navigationElements.get('runtimeInfo').textContent, /finish saving/, 'a genuinely busy frame-plan save explains the temporary navigation block');
const frameDirtyContext = { frameFieldsTouched: false, frameAutoTimer: null };
vm.createContext(frameDirtyContext); vm.runInContext(clientFunctionSource(client, 'frameFormsDirty'), frameDirtyContext);
assert.strictEqual(frameDirtyContext.frameFormsDirty(), false, 'an untouched rendered AIR frame never blocks animation navigation');
frameDirtyContext.frameFieldsTouched = true;
assert.strictEqual(frameDirtyContext.frameFormsDirty(), true, 'actual user frame-field input blocks navigation until applied or reverted');
frameDirtyContext.frameFieldsTouched = false; frameDirtyContext.frameAutoTimer = 1;
assert.strictEqual(frameDirtyContext.frameFormsDirty(), true, 'a pending automatic frame update serializes navigation');
const frameSelectionElements = new Map([['play', { textContent: 'Pause' }]]), frameSelectionCalls = { strip: 0, request: 0, schedule: 0, revoke: 0 };
const frameSelectionContext = {
  action: { frames: [{}, {}, {}] }, frameIndex: 0, playing: true, edit: { dirty: false },
  collisionViewerEditEpoch: 0, collisionEditPreparePending: { request: 1 },
  navigationAllowed: () => true,
  document: { getElementById(id) { return frameSelectionElements.get(id); } },
  canvas: { classList: { remove() {} } },
  clearCollisionEditReview() { frameSelectionCalls.revoke += 1; }, renderCollisionOwnership() {}, renderStrip() { frameSelectionCalls.strip += 1; }, requestFrame() { frameSelectionCalls.request += 1; }, schedule() { frameSelectionCalls.schedule += 1; }
};
vm.createContext(frameSelectionContext); vm.runInContext(clientFunctionSource(client, 'selectFrame'), frameSelectionContext);
assert.strictEqual(frameSelectionContext.selectFrame(2), true);
assert.strictEqual(frameSelectionContext.frameIndex, 2, 'manual timeline selection changes to the requested AIR frame');
assert.strictEqual(frameSelectionContext.playing, false, 'manual frame selection pauses playback so it remains visibly selected');
assert.strictEqual(frameSelectionElements.get('play').textContent, 'Play');
assert.deepStrictEqual(frameSelectionCalls, { strip: 1, request: 1, schedule: 1, revoke: 1 }, 'manual frame changes synchronously revoke any reviewed collision edit');
assert.strictEqual(frameSelectionContext.collisionEditPreparePending, null, 'manual frame changes also revoke any late authoritative collision seed');
frameSelectionContext.navigationAllowed = () => false;
assert.strictEqual(frameSelectionContext.selectFrame(1), false);
assert.strictEqual(frameSelectionContext.frameIndex, 2, 'a genuine pending edit still prevents destructive frame navigation');
const finishSource = clientFunctionSource(client, 'finishActionMutation');
function finishFixture({ actions, currentAction, response }) {
  const elements = new Map([['search', { value: 'filtered' }], ['newAction', { focusCount: 0, focus() { this.focusCount += 1; } }]]), selected = [], focused = [], calls = { clear: 0, renderActions: 0, renderStrip: 0, updates: 0 };
  const context = {
    actionMutationSerial: 7, actionMutationBusy: true, model: { actions }, action: currentAction, frameIndex: 3, selectedActions: new Set([10, 30]), actionAnchor: 30,
    document: { getElementById(id) { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); } },
    selectAction(number) { selected.push(number); context.action = actions.find((item) => item.number === number) || null; },
    focusActionButton(number) { focused.push(number); }, requestAnimationFrame(callback) { callback(); },
    clearActionState() { calls.clear += 1; }, renderActions() { calls.renderActions += 1; }, renderStrip() { calls.renderStrip += 1; }, updateActionSelection() { calls.updates += 1; }
  };
  vm.createContext(context); vm.runInContext(finishSource, context); context.finishActionMutation(response);
  return { context, elements, selected, focused, calls };
}
const actionZero = finishFixture({ actions: [{ number: 0 }], currentAction: null, response: { actionRequestId: 7, action: 0, deleted: [] } });
assert.deepStrictEqual(actionZero.selected, [0], 'a lifecycle response must select Action 0 rather than treating it as empty');
assert.deepStrictEqual(actionZero.focused, [0], 'created or duplicated Action 0 must be revealed and focused');
const survivor = finishFixture({ actions: [{ number: 20 }], currentAction: { number: 10 }, response: { actionRequestId: 7, action: 20, deleted: [10, 30] } });
assert.deepStrictEqual(survivor.selected, [20], 'multi-delete must select the host-chosen surviving action');
assert.deepStrictEqual(survivor.focused, [20], 'the surviving action button must be revealed and focused');
assert.strictEqual(survivor.elements.get('search').value, '', 'the surviving action must not remain hidden by the old filter');
const empty = finishFixture({ actions: [], currentAction: null, response: { actionRequestId: 7, action: null, deleted: [10, 30] } });
assert.strictEqual(empty.calls.clear, 1, 'removing the last action must explicitly clear the canvas and property state');
assert.strictEqual(empty.elements.get('newAction').focusCount, 1, 'an empty AIR must focus New Action as the recovery path');
assert.strictEqual(empty.context.actionMutationBusy, false, 'a completed lifecycle request must release its busy state');
const frameMoveStart = client.indexOf('function beginFrameMove(direction)'), frameMoveEnd = client.indexOf('function validFrameForm', frameMoveStart), frameMoveElements = new Map(), frameMoveMessages = [];
assert(frameMoveStart >= 0 && frameMoveEnd > frameMoveStart, 'generated client must bind visible frame movement controls');
const frameMoveDispatchContext = {
  action: { number: 0 }, frameIndex: 1, selectedFrames: new Set([1]), frameMoveReason: () => '',
  document: { getElementById(id) { if (!frameMoveElements.has(id)) frameMoveElements.set(id, {}); return frameMoveElements.get(id); } },
  beginActionMutation(message) { frameMoveMessages.push(message); return true; }
};
vm.createContext(frameMoveDispatchContext); vm.runInContext(client.slice(frameMoveStart, frameMoveEnd), frameMoveDispatchContext);
frameMoveElements.get('timelineMoveEarlier').onclick();
assert.deepStrictEqual(JSON.parse(JSON.stringify(frameMoveMessages[0])), { type: 'moveFrame', action: 0, frameIndex: 1, direction: 'earlier', wasMarked: true }, 'timeline Move Earlier dispatches the exact Action 0 element and mark state');
const finishFrameSource = clientFunctionSource(client, 'finishFrameMove'), focusedFrames = [], frameElements = new Map([['frameEditStatus', {}], ['timelineStatus', {}]]), frameContext = {
  actionMutationSerial: 9, actionMutationBusy: true, model: { actions: [{ number: 0, frames: [{}, {}] }] }, action: { number: 0, frames: [{}, {}] }, frameIndex: 1, selectedFrames: new Set([1]),
  document: { getElementById(id) { if (!frameElements.has(id)) frameElements.set(id, {}); return frameElements.get(id); } },
  selectAction() { throw new Error('Action 0 is already active and must not be reselected'); }, renderStrip() {}, requestFrame() {}, schedule() {}, updateActionSelection() {},
  requestAnimationFrame(callback) { callback(); }, focusFrameButton(index) { focusedFrames.push(index); }
};
vm.createContext(frameContext); vm.runInContext(finishFrameSource, frameContext); frameContext.finishFrameMove({ actionRequestId: 9, action: 0, from: 1, to: 0, wasMarked: true });
assert.strictEqual(frameContext.frameIndex, 0, 'frame-move acknowledgment follows the same moved element to its new index');
assert.deepStrictEqual([...frameContext.selectedFrames], [0], 'a marked moved element remains marked at its new index');
assert.deepStrictEqual(focusedFrames, [0], 'the moved timeline card is revealed and focused after the model update');
assert.strictEqual(frameContext.actionMutationBusy, false, 'frame-move completion releases shared AIR mutation busy state');
const reasonContext = {
  action: { number: 0, frames: [{}, {}, {}] }, frameIndex: 1, selectedFrames: new Set([0, 1]), model: { pushOverrides: [], runtimeEntries: [] },
  frameFormsDirty: () => false, runtimeDrafts: { busy: () => false, dirty: () => false }, runtimePrefix: () => 'air|', editRequests: { busy: () => false }, edit: null
};
vm.createContext(reasonContext); vm.runInContext(clientFunctionSource(client, 'frameMetadataReason') + clientFunctionSource(client, 'frameMoveReason'), reasonContext);
assert.match(reasonContext.frameMoveReason('earlier'), /Select only one element/, 'multiple marked timeline elements make a single-frame move unavailable');
reasonContext.selectedFrames = new Set(); reasonContext.frameIndex = 0;
assert.match(reasonContext.frameMoveReason('earlier'), /already the first/, 'Move Earlier is disabled at the action boundary');
reasonContext.frameIndex = 1; reasonContext.model.pushOverrides = [{ action: 0, element: 2 }];
assert.match(reasonContext.frameMoveReason('earlier'), /Saved push-box metadata/, 'saved element-indexed metadata blocks a visual reorder');
reasonContext.model.pushOverrides = []; reasonContext.frameFormsDirty = () => true;
assert.match(reasonContext.frameMoveReason('later'), /current frame-field edit/, 'ordinary unsaved or pending numeric fields block frame reorder');
assert(client.includes("if(frameFormsDirty()){document.getElementById('frameEditStatus')"), 'all ordinary frame navigation shares the numeric-field draft guard');
assert(html.includes('<button id="play">Play</button>'));
assert(html.includes('playing=false'));
assert(html.includes('id="clsn1" type="checkbox" checked'));
assert(html.includes('id="clsn2" type="checkbox" checked'));
assert(html.includes('id="showPush" type="checkbox">'));
assert(html.includes('id="showRuntime" type="checkbox">'));
assert(!html.includes('id="showPush" type="checkbox" checked'));
assert(!html.includes('id="showRuntime" type="checkbox" checked'));
assert(!html.includes('<option value="selected">Marked elements</option>'), 'collision geometry editing no longer exposes a marked-elements scope');
assert(!html.includes('<option value="action">Whole action</option>'), 'collision geometry editing no longer exposes a whole-action scope');
assert(html.includes('selectedFrames=new Set()'));
assert(!html.includes("type:'updateCollision'"), 'the legacy client-array whole-document collision mutation route is removed');
assert(!html.includes('frameIndices:[...selectedFrames]'), 'collision geometry requests do not carry client-owned multi-frame arrays');
assert(html.includes("type:'reviewCollisionEdit'") && html.includes("type:'applyReviewedCollisionEdit'"), 'one-box collision edits use the reviewed two-step protocol');
assert(html.includes("actionOccurrence:0,elementIndex:frameIndex,groupKey:edit.kind,slot,operation"), 'the collision review request carries only exact one-box selection and operation evidence');
assert(!html.includes("type:'reviewCollisionEdit',boxes:"), 'the collision request never sends a client-owned box array');
assert(html.includes("summary.textContent=") && html.includes("before.textContent=") && html.includes("replacement.textContent="), 'collision review excerpts are rendered only as text');
assert(html.includes('AIR · Learning'));
assert(html.includes('<details open><summary><b>What am I editing?</b>'));
assert(html.includes('class="guided-workflow"'));
assert(html.includes('details class="task-recipes" open'));
assert(html.includes('Bridge runtime geometry deliberately'));
assert(html.includes('[Done] Connect the AIR to its character SFF'));
assert(html.includes('data-workflow-action="panel:collisionPanel"'));
assert(html.includes("closest('[data-workflow-action]')"));
assert(!html.includes('Advanced shortcuts'));
const advancedHtml = viewerHtml({ title: 'Anim.air', airPath: 'Anim.air', sffPath: '', palettes: [], actions: [], experience: workspaceExperience('air', 'advanced') });
assert(advancedHtml.includes('AIR · Advanced'));
assert(!advancedHtml.includes('<details open><summary><b>What am I editing?</b>'));
assert(advancedHtml.includes('class="guided-workflow"'));
assert(advancedHtml.includes('details class="task-recipes"'));
assert(!advancedHtml.includes('details class="task-recipes" open'));
assert(!advancedHtml.includes('Advanced shortcuts'),'advanced actions are consolidated into the canonical Tools menu');
assert(advancedHtml.includes('data-toolbar-workflow="control:batchClsn2"'),'advanced AIR action moved into canonical Tools');
const airViewerSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'air_viewer.js'), 'utf8');
assert(airViewerSource.includes('return ownerDefs.length?null:inferCharacterFiles(airPath)'), 'an explicit owner mismatch must fail closed instead of guessing another DEF');
assert(airViewerSource.includes('exactOwners.length&&!sameAirBinding(existing,sffPath,constantsPath,sourcePaths)'), 'late deserializer races must compare the complete AIR/SFF/source binding before adopting an existing session');
assert(airViewerSource.includes("openConnected(session.airPath,'sff'"), 'AIR must use selection-aware shared viewer navigation');
assert(airViewerSource.includes('showSourceWithAirEscape(session, document'), 'AIR source controls must share one native-editor route');
assert(airViewerSource.includes('return window.showTextDocument(document'), 'AIR source access must open the native editor directly');
assert(!airViewerSource.includes('The AIR Actions Browser could not be opened, so the source editor was not opened'), 'AIR browser startup must never gate native text-editor access');
assert(airViewerSource.includes("message.type === 'updateFrame'"));
assert(airViewerSource.includes("frameFieldsTouched=false;status.textContent='AIR update submitted"), 'a complete submitted frame edit must release the local navigation guard without waiting on disk persistence');
assert(airViewerSource.includes("message.type === 'batchClsn2'"));
assert(airViewerSource.includes('batchService.visualSource(session, message)'));
for (const id of ['timelineEditor', 'timelineGroup', 'timelineIndex', 'timelineX', 'timelineY', 'timelineTime', 'timelineFlags', 'timelineTransparency', 'timelineBlendSource', 'timelineBlendDest', 'timelineBlend', 'timelineScaleX', 'timelineScaleY', 'timelineAngle', 'timelineLoopStart', 'timelineInterpolateBlend', 'timelineInterpolateOffset', 'timelineInterpolateScale', 'timelineInterpolateAngle', 'timelineBatchOffset', 'timelineBatchTime', 'timelineBatchFlip', 'timelineBatchBlend', 'timelineBatchScale', 'timelineBatchAngle', 'compactOnion', 'openAlignmentTool', 'openIkemenCollisionTools', 'airOffsetCross', 'airOffsetUp', 'airOffsetLeft', 'airOffsetDown', 'airOffsetRight', 'compactCollisionTools', 'quickToggleClsn1', 'quickAddClsn1', 'quickDefaultClsn1', 'quickToggleClsn2', 'quickAddClsn2', 'quickDefaultClsn2', 'quickShowPush', 'quickDummy', 'quickDeleteClsn', 'quickDeleteFrameClsn', 'quickDeleteActionClsn', 'quickSwitchClsnType', 'quickSwitchClsnDefault', 'quickCopyPreviousClsn', 'quickReuseClsn', 'compactReferenceTools', 'quickAnimationReferences', 'quickCollisionReferences', 'quickAirSource', 'alignmentDialog', 'timelineApply', 'timelineAdd', 'timelineDuplicate', 'timelineMoveEarlier', 'timelineMoveLater', 'timelineDelete', 'timelineOpenSource']) assert(html.includes(`id="${id}"`), `missing always-visible AIR timeline editor control ${id}`);
assert(html.includes('function drawPixelRulers()'), 'AIR viewer should render pan/zoom-aware pixel rulers');
assert(html.includes("document.getElementById('airOffsetUp').onclick"), 'AIR offset arrows should have live handlers');
assert(html.includes("document.getElementById('quickAddClsn1').onclick"), 'AIR Clsn1 quick action should have a live handler');
assert(html.includes("indexLabel.after(compactOffsetRow)") && html.includes("compactOffsetRow.append(offsetPad,offsetXLabel,offsetYLabel)"), 'offset pad and X/Y fields should share one row directly after Group/Index');
assert(html.includes('#compactOffsetRow>label:nth-of-type(1){grid-row:1}') && html.includes('#compactOffsetRow>label:nth-of-type(2){grid-row:2}'), 'X/Y offset fields should stack beside the arrow pad');
assert(html.includes("interpolationTools.after(compactCollisionTools,compactReferenceTools)"), 'collision and connector actions should follow interpolation controls');
assert(html.includes('.clsn1-tool{border-color:#e34b52') && html.includes('.clsn1-default-tool{border-color:#d8b928') && html.includes('.clsn2-tool{border-color:#377fd2') && html.includes('.clsn2-default-tool{border-color:#9562d8') && html.includes('.push-tool{border-color:#35a966') && html.includes('.dummy-tool{border:1px dotted #b8bec7'), 'collision family actions need stable color plus glyph semantics');
assert(html.includes("showPushControl.checked=saved.showPush===undefined?true") && html.includes("frame Size override") && html.includes("preview pose unless exact state evidence proves it"), 'effective push display should default on, persist, and disclose provenance limits');
assert(html.includes("document.getElementById('quickDummy').hidden=!model.dummyCollision.enabled"), 'Dummy action should be capability-gated');
assert(html.includes('id="boxSelect" class="block" multiple size="4"'), 'collision editor should allow an explicit multi-box selection');
assert(html.includes('>1⇄2</button>') && html.includes('>L⇄D</button>'), 'compact collision row should expose group and ownership conversion buttons');
assert(html.includes("requestCollisionConversion('group')") && html.includes("requestCollisionConversion('ownership')"), 'conversion buttons should invoke reviewed source conversion instead of merely opening the browser');
assert(html.includes("canvas.tabIndex=0") && html.includes("canvas.addEventListener('pointerdown',()=>canvas.focus())"), 'the AIR canvas must receive keyboard focus when a collision box is selected');
assert(html.includes("['delete','1','2','d'].includes(key)") && html.includes("if(edit.kind==='clsn2')requestCollisionConversion('group')") && html.includes("if(edit.kind==='clsn1')requestCollisionConversion('group')"), 'selected boxes expose Delete, 1, 2, and D keyboard operations');
assert(html.includes('if(event.target!==canvas||event.ctrlKey'), 'collision Delete/1/2/D shortcuts are scoped to the focused canvas and cannot hijack unrelated viewer controls');
assert(html.includes("keyboardCollisionDeletePending=true") && html.includes("document.getElementById('applyReviewedCollisionEdit').click()"), 'Delete advances the exact selected-box deletion through the reviewed apply path');
assert(html.includes("const picked=cyclePick(point,false)") && html.includes("canvas.ondblclick=e=>{const point=localPoint(e),picked=cyclePick(point,true)"), 'double-clicks explicitly advance nested collision and push-box selection');
for (const id of ['collisionContextMenu', 'collisionContextTitle', 'collisionContextBoxes', 'collisionContextSource', 'collisionContextSelect', 'collisionContextStage', 'collisionContextAppearance', 'collisionContextPush', 'collisionContextClose', 'collisionContextStatus']) assert(html.includes(`id="${id}"`), `missing collision context-menu control ${id}`);
for (const id of ['collisionAppearanceDialog', 'collisionAppearanceDialogTitle', 'appearanceDialogLineWidth', 'appearanceDialogLineWidthValue', 'appearanceDialogOpacity', 'appearanceDialogOpacityValue', 'appearanceDialogScaleWidth', 'appearanceDialogClsn1', 'appearanceDialogClsn1Default', 'appearanceDialogClsn2', 'appearanceDialogClsn2Default', 'appearanceDialogPush', 'appearanceDialogReset', 'appearanceDialogDone', 'appearanceDialogStatus']) assert(html.includes(`id="${id}"`), `missing dedicated collision appearance control ${id}`);
for (const id of ['canvasCollisionControls', 'canvasCollisionTitle', 'canvasBoxX1', 'canvasBoxY1', 'canvasBoxX2', 'canvasBoxY2', 'canvasApplyCoordinates', 'canvasRevertCoordinates', 'collisionContextSelectSprite']) assert(html.includes(`id="${id}"`), `missing always-visible canvas editing control ${id}`);
for (const id of ['collisionContextEditPush', 'collisionContextCoordinates', 'pushEditChoiceDialog', 'pushEditConstant', 'pushEditState', 'pushEditCancel', 'pushCodeDialog', 'pushCodeText', 'pushCodeCopy', 'pushCodeClose']) assert(html.includes(`id="${id}"`), `missing push-box destination or optional coordinate control ${id}`);
assert(html.includes("if(picked.kind==='size'){pointer=null;openPushEditChoice(picked);return}"), 'clicking an effective push box asks for a native-constant or state-code destination before editing');
assert(html.includes("item.kind==='clsn1'||item.kind==='clsn2'||item.kind==='size'") && html.includes("item.kind==='size'?'Push / Size'"), 'the right-click target list includes the visible push box beside overlapping CLSN boxes');
assert(html.includes("if(item.kind==='size'){openPushEditChoice(item);return}"), 'selecting the right-click push-box entry opens its explicit constant-or-state destination choice');
assert(html.includes("showCanvasCoordinatePanel=Boolean(vscode.getState()?.showCollisionCoordinatePanel)") && html.includes('const available=showCanvasCoordinatePanel&&Boolean(edit&&Number.isInteger(edit.selected)') && html.includes('showCollisionCoordinatePanel:showCanvasCoordinatePanel'), 'the floating coordinate panel defaults off, is explicitly toggled, and persists without changing canvas selection');
assert(html.includes("beginChosenPushEdit('baseline')") && html.includes("beginChosenPushEdit('frame')") && html.includes("if(event.data?.type==='pushApplied'&&event.data.code)showPushCode(event.data.code)"), 'the push-box destination choice reaches native constants or a reviewed state-code preview');
assert(airViewerSource.includes('generatedCode = controllerSnippet(result.entry)') && airViewerSource.includes("message.type === 'copyText'"), 'frame Size edits return exact generated controller code and copy only after an explicit user action');
assert(html.indexOf('id="collisionContextMenu"') < html.indexOf('<script nonce='), 'collision context controls must exist in the DOM before the startup script binds them');
assert(html.indexOf('id="collisionContextClose"') < html.indexOf("document.getElementById('collisionContextClose').onclick"), 'right-click menu startup cannot bind controls before their markup is parsed');
assert(html.includes('canvas.oncontextmenu=event=>{event.preventDefault();canvas.focus()'), 'right-click opens the collision menu without browser-menu or pan interference');
assert(html.includes('collisionContextReturnFocus=document.activeElement') && html.includes('target?.isConnected)target.focus()'), 'the collision menu remembers and restores its invoking focus target');
assert(html.includes("if(event.key!=='Tab')return") && html.includes("collisionContextMenu.querySelectorAll('button:not([disabled])"), 'the collision menu keeps keyboard focus within its enabled controls');
assert(html.includes("requestAnimationFrame(()=>{const target=collisionContextBoxes.querySelector('button:not([disabled])") && html.includes('target?.focus()'), 'opening the collision menu moves focus to a usable action');
assert(html.includes('if(e.button===2)return;pointer=e.pointerId') && html.includes("if(e.button===2)return;if(document.getElementById('runtimeKind')"), 'right-click cannot begin ordinary box, pan, or runtime-pivot dragging');
assert(html.includes("document.getElementById('collisionContextAppearance').onclick=focusCollisionAppearanceFromContext") && html.includes('collisionAppearanceDialog.showModal()') && html.includes('syncCollisionAppearanceDialog()') && html.includes("applyCollisionAppearance(appearanceDialogValue())"), 'context appearance action opens a dedicated synchronized live-preview screen without relying on covered sidebar controls');
assert(html.includes("document.getElementById('collisionAppearanceDialogClose').onclick=()=>collisionAppearanceDialog.close('close')") && html.includes("document.getElementById('appearanceDialogDone').onclick=()=>collisionAppearanceDialog.close('done')"), 'appearance X and Done close explicitly instead of relying on form submission that shared button initialization can disable');
assert(html.includes('function beginCollisionAppearanceDialogDrag(event)') && html.includes('collisionAppearanceDialogDragHandle.setPointerCapture') && html.includes('positionCollisionAppearanceDialog('), 'the appearance title owns pointer-captured, viewport-clamped panel dragging');
assert(html.includes('.collision-appearance-dialog-title{display:flex') && html.includes('cursor:grab;user-select:none;touch-action:none'), 'the appearance title visibly advertises dragging without selecting text');
assert(html.includes('Clsn1 boxes') && html.includes('Clsn1 default boxes') && html.includes('Clsn2 boxes') && html.includes('Clsn2 default boxes') && html.includes('Push / Size boxes'), 'the dedicated appearance screen names every independently configurable collision color');
assert(html.includes("showPushControl.dispatchEvent(new Event('change',{bubbles:true}))"), 'context push visibility delegates to the existing protected and persisted handler');
assert(html.includes('<kbd>X</kbd> + drag moves the current sprite') && html.includes("document.getElementById('collisionContextSelectSprite').onclick"), 'the right-click menu documents X-drag and can explicitly select the current sprite');
assert(html.includes("canvas.style.cursor=pickCandidates(point).some(item=>item.kind==='clsn1'||item.kind==='clsn2'||item.kind==='size')?'pointer':'move'"), 'the canvas uses a hand over selectable contact or push boxes and a four-arrow move cursor elsewhere');
assert(html.includes('spriteOffsetDrag.originalX+dx') && html.includes('spriteOffsetDrag.originalY+dy') && html.includes("queueFrameAutoApply('timeline')"), 'X-drag updates the current sprite AIR offsets through normal frame auto-apply');
assert(html.includes("message.type==='collisionEditReview'&&canvasCollisionApplyPending") && html.includes("document.getElementById('applyReviewedCollisionEdit').click()"), 'the on-canvas coordinate bar applies through exact AIR review without hiding a second confirmation button in the side panel');
assert(html.includes("requestCollisionEditSeed(item.kind,item.slot,'select')") && html.includes('applyCollisionContextCoordinates'), 'context text editing obtains the existing authoritative collision seed');
assert(html.includes('>Apply Edited Coordinates</button>') && !html.includes('>Stage text edit</button>'), 'the collision menu describes its coordinate action in user-facing terms');
for (const label of ['>X1<input id="boxX1"', '>Y1<input id="boxY1"', '>X2<input id="boxX2"', '>Y2<input id="boxY2"']) assert(html.includes(label), `selected collision coordinates expose visible ${label.slice(1, 3)} controls`);
assert(html.includes("editDrag.mode==='edge'") && html.includes("editDrag.edge==='left'") && html.includes("editDrag.edge==='right'") && html.includes("editDrag.edge==='top'") && html.includes("editDrag.edge==='bottom'"), 'all four selected-box edges resize independently');
assert(html.includes("if(hit.mode==='move')return'move'") && html.includes("'ew-resize':'ns-resize'") && html.includes("'nwse-resize':'nesw-resize'"), 'the canvas advertises move, edge, and corner manipulation with matching cursors');
assert(html.includes('[[b[0],b[1]],[mx,b[1]],[b[2],b[1]],[b[2],my],[b[2],b[3]],[mx,b[3]],[b[0],b[3]],[b[0],my]]'), 'the selected box draws four corner and four edge handles');
assert(html.includes('function applyCollisionContextToAir()') && html.includes("message.type==='collisionEditReview'&&collisionContextApplyPending") && html.includes("document.getElementById('applyReviewedCollisionEdit').click()"), 'edited context coordinates advance through validation and apply to the focused AIR document without a second panel action');
assert(html.includes('function beginCanvasCollisionSelection(picked)') && html.includes("switchRightPanel('collisionPanel')") && html.includes("playing=false;document.getElementById('play').textContent='Play'"), 'left-click visibly selects the exact box, opens its controls, and freezes the clicked frame before authority preparation');
assert(html.includes("collisionContextPending=null;if(applyCollisionContextCoordinates") && html.includes('applyCollisionContextToAir()'), 'valid context text advances through the existing reviewed AIR apply path');
assert(html.includes("This Copy Action preview is read-only") && html.includes("Apply or Revert the current '+edit.kind.toUpperCase()+' edit before switching groups"), 'context editing protects Copy Actions and dirty cross-group sessions');
assert(html.includes('const selectActionBeforeCollisionContext=selectAction') && html.includes('restoreCollisionContextAfterSelection(snapshot)') && !html.includes("applyModel=(...args)=>{closeCollisionContext();return applyModelBeforeCollisionContext"), 'action, frame, and model refreshes retain or explicitly invalidate the open context menu instead of unconditionally closing it');
assert(!html.includes("type:'updateCollisionText'"), 'the context menu must not introduce direct raw AIR mutation');
assert(html.includes('role="tablist" aria-label="AIR editing panels"') && html.includes('role="tab" aria-selected="true"') && html.includes("panel.setAttribute('role','tabpanel')"), 'AIR side panels expose tab, selected-state, and tabpanel semantics');
assert(html.includes("key==='ArrowRight'||key==='ArrowDown'") && html.includes("key==='ArrowLeft'||key==='ArrowUp'") && html.includes("key==='Home'") && html.includes("key==='End'"), 'AIR panel tabs support conventional arrow, Home, and End navigation');
assert(html.includes("for(const id of ['play','prev','next','exportActionSequence','shaderWorkshop','airSource','airTextEdit'])") && html.includes('Select or create an AIR animation first.'), 'action-dependent header controls are disabled with an actionable no-selection reason');
assert(html.includes("This frame has no push-box override to remove.") && html.includes("No saved '+(kind||'runtime')+' frame plan exists to copy."), 'disabled push and runtime actions explain what prerequisite is missing');
assert(html.includes('The AIR source has no unsaved document changes.') && html.includes('The AIR source is unavailable.'), 'Save AIR distinguishes a clean document from an unavailable source');
const boxHitContext = { normalized: box => [Math.min(box[0], box[2]), Math.min(box[1], box[3]), Math.max(box[0], box[2]), Math.max(box[1], box[3])] };
vm.createContext(boxHitContext); vm.runInContext(clientFunctionSource(client, 'boxHit'), boxHitContext);
assert.deepStrictEqual({ ...boxHitContext.boxHit([20, 30, -20, -30], [0, 0], 2) }, { mode: 'move' }, 'a visibly drawn box with reversed authored corners remains selectable through its interior');
assert.deepStrictEqual({ ...boxHitContext.boxHit([20, 30, -20, -30], [-20, -30], 2) }, { mode: 'corner', corner: 0 }, 'reversed authored corners expose the same visible top-left resize handle as normalized boxes');
assert.deepStrictEqual({ ...boxHitContext.boxHit([20, 30, -20, -30], [-20, 0], 2) }, { mode: 'edge', edge: 'left' }, 'the left side is an independent resize target');
assert.deepStrictEqual({ ...boxHitContext.boxHit([20, 30, -20, -30], [20, 0], 2) }, { mode: 'edge', edge: 'right' }, 'the right side is an independent resize target');
assert.deepStrictEqual({ ...boxHitContext.boxHit([20, 30, -20, -30], [0, -30], 2) }, { mode: 'edge', edge: 'top' }, 'the top side is an independent resize target');
assert.deepStrictEqual({ ...boxHitContext.boxHit([20, 30, -20, -30], [0, 30], 2) }, { mode: 'edge', edge: 'bottom' }, 'the bottom side is an independent resize target');
assert.strictEqual(boxHitContext.boxHit([20, 30, -20, -30], [40, 40], 2), null, 'points outside the normalized visible rectangle do not select it');
const cycleContext = { zoom: 1, lastPick: { signature: '', cycle: -1, x: 0, y: 0 }, pickCandidates: () => [{ kind: 'clsn1', scope: 'element', index: 0 }, { kind: 'clsn2', scope: 'element', index: 0 }, { kind: 'size', scope: 'baseline', index: 0 }] };
vm.createContext(cycleContext); vm.runInContext(clientFunctionSource(client, 'cyclePick'), cycleContext);
assert.strictEqual(cycleContext.cyclePick([4, 6], false).kind, 'clsn1', 'the first click selects the top nested collision candidate');
assert.strictEqual(cycleContext.cyclePick([4, 6], true).kind, 'clsn2', 'a double-click at the same point advances to the next nested collision box');
assert.strictEqual(cycleContext.cyclePick([4, 6], true).kind, 'size', 'another double-click reaches the nested push box');
assert.strictEqual(cycleContext.cyclePick([4, 6], true).kind, 'clsn1', 'repeated double-clicks wrap through every nested box including Size');
assert(html.includes("Copy both Clsn1 and Clsn2 boxes from the previous frame into this frame") && html.includes("type:'copyPreviousCollisions'"), 'Copy Previous is an immediate current-frame command with accurate hover help');
assert(html.includes("Apply or Revert the current pushbox edit before hiding and protecting the pushbox") && html.includes("if(document.getElementById('showPush').checked){const push="), 'the pushbox visibility action also protects hidden Size geometry from canvas selection');
assert(airViewerSource.includes("message.type === 'copyPreviousCollisions'") && airViewerSource.includes('previousCollisionCopyPlan'), 'the AIR host applies previous-frame collision geometry without opening another viewer');
assert(airViewerSource.includes('verified.version !== expectedVersion') && airViewerSource.includes('verified.getText() !== expectedText'), 'Copy Previous verifies the exact open AIR result after its one native editor change');
assert(airViewerSource.includes("ownerDef: session.defPath || '', autoFloat: true"), 'AIR icons that open the browser request floating mode');
assert(airViewerSource.includes("message.type === 'updateFrameDirectives'"), 'AIR host applies reviewed LoopStart and Interpolate changes to the open source document');
assert(airViewerSource.includes("message.type === 'applyFollowingFrameProperties'") && airViewerSource.includes("message.type === 'alignActions'"), 'AIR host owns reviewed apply-forward and multi-animation alignment edits');
assert(html.includes('input[type=number]::-webkit-inner-spin-button') && html.includes('opacity:1'), 'AIR numeric spinner arrows remain visible without hover');
assert(html.includes("compact.textContent=active?'◉'+onionDepth:'◉'") && html.includes("data-air-proxy=\"onion\""), 'compact onion-skin control mirrors the authoritative Off/1/2 preview state');
for(const id of ['airCompactActionTools','compactFrameTools','compactActionNavigation','compactFrameNavigation'])assert(html.includes(`id="${id}"`),`missing organized AIR compact control row ${id}`);
assert(html.includes('#airCompactActionTools{order:0}#compactFrameTools{order:1}'),'whole-animation and selected-frame actions stay together above the selection sliders');
assert(html.includes('#airCompactActionTools button,#compactFrameTools button:not([hidden])'),'AIR whole-animation and frame action rows share fixed compact button sizing');
for(const label of ['Revert selected AIR frame fields','Add one AIR frame after the selected frame','Duplicate the selected AIR frame','Move the selected AIR frame earlier','Move the selected AIR frame later','Delete the selected AIR frame','Open the selected AIR frame in source'])assert(html.includes(`aria-label="${label}"`),`missing compact AIR frame action ${label}`);
assert(html.includes('Duplicate the entire selected AIR animation')&&html.includes('Duplicate only the selected frame, not the whole animation'),'AIR hover help distinguishes whole-animation and frame-only duplicate actions');
assert(html.includes('Delete selected complete AIR animations')&&html.includes('Delete only the selected frame, not the whole animation'),'AIR hover help distinguishes whole-animation and frame-only delete actions');
assert(html.includes("previousIssue.id='previousAirIssue'"));
assert(html.includes("nextIssue.id='nextAirIssue'"));
assert(html.includes('queueFrameAutoApply'));
assert(html.includes('frameFieldsTouched=true'), 'only actual AIR frame-field input marks the navigation guard dirty');
assert(html.includes('function frameFormsDirty(){return frameFieldsTouched||frameAutoTimer!==null}'), 'AIR navigation must not infer false edits by comparing rendered field values');
assert(html.includes('function populateFrameFields(f){if(!f)return;frameFieldsTouched=false;'), 'loading an AIR frame establishes a clean form baseline');
assert(html.includes("document.getElementById('timelineApply').hidden=true"), 'AIR frame fields must not require a manual Apply click');
assert(airViewerSource.includes('runtimeDraftStore.read(session.airPath)'), 'AIR models must restore host-backed frame-plan drafts');
assert(airViewerSource.includes("type === 'runtimeDraftSync'"), 'AIR input changes must persist frame-plan drafts outside webview state');
assert(airViewerSource.includes("require('./viewer_close').support(panel"), 'AIR panels must participate in recoverable direct-close handling');
assert(html.includes('runtimeDraftRecord:runtimeDrafts.record(key)'), 'AIR saves must identify the exact submitted recovery record');
assert(html.includes('globalThis.ikemenCanKeepDraft'), 'AIR close checks must distinguish recoverable frame plans from collision edits');
assert(!airViewerSource.includes("executeCommand('vscode.openWith', vscode.Uri.file(session.sffPath)"), 'AIR must not let the custom editor choose a text-editor group for SFF');
assert(!html.includes('Legacy background toggle'));
assert(!html.includes('id="transparent"'));
assert(!html.includes("getElementById('transparent')"));
assert(html.includes("openRuntimeControllerReview.id='openRuntimeControllerReview'"), 'runtime collision plans hand off to one reviewed source-controller editor');
assert(html.includes("for(const id of ['saveRuntime','removeRuntime','copyRuntime'])document.getElementById(id).hidden=sourceOwned"), 'OverrideClsn and TransformClsn no longer expose the competing legacy Save/Remove/Copy writer');
assert(html.includes("querySelectorAll('input,select,button'))control.disabled=sourceOwned"), 'the legacy main-panel runtime-controller fields become a read-only summary');
assert(html.includes("collisionMode:'transform'"), 'the source-controller handoff opens the existing AIR browser Transform surface');
assert(airViewerSource.includes("['properties', 'transform'].includes(message.collisionMode)"), 'the host preserves the explicit Transform handoff instead of silently opening Inspect');
const copyCapability = 'C'.repeat(64), copyEvidence = { target: { channel: 'stable', version: '1.0' }, allocationDecision: { enabled: false, status: 'unsupported', capabilityFingerprint: copyCapability }, capabilityFingerprint: copyCapability };
const copySource = `[Begin Action 700]
Clsn1: 2
Clsn1[0] = -10, -20, 10, 20
Clsn1[1] = -5, -8, 5, 8
Clsn2: 1
Clsn2[0] = -8, -18, 8, 18
700,0,0,0,1
Clsn1: 3
Clsn1[0] = 1, 2, 3, 4
Clsn1[1] = 5, 6, 7, 8
Clsn1[2] = 9, 10, 11, 12
700,1,0,0,1`;
const copyPlan = previousCollisionCopyPlan({ airPath: 'Anim.air' }, copySource, 700, 1, copyEvidence), copiedSource = copySource.slice(0, copyPlan.patch.start) + copyPlan.patch.replacement + copySource.slice(copyPlan.patch.end);
assert(copiedSource.includes('Clsn1: 2') && !copiedSource.includes('Clsn1[2] = 9, 10, 11, 12'), 'copy previous removes extra destination boxes instead of opening another tool');
assert.strictEqual((copiedSource.match(/Clsn1\[0\] = -10, -20, 10, 20/g) || []).length, 2, 'copy previous writes the preceding Clsn1 geometry into the destination frame');
assert.strictEqual((copiedSource.match(/Clsn2\[0\] = -8, -18, 8, 18/g) || []).length, 2, 'copy previous also writes the preceding Clsn2 geometry into the destination frame');
const pastedPlan = collisionClipboardMutationPlan({ airPath: 'Anim.air' }, copySource, { mode: 'paste', action: 700, elementIndex: 1, groupKey: 'clsn2', boxes: [[20, 21, 30, 31], [-40, -41, -30, -31]] }, copyEvidence);
const pastedSource = copySource.slice(0, pastedPlan.patch.start) + pastedPlan.patch.replacement + copySource.slice(pastedPlan.patch.end);
assert.deepStrictEqual(pastedPlan.affectedSlots, [0, 1], 'paste appends copied boxes to stable, unused collision indices');
assert(pastedSource.includes('Clsn2[0] = 20, 21, 30, 31') && pastedSource.includes('Clsn2[1] = -40, -41, -30, -31'), 'paste preserves the copied collision type and exact coordinates');
const cutPlan = collisionClipboardMutationPlan({ airPath: 'Anim.air' }, pastedSource, { mode: 'cut', action: 700, elementIndex: 1, groupKey: 'clsn2', slots: [0, 1], boxes: [[20, 21, 30, 31], [-40, -41, -30, -31]] }, copyEvidence);
const cutSource = pastedSource.slice(0, cutPlan.patch.start) + cutPlan.patch.replacement + pastedSource.slice(cutPlan.patch.end);
assert(!cutSource.includes('Clsn2[0] = 20, 21, 30, 31') && !cutSource.includes('Clsn2[1] = -40, -41, -30, -31'), 'cut removes every selected exact box in one source patch');
const defaultSource = `[Begin Action 701]
Clsn2Default: 1
Clsn2[0] = -12, -24, 12, 0
701,0,0,0,1
701,1,0,0,1`;
const defaultCutPlan = collisionClipboardMutationPlan({ airPath: 'Anim.air' }, defaultSource, { mode: 'cut', action: 701, elementIndex: 0, groupKey: 'clsn2', slots: [0], boxes: [[-12, -24, 12, 0]] }, copyEvidence);
assert(defaultCutPlan.ownershipImpact.editsSharedDefault && defaultCutPlan.ownershipImpact.sharedDefault.affectedCount === 2 && defaultCutPlan.ownershipImpact.sharedDefault.inheritorCount === 1, 'cut reports the complete shared Default frame scope before mutation');
const inheritedPastePlan = collisionClipboardMutationPlan({ airPath: 'Anim.air' }, defaultSource, { mode: 'paste', action: 701, elementIndex: 1, groupKey: 'clsn2', boxes: [[20, 21, 30, 31]] }, copyEvidence);
const inheritedPasteSource = defaultSource.slice(0, inheritedPastePlan.patch.start) + inheritedPastePlan.patch.replacement + defaultSource.slice(inheritedPastePlan.patch.end);
assert(inheritedPastePlan.ownershipImpact.materializesInheritedDefault && inheritedPastePlan.ownershipImpact.materializedDefault.materializesCount === 1, 'paste reports inherited Default materialization before mutation');
assert.strictEqual((inheritedPasteSource.match(/Clsn2Default: 1/g) || []).length, 1, 'inherited paste leaves the shared Default declaration unchanged');
assert(inheritedPasteSource.includes('Clsn2: 2') && inheritedPasteSource.includes('Clsn2[1] = 20, 21, 30, 31'), 'inherited paste materializes the effective boxes into one local frame block');
assert(airViewerSource.includes('WARNING: This edits a shared ${group}Default declaration used by') && airViewerSource.includes('the shared Default remains unchanged.'), 'clipboard confirmation distinguishes shared Default edits from local inherited-Default materialization');
assert(html.includes("['c','x','v']") && html.includes("event.target!==canvas"), 'AIR collision clipboard shortcuts are canvas-scoped and do not steal text-field copy/paste');
assert(html.includes('id="collisionContextCopy"') && html.includes('id="collisionContextCut"') && html.includes('id="collisionContextPaste"'), 'the collision right-click menu exposes copy, cut, and paste');
assert(html.includes('<canvas id="canvas" tabindex="0" aria-label="AIR frame preview; arrow keys move selected collision boxes or the armed sprite, Shift moves by ten">'), 'the AIR canvas is keyboard-focusable and names its nudge behavior');
assert(html.includes('<dialog id="alignmentDialog" aria-labelledby="alignmentDialogTitle"><h2 id="alignmentDialogTitle">'), 'the alignment dialog has a programmatic name');
assert(html.includes("control.setAttribute?.('aria-description',control.title)") && html.includes("control.removeAttribute?.('aria-description')"), 'disabled AIR controls expose and clear the actionable reason for assistive technology');
assert(html.includes("for(const id of ['airSaveStatus','frameEditStatus','editStatus','timelineStatus','collisionAffectedStatus','collisionContextStatus','sourceSummary','sourceConfidence','error'])") && html.includes("node.setAttribute('aria-live','polite')"), 'changing AIR operation and source states are polite live statuses');
assert(html.includes('width:min(700px,calc(100vw - 24px))'), 'the AIR text surface remains usable at narrow widths');
const dialogFocusContext = { document: { body: {}, activeElement: null }, requestAnimationFrame: callback => dialogFocusContext.frames.push(callback), frames: [] };
vm.createContext(dialogFocusContext); vm.runInContext(clientFunctionSource(client, 'restoreAirViewerDialogFocus'), dialogFocusContext);
const focusDialog = {}, ordinaryOpener = { isConnected: true, disabled: false, focus(){ dialogFocusContext.document.activeElement = this; } };
dialogFocusContext.document.activeElement = focusDialog;
dialogFocusContext.restoreAirViewerDialogFocus(focusDialog, ordinaryOpener, focusDialog);
dialogFocusContext.frames.shift()();
assert.strictEqual(dialogFocusContext.document.activeElement, ordinaryOpener, 'closing an AIR dialog restores its connected ordinary opener');
const detachedOpener = { isConnected: false, disabled: false, focus(){ throw new Error('detached opener must not receive focus'); } };
dialogFocusContext.document.activeElement = focusDialog;
dialogFocusContext.restoreAirViewerDialogFocus(focusDialog, detachedOpener, focusDialog);
dialogFocusContext.frames.shift()();
assert.strictEqual(dialogFocusContext.document.activeElement, focusDialog, 'deferred AIR dialog focus restoration ignores a detached opener');
const unrelatedFocus = {}, movedOpener = { isConnected: true, disabled: false, focus(){ throw new Error('unrelated focus must not be stolen'); } };
dialogFocusContext.document.activeElement = focusDialog;
dialogFocusContext.restoreAirViewerDialogFocus(focusDialog, movedOpener, focusDialog);
dialogFocusContext.document.activeElement = unrelatedFocus;
dialogFocusContext.frames.shift()();
assert.strictEqual(dialogFocusContext.document.activeElement, unrelatedFocus, 'deferred AIR dialog focus restoration preserves focus deliberately moved elsewhere');
console.log('AIR viewer HTML tests passed');
