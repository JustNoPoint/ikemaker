'use strict';

const assert = require('assert');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {};
  if (request === './air_viewer' && /air_docking_workspace\.js$/.test(parent?.filename || '')) return {
    parseAir: () => [], inferCharacterFiles: () => ({}), collisionRuntimeOptions: () => ({}), collisionRuntimeDraftEntries: () => []
  };
  return originalLoad.call(this, request, parent, isMain);
};
const { buildCollisionInspection, queueCollisionInspection, openCollisionSourceRoute, sourceHandoffDetails } = require('../src/air_docking_workspace');
const { sessions, key } = require('../src/air_browser_sessions');
Module._load = originalLoad;

const airPath = require('path').resolve('/char/main.air');
let text = '; filler\n'.repeat(899) + '[Begin Action 200]\nClsn1: 1\nClsn1[0] = -10, -20, 10, 20\n0,0, 0,0, 2';
const document = { fileName: airPath, isClosed: false, version: 7, getText: () => text };
const workspace = { textDocuments: [document], openTextDocument: async () => document };
class Range { constructor(startLine, startCharacter, endLine, endCharacter) { this.start = { line: startLine, character: startCharacter }; this.end = { line: endLine, character: endCharacter }; } }
const serviceBase = {
  workspace, Range, commands: { executeCommand: async (command, options) => command === 'ikemen.textToolbar.resumeFromVisualViewer' ? { attached: true, selectedFile: options.selectedFile, airReturnRendered: true } : undefined },
  collisionRuntimeOptions: () => ({ target: { channel: 'stable', version: '1.0' }, capabilityFingerprint: 'A'.repeat(64), allocationDecision: { capabilityId: 'collision.air-index-allocation', enabled: false, status: 'unsupported', capabilityFingerprint: 'A'.repeat(64) } }),
  readRuntimePlan: () => ({ entries: [] }), collisionRuntimeDraftEntries: () => []
};
const makeRecord = () => ({ panel: { active: true }, data: { airPath }, collisionGeneration: 0, collisionAuthorities: new Map(), consumedCollisionRoutes: new Set() });

