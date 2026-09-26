'use strict';

const assert = require('assert');
const { registerLanguageProviders, domainFor, experienceFor } = require('../src/language_providers');

const registered = {};
class CompletionItem { constructor(label, kind) { this.label = label; this.kind = kind; } }
class SnippetString { constructor(value) { this.value = value; } }
class MarkdownString {
  constructor() { this.value = ''; }
  appendMarkdown(value) { this.value += value; return this; }
}
class Hover { constructor(contents, range) { this.contents = contents; this.range = range; } }
const vscode = {
  workspace: { getConfiguration: () => ({ get: (key, fallback) => key === 'experience.zss' ? 'learning' : fallback }) },
  languages: {
    registerCompletionItemProvider: (selector, provider) => { registered.completion = { selector, provider }; return { dispose() {} }; },
    registerHoverProvider: (selector, provider) => { registered.hover = { selector, provider }; return { dispose() {} }; }
  },
  CompletionItemKind: { Class: 1, Property: 2, Reference: 3, Function: 4 },
  CompletionItem, SnippetString, MarkdownString, Hover
};
const context = { subscriptions: [] };
const controllers = [{ name: 'HitDef', description: 'Defines an attack.', params: [{ name: 'attr', placeholder: 'state, attack', required: true }] }];
registerLanguageProviders(vscode, context, () => controllers);
assert.deepStrictEqual(registered.completion.selector.map((item) => item.language), ['zss', 'ikemen-cns', 'lua']);
assert.strictEqual(context.subscriptions.length, 2);

const document = {
  languageId: 'zss', uri: {},
  getText: (range) => range ? 'HitDef' : 'hitDef{\n\t',
  lineAt: () => ({ text: '\t' }),
  getWordRangeAtPosition: () => ({ start: 0, end: 6 })
};
const items = registered.completion.provider.provideCompletionItems(document, { line: 1, character: 1 });
assert.strictEqual(items[0].label, 'attr');
assert.ok(items[0].insertText instanceof SnippetString);
const hover = registered.hover.provider.provideHover(document, { line: 0, character: 1 });
assert.ok(hover.contents.value.includes('Bundled IKEMEN 1.0 documentation'));
assert.strictEqual(domainFor(document), 'zss');
assert.strictEqual(domainFor({ languageId: 'ikemen-cns' }), 'cns');
assert.strictEqual(domainFor({ languageId: 'lua' }), 'lua');
assert.strictEqual(experienceFor(vscode, document), 'learning');

console.log('Language provider registration tests passed');
