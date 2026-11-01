'use strict';

const assert = require('assert');
const { registerNavigationProviders } = require('../src/navigation_providers');
const { stateCompletions, stateReferenceHover } = require('../src/language_providers');

class Range { constructor(startLine, startCharacter, endLine, endCharacter) { this.start = { line: startLine, character: startCharacter }; this.end = { line: endLine, character: endCharacter }; } }
class Location { constructor(uri, range) { this.uri = uri; this.range = range; } }
class CompletionItem { constructor(label, kind) { this.label = label; this.kind = kind; } }
class MarkdownString { constructor(){this.value='';} appendMarkdown(value){this.value+=value;return this;} }
class Hover { constructor(contents,range){this.contents=contents;this.range=range;} }
const uri = filename => ({ scheme: 'file', fsPath: filename, toString: () => `file:${filename}` });
const sourceUri = uri('/game/chars/Ryu/states.zss'), commonUri = uri('/game/data/common.zss');
const catalog = {
  complete: true,
  definitions: [
    { value: 200, uri: sourceUri, filename: sourceUri.fsPath, line: 0, character: 10, endLine: 0, endCharacter: 13, order: 0, role: 'st',documentation:'Authored launcher state.' },
    { value: 200, uri: commonUri, filename: commonUri.fsPath, line: 4, character: 10, endLine: 4, endCharacter: 13, order: 1, role: 'stcommon' },
    { value: 300, uri: sourceUri, filename: sourceUri.fsPath, line: 8, character: 10, endLine: 8, endCharacter: 13, order: 0, role: 'st' }
  ],
  entries: [{ filename: sourceUri.fsPath, uri: sourceUri, transfers: [{ kind: 'changestate', literal: 200, dynamic: false, redirected: false, line: 2, character: 21, endLine: 2, endCharacter: 24 },{kind:'helper',literal:300,dynamic:false,redirected:false,line:5,character:18,endLine:5,endCharacter:21}] }]
};
let definitionProvider, referenceProvider;
const disposable = () => ({ dispose() {} });
const vscode = {
  Range, Location, CompletionItem,MarkdownString,Hover, CompletionItemKind: { Reference: 18 }, Uri: { file: uri }, WorkspaceEdit: class {},
  languages: {
    registerDefinitionProvider: (_selector, provider) => { definitionProvider = provider; return disposable(); },
    registerReferenceProvider: (_selector, provider) => { referenceProvider = provider; return disposable(); },
    registerRenameProvider: () => disposable()
  },
  commands: { registerCommand: () => disposable() },
  workspace: {
    textDocuments: [], getConfiguration: () => ({ get: (_key, fallback) => fallback }), findFiles: async () => [], openTextDocument: async () => null,
    onDidChangeTextDocument: () => disposable(), onDidCreateFiles: () => disposable(), onDidDeleteFiles: () => disposable(), onDidRenameFiles: () => disposable(),
    asRelativePath: value => value.fsPath
  },
  window: {}
};
registerNavigationProviders(vscode, { subscriptions: [] }, { invalidate() {}, entries: async () => [] }, async () => ({ complete: false }), async () => catalog);
const makeDocument = (languageId, text, filename) => ({ languageId, fileName: filename, uri: uri(filename), getText: () => text, lineAt: line => ({ text: text.split('\n')[line] || '' }) });

(async () => {
  const zss = makeDocument('zss', '[StateDef 0]\nif time {\nchangeState { value: 200; }\n}', sourceUri.fsPath);
  const definitions = await definitionProvider.provideDefinition(zss, { line: 2, character: 22 });
  assert.strictEqual(definitions.length, 2, 'ambiguous duplicate StateDefs return every exact candidate');
  const references = await referenceProvider.provideReferences(zss, { line: 2, character: 22 }, { includeDeclaration: true });
  assert.strictEqual(references.length, 3, 'references include the exact transfer and all declarations when requested');

  const cns = makeDocument('ikemen-cns', '[StateDef 0]\n[State 0]\ntype = TargetState\nvalue = 200', '/game/chars/Ryu/states.cns');
  assert.strictEqual((await definitionProvider.provideDefinition(cns, { line: 3, character: 8 })).length, 2, 'legacy CNS destination navigation uses the same proven runtime catalog');
  const helper=makeDocument('zss','[StateDef 0]\nhelper { stateNo: 300; }',sourceUri.fsPath);
  assert.strictEqual((await definitionProvider.provideDefinition(helper,{line:1,character:19})).length,1,'Helper starting states navigate through the exact character runtime catalog');

  const items = stateCompletions(vscode, { line: 2, start: 9, end: 10, prefix: '2' }, catalog);
  assert.deepStrictEqual(items.map(item => item.label), ['200', '300']);
  assert.strictEqual(items[0].range.start.character, 9); assert.match(items[0].documentation, /compile catalog/);
  assert.match(items[0].documentation,/Authored launcher state/,'state completion includes only exact authored documentation');
  const stateHover=stateReferenceHover(vscode,{type:'reference',value:200,record:{line:2,character:21,endLine:2,endCharacter:24}},catalog);assert.match(stateHover.contents.value,/Authored launcher state/);assert.match(stateHover.contents.value,/active candidate/);assert.match(stateHover.contents.value,/shadowed candidate/,'hover exposes duplicate compile candidates instead of silently choosing one');
  assert.strictEqual(stateReferenceHover(vscode,{type:'reference',value:200,record:{}},{...catalog,complete:false}),undefined,'incomplete runtime authority suppresses state hover rather than guessing');
  assert.deepStrictEqual(stateCompletions(vscode, { line: 0, start: 0, end: 6, prefix: 'map(X)' }, catalog), [], 'dynamic expressions are never replaced by state completion');
  console.log('StateDef navigation, reference, ambiguity, and guarded completion tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
