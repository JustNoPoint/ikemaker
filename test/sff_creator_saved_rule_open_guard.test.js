'use strict';

const assert = require('assert');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'vscode') return { workspace: { workspaceFolders: [], getConfiguration: () => ({ get: (_key, fallback) => fallback }) }, window: {}, Uri: { file: fsPath => ({ fsPath }) }, ViewColumn: { Active: 1 } };
  return originalLoad.call(this, request, parent, isMain);
};

(async () => {
  const workspace = require('../src/sff_creator_workspace');
  let opened = 0, order = [];
  await assert.rejects(() => workspace.openPaletteWorkshopAfterFreshCheck(async () => order.push('post'), async () => { order.push('verify-disposed'); throw new Error('disposed'); }, async () => { opened += 1; }), /disposed/);
  assert.strictEqual(opened, 0, 'a disposed Creator session must open zero Palette Workshop windows');
  await assert.rejects(() => workspace.openPaletteWorkshopAfterFreshCheck(async () => order.push('post'), async () => { order.push('verify-mutated'); throw new Error('mutated'); }, async () => { opened += 1; }), /mutated/);
  assert.strictEqual(opened, 0, 'a mutated Creator draft must open zero Palette Workshop windows');
  await workspace.openPaletteWorkshopAfterFreshCheck(async () => order.push('post'), async () => order.push('verify-fresh'), async () => { order.push('open'); opened += 1; });
  assert.strictEqual(opened, 1, 'one fresh exact handoff opens exactly one Palette Workshop window');
  assert.deepStrictEqual(order.slice(-3), ['post', 'verify-fresh', 'open'], 'opening occurs only after the awaited state post and fresh-evidence check');
  console.log('SFF Creator Palette Workshop disposal, mutation, and exact pre-open guard tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { Module._load = originalLoad; });
