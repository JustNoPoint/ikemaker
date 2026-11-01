'use strict';

const assert = require('assert');
const { parseSpriteReference, projectSpriteReferences, pickSpriteReference } = require('../src/visual_sprite_picker');

assert.deepStrictEqual(parseSpriteReference(' 12, 34 '), [12, 34]);
assert.strictEqual(parseSpriteReference('-1,2'), null);
assert.strictEqual(parseSpriteReference('1,65536'), null);

const archive = { sprites: [
  { index: 0, group: 10, number: 2, width: 20, height: 30, axisX: -4, axisY: 8 },
  { index: 1, group: 1, number: 9, width: 8, height: 9, axisX: 0, axisY: 0 },
  { index: 2, group: 10, number: 2, width: 20, height: 30, axisX: -4, axisY: 8 }
] };
const projection = projectSpriteReferences(archive);
assert.deepStrictEqual(projection.rows.map(row => row.key), ['1,9', '10,2']);
assert.strictEqual(projection.rows[1].ambiguous, true);
assert.deepStrictEqual(projection.rows[1].physicalIndexes, [0, 2]);
assert.match(projection.rows[1].detail, /cannot distinguish/);
assert.strictEqual(projectSpriteReferences(archive, 1).truncated, true);

(async () => {
  const calls = [], vscode = { window: {
    showQuickPick: async (items, options) => { calls.push({ items, options }); return items.find(item => item.key === '10,2'); },
    showInputBox: async () => { throw new Error('manual fallback was not expected'); }
  } };
  const selected = await pickSpriteReference(vscode, 'D:/fake.sff', { value: '10,2', fileSystem: { existsSync: () => true }, reader: () => archive });
  assert.strictEqual(selected, '10,2');
  assert.strictEqual(calls[0].items[0].key, '10,2', 'the current reference is suggested first without changing the archive');

  let inputOptions;
  const manualVscode = { window: { showInputBox: async options => { inputOptions = options; return '7, 8'; } } };
  assert.strictEqual(await pickSpriteReference(manualVscode, '', { value: '3,4' }), '7,8');
  assert.strictEqual(inputOptions.validateInput('1,x'), 'Enter two whole numbers from 0 to 65535, separated by a comma.');
  assert.strictEqual(inputOptions.validateInput('1,2'), undefined);
  console.log('Shared Stage, UI, and Storyboard sprite-reference picker tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
