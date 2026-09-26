'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { MapRegistryService, resolveCharacterDef, descendantBoundaries } = require('../src/map_registry_service');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'map-registry-service-')), root = path.join(temp, 'Ryu'), shared = path.join(temp, 'shared'); fs.mkdirSync(root); fs.mkdirSync(shared);
const first = path.join(shared, 'first.zss'), second = path.join(shared, 'second.zss');
const commands = path.join(shared, 'commands.jnp'), plainZss = path.join(shared, 'plain.zss'), optedText = path.join(shared, 'legacy.txt');
const uri = (fsPath) => ({ fsPath: path.resolve(fsPath), toString: () => `file:///${path.resolve(fsPath).replace(/\\/g, '/')}` });
const source = new Map([
  [first.toLowerCase(), 'map(JNP_SF6_first) := 1;'], [second.toLowerCase(), 'map(JNP_SF6_second) := 1;'],
  [commands.toLowerCase(), 'trigger1 = map(JNP_SF6_command) = 1'],
  [plainZss.toLowerCase(), 'map(JNP_SF6_plainA) := 1; map(JNP_SF6_plainB) := 2;'],
  [optedText.toLowerCase(), 'map(JNP_SF6_text) := 1;']
]);
const textChoices = { [uri(optedText).toString()]: 'zss' };
for (const filename of [first, second, commands, plainZss, optedText]) fs.writeFileSync(filename, source.get(filename.toLowerCase()), 'utf8');
const vscode = {
  RelativePattern: class RelativePattern { constructor(base, pattern) { this.base = base; this.pattern = pattern; } },
  Uri: { file: uri, parse: (value) => ({ fsPath: value.replace(/^file:\/\/\//, '').replace(/^\/(.:)/, '$1').replace(/\//g, path.sep), toString: () => value }) },
  window: {},
  workspace: {
    workspaceFolders: [], textDocuments: [],
    getConfiguration: () => ({ get: (_name, fallback) => fallback }),
    findFiles: async () => [],
    openTextDocument: async (documentUri) => ({ fileName: documentUri.fsPath, uri: documentUri, languageId: path.resolve(documentUri.fsPath).toLowerCase() === plainZss.toLowerCase() ? 'plaintext' : 'plaintext', getText: () => source.get(path.resolve(documentUri.fsPath).toLowerCase()) || '' })
  }
};

(async () => {
  const service = new MapRegistryService(vscode, { workspaceState: { get: (_key, fallback) => textChoices || fallback } });
  service.scope = (seed) => { const files = seed.fsPath.endsWith('grammar.def') ? [commands, plainZss, optedText] : [seed.fsPath.endsWith('one.def') ? first : second]; return { root, def: seed.fsPath, dependencies: files, missingDependencies: [], label: 'SF6', characterName: 'Ryu', projectId: 'sf6', game: 'SF6', resolved: true, identity: seed.fsPath, currentFile: files[0], scopeFiles: { current: [files[0]], character: files, template: files, assigned: files, available: files } }; };
  const one = { fsPath: path.join(root, 'one.def') }, two = { fsPath: path.join(root, 'two.def') };
  assert.deepStrictEqual((await service.scan(one)).entries.map((entry) => entry.name), ['JNP_SF6_first']);
  assert.deepStrictEqual((await service.scan(two)).entries.map((entry) => entry.name), ['JNP_SF6_second'], 'different DEF/dependency identities must not share one cache result');
  const grammar = await service.scan({ fsPath: path.resolve('C:/game/chars/Ryu/grammar.def') });
  assert.deepStrictEqual(grammar.entries.map((entry) => entry.name), ['JNP_SF6_command', 'JNP_SF6_plainA', 'JNP_SF6_plainB', 'JNP_SF6_text'], 'JNP, plaintext ZSS, and explicitly opted-in TXT dependencies must share the insertion grammar policy');
  source.set(first.toLowerCase(), 'map(JNP_SF6_changed) := 1;');
  fs.writeFileSync(first, source.get(first.toLowerCase()), 'utf8');
  service.invalidate(first);
  assert.deepStrictEqual((await service.scan(one)).entries.map((entry) => entry.name), ['JNP_SF6_changed'], 'external dependency invalidation must clear a warm character cache');
  service.scope = () => ({ root, def: path.join(root, 'dvs.def'), dependencies: [first, second], missingDependencies: [], label: 'DvS', characterName: 'Ryu', projectId: 'dsvssf', game: 'DvS', resolved: true, identity: 'dvs.def', currentFile: first, scopeFiles: { current: [first], character: [first, second], template: [], assigned: [first, second], available: [first, second] } });
  assert.deepStrictEqual((await service.scan({ fsPath: 'dvs.def' }, { refresh: true })).entries, [], 'a DvS scope must not expose confirmed SF6 map namespaces');

  const defs = path.join(temp, 'defs'); fs.mkdirSync(defs);
  const ryuDef = path.join(defs, 'Ryu.def'), dvsDef = path.join(defs, 'DvS.def');
  fs.writeFileSync(ryuDef, '[Files]\nsprite = Ryu.sff\nst = Ryu.zss\n');
  fs.writeFileSync(dvsDef, '[Files]\nsprite = DvS.sff\nst = DvS.zss\n');
  const picker = { isCharacterDef: (filename) => [ryuDef, dvsDef].some((item) => path.resolve(item).toLowerCase() === path.resolve(filename || '').toLowerCase()), nearestCharacterDef: () => '' };
  const contexts = { inside: (filename, folder) => path.resolve(filename).toLowerCase().startsWith(`${path.resolve(folder).toLowerCase()}${path.sep}`) };
  const retainedRyu = { root: path.dirname(ryuDef), files: [ryuDef, first] };
  assert.strictEqual(resolveCharacterDef(dvsDef, retainedRyu, picker, contexts).def, path.resolve(dvsDef), 'an explicit DvS DEF must outrank a retained Ryu panel even when both DEFs share a folder');
  assert.strictEqual(resolveCharacterDef(path.join(temp, 'unrelated.zss'), retainedRyu, picker, contexts).def, '', 'an unrelated seed must not inherit the last visual panel context');

  const unsupported = path.join(shared, 'unsupported.bin'), missing = path.join(shared, 'missing.zss'); fs.writeFileSync(unsupported, 'not indexed');
  vscode.workspace.getConfiguration = () => ({ get: (name, fallback) => name === 'maxAuditFiles' ? 1 : fallback });
  service.scope = () => ({ root, def: path.join(root, 'limited.def'), dependencies: [first], missingDependencies: [missing], unsupportedDependencies: [unsupported], discoverySkips: [], label: 'SF6', characterName: 'Ryu', projectId: 'sf6', game: 'SF6', resolved: true, identity: 'limited.def', currentFile: first, scopeFiles: { current: [first], character: [first], template: [second], assigned: [first], available: [first, second] } });
  const limited = await service.scan({ fsPath: 'limited.def' }, { refresh: true });
  assert.deepStrictEqual(limited.indexedFiles, [path.resolve(first)], 'assigned files must be indexed before reference-template files under the shared cap');
  assert.strictEqual(limited.scopes.find((item) => item.id === 'assigned').fileCount, 1);
  assert.strictEqual(limited.scopes.find((item) => item.id === 'template').fileCount, 0, 'scope counts must report actually indexed files, not all discovered files');
  assert.ok(limited.detail.includes('audit limit') && limited.detail.includes('missing') && limited.detail.includes('unsupported'), 'simultaneous limit, missing, and unsupported conditions must all be disclosed');

  const discoveryRoot = path.join(temp, 'discovery'), archived = path.join(discoveryRoot, 'archive'), nested = path.join(discoveryRoot, 'NestedGame');
  fs.mkdirSync(archived, { recursive: true }); fs.mkdirSync(path.join(nested, '.ikemen'), { recursive: true });
  fs.writeFileSync(path.join(discoveryRoot, 'live.zss'), 'map(JNP_SF6_live) := 1;');
  fs.writeFileSync(path.join(archived, 'old.zss'), 'map(Old) := 1;');
  fs.writeFileSync(path.join(nested, '.ikemen', 'project-registry.json'), '{}');
  fs.writeFileSync(path.join(nested, 'foreign.zss'), 'map(Foreign) := 1;');
  const discovered = service.recursiveCodeFiles(discoveryRoot);
  assert.deepStrictEqual(discovered.files.map((item) => path.basename(item)), ['live.zss'], 'archives and nested project roots must not enter character/project discovery');
  assert.ok(discovered.skipped.some((item) => item.reason === 'nested project boundary'));

  const configuredRoot = path.join(temp, 'ConfiguredGames'), sf6Root = path.join(configuredRoot, 'SF6'), foreignRoot = path.join(sf6Root, 'Foreign');
  fs.mkdirSync(foreignRoot, { recursive: true });
  fs.writeFileSync(path.join(sf6Root, 'sf6.zss'), 'map(JNP_SF6_local) := 1;');
  fs.writeFileSync(path.join(foreignRoot, 'foreign.zss'), 'map(Unnamespaced_foreign) := 1;');
  const configured = [configuredRoot, sf6Root, foreignRoot];
  assert.deepStrictEqual(descendantBoundaries(sf6Root, configured), [path.resolve(foreignRoot)], 'a broad universal ancestor must not become a boundary, but a configured foreign descendant must');
  const isolated = service.recursiveCodeFiles(sf6Root, { boundaries: descendantBoundaries(sf6Root, configured) });
  assert.deepStrictEqual(isolated.files.map((item) => path.basename(item)), ['sf6.zss'], 'a marker-free foreign project declared only by the parent registry must remain outside active-game discovery');
  console.log('Map registry service scope, dependency cache and game filtering tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { fs.rmSync(temp, { recursive: true, force: true }); });
