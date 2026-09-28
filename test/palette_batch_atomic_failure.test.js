'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemen-palette-atomic-')); fs.writeFileSync(path.join(root, 'Ikemen_GO.exe'), '');
const folder = path.join(root, 'chars', 'Test'); fs.mkdirSync(folder, { recursive: true });
const sff = path.join(folder, 'Test.sff'), source = path.join(root, 'one.act'); fs.writeFileSync(sff, 'stable'); fs.writeFileSync(source, Buffer.alloc(768, 7));
const normal = require('../src/palette_plan'); normal.stagePalette(sff, source, 1, 1, []);
const planFile = normal.palettePlanLocation(sff), before = fs.readFileSync(planFile);

const originalLoad = Module._load, modulePath = require.resolve('../src/palette_plan');
delete require.cache[modulePath];
Module._load = function patched(request, parent, main) {
  if (request === './mutation_safety' && parent?.filename === modulePath) return { transactionalWrite() { throw new Error('injected final write failure'); } };
  return originalLoad.call(this, request, parent, main);
};
try {
  const failing = require('../src/palette_plan');
  const preview = failing.batchPalettePreflight(sff, { mode: 'append', group: 1, incoming: [{ source }], occupiedIds: [] });
  assert.throws(() => failing.stagePaletteBatch(sff, preview), /injected final write failure/);
  assert.deepStrictEqual(fs.readFileSync(planFile), before);
} finally {
  Module._load = originalLoad; delete require.cache[modulePath]; fs.rmSync(root, { recursive: true, force: true });
}

console.log('palette batch final-write failure leaves the prior plan byte-identical');
