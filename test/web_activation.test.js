'use strict';

const assert = require('assert');
const Module = require('module');

(async () => {
  const commands = new Map(), trees = new Map(), completionProviders = [], hoverProviders = [];
  const data = {
    'sctrl.json': [{ name: 'ChangeState', description: 'Change state.', params: [{ name: 'value', placeholder: 'state_no', required: true }] }],
    'triggers.json': [{ name: 'MoveCountered', signature: 'MoveCountered', description: 'Attack contact.', kind: 'trigger' }],
    'lua-api.json': [{ name: 'testApi', signature: 'testApi(value)', description: 'Test API.', category: 'test', kind: 'function' }]
  };
  class TreeItem { constructor(label, state) { this.label = label; this.collapsibleState = state; } }
  class EventEmitter { constructor() { this.event = () => {}; } fire() {} }
  class CompletionItem { constructor(label, kind) { this.label = label; this.kind = kind; } }
  class SnippetString { constructor(value) { this.value = value; } }
  class MarkdownString { constructor() { this.value = ''; } appendMarkdown(value) { this.value += value; } }
  class Hover { constructor(contents, range) { this.contents = contents; this.range = range; } }
  const vscode = {
    TreeItem, EventEmitter, CompletionItem, SnippetString, MarkdownString, Hover,
    TreeItemCollapsibleState: { None: 0 }, CompletionItemKind: { Class: 1, Function: 2 }, ThemeIcon: class {},
    ConfigurationTarget: { Workspace: 1 }, ViewColumn: { Beside: 2 },
    Uri: { joinPath: (_base, ...parts) => ({ path: parts.join('/'), toString: () => parts.join('/') }) },
    workspace: {
      fs: { readFile: async (uri) => Buffer.from(JSON.stringify(data[uri.path.split('/').pop()] || {})) },
      getConfiguration: () => ({ get: (_key, fallback) => fallback, update: async () => {} }),
      openTextDocument: async (value) => value
    },
    window: {
      activeTextEditor: null,
      showInformationMessage: async () => {}, showWarningMessage: async () => {}, showQuickPick: async () => undefined, showInputBox: async () => undefined,
      showTextDocument: async () => {},
      registerTreeDataProvider: (id, provider) => { trees.set(id, provider); return { dispose() {} }; },
      registerCustomEditorProvider: () => ({ dispose() {} })
    },
    commands: {
      registerCommand: (id, handler) => { commands.set(id, handler); return { dispose() {} }; },
      executeCommand: async () => {}
    },
    languages: {
      registerCompletionItemProvider: (selector, provider) => { completionProviders.push({ selector, provider }); return { dispose() {} }; },
      registerHoverProvider: (selector, provider) => { hoverProviders.push({ selector, provider }); return { dispose() {} }; }
    }
  };
  const original = Module._load;
  Module._load = function patched(request, parent, main) { if (request === 'vscode') return vscode; return original.call(this, request, parent, main); };
  const { activate } = require('../src/web_extension');
  Module._load = original;
  const context = { extensionUri: { path: '/extension' }, subscriptions: [] };
  await activate(context);

  for (const id of ['ikemen.help.open', 'ikemen.codeStructure.openWorkspace', 'ikemen.testSessions.open', 'zss.audit.currentFile', 'zssControllers.insert', 'zssControllers.search', 'zssControllers.openDocs']) assert.ok(commands.has(id), `missing browser command ${id}`);
  assert.ok(trees.has('zssStateControllers'));
  assert.strictEqual(trees.get('zssStateControllers').getChildren()[0].label, 'ChangeState');
  assert.strictEqual(completionProviders.length, 1);
  assert.strictEqual(hoverProviders.length, 1);

  const provider = completionProviders[0].provider;
  const document = { languageId: 'zss', uri: {}, lineAt: () => ({ text: 'change' }) };
  const items = provider.provideCompletionItems(document, { line: 0, character: 6 });
  assert.strictEqual(items[0].label, 'changeState');
  assert.ok(items[0].insertText.value.includes('value: ${1:state_no};'));
  const luaItems = provider.provideCompletionItems({ languageId: 'lua', uri: {}, lineAt: () => ({ text: 'return ' }) }, { line: 0, character: 7 });
  assert.strictEqual(luaItems[0].label, 'testApi');

  console.log('Web activation tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
