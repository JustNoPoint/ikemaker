'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildZssFunctionCatalog, catalogStillCurrent, functionOwnerCacheStats, invalidateFunctionOwnerCache, resetFunctionOwnerCacheForTests } = require('../src/zss_function_catalog');
const { MAX_AUTHORITY_WATCH_ROOTS, registerZssFunctionDiagnostics } = require('../src/zss_function_diagnostics');

class Range { constructor(startLine, startCharacter, endLine, endCharacter) { this.start = { line: startLine, character: startCharacter }; this.end = { line: endLine, character: endCharacter }; } }
class Diagnostic { constructor(range, message, severity) { this.range = range; this.message = message; this.severity = severity; } }
class RelativePattern { constructor(base, pattern) { this.base = base; this.pattern = pattern; } }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-function-root-watch-'));
const game = path.join(root, 'Game'), ryu = path.join(game, 'chars', 'Ryu'), outside = path.join(root, 'DeclaredProject'), ken = path.join(outside, 'Ken');
fs.mkdirSync(path.join(game, 'external', 'script'), { recursive: true }); fs.writeFileSync(path.join(game, 'external', 'script', 'main.lua'), '');
fs.mkdirSync(ryu, { recursive: true }); fs.mkdirSync(ken, { recursive: true });
const source = path.join(ryu, 'states.zss'), ryuDef = path.join(ryu, 'Ryu.def'), kenDef = path.join(ken, 'Ken.def');
fs.writeFileSync(source, 'call JNP_Missing();'); fs.writeFileSync(ryuDef, '[Files]\nsprite = Ryu.sff\nst = states.zss\n');
const uri = filename => ({ scheme: 'file', fsPath: path.resolve(filename), toString: () => `file:${path.resolve(filename)}` });
let text = fs.readFileSync(source, 'utf8'), version = 1;
const document = { languageId: 'zss', fileName: source, uri: uri(source), get version() { return version; }, getText: () => text, get lineCount() { return text.split(/\r?\n/).length; }, lineAt: line => ({ text: text.split(/\r?\n/)[line] || '' }) };
const published = new Map(), watchers = [], events = {};
const watcher = pattern => { const callbacks = {}; const value = { pattern, callbacks, disposed: false, onDidChange: callback => { callbacks.change = callback; }, onDidCreate: callback => { callbacks.create = callback; }, onDidDelete: callback => { callbacks.delete = callback; }, dispose() { this.disposed = true; } }; watchers.push(value); return value; };
const event = name => callback => { events[name] = callback; return { dispose() {} }; };
const vscode = {
  Range, Diagnostic, RelativePattern, DiagnosticSeverity: { Error: 0, Warning: 1 }, Uri: { file: uri },
  languages: { createDiagnosticCollection: () => ({ set: (target, value) => published.set(target.toString(), value), get: target => published.get(target.toString()), delete: target => published.delete(target.toString()), clear: () => published.clear(), dispose() {} }) },
  workspace: {
    textDocuments: [document], workspaceFolders: [{ uri: uri(ryu) }],
    getConfiguration: () => ({ get: (_key, fallback) => fallback }), findFiles: async () => [uri(ryuDef)],
    createFileSystemWatcher: watcher,
    onDidOpenTextDocument: event('open'), onDidChangeTextDocument: event('change'), onDidSaveTextDocument: event('save'), onDidCloseTextDocument: event('close'), onDidChangeConfiguration: event('configuration')
  }
};
const scope = { root: ryu, def: ryuDef, characterName: 'Ryu', missingDependencies: [], unsupportedDependencies: [], templateBase: '', projectRoots: [outside], scopeFiles: { assigned: [source] } };
const service = { context: {}, scope: () => scope, watchDependency() {} };

