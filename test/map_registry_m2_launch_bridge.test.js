'use strict';
const assert = require('assert'), Module = require('module');
const original = Module._load, calls = [];
const panel = { viewType: 'ikemenHelperLab' }, target = Object.freeze({ kind: 'visual' });
const capture = { surface: 'helper', id: 'helper-maps', expected: '', epoch: 0, bridgeEpoch: 1, start: 0, end: 0, grammar: 'map-table', language: 'zss' };
Module._load = function (request, parent, main) {
  if (request === 'vscode') return { Uri: { file: fsPath => ({ fsPath }) } };
  if (request === './mode_visibility') return { handle: async () => false };
  if (request === './asset_workspace') return { handle: async () => false };
  if (request === './map_registry_ui') return {
    captureVisualTarget(_vscode, _context, seed, origin, proof) { calls.push(['capture', seed.fsPath, origin, proof]); return target; },
    async openBrowser(_vscode, _context, seed, actual) { calls.push(['open', seed.fsPath, actual]); }
  };
  return original.call(this, request, parent, main);
};
(async () => { try {
  const { handleLaunchMessage } = require('../src/launch_controls');
  assert.equal(await handleLaunchMessage({ type: 'ikemenMaps', target: capture }, 'C:\\game\\chars\\hero.def', '', panel), true);
  assert.equal(calls.length, 2); assert.strictEqual(calls[1][2], target);
  calls.length = 0;
  assert.equal(await handleLaunchMessage({ type: 'ikemenMaps', target: { ...capture, path: 'forged' } }, 'C:\\game\\chars\\hero.def', '', panel), true);
  assert.equal(calls.length, 0, 'forged visual capture never opens Maps');
  assert.equal(await handleLaunchMessage({ type: 'ikemenMaps', target: { ...capture, expected: 'x'.repeat(524289) } }, 'C:\\game\\chars\\hero.def', '', panel), true);
  assert.equal(calls.length, 0, 'oversized visual capture never opens Maps');
  const panelTypes = { helper: 'ikemenHelperLab', hitdef: 'ikemenHitDefEditor', move_constants: 'ikemenMoveConstants', spatial_composer: 'ikemenSpatialComposer' };
  for (const [surface, viewType] of Object.entries(panelTypes)) {
    calls.length = 0; panel.viewType = viewType;
    assert.equal(await handleLaunchMessage({ type: 'ikemenMaps', target: { ...capture, surface } }, 'C:\\game\\chars\\hero.def', '', panel), true);
    assert.equal(calls.length, 2, `${surface} is accepted only from its host panel`);
    for (const forged of Object.keys(panelTypes).filter(item => item !== surface)) {
      calls.length = 0;
      assert.equal(await handleLaunchMessage({ type: 'ikemenMaps', target: { ...capture, surface: forged } }, 'C:\\game\\chars\\hero.def', '', panel), true);
      assert.equal(calls.length, 0, `${surface} host rejects forged ${forged} origin`);
    }
  }
  panel.viewType = 'ikemenSffViewer'; calls.length = 0;
  assert.equal(await handleLaunchMessage({ type: 'ikemenMaps', target: capture }, 'C:\\game\\chars\\hero.def', '', panel), true);
  assert.equal(calls.length, 0, 'non-map hosts cannot forge an allowlisted surface');
  console.log('Maps Registry M2 launch bridge validates exact host-owned visual capture before opening');
} finally { Module._load = original; } })().catch(error => { console.error(error); process.exitCode = 1; });
