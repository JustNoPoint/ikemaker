'use strict';
const assert = require('assert');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function(request, parent, main) { if (request === 'vscode') return {}; return originalLoad.call(this, request, parent, main); };
const { chooseActOrder } = require('../src/sff_viewer');
Module._load = originalLoad;

function api(initial, picks, effectiveAfterUpdate = true) {
  let stored = initial; const updates = [], information = [], seen = [];
  return {
    ConfigurationTarget: { Global: 1 },
    workspace: { getConfiguration: () => ({ get: () => stored, update: async (key, value, target) => { updates.push({ key, value, target }); if (effectiveAfterUpdate) stored = value; } }) },
    window: { showQuickPick: async (items) => { seen.push(items); const pick = picks.shift(); return pick === null ? undefined : items[pick]; }, showInformationMessage: message => information.push(message) },
    updates, information, seen
  };
}

(async () => {
  let mock = api('reversed', [0]);
  assert.strictEqual(await chooseActOrder({}, 'Import', mock), 'reversed');
  assert.strictEqual(mock.updates.length, 0);assert.strictEqual(mock.seen[0][0].description, 'Remembered setting');

  mock = api('reversed', [1, 0]);
  assert.strictEqual(await chooseActOrder({}, 'Import', mock), 'index');
  assert.strictEqual(mock.updates.length, 0, 'Use once must not replace the remembered preference');

  mock = api('index', [1, 1]);
  assert.strictEqual(await chooseActOrder({}, 'Export', mock), 'reversed');
  assert.deepStrictEqual(mock.updates, [{ key: 'actPaletteOrder', value: 'reversed', target: 1 }]);

  mock = api('index', [1, 1], false);
  assert.strictEqual(await chooseActOrder({}, 'Export', mock), 'reversed');
  assert.strictEqual(mock.information.length, 1, 'a more specific effective setting is disclosed without a workspace write');

  mock = api('index', [null]);
  assert.strictEqual(await chooseActOrder({}, 'Import', mock), null);assert.strictEqual(mock.updates.length, 0);
  mock = api('index', [1, null]);
  assert.strictEqual(await chooseActOrder({}, 'Import', mock), null);assert.strictEqual(mock.updates.length, 0);
  console.log('ACT palette remembered, one-time, persistent, overridden and cancelled preference tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
