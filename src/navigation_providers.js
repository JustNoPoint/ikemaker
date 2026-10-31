'use strict';

const fs = require('fs');
const path = require('path');
const { collectRecords } = require('./analyzer');
const { symbolAt, symbolLength, referencesFor, definitionsFor, canRename, validRename, functionDefinitions } = require('./zss_navigation');
const { commandReferenceAtPosition, resolveCommandCatalog } = require('./command_reference_model');
const { stateSymbolAt } = require('./state_transfer_model');
const { definitionsForState, referencesForState } = require('./state_transfer_catalog');

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
  const start=symbol.start+(symbol.kind==='local'&&symbol.sigil?1:0);
  return new vscode.Range(symbol.line, start, symbol.line, start + String(symbol.name||'').length);
}

function location(vscode, symbol) {
  return new vscode.Location(symbol.uri, range(vscode, symbol));
}

function currentSymbol(document, position) {
  const symbol = symbolAt(document.getText(), position.line, position.character, document.fileName || document.uri?.fsPath || '');
  return symbol ? { ...symbol, uri: document.uri } : null;
}

function defFileReferenceAt(document, position) {
  const filename=document.fileName||document.uri?.fsPath||'';
  if(!/\.def$/i.test(filename)||typeof document.lineAt!=='function')return null;
  let section='';
  for(let line=0;line<=position.line;line+=1){
    const raw=String(document.lineAt(line).text||''),header=/^\s*\[\s*([^\];]+)\s*\]/.exec(raw);
    if(header){section=header[1].trim().toLowerCase();continue;}
    if(line!==position.line||section!=='files')continue;
    let code=raw,quoted=false;for(let index=0;index<code.length;index+=1){if(code[index]==='"'&&code[index-1]!=='\\')quoted=!quoted;else if(code[index]===';'&&!quoted){code=code.slice(0,index);break;}}
    const field=/^\s*([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.*?)\s*$/.exec(code);if(!field)return null;
    const authored=field[2],leading=authored.length-authored.trimStart().length,value=authored.trim(),valueStart=field.index+field[0].indexOf(field[2])+leading,valueEnd=valueStart+value.length;
    if(position.character<valueStart||position.character>valueEnd)return null;
    const relative=/^"([^"\r\n]+)"$/.test(value)?value.slice(1,-1):value;
    if(!relative||/[\r\n\0]/.test(relative)||/[,*?]/.test(relative))return null;
    const target=path.resolve(path.dirname(filename),relative.replace(/[\\/]/g,path.sep)),extension=path.extname(target).toLowerCase();
    if(['.sff','.snd','.act','.pcx','.png','.bmp','.gif','.jpg','.jpeg','.ogg','.wav','.mp3'].includes(extension)||!fs.existsSync(target)||!fs.statSync(target).isFile())return null;
    return{key:field[1],value:relative,target,line,start:valueStart+(value.startsWith('"')?1:0),length:relative.length};
  }
  return null;
}

function stateLocation(vscode, symbol) {
  return new vscode.Location(symbol.uri, new vscode.Range(symbol.line, symbol.character, symbol.endLine ?? symbol.line, symbol.endCharacter));
}

async function safeStateCatalog(provider, document) {
  try { const catalog = await provider(document); return catalog?.complete ? catalog : null; } catch (_) { return null; }
}

