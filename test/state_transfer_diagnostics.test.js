'use strict';

const assert = require('assert');
const { registerStateTransferDiagnostics } = require('../src/state_transfer_diagnostics');

class Range { constructor(startLine, startCharacter, endLine, endCharacter) { this.start = { line: startLine, character: startCharacter }; this.end = { line: endLine, character: endCharacter }; } }
class Diagnostic { constructor(range, message, severity) { this.range = range; this.message = message; this.severity = severity; } }
const uri = { scheme: 'file', fsPath: '/project/states.zss', toString: () => 'file:/project/states.zss' };
let text = 'changeState { value: 200; }\ntargetState { value: -2; }\nselfState { value: 300; }\nhelper { stateNo: 400; }\nhelper(1), changeState { value: 500; }', version = 1;
const document = { uri, fileName: uri.fsPath, languageId: 'zss', get version() { return version; }, getText: () => text, get lineCount() { return text.split('\n').length; }, lineAt: line => ({ text: text.split('\n')[line] || '' }), edit(value) { text = value; version += 1; } };
const published = new Map(), handlers = {};
const event = name => callback => { handlers[name] = callback; return { dispose() {} }; };
const vscode = {
  Range, Diagnostic, DiagnosticSeverity: { Error: 0, Warning: 1 },
  languages: { createDiagnosticCollection: () => ({ set: (target, value) => published.set(target.toString(), value), delete: target => published.delete(target.toString()), clear: () => published.clear(), dispose() {} }) },
  workspace: { textDocuments: [document], onDidOpenTextDocument: event('open'), onDidChangeTextDocument: event('change'), onDidSaveTextDocument: event('save'), onDidCloseTextDocument: event('close'), onDidChangeConfiguration: event('config') }
};
const catalog = { complete: true, definitions: [{ value: 0 }], entries: [] };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

(async () => {
  const context = { subscriptions: [] }, registrar = registerStateTransferDiagnostics(vscode, context, async () => catalog, { delay: 10000, validateCatalog: async () => true });
  await registrar.update(document);
  const diagnostics = published.get(uri.toString());
  assert.deepStrictEqual(diagnostics.map(item => item.code), ['missing-state', 'negative-state-transfer', 'missing-state']);
  assert.deepStrictEqual(diagnostics.map(item => [item.range.start.line, item.range.start.character, item.range.end.character]), [[0, 21, 24], [1, 21, 23], [3, 18, 21]], 'diagnostics retain the exact destination literal ranges, including Helper starting states');

  registrar.dispose(); published.clear();
  let watcherChecks = 0, catalogBuilds = 0, invalidations = 0;
  const watcherProtected = registerStateTransferDiagnostics(vscode, { subscriptions: [] }, async () => { catalogBuilds += 1; return catalog; }, {
    delay: 10000,
    validateCatalog: async () => true,
    invalidateAuthority: () => { invalidations += 1; },
    ensureAuthorityWatchers: () => ++watcherChecks === 1 ? { ok: true, installed: 1, signature: '[root]' } : { ok: true, installed: 0, signature: '[root]' }
  });
  await watcherProtected.update(document);
  assert.strictEqual(catalogBuilds, 2, 'state diagnostics reuse watcher installation and rebuild once under active authority coverage');
  assert.strictEqual(invalidations, 1);
  watcherProtected.dispose(); published.clear();

  const first = deferred(); let call = 0;
  const raced = registerStateTransferDiagnostics(vscode, { subscriptions: [] }, async () => ++call === 1 ? first.promise : catalog, { delay: 10000, validateCatalog: async () => true });
  document.edit('changeState { value: 0; }');
  const stale = raced.update(document);
  document.edit('changeState { value: 999; }');
  const current = raced.update(document);
  first.resolve(catalog); await stale; await current;
  assert.deepStrictEqual(published.get(uri.toString()).map(item => item.code), ['missing-state'], 'older async work cannot overwrite diagnostics for the newer document generation');
  handlers.change({ document });
  assert.strictEqual(published.get(uri.toString()), undefined, 'dependency changes immediately retire published state claims during debounce');
  raced.dispose();

  const otherUri = { scheme: 'file', fsPath: '/project/other.zss', toString: () => 'file:/project/other.zss' };
  const otherText = 'changeState { value: 0; }';
  const other = { uri: otherUri, fileName: otherUri.fsPath, languageId: 'zss', version: 1, getText: () => otherText, lineCount: 1, lineAt: () => ({ text: otherText }) };
  vscode.workspace.textDocuments = [document, other]; published.clear();
  const builds = new Map(), selective = registerStateTransferDiagnostics(vscode, { subscriptions: [] }, async source => {
    builds.set(source.fileName, (builds.get(source.fileName) || 0) + 1); return catalog;
  }, { delay: 10, validateCatalog: async () => true });
  await new Promise(resolve => setTimeout(resolve, 35));
  const initialOtherBuilds = builds.get(other.fileName);
  document.edit('changeState { value: 998; }'); handlers.change({ document });
  assert.strictEqual(published.get(otherUri.toString()), undefined, 'editing one state source immediately retires dependent claims in other open files');
  await new Promise(resolve => setTimeout(resolve, 35));
  assert.strictEqual(builds.get(other.fileName), initialOtherBuilds, 'editing one state source does not rebuild every open catalog on each keystroke');
  handlers.save(document); await new Promise(resolve => setTimeout(resolve, 35));
  assert.ok(builds.get(other.fileName) > initialOtherBuilds, 'saving a state dependency refreshes other open files');
  selective.dispose();
  console.log('Generation-safe live StateDef transfer diagnostic tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
