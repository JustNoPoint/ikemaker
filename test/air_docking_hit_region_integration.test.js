'use strict';

const assert = require('assert');
const path = require('path');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {};
  if (request === './air_viewer' && /air_docking_workspace\.js$/.test(parent?.filename || '')) return { parseAir: () => [], inferCharacterFiles: () => ({}), collisionRuntimeOptions: () => ({}), collisionRuntimeDraftEntries: () => [] };
  return originalLoad.call(this, request, parent, isMain);
};
const { buildCollisionInspection, html, openHitRegionSourceRoute } = require('../src/air_docking_workspace');
const { hash } = require('../src/mutation_safety');
Module._load = originalLoad;

const airPath = path.resolve('/char/main.air'), sourcePath = path.resolve('/char/options.zss');
let airText = '[Begin Action 200]\nClsn2: 1\nClsn2[0] = -10, -20, 10, 20\n0,0, 0,0, 2';
const sourceText = '[Function Init()]\nmap(JNP_SF6_cfg_hit_region_low_clsn2_index) := 0;\nmap(JNP_SF6_cfg_hit_region_high_clsn2_index) := 2;\n';
let sourceCurrent = sourceText;
const positionAt = offset => { const before = sourceText.slice(0, offset).split(/\r?\n/); return { line: before.length - 1, character: before[before.length - 1].length }; };
const airDocument = { fileName: airPath, isClosed: false, version: 3, getText: () => airText, positionAt: offset => ({ line: 0, character: offset }) };
const sourceDocument = { fileName: sourcePath, isClosed: false, version: 4, getText: () => sourceCurrent, positionAt };
const workspace = { textDocuments: [airDocument, sourceDocument], openTextDocument: async filename => path.resolve(filename) === sourcePath ? sourceDocument : airDocument };
class Range { constructor(start, end) { this.start = start; this.end = end; } }
const referenceContext = { inventoryComplete: true, generation: 8, defPath: path.resolve('/char/main.def'), assignedSources: [sourcePath], sources: [{ filename: sourcePath, text: sourceText, sourceHash: hash(sourceText), syntax: 'zss', available: true, version: 4, dirty: false }] };
const services = { workspace, Range, commands: { executeCommand: async (command, options) => command === 'ikemen.textToolbar.resumeFromVisualViewer' ? { attached: true, selectedFile: options.selectedFile, airReturnRendered: true } : undefined }, collisionRuntimeOptions: () => ({ target: { channel: 'stable', version: '1.0' }, capabilityFingerprint: 'A'.repeat(64), allocationDecision: { capabilityId: 'collision.air-index-allocation', enabled: false, status: 'unsupported', capabilityFingerprint: 'A'.repeat(64) } }), readRuntimePlan: () => ({ entries: [] }), collisionRuntimeDraftEntries: () => [], referenceContext: () => referenceContext };
const makeRecord = () => ({ panel: { active: true }, data: { airPath, ownerDef: referenceContext.defPath }, referenceContext, collisionGeneration: 0, collisionAuthorities: new Map(), consumedCollisionRoutes: new Set(), hitRegionAuthorities: new Map(), consumedHitRegionRoutes: new Set() });

