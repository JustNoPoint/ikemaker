'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { registerNavigationProviders, defFileReferenceAt } = require('../src/navigation_providers');

const providers = {};
const commands = {};
class Range { constructor(startLine, startCharacter, endLine, endCharacter) { Object.assign(this, { startLine, startCharacter, endLine, endCharacter, start: { line: startLine, character: startCharacter }, end: { line: endLine, character: endCharacter } }); } }
class Location { constructor(uri, range) { Object.assign(this, { uri, range }); } }
class WorkspaceEdit { constructor() { this.edits = []; } replace(uri, range, value) { this.edits.push({ uri, range, value }); } }
const documents = [
  { uri: { toString: () => 'one' }, version: 1, getText: () => '[Function Test()]\nmap(Test.Value) := 1;\ncall Test();\n[StateDef 200]\n[Constants]\nMove.Speed = 4.5\n[StateDef 900]\nhelper{ id: 9000; stateNo: 9000; }' },
  { uri: { toString: () => 'two' }, version: 1, getText: () => '[Function Other()]\ncall Test();\nmap(Test.Value) = 1;\nchangeState{value: 200}\nvelSet{x: const(Move.Speed)}\n[StateDef 901]\nif numHelper(9000) > 0 {}' },
  { uri: { toString: () => 'unrelated' }, version: 1, getText: () => '[Function Intruder()]\nmap(Test.Value) := 9;\n[StateDef 200]' }
];
const vscode = {
  Range, Location, WorkspaceEdit, Uri: { file: (fsPath) => ({ fsPath, scheme: 'file', toString: () => fsPath }) },
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
const functionEntries=documents.slice(0,2).map(document=>({uri:document.uri,text:document.getText()}));
const functionCatalog = async () => ({ complete: true, entries: functionEntries });
registerNavigationProviders(vscode, context, undefined, functionCatalog);
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
  const mapReferences = await providers.reference.provideReferences(documents[0], { line: 1, character: 6 }, { includeDeclaration: true });
  assert.strictEqual(mapReferences.length, 2, 'map references stay inside the exact owner catalog and exclude an unrelated character with the same name');
  const mapEdit = await providers.rename.provideRenameEdits(documents[0], { line: 1, character: 6 }, 'Test.Renamed');
  assert.strictEqual(mapEdit.edits.length, 2, 'map rename edits only owner-assigned source');
  const defText='[Map]\nTest.Value = 0\n',defUri={fsPath:'C:/Hero/Hero.def',toString:()=> 'owner-def',scheme:'file'},defDocument={fileName:defUri.fsPath,languageId:'plaintext',uri:defUri,getText:()=>defText};functionEntries.push({uri:defUri,filename:defUri.fsPath,text:defText});
  const defMapReferences=await providers.reference.provideReferences(defDocument,{line:1,character:5},{includeDeclaration:true});assert.strictEqual(defMapReferences.length,3,'a DEF map default and its assigned ZSS reads/writes share one references result');
  const defMapEdit=await providers.rename.provideRenameEdits(defDocument,{line:1,character:5},'Test.FromDef');assert.strictEqual(defMapEdit.edits.length,3,'rename from the character DEF updates the exact owner-scoped map graph');
  const stateDefinition = await providers.definition.provideDefinition(documents[1], { line: 3, character: 20 });
  assert.strictEqual(stateDefinition.length, 1);assert.strictEqual(stateDefinition[0].uri.toString(), 'one');
  const stateReferences = await providers.reference.provideReferences(documents[1], { line: 3, character: 20 }, { includeDeclaration: true });
  assert.strictEqual(stateReferences.length, 2, 'StateDef navigation excludes unrelated-character definitions');
  const constantDefinition=await providers.definition.provideDefinition(documents[1],{line:4,character:20});assert.strictEqual(constantDefinition.length,1);assert.strictEqual(constantDefinition[0].uri.toString(),'one');assert.strictEqual(constantDefinition[0].range.start.line,5);
  const constantReferences=await providers.reference.provideReferences(documents[1],{line:4,character:20},{includeDeclaration:true});assert.strictEqual(constantReferences.length,2,'authored constants use the same exact owner catalog');const constantRename=await providers.rename.provideRenameEdits(documents[1],{line:4,character:20},'Move.NewSpeed');assert.strictEqual(constantRename.edits.length,2);
  const resourceDefinition=await providers.definition.provideDefinition(documents[1],{line:6,character:14});assert.strictEqual(resourceDefinition.length,1);assert.strictEqual(resourceDefinition[0].uri.toString(),'one');assert.strictEqual(resourceDefinition[0].range.start.line,7);const resourceReferences=await providers.reference.provideReferences(documents[1],{line:6,character:14},{includeDeclaration:true});assert.strictEqual(resourceReferences.length,2,'literal helper ID navigation stays inside the complete owner catalog and exact helper namespace');
  const localText='[Function First(value)]\nlet shared := $value;\nlet result := $shared;\n[Function Second(value)]\nlet shared := $value;\nlet result := $shared;',localUri={toString:()=> 'locals',scheme:'file'},localDocument={languageId:'zss',uri:localUri,getText:()=>localText};
  const localDefinition=await providers.definition.provideDefinition(localDocument,{line:2,character:20});
  assert.strictEqual(localDefinition.length,1);assert.strictEqual(localDefinition[0].range.start.line,1,'local go-to-definition stays in the exact containing function');
  const localReferences=await providers.reference.provideReferences(localDocument,{line:2,character:20},{includeDeclaration:true});
  assert.deepStrictEqual(localReferences.map(item=>item.range.start.line),[1,2],'local references exclude equal spellings in another function and never need a project scan');
  const localRename=await providers.rename.provideRenameEdits(localDocument,{line:2,character:20},'renamed');assert.deepStrictEqual(localRename.edits.map(item=>[item.range.start.line,item.range.start.character,item.range.end.character,item.value]),[[1,4,10,'renamed'],[2,15,21,'renamed']],'scoped rename edits only bare identifier text, preserving the use-site $ sigil and excluding equal names in another function');
  vscode.window.activeTextEditor = { document: { ...documents[1], languageId: 'zss' }, selection: { active: { line: 1, character: 7 } } };
  const opened = await commands['ikemen.navigation.openDefinition']();
  assert.strictEqual(opened.uri.toString(), 'one');
  assert.strictEqual(opened.options.selection.start.line, 0);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-command-definition-'));
  try {
    const def = path.join(root, 'Test.def'), command = path.join(root, 'Test.cmd'), code = path.join(root, 'states.zss');
    fs.writeFileSync(def, '[Files]\ncmd = Test.cmd\nstates = states.zss\n');
    fs.writeFileSync(command, '[Command]\nname = "fireball"\ncommand = D, DF, F, x\n\n[Command]\nname = "fireball"\ncommand = D, DF, F, ~x\n');
    fs.writeFileSync(code, 'if command = "fireball" {}\n');
    const source = 'if command = "fireball" {}', commandDocument = { languageId: 'zss', uri: vscode.Uri.file(code), lineAt: () => ({ text: source }), getText: () => source };
    const commandDefinitions = await providers.definition.provideDefinition(commandDocument, { line: 0, character: 17 });
    assert.strictEqual(commandDefinitions.length, 2, 'go-to-definition exposes every exact same-name native command definition');
    assert.deepStrictEqual(commandDefinitions.map(item => [path.basename(item.uri.fsPath), item.range.start.line]), [['Test.cmd', 1], ['Test.cmd', 5]]);
    const defLines=fs.readFileSync(def,'utf8').split(/\r?\n/),defDocument={languageId:'ikemen-def',fileName:def,uri:vscode.Uri.file(def),getText:()=>defLines.join('\n'),lineAt:line=>({text:defLines[line]||''})},fileReference=defFileReferenceAt(defDocument,{line:2,character:14});assert(fileReference&&fileReference.key==='states'&&fileReference.target===code,'[Files] path detection resolves only the exact value under the cursor');const fileDefinitions=await providers.definition.provideDefinition(defDocument,{line:2,character:14});assert.strictEqual(fileDefinitions.length,1);assert.strictEqual(fileDefinitions[0].uri.fsPath,code,'go-to-definition from character DEF opens the exact connected text source');assert.strictEqual(defFileReferenceAt(defDocument,{line:0,character:2}),null,'section headings and non-value positions do not fabricate file routes');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
  console.log('ZSS navigation provider tests passed');
})().catch((error) => { console.error(error); process.exit(1); });
