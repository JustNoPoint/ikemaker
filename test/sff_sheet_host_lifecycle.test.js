'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const receivers = [], posted = [], disposeHandlers = [];
const panel = {
  active: true, title: 'Sprite Sheet', viewColumn: 1, viewType: 'ikemenSffSheetReview',
  webview: {
    cspSource: 'test:', html: '',
    postMessage: async message => { posted.push(message); return true; },
    onDidReceiveMessage: handler => { receivers.push(handler); return { dispose() {} }; }
  },
  onDidDispose: handler => { disposeHandlers.push(handler); return { dispose() {} }; },
  onDidChangeViewState: () => ({ dispose() {} }), reveal() {},
  dispose() { for (const handler of [...disposeHandlers]) handler(); }
};
let warningCount = 0;
const vscode = { ViewColumn: { Active: 1 }, window: { createWebviewPanel: () => panel, showWarningMessage: async () => { warningCount++; return undefined; } } };
const original = Module._load;
Module._load = function (request, parent, main) {
  if (request === 'vscode') return vscode;
  return original.call(this, request, parent, main);
};
const { reviewSpriteSheet } = require('../src/sff_sheet_workspace');
Module._load = original;
const { indexedSourcePng } = require('../src/sff_reader');
const { sha256, gridProposal, extractIndexedGrid, analyzeIndexedComponents } = require('../src/sff_sheet_intake');

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-sheet-host-'));
  const colors = Array.from({ length: 256 }, (_, index) => [index, index, index, index ? 255 : 0]);
  const source = indexedSourcePng(4, 2, Buffer.from([1, 1, 1, 1, 1, 1, 1, 1]), colors), sourceHash = sha256(source);
  const proposal = gridProposal({ width: 4, height: 2, sourceHash }, { cellWidth: 2, cellHeight: 2 });
  const componentAudit = analyzeIndexedComponents(source, { mode: 'palette-index', backgroundIndex: 0, proposal });
  assert.strictEqual(componentAudit.components[0].crossesCuts, true);
  const completion = reviewSpriteSheet({ projectRoot: root, sourceBuffer: source, sourceFilename: 'crossing.png', proposal, intakeEvidence: { sourceHash, componentAudit }, extractedFrames: extractIndexedGrid(source, proposal) });
  const receive = receivers.at(-1);
  assert.strictEqual(typeof receive, 'function');

  await receive({ type: 'attachComponents', componentIds: [componentAudit.components[0].componentId], ownership: 'duplicate', note: 'cancel warning' });
  assert.strictEqual(warningCount, 1);
  assert.strictEqual(posted.at(-1).type, 'state', 'cancel republishes authoritative state so the client unlocks');
  assert.deepStrictEqual(posted.at(-1).model.state.componentAttachments, [], 'cancel cannot attach component pixels');

  await receive({ type: 'close' });
  assert.strictEqual(await completion, null);
  console.log('SFF sheet-review native warning cancellation and terminal lifecycle tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
