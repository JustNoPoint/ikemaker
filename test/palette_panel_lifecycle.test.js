'use strict';

const assert = require('assert');
const { disposeOtherPalettePanels, singleFlight } = require('../src/palette_panel_lifecycle');

const calls = [];
const keep = { dispose() { calls.push('keep'); } };
const oldScratch = { dispose() { calls.push('scratch'); } };
const oldTarget = { dispose() { calls.push('target'); } };
const duplicate = { dispose() { calls.push('duplicate'); } };
const count = disposeOtherPalettePanels([
  new Map([['keep', keep], ['scratch', oldScratch], ['duplicate-a', duplicate]]),
  new Map([['target', oldTarget], ['duplicate-b', duplicate]])
], keep);

assert.strictEqual(count, 3);
assert.deepStrictEqual(calls.sort(), ['duplicate', 'scratch', 'target']);
console.log('Palette Workshop keeps one canonical panel and disposes duplicate palette surfaces exactly once');

(async () => {
  const opening = new Map();
  let opens = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const first = singleFlight(opening, 'target:ryu.sff', async () => { opens += 1; await gate; return 'panel'; });
  const duplicateOpen = singleFlight(opening, 'target:ryu.sff', async () => { opens += 1; return 'duplicate'; });
  assert.strictEqual(first, duplicateOpen);
  assert.strictEqual(opens, 0);
  release();
  assert.deepStrictEqual(await Promise.all([first, duplicateOpen]), ['panel', 'panel']);
  assert.strictEqual(opens, 1);
  assert.strictEqual(opening.size, 0);
  assert.strictEqual(await singleFlight(opening, 'target:ryu.sff', async () => { opens += 1; return 'reopened'; }), 'reopened');
  assert.strictEqual(opens, 2);
  console.log('Palette Workshop coalesces simultaneous requests for the same source into one panel');
})().catch(error => { console.error(error); process.exitCode = 1; });
