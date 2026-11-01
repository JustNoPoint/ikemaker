'use strict';

const assert = require('assert');
const { registerZssAssetDiagnostics } = require('../src/zss_asset_diagnostics');

class Range { constructor(startLine, startCharacter, endLine, endCharacter) { this.start = { line: startLine, character: startCharacter }; this.end = { line: endLine, character: endCharacter }; } }
class Diagnostic { constructor(range, message, severity) { this.range = range; this.message = message; this.severity = severity; } }
const published = new Map(), handlers = {};
const collection = {
  set(uri, diagnostics) { published.set(uri.toString(), diagnostics); },
  get(uri) { return published.get(uri.toString()); },
  delete(uri) { published.delete(uri.toString()); },
  dispose() {}
};
const event = name => callback => { handlers[name] = callback; return { dispose() {} }; };
const vscode = {
  Range, Diagnostic, DiagnosticSeverity: { Error: 0, Warning: 1 },
  languages: { createDiagnosticCollection: () => collection },
  workspace: {
    textDocuments: [],
    onDidOpenTextDocument: event('open'), onDidChangeTextDocument: event('change'),
    onDidSaveTextDocument: event('save'), onDidCloseTextDocument: event('close')
  }
};
const uri = { scheme: 'file', fsPath: 'C:\\chars\\Ryu\\states.zss', toString: () => 'file:///states.zss' };
let source = 'changeAnim{value: 20}\nplaySnd{value: S2,1}', version = 1;
const document = { languageId: 'zss', uri, fileName: uri.fsPath, get version() { return version; }, get lineCount() { return source.split(/\r?\n/).length; }, getText: () => source, lineAt: line => ({ text: source.split(/\r?\n/)[line] }) };
const complete = { kinds: {
  air: { complete: true, ids: new Set(['10']) },
  snd: { complete: true, ids: new Set(['2,1']) },
  sff: { complete: true, ids: new Set() }
} };

(async () => {
  const context = { subscriptions: [] };
  const registered = registerZssAssetDiagnostics(vscode, context, async () => complete, 10000);
  assert.strictEqual(context.subscriptions.length, 5, 'the native Problems integration owns one collection and four document lifecycle listeners');
  await registered.update(document);
  const diagnostics = collection.get(uri);
  assert.deepStrictEqual(diagnostics.map(item => item.code), ['missing-air-action']);
  assert.deepStrictEqual(diagnostics[0].range.start, { line: 0, character: 18 }, 'the warning highlights only the literal asset field');

  let release; const waiting = new Promise(resolve => { release = resolve; });
  const stale = registerZssAssetDiagnostics(vscode, { subscriptions: [] }, async () => { await waiting; return complete; }, 10000);
  published.delete(uri.toString()); version = 2; const pending = stale.update(document); version = 3; release(); await pending;
  assert.strictEqual(collection.get(uri), undefined, 'a catalog resolved for an obsolete document version is never published');

  const partial = registerZssAssetDiagnostics(vscode, { subscriptions: [] }, async () => ({ kinds: { air: { complete: false, ids: new Set() }, snd: complete.kinds.snd } }), 10000);
  await partial.update(document);
  assert.deepStrictEqual(collection.get(uri), [], 'an incomplete assigned AIR suppresses absence claims instead of guessing');
  console.log('Stale-source-safe ZSS asset diagnostic tests passed');
})().catch(error => { console.error(error); process.exit(1); });
