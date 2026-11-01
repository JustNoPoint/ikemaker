'use strict';

const assert = require('assert');
const { registerLanguageProviders, capabilityFingerprint } = require('../src/language_providers');

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
class CompletionItem { constructor(label, kind) { this.label = label; this.kind = kind; } }
class SnippetString { constructor(value) { this.value = value; } }
class MarkdownString { constructor() { this.value = ''; } appendMarkdown(value) { this.value += value; return this; } }
class Hover { constructor(contents, range) { this.contents = contents; this.range = range; } }
class Range { constructor(sl, sc, el, ec) { this.start = { line: sl, character: sc }; this.end = { line: el, character: ec }; } }
const registered = {};
const vscode = {
  workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) },
  languages: {
    registerCompletionItemProvider: (_selector, provider) => { registered.completion = provider; return { dispose() {} }; },
    registerHoverProvider: (_selector, provider) => { registered.hover = provider; return { dispose() {} }; },
    registerSignatureHelpProvider: (_selector, provider) => { registered.signature = provider; return { dispose() {} }; }
  },
  CompletionItemKind: { Class: 1, Property: 2, Reference: 3, Function: 4, Variable: 5 }, CompletionItem, SnippetString, MarkdownString, Hover, Range
};
const context = { subscriptions: [] };
let source = 'call Com', version = 1;
const document = {
  languageId: 'zss', fileName: 'C:\\chars\\Ryu\\logic.zss', uri: { toString: () => 'file:///Ryu/logic.zss' },
  get version() { return version; }, getText: () => source,
  lineAt: line => ({ text: source.split(/\r?\n/)[line] || '' }), getWordRangeAtPosition: () => undefined
};
let currentCapabilities = { enabledCapabilities: ['zss.runtime-strings'], target: { channel: 'nightly', commit: 'aaaa', buildId: 'nightly-a' } };
let catalogGate = deferred();
const authoredCatalog = { complete: true, entries: [{ uri: { fsPath: 'C:\\chars\\Ryu\\functions.zss' }, text: '[Function Compute(value)]\nreturn $value;' }] };
registerLanguageProviders(vscode, context, () => [], () => ({ names: [] }), () => catalogGate.promise, () => ({ kinds: {} }), () => ({ complete: false, definitions: [] }), () => currentCapabilities);

(async () => {
  assert.notStrictEqual(
    capabilityFingerprint(currentCapabilities),
    capabilityFingerprint({ ...currentCapabilities, target: { ...currentCapabilities.target, commit: 'bbbb', buildId: 'nightly-b' } }),
    'engine identity participates even when both targets enable the same capabilities'
  );
  assert.notStrictEqual(
    capabilityFingerprint({ enabledCapabilities: [], target: { channel: 'custom', customFork: { baseBuildId: 'stable', patches: ['one'] } } }),
    capabilityFingerprint({ enabledCapabilities: [], target: { channel: 'custom', customFork: { baseBuildId: 'stable', patches: ['two'] } } }),
    'nested custom-target evidence participates in the authority fingerprint'
  );

  const staleSource = registered.completion.provideCompletionItems(document, { line: 0, character: 8 });
  source = 'call Different'; version += 1; catalogGate.resolve(authoredCatalog);
  assert.deepStrictEqual(await staleSource, [], 'a completion built for an older source revision is not published');

  source = 'call Com'; version += 1; catalogGate = deferred();
  const staleTarget = registered.completion.provideCompletionItems(document, { line: 0, character: 8 });
  currentCapabilities = { ...currentCapabilities, target: { channel: 'nightly', commit: 'bbbb', buildId: 'nightly-b' } };
  catalogGate.resolve(authoredCatalog);
  assert.deepStrictEqual(await staleTarget, [], 'an engine-target change suppresses an older completion even when enabled capabilities are identical');

  currentCapabilities = { ...currentCapabilities, target: { channel: 'nightly', commit: 'cccc', buildId: 'nightly-c' } };
  catalogGate = deferred(); source = 'call Com'; version += 1;
  const retired = registered.completion.provideCompletionItems(document, { line: 0, character: 8 });
  source = ' '; version += 1;
  const synchronous = registered.completion.provideCompletionItems(document, { line: 0, character: 1 });
  assert(Array.isArray(synchronous), 'the later request can complete synchronously');
  catalogGate.resolve(authoredCatalog);
  assert.deepStrictEqual(await retired, [], 'every later provider invocation retires an older async result, including a synchronous request');

  catalogGate = deferred(); source = 'call Compute(1)'; version += 1;
  const staleSignature = registered.signature.provideSignatureHelp(document, { line: 0, character: source.length - 1 });
  version += 1; catalogGate.resolve(authoredCatalog);
  assert.strictEqual(await staleSignature, undefined, 'signature help suppresses an older source revision');

  catalogGate = deferred(); source = 'call Compute(1)'; version += 1;
  const cancelled = { isCancellationRequested: false };
  const staleHover = registered.hover.provideHover(document, { line: 0, character: 7 }, cancelled);
  cancelled.isCancellationRequested = true; catalogGate.resolve(authoredCatalog);
  assert.strictEqual(await staleHover, undefined, 'hover honors cancellation after the catalog resolves');

  console.log('Language provider async authority tests passed');
})().catch(error => { console.error(error); process.exit(1); });
