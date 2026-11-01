'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.js'), 'utf8');
const start = source.indexOf('class ZssControllerProvider {');
const end = source.indexOf('\nasync function insertController', start);
const luaApiCatalog = require('../data/lua-api.json');
const luaText = '--- Draws the menu\nfunction drawMenu(player, alpha)\nend\n\nlocal function helper(value)\nend\n';

class Item {
  constructor(label, state, values = {}) { this.label = label; this.collapsibleState = state; Object.assign(this, values); }
}
class MarkdownString { constructor() { this.value = ''; } appendMarkdown(value) { this.value += value; } appendText(value) { this.value += value; } }
const vscode = {
  EventEmitter: class { constructor() { this.event = () => {}; } fire() {} },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class { constructor(id) { this.id = id; } }, ThemeColor: class {}, MarkdownString,
  commands: { executeCommand() {} },
  window: { activeTextEditor: { document: { languageId: 'lua', fileName: path.resolve('main.lua'), getText: () => luaText } } },
  workspace: { workspaceFolders: [], getConfiguration: () => ({ get: (_key, fallback) => fallback }) }
};
const zssStructures = { STRUCTURES: [], GROUPS: [] };
const authoringLibrary = { favorites: () => [], recents: () => [] };
const { parseLuaFunctions } = require('../src/lua_function_catalog');
const expression = `(${source.slice(start, end)})`;
const localRequire = request => request === './intent_search' ? require('../src/intent_search') : require(request);
const Provider = vm.runInNewContext(expression, { vscode, path, controllerCatalog: [], controllerChangeMarkers: { project: () => ({ items: [], groups: [] }) }, filterAvailable: value => value, NavigatorItem: Item, authoringLibrary, zssStructures, luaApiCatalog, parseLuaFunctions, insertController: async () => false, require: localRequire });
const provider = new Provider([], () => ({}), { acknowledged: () => ({}) }, {});

const roots = provider.getChildren();
const luaRoot = roots.find(item => item.nodeType === 'luaRoot');
assert(luaRoot, 'Lua Authoring is a peer group in the shared authoring tree');
assert.match(luaRoot.label, /^Lua Authoring \(\d+\)$/);
const groups = provider.getChildren(luaRoot);
assert(groups.some(item => item.nodeType === 'luaProjectGroup' && /Current File Functions \(2\)/.test(item.label)), 'active Lua functions have their own navigable group');
assert(groups.some(item => item.nodeType === 'luaApiGroup' && item.category === 'Embedded functions'), 'built-in API entries remain grouped by their documented category');
const embedded = provider.getChildren(groups.find(item => item.category === 'Embedded functions'));
assert(embedded.length > 250 && embedded.every(item => item.contextValue === 'ikemenLuaApi'), 'the complete embedded Lua API is exposed as insertable items');
assert(embedded.some(item => /animDraw/.test(item.label) && item.command.command === 'ikemen.lua.insertApi'), 'Lua API functions insert through the dedicated Lua command');
const project = provider.getChildren(groups.find(item => item.nodeType === 'luaProjectGroup'));
assert(project.some(item => /^drawMenu\(/.test(item.label) && item.command.command === 'ikemen.lua.goToFunction'), 'authored Lua functions navigate to their source definition');
const extensionPackage = require('../package.json');
assert(extensionPackage.contributes.views.ikemen.some(view => view.id === 'zssStateControllers' && view.name === 'State Controllers & Lua'), 'the shared view title names both authoring languages');

provider.setFilter('hotkey');
const filteredLua = provider.getChildren().find(item => item.nodeType === 'luaRoot');
assert(filteredLua && /\(1\)$/.test(filteredLua.label), 'the shared search filters Lua names, signatures, and descriptions');
provider.setFilter('definitely-no-authoring-match');
const empty = provider.getChildren().find(item => item.nodeType === 'authoringFilterEmpty');
assert(empty && /Change or clear the filter/.test(empty.description), 'an empty authoring search explains how to restore results instead of leaving a blank tree');

console.log('Lua Authoring shares the authoring tree with categorized API, hooks, project functions, insertion, navigation, and search');