(async () => {
  // A closed competing DEF can appear after the first ownership scan but
  // before its authority-root watchers are attached. The registrar must
  // rebuild once with those watchers active instead of publishing the stale
  // unique-owner result from that first scan.
  resetFunctionOwnerCacheForTests();
  let injectCompetingOwner = true;
  const raced = registerZssFunctionDiagnostics(vscode, { subscriptions: [] }, async doc => {
    const catalog = await buildZssFunctionCatalog(vscode, doc.uri, service);
    if (injectCompetingOwner) {
      injectCompetingOwner = false;
      const relative = path.relative(ken, source).replace(/\\/g, '/');
      fs.writeFileSync(kenDef, `[Files]\nsprite = Ken.sff\nst = ${relative}\n`);
    }
    return catalog;
  }, () => ({ ownedPrefixes: ['JNP_'] }), {
    delay: 10000,
    validateCatalog: catalog => catalogStillCurrent(vscode, catalog, service),
    invalidateAuthority: invalidateFunctionOwnerCache
  });
  await raced.update(document);
  assert.deepStrictEqual(published.get(document.uri.toString()), [], 'the first live update rebuilds under active root watchers and does not publish a stale unique-owner finding');
  assert.strictEqual(functionOwnerCacheStats().domainScans, 2, 'watch installation invalidates the pre-watch scan exactly once');
  raced.dispose();
  fs.unlinkSync(kenDef);
  published.clear();

  resetFunctionOwnerCacheForTests();
  const context = { subscriptions: [] };
  let sharedAuthorityChanges = 0;
  const registered = registerZssFunctionDiagnostics(vscode, context, doc => buildZssFunctionCatalog(vscode, doc.uri, service), () => ({ ownedPrefixes: ['JNP_'] }), {
    delay: 10000,
    validateCatalog: catalog => catalogStillCurrent(vscode, catalog, service),
    invalidateAuthority: invalidateFunctionOwnerCache,
    onAuthorityChanged: () => { sharedAuthorityChanges += 1; }
  });
  await registered.update(document);
  assert.deepStrictEqual(published.get(document.uri.toString()).map(item => item.code), ['missing-function']);
  assert.strictEqual(functionOwnerCacheStats().domainScans, 2, 'initial publication is based on a watcher-protected rebuild');
  const outsideWatcher = watchers.find(item => !item.disposed && path.resolve(item.pattern.base) === path.resolve(outside));
  assert(outsideWatcher && outsideWatcher.pattern.pattern === '**/*.def', 'a real per-root DEF watcher covers the declared out-of-workspace project root');

  const relative = path.relative(ken, source).replace(/\\/g, '/');
  fs.writeFileSync(kenDef, `[Files]\nsprite = Ken.sff\nst = ${relative}\n`);
  outsideWatcher.callbacks.create(uri(kenDef));
  assert.strictEqual(sharedAuthorityChanges, 1, 'the shared authority watcher notifies dependent state catalogs without installing another watcher set');
  assert.strictEqual(published.get(document.uri.toString()), undefined, 'root watcher immediately retires the formerly unique result');
  await registered.update(document);
  assert.deepStrictEqual(published.get(document.uri.toString()), [], 'the recomputed domain rejects ambiguity introduced by a closed external DEF');
  assert.strictEqual(functionOwnerCacheStats().domainScans, 3, 'root watcher invalidation causes one new domain scan');

  fs.unlinkSync(kenDef); outsideWatcher.callbacks.delete(uri(kenDef));
  await registered.update(document);
  assert.deepStrictEqual(published.get(document.uri.toString()).map(item => item.code), ['missing-function'], 'deleting the external owner and refreshing restores the uniquely owned finding');
  assert.strictEqual(functionOwnerCacheStats().domainScans, 4);
  registered.dispose(); assert(watchers.every(item => item.disposed), 'all dynamically discovered root watchers are disposed with the live registrar');

  // The limit applies to the registrar's cumulative retained watcher set,
  // not merely the roots in the current project catalog. Switching projects
  // after filling the budget must fail closed before creating another watcher.
  published.clear();
  vscode.workspace.createFileSystemWatcher = watcher;
  const watchRootParent = path.join(root, 'WatchRoots');
  const authorityRoots = [];
  for (let index = 0; index <= MAX_AUTHORITY_WATCH_ROOTS; index += 1) {
    const authorityRoot = path.join(watchRootParent, `root-${index}`);
    fs.mkdirSync(authorityRoot, { recursive: true });
    authorityRoots.push(authorityRoot);
  }
  let changingCatalogCall = 0;
  const changedDuringAttach = registerZssFunctionDiagnostics(vscode, { subscriptions: [] }, async () => ({
    complete: true,
    owner: ryuDef,
    entries: [{ filename: source, records: { functions: [] } }],
    authority: { ownership: { roots: changingCatalogCall++ === 0 ? authorityRoots.slice(0, 2) : authorityRoots.slice(0, 1) } }
  }), () => ({ ownedPrefixes: ['JNP_'] }), {
    delay: 10000,
    validateCatalog: async () => true,
    invalidateAuthority() {}
  });
  await changedDuringAttach.update(document);
  assert.deepStrictEqual(published.get(document.uri.toString()), [], 'a changed authority-root set on the single watcher-protected rebuild fails closed');
  changedDuringAttach.dispose();
  published.clear();

  let selectedRoots = authorityRoots.slice(0, MAX_AUTHORITY_WATCH_ROOTS);
  const syntheticCatalog = () => ({
    complete: true,
    owner: ryuDef,
    entries: [{ filename: source, records: { functions: [] } }],
    authority: { ownership: { roots: selectedRoots } }
  });
  const beforeCappedWatchers = watchers.length;
  const capped = registerZssFunctionDiagnostics(vscode, { subscriptions: [] }, async () => syntheticCatalog(), () => ({ ownedPrefixes: ['JNP_'] }), {
    delay: 10000,
    validateCatalog: async () => true,
    invalidateAuthority() {}
  });
  await capped.update(document);
  assert.deepStrictEqual(published.get(document.uri.toString()).map(item => item.code), ['missing-function']);
  assert.strictEqual(watchers.length - beforeCappedWatchers, MAX_AUTHORITY_WATCH_ROOTS, 'the first project installs exactly the cumulative watcher budget');
  selectedRoots = [authorityRoots[MAX_AUTHORITY_WATCH_ROOTS]];
  await capped.update(document);
  assert.deepStrictEqual(published.get(document.uri.toString()), [], 'a project switch beyond the cumulative watcher budget fails closed');
  assert.strictEqual(watchers.length - beforeCappedWatchers, MAX_AUTHORITY_WATCH_ROOTS, 'the over-budget project root is rejected before watcher creation');
  capped.dispose();
  assert(watchers.slice(beforeCappedWatchers).every(item => item.disposed), 'all capped registrar watchers are disposed');

  published.clear(); resetFunctionOwnerCacheForTests(); vscode.workspace.createFileSystemWatcher = () => { throw new Error('injected watcher failure'); };
  const refused = registerZssFunctionDiagnostics(vscode, { subscriptions: [] }, doc => buildZssFunctionCatalog(vscode, doc.uri, service), () => ({ ownedPrefixes: ['JNP_'] }), {
    delay: 10000, validateCatalog: catalog => catalogStillCurrent(vscode, catalog, service), invalidateAuthority: invalidateFunctionOwnerCache
  });
  await refused.update(document);
  assert.deepStrictEqual(published.get(document.uri.toString()), [], 'failure to watch any declared authority root makes the live result non-authoritative');
  refused.dispose();
  console.log('Dynamic external DEF root watcher ownership lifecycle tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => fs.rmSync(root, { recursive: true, force: true }));
