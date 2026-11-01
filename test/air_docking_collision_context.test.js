'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {};
  if (request === './air_viewer' && /air_docking_workspace\.js$/.test(parent?.filename || '')) return { parseAir: () => [], inferCharacterFiles: () => ({}), collisionRuntimeOptions: () => ({}), collisionRuntimeDraftEntries: () => [] };
  return originalLoad.call(this, request, parent, isMain);
};
const { MAX_PUBLIC_CHARACTER_CONTEXT_CARDS, buildModel, html, exactAssignedConstants, currentSourceSnapshot, buildCharacterCollisionContext, validateCharacterContextRoute, openCharacterContextRoute } = require('../src/air_docking_workspace');
Module._load = originalLoad;

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-air-context-'));
const airPath = path.join(root, 'main.air'), defPath = path.join(root, 'char.def'), constantsPath = path.join(root, 'dirty constants.cns');
fs.writeFileSync(airPath, '[Begin Action 0]\n0,0,0,0,1\n');
fs.writeFileSync(defPath, '[Info]\nikemenversion = 1.0\n[Files]\ncns = disk.cns\n');
fs.writeFileSync(constantsPath, '[Size]\npushfactor = 99\n');
const defText = '[Info]\nikemenversion = 1.0\n[Files]\ncns = "dirty constants.cns" ; current dirty assignment\n';
const constantsText = '[Size]\nstand.sizebox = -11, -72, 12, 0\nattack.dist.width = 160, 0\nattack.dist.height = 0, 70\npushfactor = 0.8\nweight = 3\ndepth = -8, 8\nattack.depth = -4, 4\nxscale = 1\nyscale = 1\n';
const defDocument = { fileName: defPath, isClosed: false, isDirty: true, version: 4, getText: () => defText, positionAt: offset => ({ line: defText.slice(0, offset).split('\n').length - 1, character: offset - (defText.lastIndexOf('\n', offset - 1) + 1) }) };
const constantsDocument = { fileName: constantsPath, isClosed: false, isDirty: true, version: 9, getText: () => constantsText, positionAt: offset => ({ line: constantsText.slice(0, offset).split('\n').length - 1, character: offset - (constantsText.lastIndexOf('\n', offset - 1) + 1) }) };
const workspace = { textDocuments: [defDocument, constantsDocument], openTextDocument: async filename => path.resolve(filename).toLowerCase() === path.resolve(defPath).toLowerCase() ? defDocument : constantsDocument };
const fingerprint = 'A'.repeat(64);
const runtime = () => ({ target: { channel: 'nightly', buildId: 'nightly-test' }, targetBuildId: 'nightly-test', capabilityFingerprint: fingerprint });
const services = { workspace, commands: { executeCommand: async (command, options) => command === 'ikemen.textToolbar.resumeFromVisualViewer' ? { attached: true, selectedFile: options.selectedFile, airReturnRendered: true } : undefined }, inferCharacterFiles: () => ({ defPath, constantsPath }), collisionRuntimeOptions: runtime };