(async () => {
  const record = makeRecord(), first = await buildCollisionInspection(record, { action: 200, elementIndex: 0 }, serviceBase);
  sessions.set(key(airPath), record);
  assert.strictEqual(first.inspection.selection.elementNumber, 1);
  assert.strictEqual(first.inspection.target.allocation.id, 'stable-source-order');
  assert.strictEqual(first.editImpact.status, 'frame-specific');
  assert.strictEqual(first.editImpact.selection.group, 'Clsn1');
  assert.strictEqual(first.editImpact.selection.slot, 0);
  assert.deepStrictEqual(first.editImpact.effects, { filesystem: false, editor: false, clipboard: false, command: false, route: false, mutationAuthority: false });
  assert(first.routes.some(item => item.kind === 'block') && first.routes.some(item => item.kind === 'assignment'));
  assert.strictEqual(record.collisionAuthorities.size, first.routes.length);
  const assignment = first.routes.find(item => item.kind === 'assignment');
  let revealed = null;
  const editor = { document, viewColumn: 1, selection: null, revealRange: range => { revealed = range; } };
  const opened = await openCollisionSourceRoute(record, assignment.route, { ...serviceBase, window: { showTextDocument: async () => editor } });
  assert.strictEqual(opened, editor);
  assert(editor.selection && revealed, 'selection is assigned only after the post-open authority check succeeds');
  assert(sourceHandoffDetails(airPath).line >= 899, 'the deep AIR collision route anchors its escape controls at the revealed source range');
  const sibling = first.routes.find(item => item.kind === 'block');
  await openCollisionSourceRoute(record, sibling.route, { ...serviceBase, window: { showTextDocument: async () => editor } });
  assert(record.consumedCollisionRoutes.has(assignment.route) && record.consumedCollisionRoutes.has(sibling.route), 'two sibling routes from one rendered inspection remain independently usable');
  await assert.rejects(() => openCollisionSourceRoute(record, assignment.route, { ...serviceBase, window: { showTextDocument: async () => editor } }), /already used/);

  const inheritedText = text.replace('Clsn1: 1', 'Clsn1Default: 1') + '\n0,1, 0,0, 2', inheritedDocument = { fileName: airPath, isClosed: false, version: 7, getText: () => inheritedText }, inheritedWorkspace = { textDocuments: [inheritedDocument], openTextDocument: async () => inheritedDocument };
  const inherited = await buildCollisionInspection(makeRecord(), { action: 200, elementIndex: 1, groupKey: 'clsn1', slot: 0 }, { ...serviceBase, workspace: inheritedWorkspace });
  assert.strictEqual(inherited.editImpact.status, 'inherited-default');
  assert.strictEqual(inherited.editImpact.materializationOnEdit, true);
  assert.strictEqual(inherited.editImpact.materializesCount, 1, 'the actual browser host projection discloses that a first local edit materializes every effective same-group box');
  assert.strictEqual(inherited.editImpact.ownership.affected.ownerCount, 1);
  assert.strictEqual(inherited.editImpact.ownership.affected.inheritorCount, 1);

  const staleRecord = makeRecord(), stale = await buildCollisionInspection(staleRecord, { action: 200, elementIndex: 0 }, serviceBase), staleRoute = stale.routes.find(item => item.kind === 'assignment').route;
  text = text.replace('-10', '-11'); document.version += 1;
  await assert.rejects(() => openCollisionSourceRoute(staleRecord, staleRoute, { ...serviceBase, window: { showTextDocument: async () => editor } }), /changed|stale/);
  assert(staleRecord.consumedCollisionRoutes.has(staleRoute), 'a failed stale route is still consumed before any editor is opened');

  let raceSourceLoads = 0, raceReveals = 0;
  const floatingRaceWorkspace = { textDocuments: [document], openTextDocument: async () => { raceSourceLoads += 1; return document; } };
  const floatingRaceRecord = makeRecord(); floatingRaceRecord.panel.reveal = () => { raceReveals += 1; };
  const floatingRaceInspection = await buildCollisionInspection(floatingRaceRecord, { action: 200, elementIndex: 0 }, { ...serviceBase, workspace: floatingRaceWorkspace });
  const floatingRaceRoute = floatingRaceInspection.routes.find(item => item.kind === 'assignment').route;
  const floatingRaceTask = openCollisionSourceRoute(floatingRaceRecord, floatingRaceRoute, { ...serviceBase, workspace: floatingRaceWorkspace, window: { showTextDocument: async () => editor } });
  await Promise.resolve(); floatingRaceRecord.floating = true;
  assert.strictEqual(await floatingRaceTask, editor, 'a floated AIR browser is restored before opening its exact collision source');
  assert.strictEqual(floatingRaceRecord.floating, false, 'source navigation clears the tracked floating state after restoring the browser');
  assert.strictEqual(raceSourceLoads, 0, 'becoming floating during collision evidence rebuild rejects before any source document admission');
  assert(raceReveals >= 1, 'the exact AIR browser is revealed while it returns to the main window');

  let releaseOld;
  const oldDocument = { fileName: airPath, isClosed: false, version: 8, getText: () => text }, newText = text.replace('-11', '-12'), newDocument = { fileName: airPath, isClosed: false, version: 9, getText: () => newText };
  let openCount = 0;
  const raceWorkspace = { textDocuments: [], openTextDocument: async () => { openCount += 1; if (openCount === 1) return new Promise(resolve => { releaseOld = () => resolve(oldDocument); }); return newDocument; } };
  const raceRecord = { panel: { active: true }, airSourceAvailable: true, data: { airPath }, collisionGeneration: 0, collisionEpoch: 0, latestCollisionRequest: 0, collisionQueue: Promise.resolve(), collisionAuthorities: new Map(), consumedCollisionRoutes: new Set() }, published = [];
  const oldTask = queueCollisionInspection(raceRecord, { request: 1, action: 200, elementIndex: 0 }, payload => { published.push(payload); }, { ...serviceBase, workspace: raceWorkspace });
  await Promise.resolve(); await Promise.resolve();
  raceRecord.collisionEpoch += 1; raceRecord.collisionAuthorities.clear();
  const newTask = queueCollisionInspection(raceRecord, { request: 1, action: 200, elementIndex: 0 }, payload => { published.push(payload); }, { ...serviceBase, workspace: raceWorkspace });
  releaseOld(); await oldTask; await newTask;
  assert.strictEqual(published.length, 1, 'a host-monotonic epoch prevents an old same-number client request from publishing into a regenerated page');
  assert.strictEqual(published[0].inspection.sourceFingerprint, require('crypto').createHash('sha256').update(newText).digest('hex').toUpperCase());

  raceRecord.airSourceAvailable = false;
  await assert.rejects(() => queueCollisionInspection(raceRecord, { request: 2, action: 200, elementIndex: 0 }, payload => published.push(payload), { ...serviceBase, workspace: raceWorkspace }), /removed or renamed/);
  assert.strictEqual(published.length, 1, 'a removed/renamed AIR path cannot publish a new inspection even when an old document object remains available');
  console.log('AIR docking collision inspection host keeps dirty-document evidence and one-use source routes exact');
  sessions.clear();
})().catch(error => { console.error(error); process.exitCode = 1; });
