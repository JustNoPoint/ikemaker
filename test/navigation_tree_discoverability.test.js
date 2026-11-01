'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.js'), 'utf8');

function extract(startText, endText) {
  const start = source.indexOf(startText), end = source.indexOf(endText, start);
  assert(start >= 0 && end > start, `${startText} source boundary must remain discoverable`);
  return source.slice(start, end).trim();
}

(async () => {
  const navVscode = {
    TreeItem: class { constructor(label, collapsibleState) { Object.assign(this, { label, collapsibleState }); } },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    ThemeIcon: class { constructor(id) { this.id = id; } },
    EventEmitter: class { constructor() { this.event = () => {}; } fire() {} },
    window: { activeTextEditor: null },
    workspace: { workspaceFolders: undefined, getConfiguration: () => ({ get: (_key, fallback) => fallback }) }
  };
  const navigatorClasses = vm.runInNewContext(`${extract('class NavigatorItem', 'class ZssControllerProvider')}\n;({NavigatorItem,ZssNavigator})`, { vscode: navVscode, path, parseZss: () => [], displayName: () => '' });
  const emptyRoots = await new navigatorClasses.ZssNavigator({}).getChildren();
  assert.strictEqual(emptyRoots.length, 1);
  assert.strictEqual(emptyRoots[0].contextValue, 'zssNavigatorEmpty');
  assert.strictEqual(emptyRoots[0].command.command, 'workbench.action.files.openFile', 'empty ZSS Navigator offers the direct enabling route');
  navVscode.workspace.workspaceFolders=[{}];navVscode.workspace.findFiles=async()=>[];
  const workspaceNavigator=new navigatorClasses.ZssNavigator({}),workspaceRoot=(await workspaceNavigator.getChildren()).find(item=>item.nodeType==='workspace'),workspaceEmpty=await workspaceNavigator.getChildren(workspaceRoot);
  assert.strictEqual(workspaceEmpty[0].contextValue,'zssNavigatorWorkspaceEmpty','an expanded workspace group never becomes a silent blank subtree');
  navVscode.workspace.openTextDocument=async uri=>({uri,fileName:'empty.zss',getText:()=>''});
  const documentEmpty=await workspaceNavigator.getChildren({nodeType:'document',uri:{fsPath:'empty.zss'}});
  assert.strictEqual(documentEmpty[0].contextValue,'zssNavigatorDocumentEmpty','a ZSS file with no authored symbols exposes guided empty content');

  const notices = [], focused = [], opened = [];
  const vscode = {
    Position: class { constructor(line, character) { Object.assign(this, { line, character }); } },
    Selection: class { constructor(start, end) { Object.assign(this, { start, end }); } },
    Range: class { constructor(start, end) { Object.assign(this, { start, end }); } },
    TextEditorRevealType: { AtTop: 1 },
    Uri: { parse: value => ({ value }) },
    workspace: { openTextDocument: async uri => ({ uri, lineCount: 3 }) },
    window: {
      showInformationMessage: async message => { notices.push(message); return message; },
      showTextDocument: async document => ({ document, revealRange() {}, selection: null }),
      showQuickPick: async items => items[0]
    },
    env: { openExternal: async uri => { opened.push(uri.value); } }
  };
  const revealSymbol = vm.runInNewContext(`(${extract('async function revealSymbol', 'async function auditWorkspace')})`, {
    vscode,
    focusIkemenView: async id => focused.push(id)
  });
  await revealSymbol();
  assert.deepStrictEqual(focused, ['zssNavigator'], 'Command Palette reveal focuses the enabling navigator instead of silently doing nothing');
  assert.match(notices.at(-1), /Choose a file and authored symbol/);
  assert(await revealSymbol({ uri: { value: 'hero.zss' }, line: 9 }), 'valid tree-item reveal returns the opened editor');

  const controllerCatalog = [{ name: 'Alpha', description: 'Alpha docs', url: 'https://example.invalid/alpha' }];
  const openControllerDocs = vm.runInNewContext(`(${extract('async function openControllerDocs', 'async function openLuaApiDocs')})`, { vscode, controllerCatalog });
  assert.strictEqual(await openControllerDocs(), true, 'Command Palette documentation route prompts for an exact controller');
  assert.deepStrictEqual(opened, ['https://example.invalid/alpha']);

  let projection = {
    visible: true,
    items: [{ marked: true, controller: 'Alpha' }],
    groups: [{ id: 'new', unreviewedCount: 1 }]
  };
  const classSource = extract('class ZssControllerProvider {', 'async function insertController');
  const picks = [], providerNotices = [];
  const providerVscode = {
    EventEmitter: class { constructor() { this.event = () => {}; } fire() {} },
    commands: { executeCommand() {} },
    window: {
      activeTextEditor: null,
      showQuickPick: async (items, options) => { picks.push({ items, options }); return items[0]; },
      showInformationMessage: async message => { providerNotices.push(message); return message; }
    },
    workspace: { workspaceFolders: [], getConfiguration: () => ({ get: (_key, fallback) => fallback }) }
  };
  const Provider = vm.runInNewContext(`(${classSource})`, {
    vscode: providerVscode,
    path,
    controllerCatalog,
    controllerChangeMarkers: { ACCESSIBLE_MARKER: 'Changed', project: () => projection },
    filterAvailable: value => value,
    NavigatorItem: class {},
    authoringLibrary: { favorites: () => [], recents: () => [] },
    zssStructures: { STRUCTURES: [], GROUPS: [] },
    luaApiCatalog: [],
    parseLuaFunctions: () => ({ definitions: [] }),
    insertController: async () => false,
    require
  });
  const provider = new Provider([{ name: 'Alpha', description: 'Changed alpha', params: [] }], () => ({}), { available: true, acknowledged: () => ({}) }, {});
  let reviewed = '', cleared = '';
  provider.reviewControllerFor = async controller => { reviewed = controller.name; return true; };
  provider.clearReviewGroupFor = async group => { cleared = group; return true; };
  assert.strictEqual(await provider.reviewController(), true);
  assert.strictEqual(reviewed, 'Alpha', 'Command Palette review chooses a marked controller instead of sending an empty tree context');
  assert.strictEqual(await provider.clearReviewGroup(), true);
  assert.strictEqual(cleared, 'new', 'Command Palette clear chooses an exact marked group instead of sending an empty tree context');
  assert.match(picks[0].options.placeHolder, /exact controller contract/);
  assert.match(picks[1].options.placeHolder, /exact reviewed group/);

  projection = { visible: false, items: [], groups: [] };
  assert.match(await provider.reviewController(), /No unreviewed controller changes/);
  assert.match(await provider.clearReviewGroup(), /No controller change-marker groups/);
  assert.strictEqual(providerNotices.length, 2, 'empty Command Palette routes explain their current prerequisite');

  const manifest = require('../package.json');
  const clearTitle = manifest.contributes.menus['view/title'].find(row => row.command === 'zssControllers.clearFilter');
  const clearPalette = manifest.contributes.menus.commandPalette.find(row => row.command === 'zssControllers.clearFilter');
  assert(clearTitle.when.includes('ikemen.controllerFilterActive') && clearPalette.when.includes('ikemen.controllerFilterActive'), 'Clear Filter is not exposed as a no-op before a filter exists');

  console.log('Native navigation Command Palette routes focus or prompt for exact tree context and explain empty states');
})().catch(error => { console.error(error); process.exit(1); });
