'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildStateTransferCatalog, stateCatalogStillCurrent, stateTransferFindings } = require('../src/state_transfer_catalog');
const { parseStateSource } = require('../src/state_transfer_model');
const { functionOwnerCacheStats, resetFunctionOwnerCacheForTests } = require('../src/zss_function_catalog');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-state-catalog-')), game = path.join(root, 'Game'), ryu = path.join(game, 'chars', 'Ryu');
fs.mkdirSync(path.join(game, 'external', 'script'), { recursive: true }); fs.writeFileSync(path.join(game, 'external', 'script', 'main.lua'), '');
fs.mkdirSync(path.join(game, 'save'), { recursive: true }); fs.mkdirSync(path.join(game, 'data'), { recursive: true }); fs.mkdirSync(ryu, { recursive: true });
fs.mkdirSync(path.join(game, 'resources'), { recursive: true }); fs.mkdirSync(path.join(game, 'src', 'resources'), { recursive: true });
const def = path.join(ryu, 'Ryu.def'), first = path.join(ryu, 'first.zss'), second = path.join(ryu, 'second.cns'), state2 = path.join(ryu, 'state2.zss'), state10 = path.join(ryu, 'state10.zss');
const stcommon = path.join(game, 'data', 'common1.cns.zss'), cmd = path.join(game, 'data', 'Ryu.cmd'), lateState = path.join(game, 'data', 'late-state.cns'), runtime = path.join(game, 'data', 'runtime.cns.zss'), config = path.join(game, 'save', 'config.ini');
fs.writeFileSync(path.join(game, 'resources', 'defaultConfig.ini'), '[Config]\nMotif = data/system.def\n[Common]\nStates = data/default-common.cns\nStates10 = common10.cns\nStates2 = common2.cns\nStates20 = priority.cns\n');
fs.writeFileSync(path.join(game, 'src', 'resources', 'defaultConfig.ini'), '[Config]\nMotif = data/wrong-system.def\n[Common]\nStates = data/wrong-source-only.cns\n');
fs.writeFileSync(path.join(game, 'data', 'system.def'), '[Files]\nfight = fight.def\n');
fs.writeFileSync(path.join(game, 'data', 'fight.def'), '[Files]\n');
fs.writeFileSync(path.join(game, 'data', 'default-common.cns'), '[StateDef 800]\n');
fs.writeFileSync(path.join(game, 'data', 'common2.cns'), '[StateDef 902]\n'); fs.writeFileSync(path.join(game, 'data', 'common10.cns'), '[StateDef 910]\n'); fs.writeFileSync(path.join(game, 'data', 'priority.cns'), '[StateDef 920]\n');
fs.writeFileSync(def, '[Files]\nst10 = state10.zss\nst = first.zss\nst3 = late-state.cns\nst2 = state2.zss\nst1 = second.cns\ncmd = Ryu.cmd\nstcommon = common1.cns\n');
fs.writeFileSync(first, '# Authored starting state.\n[StateDef 100]\nchangeState{value: 999}\n'); fs.writeFileSync(second, '; Authored classic state.\n[StateDef 100]\n[StateDef 200]\n');
fs.writeFileSync(state2, '[StateDef 202]\n'); fs.writeFileSync(state10, '[StateDef 210]\n');
fs.writeFileSync(lateState, '[StateDef 203]\n'); fs.writeFileSync(cmd, '[StateDef 300]\n'); fs.writeFileSync(stcommon, '[StateDef 0]\n'); fs.writeFileSync(runtime, '[StateDef 900]\n');
fs.writeFileSync(config, '[Config]\nMotif = data/system.def\nMotif = data/wrong-system.def\n[Config]\nMotif = data/also-wrong.def\n[Common]\nStates = data/runtime.cns\nStates = data/wrong-user.cns\n[Common]\nStates = data/also-wrong-user.cns\n');
const uri = filename => ({ scheme: 'file', fsPath: path.resolve(filename), toString: () => `file:${path.resolve(filename)}` });
const documents = [];
function openDocument(filename, languageId, initial, dirty = false) {
  let text = initial, version = 1, isDirty = dirty;
  const document = { uri: uri(filename), fileName: filename, languageId, get version() { return version; }, get isDirty() { return isDirty; }, getText: () => text, edit(value, nextDirty = true) { text = value; version += 1; isDirty = nextDirty; }, get lineCount() { return text.split(/\r?\n/).length; }, lineAt: line => ({ text: text.split(/\r?\n/)[line] || '' }) };
  documents.push(document); return document;
}
const vscode = { Uri: { file: uri }, workspace: { textDocuments: documents, workspaceFolders: [{ uri: uri(path.join(game, 'chars')) }], getConfiguration: () => ({ get: (_key, fallback) => fallback }), findFiles: async () => [uri(def)] } };
const assigned = [first, second, state2, lateState, state10, cmd, stcommon];
const scope = { root: ryu, def, characterName: 'Ryu', missingDependencies: [], unsupportedDependencies: [], templateBase: '', projectRoots: [], scopeFiles: { assigned } };
const watchedDependencies = [];
const service = { context: {}, scope: () => scope, watchDependency(filename) { watchedDependencies.push(path.resolve(filename)); } };