function registerNavigationProviders(vscode, context, sharedIndex, getFunctionCatalog = () => ({ complete: false, entries: [] }), getStateCatalog = () => ({ complete: false, entries: [] }), getCapabilities = () => ({})) {
  const selector = { language: 'zss', scheme: 'file' };
  const defSelector = { scheme: 'file', pattern: '**/*.def' };
  const definitionSelector = [selector, { language: 'ikemen-cns', scheme: 'file' }, defSelector];
  const index = sharedIndex || new WorkspaceZssIndex(vscode);
  const definitionProvider = {
    async provideDefinition(document, position) {
      const fileReference=defFileReferenceAt(document,position);
      if(fileReference)return[new vscode.Location(vscode.Uri.file(fileReference.target),new vscode.Range(0,0,0,0))];
      const state = stateSymbolAt(document.getText(), document.fileName, document.languageId, position.line, position.character, { capabilities: getCapabilities(document.uri) });
      if (state) {
        const catalog = await safeStateCatalog(getStateCatalog, document);
        if (catalog) return definitionsForState(catalog, state.value).map(item => stateLocation(vscode, item));
      }
      const line = typeof document.lineAt === 'function' ? document.lineAt(position.line).text : String(document.getText()).split(/\r\n|\r|\n/)[position.line] || '';
      const reference = commandReferenceAtPosition(line, position.character, { semicolonComments: document.languageId === 'ikemen-cns' });
      if (reference) {
        const catalog = resolveCommandCatalog(document.uri.fsPath, { openDocuments: vscode.workspace.textDocuments });
        if (!catalog.complete) return [];
        return catalog.definitions.filter(item => item.name === reference.name).map(item => new vscode.Location(
          vscode.Uri.file(item.file), new vscode.Range(item.line, item.start, item.line, item.start + item.length)
        ));
      }
      if (document.languageId === 'ikemen-cns') return [];
      const symbol = currentSymbol(document, position);
      if (symbol?.kind === 'local') {
        const entry = { uri: document.uri, text: document.getText(), records: collectRecords(document.getText()) };
        return definitionsFor([entry], symbol).map((item) => location(vscode, item));
      }
      if (symbol && ['function', 'state', 'map', 'variable', 'constant', 'resource'].includes(symbol.kind)) {
        const catalog = await getFunctionCatalog(document);
        if (!catalog?.complete) return [];
        return definitionsFor(catalog.entries, symbol).map((item) => location(vscode, item));
      }
      return symbol ? definitionsFor(await index.entries(), symbol).map((item) => location(vscode, item)) : [];
    }
  };
  const referenceProvider = {
    async provideReferences(document, position, options) {
      const state = stateSymbolAt(document.getText(), document.fileName, document.languageId, position.line, position.character, { capabilities: getCapabilities(document.uri) });
      if (state) {
        const catalog = await safeStateCatalog(getStateCatalog, document);
        if (catalog) {
          const output = referencesForState(catalog, state.value).map(item => stateLocation(vscode, item));
          if (options.includeDeclaration) output.unshift(...definitionsForState(catalog, state.value).map(item => stateLocation(vscode, item)));
          return output;
        }
      }
      const symbol = currentSymbol(document, position);
      if (symbol?.kind === 'local') {
        const entry = { uri: document.uri, text: document.getText(), records: collectRecords(document.getText()) };
        return referencesFor([entry], symbol, options.includeDeclaration).map((item) => location(vscode, item));
      }
      if (symbol && ['function', 'state', 'map', 'variable', 'constant', 'resource'].includes(symbol.kind)) {
        const catalog = await getFunctionCatalog(document);
        if (!catalog?.complete) return [];
        return referencesFor(catalog.entries, symbol, options.includeDeclaration).map((item) => location(vscode, item));
      }
      return symbol ? referencesFor(await index.entries(), symbol, options.includeDeclaration).map((item) => location(vscode, item)) : [];
    }
  };
  const renameProvider = {
    prepareRename(document, position) {
      const symbol = currentSymbol(document, position);
      if (!canRename(symbol)) throw new Error('Only authored ZSS functions, map names, and exact scoped locals/parameters can be safely renamed.');
      return { range: range(vscode, symbol), placeholder: symbol.name };
    },
    async provideRenameEdits(document, position, newName) {
      const symbol = currentSymbol(document, position);
      if (!validRename(symbol, newName)) throw new Error(symbol?.kind==='local'?'Use a scoped ZSS name containing letters, numbers, or underscores.':'Use a ZSS identifier containing letters, numbers, underscores, or dots.');
      if(symbol.kind==='local'){
        const entry={uri:document.uri,text:document.getText(),records:collectRecords(document.getText())},edit=new vscode.WorkspaceEdit();
        for(const item of referencesFor([entry],symbol,true))edit.replace(item.uri,range(vscode,item),newName);
        return edit;
      }
      if (symbol.kind === 'function') {
        const catalog = await getFunctionCatalog(document);
        if (!catalog?.complete) throw new Error('Function rename is unavailable because the owning character function catalog is incomplete. Resolve its DEF assignments and missing files first.');
        const declarations = functionDefinitions(catalog.entries, symbol.name);
        if (declarations.length !== 1) throw new Error(`Function rename requires one exact declaration; ${declarations.length} were found in the owning character.`);
        const edit = new vscode.WorkspaceEdit();
        for (const item of referencesFor(catalog.entries, symbol, true)) edit.replace(item.uri, range(vscode, item), newName);
        return edit;
      }
      const catalog = await getFunctionCatalog(document);
      if (!catalog?.complete) throw new Error(`${symbol.kind==='constant'?'Constant':'Map'} rename is unavailable because the owning character symbol catalog is incomplete. Resolve its DEF assignments and missing files first.`);
      if(symbol.kind==='constant'){
        const declarations=definitionsFor(catalog.entries,symbol);
        if(declarations.length!==1)throw new Error(`Constant rename requires one exact authored declaration; ${declarations.length} were found in the owning character.`);
      }
      const edit = new vscode.WorkspaceEdit();
      for (const item of referencesFor(catalog.entries, symbol, true)) edit.replace(item.uri, range(vscode, item), newName);
      return edit;
    }
  };
  const openDefinition = async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !['zss', 'ikemen-cns'].includes(editor.document.languageId) && !/\.def$/i.test(editor.document.fileName || '')) return vscode.window.showInformationMessage('Place the cursor on an authored state destination, function, state number, map, or constant name first.');
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
    vscode.languages.registerDefinitionProvider(definitionSelector, definitionProvider),
    vscode.languages.registerReferenceProvider(definitionSelector, referenceProvider),
    vscode.languages.registerRenameProvider([selector, defSelector], renameProvider),
    vscode.commands.registerCommand('ikemen.navigation.openDefinition', openDefinition),
    vscode.workspace.onDidChangeTextDocument((event) => index.invalidate(event.document.uri)),
    vscode.workspace.onDidCreateFiles(() => index.invalidate()),
    vscode.workspace.onDidDeleteFiles(() => index.invalidate()),
    vscode.workspace.onDidRenameFiles(() => index.invalidate())
  );
  return index;
}

module.exports = { WorkspaceZssIndex, registerNavigationProviders, range, currentSymbol, defFileReferenceAt };
