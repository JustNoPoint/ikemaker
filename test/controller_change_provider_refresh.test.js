'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.js'), 'utf8');
const start = source.indexOf('class ZssControllerProvider {');
const end = source.indexOf('\nasync function insertController', start);
assert(start >= 0 && end > start, 'ZssControllerProvider source boundary must remain discoverable');

const contexts = [];
let target = 'stable';
let acknowledged = false;
const vscode = {
  EventEmitter: class { constructor() { this.event = () => {}; } fire() {} },
  commands: { executeCommand(command, key, value) { contexts.push({ command, key, value }); } },
  window: { activeTextEditor: null },
  workspace: { workspaceFolders: [{ uri: { fsPath: path.resolve('fixture-project') } }] }
};
const controllerChangeMarkers = {
  project(_catalog, capabilities) {
    const marked = capabilities.target === 'nightly' && !acknowledged;
    return { visible: capabilities.target === 'nightly', unreviewedCount: marked ? 1 : 0, items: [], groups: [] };
  }
};

const classExpression = `(${source.slice(start, end).replace('class ZssControllerProvider', 'class ZssControllerProvider')})`;
const ZssControllerProvider = vm.runInNewContext(classExpression, {
  vscode,
  path,
  controllerCatalog: [],
  controllerChangeMarkers,
  filterAvailable: (catalog) => catalog,
  NavigatorItem: class {},
  authoringLibrary: {},
  zssStructures: {},
  luaApiCatalog: [],
  parseLuaFunctions: () => ({ definitions: [] }),
  insertController: async () => false,
  require
});
const provider = new ZssControllerProvider([], () => ({ target }), { acknowledged: () => ({}) }, {});

function latest() {
  const record = [...contexts].reverse().find(item => item.key === 'ikemen.controllerChangesAvailable');
  assert.strictEqual(record.command, 'setContext');
  assert.strictEqual(record.key, 'ikemen.controllerChangesAvailable');
  return record.value;
}

provider.refresh();
assert.strictEqual(latest(), false, 'stable refresh hides controller-change commands');
target = 'nightly';
provider.refresh();
assert.strictEqual(latest(), true, 'an exact Nightly marker exposes controller-change commands');
acknowledged = true;
provider.refresh();
assert.strictEqual(latest(), false, 'acknowledging the exact contract hides the commands on refresh');
acknowledged = false;
target = 'stable';
provider.refresh();
assert.strictEqual(latest(), false, 'returning the project target to stable keeps the commands hidden');
assert.strictEqual(contexts.filter(item=>item.key==='ikemen.controllerChangesAvailable').length, 4, 'each provider refresh publishes the change-review context once');
assert.strictEqual(contexts.filter(item=>item.key==='ikemen.controllerFilterActive').length, 4, 'each provider refresh also publishes exact filter availability once');
provider.setFilter('helper');
assert.strictEqual(contexts.filter(item=>item.key==='ikemen.controllerFilterActive').at(-1).value,true,'setting a filter enables Clear Filter through a native context key');
provider.setFilter('');
assert.strictEqual(contexts.filter(item=>item.key==='ikemen.controllerFilterActive').at(-1).value,false,'clearing the filter removes the otherwise no-op action');

console.log('controller provider refresh publishes stable, Nightly, acknowledged, and target-reset command contexts');
