'use strict';

const { collectRecords } = require('./analyzer');
const { symbolAt, symbolLength, referencesFor, definitionsFor, canRename, validRename } = require('./zss_navigation');

class WorkspaceZssIndex {
  constructor(vscode) { this.vscode = vscode; this.cache = new Map(); }
  invalidate(uri) { if (uri) this.cache.delete(uri.toString()); else this.cache.clear(); }
  async entries() {
    const maximum = this.vscode.workspace.getConfiguration('ikemenZss').get('maxAuditFiles', 1000);
    const found = await this.vscode.workspace.findFiles('**/*.zss', '**/{.git,node_modules}/**', maximum);
    // A character may be open beside, rather than inside, the saved template
    // workspace. Include those live ZSS documents so navigation does not stop at
    // the workspace-folder boundary.
    const open = (this.vscode.workspace.textDocuments || []).filter((document) => document.languageId === 'zss' && document.uri?.scheme === 'file').map((document) => document.uri);
    const uris = [...new Map([...found, ...open].map((uri) => [uri.toString(), uri])).values()];
    const active = new Set(uris.map((uri) => uri.toString()));
    for (const key of this.cache.keys()) if (!active.has(key)) this.cache.delete(key);
    for (const uri of uris) {
      const document = await this.vscode.workspace.openTextDocument(uri);
      const cached = this.cache.get(uri.toString());
      if (!cached || cached.version !== document.version) {
        const text = document.getText();
        this.cache.set(uri.toString(), { uri, version: document.version, text, records: collectRecords(text) });
      }
    }
    return [...this.cache.values()];
  }
}

function range(vscode, symbol) {
  return new vscode.Range(symbol.line, symbol.start, symbol.line, symbol.start + symbolLength(symbol));
}

function location(vscode, symbol) {
  return new vscode.Location(symbol.uri, range(vscode, symbol));
}

function currentSymbol(document, position) {
  return symbolAt(document.getText(), position.line, position.character);
}

function registerNavigationProviders(vscode, context) {
  const selector = { language: 'zss', scheme: 'file' };
  const index = new WorkspaceZssIndex(vscode);
  const definitionProvider = {
    async provideDefinition(document, position) {
      const symbol = currentSymbol(document, position);
      return symbol ? definitionsFor(await index.entries(), symbol).map((item) => location(vscode, item)) : [];
    }
  };
  const referenceProvider = {
    async provideReferences(document, position, options) {
      const symbol = currentSymbol(document, position);
      return symbol ? referencesFor(await index.entries(), symbol, options.includeDeclaration).map((item) => location(vscode, item)) : [];
    }
  };
  const renameProvider = {
    prepareRename(document, position) {
      const symbol = currentSymbol(document, position);
      if (!canRename(symbol)) throw new Error('Only authored ZSS functions and map names can be safely renamed.');
      return { range: range(vscode, symbol), placeholder: symbol.name };
    },
    async provideRenameEdits(document, position, newName) {
      const symbol = currentSymbol(document, position);
      if (!validRename(symbol, newName)) throw new Error('Use a ZSS identifier containing letters, numbers, underscores, or dots.');
      const edit = new vscode.WorkspaceEdit();
      for (const item of referencesFor(await index.entries(), symbol, true)) edit.replace(item.uri, range(vscode, item), newName);
      return edit;
    }
  };
  const openDefinition = async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'zss') return vscode.window.showInformationMessage('Place the cursor on a ZSS function, state number, or map name first.');
    const locations = await definitionProvider.provideDefinition(editor.document, editor.selection.active);
    if (!locations.length) return vscode.window.showInformationMessage('No authored definition was found in the current workspace or open ZSS files.');
    let selected = locations[0];
    if (locations.length > 1) {
      const choices = locations.map((item) => ({ label: `${vscode.workspace.asRelativePath(item.uri)}:${item.range.start.line + 1}`, description: item.uri.fsPath, location: item }));
      const picked = await vscode.window.showQuickPick(choices, { title: 'Open Referenced Definition', placeHolder: 'Choose the authored definition to open.' });
      if (!picked) return;
      selected = picked.location;
    }
    return vscode.window.showTextDocument(selected.uri, { selection: selected.range, preview: false });
  };
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(selector, definitionProvider),
    vscode.languages.registerReferenceProvider(selector, referenceProvider),
    vscode.languages.registerRenameProvider(selector, renameProvider),
    vscode.commands.registerCommand('ikemen.navigation.openDefinition', openDefinition),
    vscode.workspace.onDidChangeTextDocument((event) => index.invalidate(event.document.uri)),
    vscode.workspace.onDidCreateFiles(() => index.invalidate()),
    vscode.workspace.onDidDeleteFiles(() => index.invalidate()),
    vscode.workspace.onDidRenameFiles(() => index.invalidate())
  );
}

module.exports = { WorkspaceZssIndex, registerNavigationProviders, range, currentSymbol };
