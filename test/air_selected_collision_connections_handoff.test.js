'use strict';

const assert = require('assert');
const Module = require('module');
let receiver = null, createdPanels = 0;
const commands = [];
const vscode = {
  Uri: { file: fsPath => ({ fsPath }) },
  ViewColumn: {},
  commands: { async executeCommand(...args) { commands.push(args); } },
  workspace: {},
  window: { createWebviewPanel() { createdPanels += 1; throw new Error('The AIR handoff must reuse the existing docking command rather than create a new window type.'); } }
};
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return vscode;
  return originalLoad.call(this, request, parent, isMain);
};
const { attachMessages, viewerHtml } = require('../src/air_viewer');
Module._load = originalLoad;

const session = { airPath: 'C:\\fixture\\Anim.air', defPath: 'C:\\fixture\\Hero.def', panel: { webview: { onDidReceiveMessage(callback) { receiver = callback; return { dispose() {} }; }, async postMessage() {} } } };
attachMessages(session);

(async () => {
  await receiver({ type: 'openCollisionBrowser', action: 200, elementIndex: 4, collisionGroup: 'clsn2', collisionSlot: 3, view: 'references', referenceView: 'collision' });
  assert.strictEqual(commands.length, 1);
  assert.strictEqual(commands[0][0], 'air.openDockingWorkspaceExperimental');
  assert.deepStrictEqual(commands[0][2], { action: 200, elementIndex: 4, collisionGroup: 'clsn2', collisionSlot: 3, collisionMode: 'inspect', view: 'references', referenceView: 'collision', ownerDef: session.defPath, autoFloat: true });
  assert.strictEqual(createdPanels, 0, 'the main viewer delegates to the existing AIR browser command');

  const page = viewerHtml({ title: 'Anim.air', airPath: session.airPath, sffPath: '', palettes: [], collisionCapabilities: { indexed: true, status: 'verified', reason: 'fixture', target: { buildId: 'fixture' }, fingerprint: 'A'.repeat(64) }, actions: [{ number: 200, line: 1, loopStart: 0, frames: [{ group: 0, index: 0, x: 0, y: 0, time: 1, flags: '', line: 2, clsn1: [], clsn2: [[-1, -1, 1, 1]], clsn1Source: 'none', clsn2Source: 'element', clsn1Line: null, clsn2Line: 2 }] }] });
  assert(page.includes('aria-label="Open selected collision box Code connections"'));
  assert(page.includes("collisionGroup:indexedGroup.toLowerCase(),collisionSlot:record.index,view:'references',referenceView:'collision'"));
  assert(page.includes("if(!record){document.getElementById('timelineStatus').textContent='Select an exact Clsn1 or Clsn2 box first.'"));
  console.log('AIR selected collision-box handoff reuses the existing Code connections browser with exact slot identity');
})().catch(error => { console.error(error); process.exitCode = 1; });