(async () => {
  const record = makeRecord(), result = await buildCollisionInspection(record, { action: 200, elementIndex: 0, groupKey: 'clsn2', slot: 0 }, services);
  assert.strictEqual(result.hitRegionSelection.available, true);
  assert.deepStrictEqual([result.hitRegionSelection.evidence.selectedBox.groupKey, result.hitRegionSelection.evidence.selectedBox.effectiveSlot], ['clsn2', 0]);
  assert.deepStrictEqual([result.hitRegionSelection.evidence.sourceMeaning.status, result.hitRegionSelection.evidence.sourceMeaning.name], ['source-proven', 'Configured Low']);
  const routed = result.hitRegionSelection.evidence.evidence.find(item => item.meaning === 'Configured Low index 0');
  assert(routed?.route && record.hitRegionAuthorities.has(routed.route), 'the host issues a one-use route only for exact source evidence');

  let revealed = null;
  const editor = { document: sourceDocument, viewColumn: 1, selection: null, revealRange: range => { revealed = range; } };
  await openHitRegionSourceRoute(record, routed.route, { ...services, window: { showTextDocument: async () => editor } });
  assert(editor.selection && revealed);
  await assert.rejects(() => openHitRegionSourceRoute(record, routed.route, { ...services, window: { showTextDocument: async () => editor } }), /already used/);

  let raceSourceLoads = 0, raceReveals = 0;
  const floatingRaceWorkspace = { textDocuments: [airDocument, sourceDocument], openTextDocument: async filename => { raceSourceLoads += 1; return path.resolve(filename) === sourcePath ? sourceDocument : airDocument; } };
  const floatingRaceRecord = makeRecord(); floatingRaceRecord.panel.reveal = () => { raceReveals += 1; };
  const floatingRaceInspection = await buildCollisionInspection(floatingRaceRecord, { action: 200, elementIndex: 0, groupKey: 'clsn2', slot: 0 }, { ...services, workspace: floatingRaceWorkspace });
  const floatingRaceRoute = floatingRaceInspection.hitRegionSelection.evidence.evidence.find(item => item.meaning === 'Configured Low index 0').route;
  const floatingRaceTask = openHitRegionSourceRoute(floatingRaceRecord, floatingRaceRoute, { ...services, workspace: floatingRaceWorkspace, window: { showTextDocument: async () => editor } });
  await Promise.resolve(); floatingRaceRecord.floating = true;
  assert.strictEqual(await floatingRaceTask, editor, 'a floated AIR browser is restored before opening its exact hit-region source');
  assert.strictEqual(floatingRaceRecord.floating, false, 'hit-region navigation clears the tracked floating state after restoring the browser');
  assert.strictEqual(raceSourceLoads, 1, 'only the exact routed hit-region source document is admitted after the browser returns');
  assert(raceReveals >= 1, 'the exact AIR browser is revealed while it returns to the main window');

  const staleRecord = makeRecord(), staleResult = await buildCollisionInspection(staleRecord, { action: 200, elementIndex: 0, groupKey: 'clsn2', slot: 0 }, services), staleRoute = staleResult.hitRegionSelection.evidence.evidence.find(item => item.meaning === 'Configured Low index 0').route;
  sourceCurrent = sourceText.replace(':= 0', ':= 1'); sourceDocument.version += 1;
  await assert.rejects(() => openHitRegionSourceRoute(staleRecord, staleRoute, { ...services, window: { showTextDocument: async () => editor } }), /changed|stale/i);
  assert(staleRecord.consumedHitRegionRoutes.has(staleRoute));
  sourceCurrent = sourceText; sourceDocument.version += 1;

  const missing = await buildCollisionInspection(makeRecord(), { action: 200, elementIndex: 0, groupKey: 'clsn2', slot: 1 }, services);
  assert.strictEqual(missing.hitRegionSelection.available, false);
  assert.match(missing.hitRegionSelection.reason, /not filled/i);

  const output = html({ airPath, sourceFingerprint: 'A'.repeat(64), actions: [], initialAction: 0, initialOccurrence: '', initialView: 'collisions', initialReferenceView: 'collision', initialReferenceScope: 'selected', initialElementIndex: 0, initialCollisionGroup: 'clsn2', initialCollisionRecord: 0, initialCollisionSlot: 0, initialCollisionMode: 'inspect', initialAssistance: {}, forceInitialView: false, references: { available: false, items: [], occurrences: [] } });
  assert(output.includes('id="hitRegionBadge"') && output.includes('id="hitRegionConnections"'));
  assert(output.includes('Configured meaning:') && output.includes('runtime unresolved'));
  assert(output.includes('openHitRegionSource') && output.includes('Open exact source for'));
  assert(output.includes("diagnosticSummary.textContent='Diagnostics ('") && output.includes('item.severity.toUpperCase()'));
  assert(output.includes("primaryView==='references'&&referenceView==='collision'") && output.includes("if(referenceView==='collision'&&!hitRegionSelection)requestCollisions()"), 'a direct Code connections handoff requests the same exact selected-box evidence without another window');
  assert(output.includes('allRouted.slice(0,6)') && output.includes('more exact source route(s)'), 'the compact summary caps visible routes and progressively discloses the bounded remainder');
  assert(output.includes('.hit-region-summary{display:flex') && !output.includes('window.open('));
  console.log('AIR docking selected-box hit-region evidence stays compact, exact-slot bound, and source-routed');
})().catch(error => { console.error(error); process.exitCode = 1; });
