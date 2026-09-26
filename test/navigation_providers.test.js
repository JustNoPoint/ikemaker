'use strict';

const assert = require('assert');
const { registerNavigationProviders } = require('../src/navigation_providers');

const providers = {};
const commands = {};
class Range { constructor(startLine, startCharacter, endLine, endCharacter) { Object.assign(this, { startLine, startCharacter, endLine, endCharacter, start: { line: startLine, character: startCharacter }, end: { line: endLine, character: endCharacter } }); } }
class Location { constructor(uri, range) { Object.assign(this, { uri, range }); } }
class WorkspaceEdit { constructor() { this.edits = []; } replace(uri, range, value) { this.edits.push({ uri, range, value }); } }
const documents = [
  { uri: { toString: () => 'one' }, version: 1, getText: () => '[Function Test()]\nmap(Test.Value) := 1;\ncall Test();' },
  { uri: { toString: () => 'two' }, version: 1, getText: () => '[Function Other()]\ncall Test();' }
];
const vscode = {
  Range, Location, WorkspaceEdit,
  commands: { registerCommand: (id, handler) => { commands[id] = handler; return {}; } },
  window: { activeTextEditor: null, showInformationMessage: () => {}, showQuickPick: async (items) => items[0], showTextDocument: async (uri, options) => ({ uri, options }) },
  languages: {
    registerDefinitionProvider: (_selector, provider) => { providers.definition = provider; return {}; },
    registerReferenceProvider: (_selector, provider) => { providers.reference = provider; return {}; },
    registerRenameProvider: (_selector, provider) => { providers.rename = provider; return {}; }
  },
  workspace: {
    getConfiguration: () => ({ get: (_key, fallback) => fallback }),
    findFiles: async () => documents.map((document) => document.uri),
    openTextDocument: async (uri) => documents.find((document) => document.uri === uri),
    textDocuments: [], asRelativePath: (uri) => uri.toString(),
    onDidChangeTextDocument: () => ({}), onDidCreateFiles: () => ({}),
    onDidDeleteFiles: () => ({}), onDidRenameFiles: () => ({})
  }
};
const context = { subscriptions: [] };
registerNavigationProviders(vscode, context);
assert.strictEqual(context.subscriptions.length, 8);

(async () => {
  const definition = await providers.definition.provideDefinition(documents[1], { line: 1, character: 7 });
  assert.strictEqual(definition.length, 1);
  assert.strictEqual(definition[0].uri.toString(), 'one');
  const references = await providers.reference.provideReferences(documents[0], { line: 0, character: 11 }, { includeDeclaration: true });
  assert.strictEqual(references.length, 3);
  const edit = await providers.rename.provideRenameEdits(documents[0], { line: 0, character: 11 }, 'Renamed');
  assert.strictEqual(edit.edits.length, 3);
  assert.ok(edit.edits.every((item) => item.value === 'Renamed'));
  vscode.window.activeTextEditor = { document: { ...documents[1], languageId: 'zss' }, selection: { active: { line: 1, character: 7 } } };
  const opened = await commands['ikemen.navigation.openDefinition']();
  assert.strictEqual(opened.uri.toString(), 'one');
  assert.strictEqual(opened.options.selection.start.line, 0);
  console.log('ZSS navigation provider tests passed');
})().catch((error) => { console.error(error); process.exit(1); });
