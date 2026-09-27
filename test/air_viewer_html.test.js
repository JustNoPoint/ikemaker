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
const { viewerHtml, inferCharacterFiles, existingAirSourceColumn } = require('../src/air_viewer');
const { workspaceExperience } = require('../src/experience_model');
Module._load = originalLoad;

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
const allowedStyleNonce = /style-src 'nonce-([^']+)'/.exec(html)[1];
  for (const [, attrs] of html.matchAll(/<style\b([^>]*)>/g)) assert(attrs.includes('nonce=\"' + allowedStyleNonce + '\"'), 'shared styles must satisfy the rendered content security policy');
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
assert.strictEqual(scripts.length, 1);
assert.doesNotThrow(() => new vm.Script(scripts[0][1]));
for (const id of ['actionSort', 'showActionThumbs', 'newAction', 'duplicateAction', 'deleteSelectedActions', 'markVisibleActions', 'clearActionMarks', 'actionSelectionStatus', 'proofBackground', 'proofColor', 'exportPreview', 'canvas', 'strip', 'collisionPanel', 'pushPanel', 'runtimePanel', 'sourcePanel', 'sourceConfidence', 'sourceFindings', 'rulesPanel', 'layerPanel', 'palette', 'goCode', 'frameGroup', 'frameIndexValue', 'frameX', 'frameY', 'frameTime', 'frameFlags', 'frameBlend', 'frameScaleX', 'frameScaleY', 'frameAngle', 'applyFrame', 'addFrame', 'duplicateFrame', 'moveFrameEarlier', 'moveFrameLater', 'deleteFrame', 'editKind', 'editScope', 'addBox', 'applyBoxEdit', 'revertBoxEdit', 'showPush', 'editBaselinePush', 'editFramePush', 'bridgeKind', 'copyBridge']) assert(html.includes(`id="${id}"`), `missing ${id}`);
assert(html.includes('data-ikemen-destination="sff" id="openSff"'));
assert(html.includes('data-ikemen-destination="palette" id="palFx"'));
assert(html.includes('data-ikemen-destination="code" id="airSource"'));
assert(html.includes("selectedActions:new Set") || html.includes('selectedActions:[...selectedActions]'));
assert(html.includes("type:'exportPreview'"));
assert(!html.includes('id="deleteActions"'));
assert(html.includes('webviewSection":"airActions'));
assert(html.includes("event.key!=='Delete'"));
assert(html.includes("event.target.closest('.frame')"), 'Delete on a timeline frame must not delete its whole animation');
assert(html.includes("event.ctrlKey||event.metaKey"));
assert(html.includes('event.shiftKey&&actionAnchor!==null'));
assert(html.includes("type:'actionThumbnails'"));
assert(html.includes("type:'batchClsn2'"), 'visual AIR bulk Clsn2 must use its own source-bound host request');
assert(html.includes('pendingGuardPassed:true'), 'visual AIR bulk Clsn2 must pass the shared pending-edit guard first');
assert(html.includes('actionText:action.sourceText'), 'visual AIR bulk Clsn2 must send the displayed action snapshot for host validation');
assert(!html.includes("getElementById('batchClsn2').onclick=()=>vscode.postMessage({type:'command',command:'air.batchApplyClsn2'})"), 'visual bulk Clsn2 must not borrow the active text editor command');
const client = scripts[0][1], mutationStart = client.indexOf('function beginActionMutation(message)'), mutationEnd = client.indexOf("document.getElementById('markVisibleActions')", mutationStart);
assert(mutationStart >= 0 && mutationEnd > mutationStart, 'action lifecycle dispatch block must be present in the generated client');
const lifecycleElements = new Map(), lifecycleMessages = [], lifecycleContext = {
  actionMutationBusy: false, actionMutationSerial: 0, action: { number: 0 }, playing: true,
  navigationAllowed: () => true, updateActionSelection() {}, requestActionDeletion() { this.deleted = true; },
  document: { getElementById(id) { if (!lifecycleElements.has(id)) lifecycleElements.set(id, {}); return lifecycleElements.get(id); } },
  vscode: { postMessage(message) { lifecycleMessages.push(message); } }
};
vm.createContext(lifecycleContext); vm.runInContext(client.slice(mutationStart, mutationEnd), lifecycleContext);
lifecycleElements.get('newAction').onclick();
assert.strictEqual(lifecycleMessages.at(-1).type, 'createAction', 'New Action dispatches the create lifecycle request');
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
assert(html.includes('<option value="selected">Marked elements</option>'));
assert(html.includes('<option value="action">Whole action</option>'));
assert(html.includes('selectedFrames=new Set()'));
assert(html.includes('frameIndices:[...selectedFrames]'));
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
assert(advancedHtml.includes('Advanced shortcuts'));
assert(advancedHtml.includes('data-workflow-action="control:batchClsn2"'));
const airViewerSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'air_viewer.js'), 'utf8');
assert(airViewerSource.includes("openConnected(session.airPath,'sff'"), 'AIR must use selection-aware shared viewer navigation');
assert(airViewerSource.includes('viewColumn = session.panel.viewColumn'), 'AIR source opened from its viewer must become a tab in that viewer group');
assert(airViewerSource.includes("message.type === 'updateFrame'"));
assert(airViewerSource.includes("message.type === 'batchClsn2'"));
assert(airViewerSource.includes('batchService.visualSource(session, message)'));
for (const id of ['timelineEditor', 'timelineGroup', 'timelineIndex', 'timelineX', 'timelineY', 'timelineTime', 'timelineFlags', 'timelineBlend', 'timelineScaleX', 'timelineScaleY', 'timelineAngle', 'timelineApply', 'timelineAdd', 'timelineDuplicate', 'timelineMoveEarlier', 'timelineMoveLater', 'timelineDelete', 'timelineOpenSource']) assert(html.includes(`id="${id}"`), `missing always-visible AIR timeline editor control ${id}`);
assert(html.includes("previousIssue.id='previousAirIssue'"));
assert(html.includes("nextIssue.id='nextAirIssue'"));
assert(html.includes('queueFrameAutoApply'));
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
console.log('AIR viewer HTML tests passed');
