'use strict';

const assert = require('assert');
const { identityIndexMap, archiveBankIdentity, composeIndexMaps, rearrangeBank } = require('../src/palette_dual_bank_client');

const archiveA = { filename: 'fighter.sff', byteHash: 'aaa', byteLength: 10 };
assert.strictEqual(archiveBankIdentity(archiveA, 2), archiveBankIdentity({ ...archiveA, selectedSprite: 99 }, 2), 'sprite selection must not reset the Bank B draft');
assert.notStrictEqual(archiveBankIdentity(archiveA, 2), archiveBankIdentity({ ...archiveA, byteHash: 'bbb' }, 2), 'new archive bytes must reset Bank B state');
assert.notStrictEqual(archiveBankIdentity(archiveA, 2), archiveBankIdentity(archiveA, 3), 'changing the physical Bank B palette must reset Bank B state');

const colors = Array.from({ length: 256 }, (_, index) => [index, index, index, 255]);
const ids = result => result.colors.map(color => color[0]);

{
  const result = rearrangeBank(colors, [2], 5, true);
  assert.deepStrictEqual(ids(result).slice(0, 8), [0, 1, 3, 4, 5, 2, 6, 7], 'offset move inserts at the exact dropped index and shifts surrounding colors');
  assert.strictEqual(result.oldToNew[2], 5);
  assert.deepStrictEqual(result.selected, [5]);
}
{
  const result = rearrangeBank(colors, [6, 2, 4], 10, true);
  assert.deepStrictEqual(ids(result).slice(10, 13), [2, 4, 6], 'offset move preserves ascending selected-index order for discontiguous selections');
  assert.deepStrictEqual(result.selected, [10, 11, 12]);
}
{
  const result = rearrangeBank(colors, [2], 5, false);
  assert.deepStrictEqual(ids(result).slice(0, 7), [0, 1, 5, 3, 4, 2, 6], 'non-offset single move swaps source and destination');
}
{
  const result = rearrangeBank(colors, [2, 3], 3, false);
  assert.deepStrictEqual(ids(result).slice(1, 6), [1, 4, 2, 3, 5], 'overlapping non-offset blocks rotate their union without shifting unrelated indexes');
}
{
  const result = rearrangeBank(colors, [2, 5], 3, false), output = ids(result);
  assert.deepStrictEqual(output.slice(2, 6), [3, 2, 5, 4], 'discontiguous non-offset move fills vacated sources with displaced destinations');
  assert.deepStrictEqual([...output].sort((a, b) => a - b), identityIndexMap(), 'non-offset rearrangement preserves the complete color multiset');
  for (const index of [1, 6, 200]) assert.strictEqual(output[index], index, 'indexes outside the source/destination union remain unchanged');
}
{
  const duplicateColors = colors.map(color => color.slice()); duplicateColors[2] = duplicateColors[9].slice();
  const result = rearrangeBank(duplicateColors, [2], 8, false);
  assert.strictEqual(result.oldToNew[2], 8, 'identity mapping follows original indexes rather than duplicate RGBA equality');
  assert.strictEqual(result.oldToNew[8], 2);
}
assert.throws(() => rearrangeBank(colors, [0, 2], 5, true), /index 0/, 'transparent index 0 rejects the whole source selection');
assert.throws(() => rearrangeBank(colors, [2, 3], 255, true), /fit/, 'out-of-bounds destination blocks are rejected');
{
  const first = rearrangeBank(colors, [2], 5, false), second = rearrangeBank(first.colors, [5], 8, false);
  const composed = composeIndexMaps(first.oldToNew, second.oldToNew);
  assert.strictEqual(composed[2], 8, 'sequential retained connections compose old index through every rearrangement');
  assert.strictEqual(composed[0], 0);
}

console.log('Palette Bank B offset and non-offset rearrangement rules preserve exact index identity');
