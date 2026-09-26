'use strict';

const assert = require('assert');
const { routeForFilename, registerDirectAssetOpening } = require('../src/direct_asset_opening');

assert.strictEqual(routeForFilename('Fighter.SFF'), 'ikemen.sffWorkspace');
assert.strictEqual(routeForFilename('voices.snd'), 'ikemen.sndWorkspace');
assert.strictEqual(routeForFilename('anim.air'), null, 'AIR deliberately remains text plus its synchronized visual workspace');
assert.strictEqual(routeForFilename('states.zss'), null);

const calls = [], listeners = [], closed = [];
const ryuTextTab = { input: { uri: { scheme: 'file', fsPath: 'C:\\chars\\Ryu\\Ryu.sff' } } };
const vscode = {
  commands: { executeCommand: async (...args) => calls.push(args) },
  window: {
    activeTextEditor: { document: { uri: { scheme: 'file', fsPath: 'C:\\chars\\Ryu\\Ryu.sff' } }, viewColumn: 2 },
    tabGroups: { all: [{ viewColumn: 1, tabs: [
      { input: { uri: { scheme: 'file', fsPath: 'C:\\chars\\Ryu\\Sound.snd' } } },
      { input: { uri: { scheme: 'file', fsPath: 'C:\\chars\\Ryu\\Already.sff' }, viewType: 'ikemen.sffWorkspace' } },
      { input: { uri: { scheme: 'file', fsPath: 'C:\\chars\\Ryu\\Anim.air' } } }
    ] }, { viewColumn: 2, tabs: [ryuTextTab, { input: { uri: { scheme: 'file', fsPath: 'C:\\chars\\Ryu\\Ryu.sff' }, viewType: 'ikemen.sffWorkspace' } }] }], close: async (tabs) => closed.push(...tabs) },
    onDidChangeActiveTextEditor: (listener) => { listeners.push(listener); return { dispose() {} }; },
    showErrorMessage() {}
  }
};
const context = { subscriptions: [] };
const originalTimeout = global.setTimeout;
global.setTimeout = (callback, delay) => { if (delay !== 500) callback(); return 1; };
registerDirectAssetOpening(vscode, context);
global.setTimeout = originalTimeout;

setImmediate(() => {
  assert.strictEqual(context.subscriptions.length, 1);
  assert(calls.some((call) => call[0] === 'vscode.openWith' && call[2] === 'ikemen.sffWorkspace'));
  assert(calls.some((call) => call[0] === 'vscode.openWith' && call[2] === 'ikemen.sndWorkspace'));
  assert(!calls.some((call) => call[1]?.fsPath?.endsWith('Anim.air')));
  assert(closed.includes(ryuTextTab), 'the redundant SFF text tab should close after the visual workspace opens');
  assert(!closed.some((tab) => tab.input?.viewType), 'visual custom-editor tabs must never be closed');
  assert(!closed.some((tab) => tab.input?.uri?.fsPath?.endsWith('Anim.air')), 'AIR text tabs remain intentional');
  console.log('Direct asset-opening tests passed');
});
