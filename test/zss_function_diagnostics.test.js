'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { collectRecords } = require('../src/analyzer');
const { registerZssFunctionDiagnostics } = require('../src/zss_function_diagnostics');

class Range { constructor(startLine, startCharacter, endLine, endCharacter) { this.start = { line: startLine, character: startCharacter }; this.end = { line: endLine, character: endCharacter }; } }
class Diagnostic { constructor(range, message, severity) { this.range = range; this.message = message; this.severity = severity; } }
const published = new Map(), handlers = {};
const collection = { set(uri, value) { published.set(uri.toString(), value); }, get(uri) { return published.get(uri.toString()); }, delete(uri) { published.delete(uri.toString()); }, clear() { published.clear(); }, dispose() {} };
const event = name => callback => { handlers[name] = callback; return { dispose() {} }; };
const makeDocument = (name, source) => {
  let text = source, version = 1;
  const uri = { scheme: 'file', fsPath: `C:\\Game\\Ryu\\${name}`, toString: () => `file:///${name}` };
  return { languageId: name.endsWith('.zss') ? 'zss' : 'ikemen-def', uri, fileName: uri.fsPath, isDirty: false,
    get version() { return version; }, get lineCount() { return text.split(/\r?\n/).length; }, getText: () => text,
    lineAt: line => ({ text: text.split(/\r?\n/)[line] || '' }), edit(value, dirty = true) { text = value; version += 1; this.isDirty = dirty; } };
};
const caller = makeDocument('caller.zss', 'call Owned(1);\ncall JNP_Missing();');
const declarations = makeDocument('functions.zss', '[Function Owned(first, second)]\nreturn $first;');
const support = makeDocument('support.cns', '[StateDef -2]');
const def = makeDocument('Ryu.def', '[Files]\nst = caller.zss\nst1 = functions.zss');
const vscode = {
  Range, Diagnostic, DiagnosticSeverity: { Error: 0, Warning: 1 },
  languages: { createDiagnosticCollection: () => collection },
  workspace: { textDocuments: [caller, declarations, support, def], onDidOpenTextDocument: event('open'), onDidChangeTextDocument: event('change'), onDidSaveTextDocument: event('save'), onDidCloseTextDocument: event('close'), onDidChangeConfiguration: event('configuration') }
};
let complete = true, validator = true, release, invalidation, authorityInvalidations = 0;
const getCatalog = async () => {
  if (release) await release.promise;
  return { complete, owner: def.fileName, entries: [caller, declarations].map(document => ({ filename: document.fileName, records: collectRecords(document.getText(), document.fileName) })) };
};
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

(async () => {
  const context = { subscriptions: [] };
  const registered = registerZssFunctionDiagnostics(vscode, context, getCatalog, () => ({ ownedPrefixes: ['JNP_'] }), { delay: 10000, validateCatalog: async () => validator, invalidateAuthority: () => { authorityInvalidations += 1; }, onDidInvalidate: callback => { invalidation = callback; return { dispose() {} }; } });
  await registered.update(caller);
  assert.deepStrictEqual(collection.get(caller.uri).map(item => item.code), ['function-arity', 'missing-function']);
  assert.strictEqual(collection.get(caller.uri)[0].source, 'IKEMEN ZSS Functions');
  assert.deepStrictEqual(collection.get(caller.uri)[0].range.start, { line: 0, character: 5 }, 'only the function name is highlighted');

  const beforeDeclarationInvalidation = authorityInvalidations;
  declarations.edit('[Function Owned(value)]\nreturn $value;'); handlers.change({ document: declarations });
  assert.strictEqual(authorityInvalidations, beforeDeclarationInvalidation + 1, 'an assigned ZSS edit invalidates the shared function-catalog cache before sibling assistance refreshes');
  assert.strictEqual(collection.get(caller.uri), undefined, 'a declaration edit immediately retires stale sibling diagnostics while the debounced owner graph refreshes');
  await registered.update(caller);
  assert.deepStrictEqual(collection.get(caller.uri).map(item => item.code), ['missing-function'], 'a declaration edit refreshes sibling callers against the current owner catalog');

  def.edit(def.getText() + '\nst2 = uncertain.zss'); handlers.change({ document: def }); validator = false;
  assert(authorityInvalidations > 0, 'an open DEF version change invalidates the canonical owner index before refreshing callers');
  await registered.update(caller);
  assert.deepStrictEqual(collection.get(caller.uri), [], 'dirty or stale DEF authority clears old findings and publishes no guesses');
  def.isDirty = false; validator = true; handlers.save(def); await registered.update(caller);
  assert.deepStrictEqual(collection.get(caller.uri).map(item => item.code), ['missing-function']);

  published.delete(caller.uri.toString()); release = deferred();
  const stale = registered.update(caller); caller.edit('call Owned(1);'); handlers.change({ document: caller }); release.resolve(); await stale; release = null;
  assert.strictEqual(collection.get(caller.uri), undefined, 'an obsolete async generation may neither publish nor clear a newer document result');
  await registered.update(caller); assert.deepStrictEqual(collection.get(caller.uri), []);

  caller.edit('call Owned(1, 2);'); published.delete(caller.uri.toString()); release = deferred();
  const dependencyRace = registered.update(caller);
  declarations.edit('[Function Owned(value)]\nreturn $value;'); handlers.change({ document: declarations });
  release.resolve(); await dependencyRace; release = null;
  assert.strictEqual(collection.get(caller.uri), undefined, 'a declaration change invalidates an in-flight sibling result even when the caller version is unchanged');

  await registered.update(caller); published.delete(caller.uri.toString()); release = deferred();
  const nonZssRace = registered.update(caller);
  support.edit('[StateDef -2]\n; unsaved assigned support changed'); handlers.change({ document: support });
  release.resolve(); await nonZssRace; release = null;
  assert.strictEqual(collection.get(caller.uri), undefined, 'an in-flight result is rejected when assigned non-ZSS code changes');
  await registered.update(caller); handlers.save(support);
  assert.strictEqual(collection.get(caller.uri), undefined, 'saving assigned non-ZSS code retires callers until refreshed');
  await registered.update(caller); handlers.close(support);
  assert.strictEqual(collection.get(caller.uri), undefined, 'closing assigned non-ZSS code also refreshes its owner callers');

  caller.edit('call JNP_Missing();'); const beforeExternalInvalidation = authorityInvalidations; invalidation();
  assert.strictEqual(authorityInvalidations, beforeExternalInvalidation + 1, 'map-registry/watcher invalidation advances the owner-cache generation');
  await registered.update(caller);
  assert.deepStrictEqual(collection.get(caller.uri).map(item => item.code), ['missing-function'], 'external dependency invalidation can refresh live findings');
  handlers.close(caller); assert.strictEqual(collection.get(caller.uri), undefined, 'closing a source removes its live function findings');
  registered.dispose(); await registered.update(caller); assert.strictEqual(collection.get(caller.uri), undefined, 'disposed diagnostics cannot republish');
  assert(context.subscriptions.length >= 7, 'collection, lifecycle, document/configuration listeners, and external invalidation are owned by the extension context');
  const extensionSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.js'), 'utf8');
  assert.match(extensionSource, /auditWorkspace\(registry, functionDiagnostics, stateDiagnostics\)/, 'workspace audit awaits the live function and state diagnostic owners');
  assert.doesNotMatch(extensionSource, /functionCatalogModel\.functionCallFindings/, 'workspace audit no longer republishes live function findings through the general collection');
  console.log('Generation-safe live ZSS function diagnostics tests passed');
})().catch(error => { console.error(error); process.exit(1); });