(async () => {
  assert.strictEqual(exactAssignedConstants(defPath, defText), path.normalize(constantsPath), 'the current dirty DEF assignment, including quotes/spaces/comments, is authoritative');
  const bundle = buildCharacterCollisionContext(airPath, 7, defPath, services);
  assert.strictEqual(bundle.projection.available, true);
  assert.strictEqual(bundle.projection.sources.def.sourceDirty, true);
  assert.strictEqual(bundle.projection.sources.constants.sourceDirty, true);
  assert.strictEqual(bundle.projection.constantsBinding.status, 'exact');
  assert(bundle.projection.cards.length <= MAX_PUBLIC_CHARACTER_CONTEXT_CARDS);
  assert.strictEqual(bundle.projection.cards.find(item => item.key === 'pushfactor').values[0], 0.8, 'dirty constants text wins over disk bytes');
  assert.match(bundle.projection.cards.find(item => item.key === 'stand.sizebox').meaning, /Whole-character Size-group baseline/);
  assert.match(bundle.projection.cards.find(item => item.key === 'attack.dist.width').meaning, /Proximity-guard range/);
  assert.match(bundle.projection.cards.find(item => item.key === 'depth').meaning, /Z-axis range\/band/);
  assert(bundle.authorities.size >= 8, 'each exact assignment receives an independent source route');
  const duplicateDefText = defText + 'cns = "dirty constants.cns"\n', duplicateDef = { ...defDocument, version: 5, getText: () => duplicateDefText }, unresolved = buildCharacterCollisionContext(airPath, 70, defPath, { ...services, workspace: { ...workspace, textDocuments: [duplicateDef, constantsDocument] } });
  assert.strictEqual(unresolved.projection.constantsBinding.status, 'unresolved');
  assert.strictEqual(unresolved.authorities.size, 0, 'missing, duplicate, conflicting, or unproven DEF binding exposes no source route');
  const token = [...bundle.authorities.keys()].find(key => bundle.authorities.get(key).occurrenceKey === 'pushfactor'), authority = bundle.authorities.get(token);
  assert(validateCharacterContextRoute(authority, bundle, false));

  class Range { constructor(start, end) { this.start = start; this.end = end; } }
  const editor = { document: constantsDocument, viewColumn: 1, selection: null, revealRange(range) { this.revealed = range; } };
  const record = { panel: { active: true }, data: { airPath, ownerDef: defPath }, referenceContext: { defPath }, characterContextGeneration: 7, characterContextAuthorities: new Map(bundle.authorities), consumedCharacterContextRoutes: new Set() };
  await openCharacterContextRoute(record, token, { ...services, Range, window: { showTextDocument: async () => editor }, buildCharacterCollisionContext });
  assert(editor.selection && editor.revealed, 'the route opens and reveals its exact current source span');
  await assert.rejects(() => openCharacterContextRoute(record, token, { ...services, Range, window: { showTextDocument: async () => editor }, buildCharacterCollisionContext }), /already used/);

  const stale = buildCharacterCollisionContext(airPath, 8, defPath, services), staleToken = [...stale.authorities.keys()].find(key => stale.authorities.get(key).occurrenceKey === 'weight'), staleRecord = { panel: { active: true }, data: { airPath, ownerDef: defPath }, referenceContext: { defPath }, characterContextGeneration: 8, characterContextAuthorities: new Map(stale.authorities), consumedCharacterContextRoutes: new Set() };
  const prior = constantsDocument.getText; constantsDocument.getText = () => constantsText.replace('weight = 3', 'weight = 4'); constantsDocument.version = 10;
  await assert.rejects(() => openCharacterContextRoute(staleRecord, staleToken, { ...services, Range, window: { showTextDocument: async () => editor }, buildCharacterCollisionContext }), /changed/);
  constantsDocument.getText = prior; constantsDocument.version = 9;

  let activeFingerprint = fingerprint; const capabilityServices = { ...services, collisionRuntimeOptions: () => ({ target: { channel: 'nightly', buildId: 'nightly-test' }, targetBuildId: 'nightly-test', capabilityFingerprint: activeFingerprint }) }, capabilityBundle = buildCharacterCollisionContext(airPath, 11, defPath, capabilityServices), capabilityToken = [...capabilityBundle.authorities.keys()][0], capabilityRecord = { panel: { active: true }, data: { airPath, ownerDef: defPath }, referenceContext: { defPath }, characterContextGeneration: 11, characterContextAuthorities: new Map(capabilityBundle.authorities), consumedCharacterContextRoutes: new Set() };
  activeFingerprint = 'B'.repeat(64);
  await assert.rejects(() => openCharacterContextRoute(capabilityRecord, capabilityToken, { ...capabilityServices, Range, window: { showTextDocument: async () => editor }, buildCharacterCollisionContext }), /capability changed|changed/i, 'a capability transition invalidates every prior source route');

  const syntheticPath = path.join(root, 'synthetic.cns'), regular = (size, modified = 1) => ({ size, mtimeMs: modified, ctimeMs: modified, isFile: () => true }); let statCalls = 0, reads = 0;
  assert.throws(() => currentSourceSnapshot(syntheticPath, { textDocuments: [] }, { statSync: () => regular(2 * 1024 * 1024 + 1), readFileSync: () => { reads += 1; return ''; } }), /source cap/); assert.strictEqual(reads, 0, 'an oversized closed source is rejected before any read');
  assert.throws(() => currentSourceSnapshot(syntheticPath, { textDocuments: [] }, { statSync: () => ({ size: 0, mtimeMs: 1, ctimeMs: 1, isFile: () => false }), readFileSync: () => '' }), /not a regular source file/);
  assert.throws(() => currentSourceSnapshot(syntheticPath, { textDocuments: [] }, { statSync: () => (++statCalls === 1 ? regular(4, 1) : regular(4, 2)), readFileSync: () => 'test' }), /changed while/);
  const boundedFailures = [
    { statSync: () => regular(2 * 1024 * 1024 + 1), readFileSync: () => '' },
    { statSync: () => ({ size: 0, mtimeMs: 1, ctimeMs: 1, isFile: () => false }), readFileSync: () => '' },
    (() => { let count = 0; return { statSync: () => (++count === 1 ? regular(defText.length, 1) : regular(defText.length, 2)), readFileSync: () => defText }; })()
  ];
  for (const fileSystem of boundedFailures) { const failed = buildCharacterCollisionContext(airPath, 19, defPath, { ...services, workspace: { textDocuments: [] }, fs: fileSystem }); assert.strictEqual(failed.projection.available, false); assert.strictEqual(failed.authorities.size, 0, 'bounded source failures publish no navigation authority'); }

  fs.writeFileSync(defPath, defText); fs.writeFileSync(constantsPath, constantsText);
  const makeClosedWorkspace = onOpen => { const documents = []; return { textDocuments: documents, openTextDocument: async filename => { if (onOpen) onOpen(filename); const text = fs.readFileSync(filename, 'utf8'), document = { fileName: filename, isClosed: false, isDirty: false, version: 1, getText: () => text, positionAt: offset => ({ line: text.slice(0, offset).split('\n').length - 1, character: offset - (text.lastIndexOf('\n', offset - 1) + 1) }) }; documents.push(document); return document; } }; };
  const closedWorkspace = makeClosedWorkspace(), closedServices = { ...services, workspace: closedWorkspace }, closedBundle = buildCharacterCollisionContext(airPath, 21, defPath, closedServices), closedToken = [...closedBundle.authorities.keys()].find(key => closedBundle.authorities.get(key).occurrenceKey === 'pushfactor'), closedRecord = { panel: { active: true }, data: { airPath, ownerDef: defPath }, referenceContext: { defPath }, characterContextGeneration: 21, characterContextAuthorities: new Map(closedBundle.authorities), consumedCharacterContextRoutes: new Set() }, closedEditor = { document: null, viewColumn: 1, revealRange() {} };
  await openCharacterContextRoute(closedRecord, closedToken, { ...closedServices, Range, window: { showTextDocument: async document => { closedEditor.document = document; return closedEditor; } }, buildCharacterCollisionContext });
  assert.strictEqual(closedRecord.consumedCharacterContextRoutes.has(closedToken), true, 'a closed-to-open routed-source transition succeeds once while keeping companion evidence sealed');

  const constantsRaceWorkspace = makeClosedWorkspace(filename => { if (path.resolve(filename).toLowerCase() === path.resolve(constantsPath).toLowerCase()) fs.writeFileSync(defPath, defText.replace('dirty constants.cns', 'other.cns')); }), constantsRaceServices = { ...services, workspace: constantsRaceWorkspace }, constantsRaceBundle = buildCharacterCollisionContext(airPath, 22, defPath, constantsRaceServices), constantsRaceToken = [...constantsRaceBundle.authorities.keys()].find(key => constantsRaceBundle.authorities.get(key).occurrenceKey === 'weight'), constantsRaceRecord = { panel: { active: true }, data: { airPath, ownerDef: defPath }, referenceContext: { defPath }, characterContextGeneration: 22, characterContextAuthorities: new Map(constantsRaceBundle.authorities), consumedCharacterContextRoutes: new Set() }; let constantsRaceReveal = 0;
  await assert.rejects(() => openCharacterContextRoute(constantsRaceRecord, constantsRaceToken, { ...constantsRaceServices, Range, window: { showTextDocument: async () => { constantsRaceReveal += 1; return closedEditor; } }, buildCharacterCollisionContext }), /companion|changed/i); assert.strictEqual(constantsRaceReveal, 0); assert(constantsRaceRecord.consumedCharacterContextRoutes.has(constantsRaceToken), 'a failed companion-DEF race consumes the route without revealing');
  fs.writeFileSync(defPath, defText);

  const defRaceWorkspace = makeClosedWorkspace(filename => { if (path.resolve(filename).toLowerCase() === path.resolve(defPath).toLowerCase()) fs.writeFileSync(constantsPath, constantsText.replace('weight = 3', 'weight = 4')); }), defRaceServices = { ...services, workspace: defRaceWorkspace }, defRaceBundle = buildCharacterCollisionContext(airPath, 23, defPath, defRaceServices), defRaceToken = [...defRaceBundle.authorities.keys()].find(key => defRaceBundle.authorities.get(key).occurrenceKey === 'cns'), defRaceRecord = { panel: { active: true }, data: { airPath, ownerDef: defPath }, referenceContext: { defPath }, characterContextGeneration: 23, characterContextAuthorities: new Map(defRaceBundle.authorities), consumedCharacterContextRoutes: new Set() }; let defRaceReveal = 0;
  await assert.rejects(() => openCharacterContextRoute(defRaceRecord, defRaceToken, { ...defRaceServices, Range, window: { showTextDocument: async () => { defRaceReveal += 1; return closedEditor; } }, buildCharacterCollisionContext }), /companion|changed/i); assert.strictEqual(defRaceReveal, 0); assert(defRaceRecord.consumedCharacterContextRoutes.has(defRaceToken), 'a failed companion-constants race consumes the route without revealing');
  fs.writeFileSync(constantsPath, constantsText);

  const projection = bundle.projection, model = buildModel(airPath, fs.readFileSync(airPath, 'utf8'), '', null, { ownerDef: defPath, constantsPath, characterCollisionContext: projection, collisionMode: 'properties' }), page = html(model);
  assert.strictEqual(model.characterCollisionContext.contextHash, projection.contextHash, 'restored browser data retains the exact host projection');
  assert(page.includes('Character collision context') && page.includes('Open Move Constants') && page.includes('Open AIR Push / Runtime'));
  assert(page.includes('Copy Action aliases remain read-only'));
  assert(page.includes('characterCollisionContextRows.textContent') && !page.includes('characterCollisionContextRows.innerHTML'), 'all dynamic context evidence renders through textContent');
  assert(page.includes("type:'openCharacterContextReference'") && page.includes("type:'characterContextHandoff'"));
  console.log('AIR docking character collision-context tests passed');
})().finally(() => fs.rmSync(root, { recursive: true, force: true })).catch(error => { console.error(error); process.exitCode = 1; });