(async () => {
  resetFunctionOwnerCacheForTests();
  let catalog = await buildStateTransferCatalog(vscode, uri(first), service);
  assert.strictEqual(catalog.complete, true, catalog.limitations.join(' '));
  assert.strictEqual(catalog.provenance.commit, 'b464672651c87c42aeca10bb5c33003f26d42071');
  assert.deepStrictEqual(catalog.entries.map(entry => entry.role), ['st', 'st1', 'st2', 'st3', 'st10', 'cmd', 'stcommon', 'config:States', 'config:States2', 'config:States10', 'config:States20']);
  assert.deepStrictEqual(catalog.definitions.map(item => item.value), [100, 100, 200, 202, 203, 210, 300, 0, 900, 902, 910, 920], 'natural SortedKeys order is independent of DEF/config text order and a partial user [Common] overlays rather than erases engine defaults');
  assert.strictEqual(catalog.definitions[0].documentation,'Authored starting state.','runtime StateDef completion authority retains adjacent authored ZSS documentation');
  assert.strictEqual(catalog.definitions[1].documentation,'Authored classic state.','runtime StateDef completion authority retains adjacent authored CNS documentation');
  assert.strictEqual(catalog.authority.defaultConfig, path.join(game, 'resources', 'defaultConfig.ini'), 'the engine-loaded runtime resource wins; a mismatched source-tree defaultConfig is never accepted as binary authority');
  assert.strictEqual(catalog.active.get(100).filename, first, 'the first positive declaration in compile order is active');
  assert.strictEqual(await stateCatalogStillCurrent(vscode, catalog, service), true);
  fs.writeFileSync(path.join(ryu, 'priority.cns'), '[StateDef 921]\n');
  assert.strictEqual(await stateCatalogStillCurrent(vscode, catalog, service), false, 'creation of a higher-precedence common-state candidate retires the lower selected result');
  fs.rmSync(path.join(ryu, 'priority.cns'));
  for (const [name, state] of [['late-state.cns', 1203], ['Ryu.cmd', 1300], ['common1.cns', 1000]]) {
    const created = path.join(ryu, name); fs.writeFileSync(created, `[StateDef ${state}]\n`);
    assert.strictEqual(await stateCatalogStillCurrent(vscode, catalog, service), false, `creation of the higher-precedence ${name} candidate retires the catalog`);
    fs.rmSync(created);
  }
  assert.strictEqual(functionOwnerCacheStats().domainScans, 1, 'state build and validation reuse the exact function-owner domain index instead of rescanning the roster');
  assert.deepStrictEqual(stateTransferFindings(catalog, parseStateSource('changeState{value: 999}\ntargetState{value:-2}\nselfState{value:777}\nhelper{stateNo:778}\nhelper(1), changeState{value:779}\nchangeState{value:map(Next)}\nhitDef{fall.recover:0}', first, 'zss')).map(item => item.code), ['missing-state', 'negative-state-transfer', 'missing-state'], 'unredirected Helper starts use this character catalog while SelfState, redirected, dynamic, and unrelated fields remain unguessed');
  const targetOwnership = parseStateSource('[StateDef 10]\ntargetState { value: 777; }\n[StateDef -2]\ntargetState { value: 778; }\nfunction F(){ targetState { value: 779; } }', first, 'zss');
  assert.deepStrictEqual(stateTransferFindings(catalog, targetOwnership).map(item => item.message.match(/StateDef (\d+)/)?.[1]), ['777', '778'], 'ordinary and -2/-4 TargetState ownership resolve to this complete character catalog; function ownership stays unproven');
  const selfOwnership=parseStateSource('[StateDef 10]\nselfState { value: 776; }\n[StateDef -4]\nselfState { value: 775; }',first,'zss');
  assert.deepStrictEqual(stateTransferFindings(catalog,selfOwnership).map(item=>item.message.match(/StateDef (\d+)/)?.[1]),['775'],'SelfState remains recipient-dependent in ordinary states but is exact for the own-player -2/-4 executor');
  const runOwnership=parseStateSource('[StateDef 10]\nrunState { value: 774; }\nrunState { value: 773; playerno: 2; }\nhelper(1), runState { value: 772; }',first,'zss',{enabledCapabilities:['zss.run-state']});
  assert.deepStrictEqual(stateTransferFindings(catalog,runOwnership).map(item=>item.message.match(/StateDef (\d+)/)?.[1]),['774'],'RunState resolves only when neither redirectid nor playerno changes its source character catalog');

  const liveSecond = openDocument(second, 'ikemen-cns', '[StateDef 100]\n[StateDef 250]\n', true);
  resetFunctionOwnerCacheForTests(); catalog = await buildStateTransferCatalog(vscode, uri(first), service);
  assert.strictEqual(catalog.complete, true, 'unsaved assigned code text is authoritative without changing assignment ownership');
  assert(catalog.definitions.some(item => item.value === 250) && !catalog.definitions.some(item => item.value === 200));
  assert.strictEqual(await stateCatalogStillCurrent(vscode, catalog, service), true);
  liveSecond.edit('[StateDef 100]\n[StateDef 251]\n');
  assert.strictEqual(await stateCatalogStillCurrent(vscode, catalog, service), false, 'an assigned source edit retires the prior catalog');

  const liveConfig = openDocument(config, 'ini', '[Common]\nStates = data/runtime.cns\n', true);
  resetFunctionOwnerCacheForTests(); catalog = await buildStateTransferCatalog(vscode, uri(first), service);
  assert.strictEqual(catalog.complete, false); assert(catalog.limitations.some(item => /config\.ini has unsaved/i.test(item)));
  liveConfig.edit('[Common]\nStates = data/runtime.cns\n', false);

  liveConfig.edit('[Common]\nStates = data/missing.cns\n', false);
  resetFunctionOwnerCacheForTests(); catalog = await buildStateTransferCatalog(vscode, uri(first), service);
  assert.strictEqual(catalog.complete, false); assert(catalog.limitations.some(item => /runtime common-state assignment is missing/i.test(item)), 'missing runtime common assignments fail closed');
  assert(watchedDependencies.some(item => item.toLowerCase() === path.join(game, 'data', 'missing.cns').toLowerCase()), 'missing runtime candidates use the existing shared dependency watcher so later creation can refresh the catalog');
  liveConfig.edit('[Common]\nStates = data/runtime.cns\n', false);

  const originalFirst = fs.readFileSync(first, 'utf8');
  fs.writeFileSync(first, `${originalFirst}\n${'# padding\n'.repeat(150)}`);
  resetFunctionOwnerCacheForTests(); catalog = await buildStateTransferCatalog(vscode, uri(first), service, { fileBytes: 1024 });
  assert.strictEqual(catalog.complete, false); assert(catalog.limitations.some(item => /per-file/i.test(item)), 'per-file byte bounds suppress the runtime catalog');
  fs.writeFileSync(first, Array.from({ length: 101 }, (_, index) => `[StateDef ${1000 + index}]`).join('\n'));
  resetFunctionOwnerCacheForTests(); catalog = await buildStateTransferCatalog(vscode, uri(first), service, { records: 100 });
  assert.strictEqual(catalog.complete, false); assert(catalog.limitations.some(item => /record limit/i.test(item)), 'record bounds suppress the runtime catalog');
  fs.writeFileSync(first, `[StateDef 1]\n${'# pad\n'.repeat(100)}`);
  liveSecond.edit(`[StateDef 2]\n${'; pad\n'.repeat(100)}`);
  resetFunctionOwnerCacheForTests(); catalog = await buildStateTransferCatalog(vscode, uri(first), service, { fileBytes: 2048, totalBytes: 1024 });
  assert.strictEqual(catalog.complete, false); assert(catalog.limitations.some(item => /byte limit/i.test(item)), 'cumulative byte bounds suppress the runtime catalog');
  liveSecond.edit('[StateDef 100]\n[StateDef 251]\n');
  fs.writeFileSync(first, originalFirst);

  const duplicateZss = stateTransferFindings(null, parseStateSource('[StateDef 1]\n[StateDef 1]\n', first, 'zss'));
  const duplicateCns = stateTransferFindings(null, parseStateSource('[StateDef 1]\n[StateDef 1]\n', second, 'ikemen-cns'));
  assert(duplicateZss.every(item => item.code === 'duplicate-statedef' && item.severity === 'error'));
  assert(duplicateCns.every(item => item.severity === 'warning'));
  assert.deepStrictEqual(stateTransferFindings(null, parseStateSource('targetState { value: -4; }', first, 'zss')).map(item => item.code), ['negative-state-transfer'], 'negative literal transfers are errors even when runtime catalog authority is incomplete');
  console.log('Runtime StateDef catalog ordering, freshness, and findings tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => fs.rmSync(root, { recursive: true, force: true }));
