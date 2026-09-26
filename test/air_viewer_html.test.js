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
for (const id of ['actionSort', 'showActionThumbs', 'markVisibleActions', 'clearActionMarks', 'actionSelectionStatus', 'proofBackground', 'proofColor', 'exportPreview', 'canvas', 'strip', 'collisionPanel', 'pushPanel', 'runtimePanel', 'sourcePanel', 'sourceConfidence', 'sourceFindings', 'rulesPanel', 'layerPanel', 'palette', 'goCode', 'frameGroup', 'frameIndexValue', 'frameX', 'frameY', 'frameTime', 'frameFlags', 'frameBlend', 'frameScaleX', 'frameScaleY', 'frameAngle', 'applyFrame', 'addFrame', 'duplicateFrame', 'deleteFrame', 'editKind', 'editScope', 'addBox', 'applyBoxEdit', 'revertBoxEdit', 'showPush', 'editBaselinePush', 'editFramePush', 'bridgeKind', 'copyBridge']) assert(html.includes(`id="${id}"`), `missing ${id}`);
assert(html.includes("selectedActions:new Set") || html.includes('selectedActions:[...selectedActions]'));
assert(html.includes("type:'exportPreview'"));
assert(!html.includes('id="deleteActions"'));
assert(html.includes('webviewSection":"airActions'));
assert(html.includes("event.key!=='Delete'"));
assert(html.includes("event.target.closest('.frame')"), 'Delete on a timeline frame must not delete its whole animation');
assert(html.includes("event.ctrlKey||event.metaKey"));
assert(html.includes('event.shiftKey&&actionAnchor!==null'));
assert(html.includes("type:'actionThumbnails'"));
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
for (const id of ['timelineEditor', 'timelineGroup', 'timelineIndex', 'timelineX', 'timelineY', 'timelineTime', 'timelineFlags', 'timelineBlend', 'timelineScaleX', 'timelineScaleY', 'timelineAngle', 'timelineApply', 'timelineAdd', 'timelineDuplicate', 'timelineDelete', 'timelineOpenSource']) assert(html.includes(`id="${id}"`), `missing always-visible AIR timeline editor control ${id}`);
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
