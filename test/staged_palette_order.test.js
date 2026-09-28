'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const original = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return { workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) }, window: {}, commands: {}, env: {}, UIKind: { Web: 2 }, ProgressLocation: { Notification: 1 }, Uri: { file: (fsPath) => ({ fsPath }) } };
  return original.call(this, request, parent, main);
};
const { resolveStagedPalettes, expectedPaletteContract } = require('../src/sff_commands');
Module._load = original;

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemen-staged-order-')), source = path.join(root, 'test.act'), bytes = Buffer.alloc(768);
bytes.set([10, 20, 30], 0); bytes.set([200, 210, 220], 255 * 3); fs.writeFileSync(source, bytes);
const direct = resolveStagedPalettes({ shifts: [], palettes: [{ kind: 'source', group: 1, number: 1, source, tableOrder: 'index' }] }, { palettes: [] });
const reversed = resolveStagedPalettes({ shifts: [], palettes: [{ kind: 'source', group: 1, number: 2, source, tableOrder: 'reversed' }] }, { palettes: [] });
assert.deepStrictEqual(direct[0].colors[0].slice(0, 3), [10, 20, 30]);
assert.deepStrictEqual(reversed[0].colors[0].slice(0, 3), [200, 210, 220]);
assert.deepStrictEqual(reversed[0].colors[255].slice(0, 3), [10, 20, 30]);
const contract = expectedPaletteContract({ palettes: [{ group: 1, number: 2, index: 0, dataSize: 768, link: 0 }, { group: 1, number: 3, index: 1, dataSize: 0, link: 0 }] }, [], [{ group: 1, start: 2, amount: 30 }], null, (_archive, index) => [[index, 0, 0, 255]]);
assert.deepStrictEqual(contract.map((item) => ({ id: `${item.group},${item.number}`, alias: item.aliasOf && `${item.aliasOf.group},${item.aliasOf.number}` })), [{ id: '1,32', alias: null }, { id: '1,33', alias: '1,32' }]);
fs.rmSync(root, { recursive: true, force: true });
console.log('Staged palette build resolves direct and Reversed Photoshop table order exactly');
