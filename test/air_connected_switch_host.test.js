'use strict';

const assert = require('assert');
const path = require('path');
const Module = require('module');

const current = path.resolve('C:/chars/Hero/Hero.air'), target = path.resolve('C:/chars/Hero/Effects.air'), owner = path.resolve('C:/chars/Hero/Hero.def');
const inventory = [
  { id: 'air-current', filename: current, label: 'Character · Hero.air', current: true },
  { id: 'air-target', filename: target, label: 'FX · Effects.air', current: false }
];
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {};
  if (request === './connected_asset_inventory' && /air_viewer\.js$/.test(parent?.filename || '')) return { connectedAssetInventory: () => inventory };
  return originalLoad.call(this, request, parent, isMain);
};
const { openConnectedAir } = require('../src/air_viewer');
Module._load = originalLoad;

(async () => {
  const calls = [], warnings = [];
  let commandResult = { opened: true };
  const api = {
    Uri: { file: fsPath => ({ fsPath }) },
    window: { showWarningMessage(message) { warnings.push(message); } },
    commands: { async executeCommand(...args) { calls.push(args); return commandResult; } }
  };
  const session = { airPath: current, ownerDefs: [owner], panel: { viewColumn: 4 } };

  assert.strictEqual(await openConnectedAir({ id: 'missing' }, session, api, () => false), false);
  assert.match(warnings.pop(), /no longer available/i);
  assert.strictEqual(calls.length, 0, 'a stale inventory identity cannot open any AIR');

  assert.strictEqual(await openConnectedAir({ id: 'air-target' }, session, api, filename => filename === owner), false);
  assert.match(warnings.pop(), /workbench is closing/i);
  assert.strictEqual(calls.length, 0, 'a closing character owner blocks connected switching');

  assert.strictEqual(await openConnectedAir({ id: 'air-target' }, session, api, () => false), true);
  assert.deepStrictEqual(calls[0], ['air.openAnimationPreview', { fsPath: target }, { ownerDefs: [owner], viewerColumn: 4, preserveFocus: false, connectedAirRequest: true, connectedAirBinding: { schema: 'ikemaker.connected-air-binding', version: 1, originAirPath: current, targetId: 'air-target' } }], 'the connected selector reuses the exact AIR preview owner route and carries a revalidated inventory binding');

  commandResult = undefined;
  assert.strictEqual(await openConnectedAir({ id: 'air-target' }, session, api, () => false), false);
  assert.match(warnings.pop(), /Could not focus Effects\.air.*current AIR viewer was left unchanged/i);
  assert.strictEqual(calls.length, 2, 'a failed return is reported once without a fallback or duplicate opener');
  console.log('Connected AIR switching rejects stale/closing targets, reuses the exact preview owner route, and reports a failed focus without changing the current viewer');
})().catch(error => { console.error(error); process.exitCode = 1; });
