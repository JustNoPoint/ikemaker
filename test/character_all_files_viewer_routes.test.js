'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-character-open-'));
const defPath = path.join(root, 'Hero.def');
const files = {
  air: path.join(root, 'HeroRenamed.air'),
  sff: path.join(root, 'HeroRenamed.sff'),
  fx: path.join(root, 'A-CommonFX.sff'),
  snd: path.join(root, 'HeroRenamed.snd'),
  code: path.join(root, 'normal.zss'),
  lua: path.join(root, 'custom-runtime.lua')
};
fs.writeFileSync(defPath, '[Files]\nanim = HeroRenamed.air\nsprite = HeroRenamed.sff\nsound = HeroRenamed.snd\nst = normal.zss\n');
for (const filename of Object.values(files)) fs.writeFileSync(filename, 'fixture');

const commands = [], shown = [], groupedCalls = [];
const vscode = {
  TreeItem: class {}, TreeItemCollapsibleState: { None: 0, Collapsed: 1 }, ThemeIcon: class {}, EventEmitter: class { constructor() { this.event = () => {}; } fire() {} },
  Uri: { file: fsPath => ({ fsPath, scheme: 'file', toString: () => `file:${fsPath}` }) }, ViewColumn: { One: 1, Beside: 2 },
  workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }), openTextDocument: async uri => ({ fileName: uri.fsPath, uri, getText: () => fs.readFileSync(uri.fsPath, 'utf8') }) },
  window: {
    activeTextEditor: undefined, tabGroups: { activeTabGroup: { viewColumn: 1 }, all: [{ viewColumn: 1, tabs: [] }, { viewColumn: 2, tabs: [] }] },
    showTextDocument: async (document, options) => { shown.push({ filename: document.fileName, options }); return { document, viewColumn: options.viewColumn }; },
    showQuickPick: async items => items.filter(item => item.id === 'essentials'), showInformationMessage() {}
  },
  commands: { executeCommand: async (...args) => { commands.push(args); return args; } }
};

const dependency = filename => {
  const text = fs.readFileSync(filename, 'utf8'), edges = [], nodes = [{ filename, exists: true }, { filename: files.fx, exists: true }];
  for (const match of text.matchAll(/^\s*(anim|sprite|sound|st)\s*=\s*([^;\r\n]+)/gim)) {
    const target = path.resolve(path.dirname(filename), match[2].trim());
    edges.push({ type: 'assignment', from: filename, to: target, label: `[Files] ${match[1]}` });
    nodes.push({ filename: target, exists: fs.existsSync(target) });
  }
  return { root: filename, edges, nodes };
};

const original = Module._load;
Module._load = function(request, parent, main) {
  if (request === 'vscode') return vscode;
  if (request === './ikemen_hub') return { findGameRoot: () => root };
  if (request === './character_picker') return { chooseCharacterDef: async () => defPath };
  if (request === './character_dependency_model') return { buildCharacterDependencyModel: dependency };
  if (request === './metadata_registry') return { find: () => '' };
  if (request === './project_context_model') return { contextFor: () => ({ project: { id: 'test', name: 'Test' } }) };
  if (request === './project_registry') return { createDefault: () => ({}) };
  if (request === './character_view_policy') return { characterFolder: () => root, rememberCodeFile() {}, forgetCharacter() {}, configureCharacterCodeSync: () => ({ dispose() {} }) };
  if (request === './authoring_context_registry') return { normalized: value => String(value).toLowerCase(), openContexts: () => [], currentContext: () => null, contextOwnsFile: () => false, disposeContextPanels: () => 0, beginContextClose: () => () => {} };
  if (request === './viewer_group') return { preferredViewerColumn: value => value };
  if (request === './authoring_workspace') return { openCharacterCodingSet: async descriptor => { groupedCalls.push(descriptor); return { viewColumn:7 }; } };
  return original.call(this, request, parent, main);
};

(async () => {
  try {
    const workbenches = require('../src/character_workbenches');
    const mixed = workbenches.groupedCodeFiles({ defPath, folder: root }, [files.code, files.code, root, path.join(root, 'missing.zss')]);
    assert.deepStrictEqual(mixed, [fs.realpathSync(files.code)], 'the host collector keeps the valid regular canonical file while skipping duplicate, directory, and missing candidates');
    const stale = { id: root.toLowerCase(), name: 'Hero', folder: root, defPath, assignments: { anim: [path.join(root, 'Old.air')], sprite: [path.join(root, 'Old.sff')], sound: [path.join(root, 'Old.snd')] }, files: [], connectedFiles: [], addedFiles: [], lastSession: [] };
    await workbenches.openWorkbench(stale, true);
    assert(groupedCalls.some(options => options.origin === 'character-essentials' && options.taskId === 'character-all-code' && options.files.includes(files.air) && options.files.includes(files.code) && options.files.includes(files.lua)), 'all-code opening sends one host-owned grouped coding set, including native Lua editors regardless of their language-service extension');
    assert(commands.some(([id, uri]) => id === 'sff.openViewer' && uri.fsPath === files.sff), 'all-code opening refreshes and uses the renamed assigned SFF');
    assert(!commands.some(([id, uri]) => id === 'sff.openViewer' && uri.fsPath === files.fx), 'a discovered common/FX SFF can never replace the DEF-assigned character archive');
    assert(commands.some(([id, _uri, column]) => id === 'sff.openViewer' && column === 7), 'the Coding Viewer editor group anchors the SFF tab');
    assert(commands.some(([id, uri, options]) => id === 'air.openAnimationPreview' && uri.fsPath === files.air && options.sourceColumn === 1 && options.viewerColumn === 7), 'all-code opening launches AIR in the Coding Viewer editor group');
    commands.length = 0;
    const assignedDef = fs.readFileSync(defPath, 'utf8');
    fs.writeFileSync(defPath, assignedDef.replace(/^sprite\s*=.*\r?\n/im, ''));
    await workbenches.openWorkbench(stale, true);
    assert(!commands.some(([id]) => id === 'sff.openViewer'), 'a missing DEF sprite assignment does not fall back to an unrelated discovered FX archive');
    fs.writeFileSync(defPath, assignedDef);
    commands.length = 0;
    const state = { profiles: [stale] }, context = { workspaceState: { get: () => state.profiles, update: async (_key, value) => { state.profiles = value; } } };
    await workbenches.openCharacterSession(stale, context, { refresh() {} });
    for (const [id, filename] of [['sff.openViewer', files.sff], ['snd.openViewer', files.snd], ['air.openAnimationPreview', files.air]]) assert(commands.some(([command, uri]) => command === id && uri.fsPath === filename), `essentials directly opens refreshed ${id}`);
    assert(commands.filter(([id]) => ['sff.openViewer','snd.openViewer'].includes(id)).every(([_id,_uri,column]) => column === 7), 'essentials keeps SFF and SND in the Coding Viewer editor group');
    const grouped = groupedCalls.find(options => options.taskId === 'character-essentials');
    assert(grouped && grouped.files.includes(defPath) && grouped.files.includes(files.air) && grouped.files.includes(files.code), 'essentials opens its editable DEF/AIR/code sources once through the grouped Coding Viewer route');
    assert.deepStrictEqual(state.profiles[0].assignments.anim, [files.air], 'the remembered workbench replaces stale pre-rename assignments with the refreshed DEF identity');
    assert.strictEqual(shown.length, 0, 'grouped source routing does not fan editable files into independent native tabs before presentation resolves');
    console.log('Renamed character assignments refresh before grouped all-code routing, and essentials keep exact asset viewers');
  } finally {
    Module._load = original;
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
