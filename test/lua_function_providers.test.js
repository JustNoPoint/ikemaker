'use strict';

const assert = require('assert');
const { registerLanguageProviders } = require('../src/language_providers');
const { parseLuaFunctions } = require('../src/lua_function_catalog');

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

let source = '--- Adds two values.\n--- @param left first value\nlocal function sum(left, right) end\nlocal result = su';
let version = 1;
const document = {
  languageId: 'lua', fileName: 'C:\\game\\main.lua', uri: { toString: () => 'file:///game/main.lua', fsPath: 'C:\\game\\main.lua' },
  get version() { return version; }, getText: () => source,
  lineAt: line => ({ text: source.split(/\r?\n/)[line] || '' }), getWordRangeAtPosition: () => undefined
};
let deferred;
const catalog = () => ({ complete: true, definitions: parseLuaFunctions(source, document.fileName).definitions.map(definition => ({ ...definition, uri: document.uri })) });
const provider = () => deferred ? deferred.promise : catalog();
registerLanguageProviders(vscode, { subscriptions: [] }, () => [], () => ({ names: [] }), () => ({ complete: false, entries: [] }), () => ({ kinds: {} }), () => ({ complete: false, definitions: [] }), () => ({}), provider);

(async () => {
  let line = source.split(/\r?\n/).length - 1;
  const completion = await registered.completion.provideCompletionItems(document, { line, character: document.lineAt(line).text.length });
  const authored = completion.find(item => item.label === 'sum');
  assert(authored, 'the native Lua provider offers an authored function before bundled API entries');
  assert.strictEqual(authored.insertText.value, 'sum(${1:left}, ${2:right})');
  assert(authored.documentation.includes('Adds two values.') && authored.documentation.includes('main.lua:3'));

  source = '--- Adds two values.\n--- @param left first value\nlocal function sum(left, right) end\nlocal result = sum(1, value)'; version += 1; line = 3;
  const hover = await registered.hover.provideHover(document, { line, character: 17 });
  assert(hover.contents.value.includes('sum(left, right)') && hover.contents.value.includes('Adds two values.'), 'Lua hover preserves authored signature, documentation, and provenance');
  const signature = await registered.signature.provideSignatureHelp(document, { line, character: document.lineAt(line).text.indexOf('value') + 2 });
  assert.strictEqual(signature.signatures[0].label, 'sum(left, right)');
  assert.strictEqual(signature.signatures[0].parameters[0].documentation, 'first value');
  assert.strictEqual(signature.activeParameter, 1);

  let resolve; deferred = {}; deferred.promise = new Promise(done => { resolve = done; });
  source = 'local result = su'; version += 1; line = 0;
  const stale = registered.completion.provideCompletionItems(document, { line, character: source.length });
  source = 'local result = changed'; version += 1; resolve(catalog());
  assert.deepStrictEqual(await stale, [], 'Lua completion cannot publish after the source revision changes');

  console.log('Lua authored completion, hover, signature, and stale-authority tests passed');
})().catch(error => { console.error(error); process.exit(1); });
