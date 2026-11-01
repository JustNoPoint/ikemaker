'use strict';
const assert = require('assert');
const Module = require('module');

const calls = [];
const original = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return {
    commands: {
      executeCommand: async (...args) => { calls.push(args); },
      registerCommand: (id, handler) => ({ id, handler })
    }
  };
  return original.call(this, request, parent, main);
};
const workspace = require('../src/palette_index_organizer_workspace');
Module._load = original;

(async () => {
  assert.strictEqual(typeof workspace.enhancedHtml, 'undefined', 'legacy organizer HTML must not remain callable');
  assert.strictEqual(typeof workspace.withDropTarget, 'undefined', 'legacy drop-target panel must not remain callable');

  await workspace.openPaletteIndexOrganizer('file:///hero.png', { source: 'test' });
  assert.deepStrictEqual(calls, [[
    'ikemen.palette.openWorkspace',
    'file:///hero.png',
    { source: 'test', section: 'organize', compatibilityAlias: 'ikemen.paletteOrganizer.open' }
  ]]);

  const { paletteSwatchPng } = require('../src/palette_editor');
  const colors = Array.from({ length: 256 }, (_, index) => index ? [255, 0, 0, 255] : [0, 0, 0, 0]);
  const session = workspace.acceptDroppedPngs([{ name: 'sample.png', base64: paletteSwatchPng(colors).toString('base64') }]);
  assert.strictEqual(session.files[0].name, 'sample.png');
  assert.strictEqual(session.sourceKind, 'png-memory');
  assert.ok(session.model.uniqueColors >= 1);
  assert.throws(() => workspace.acceptDroppedPngs([{ name: 'bad.txt', base64: '' }]), /not a PNG/);

  console.log('Palette organizer alias and extracted owner tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
