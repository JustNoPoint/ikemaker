'use strict';

const assert = require('assert');
const { parseActionNumber, projectEmbeddedActions, pickEmbeddedAction } = require('../src/visual_action_picker');

assert.strictEqual(parseActionNumber(' 500 '), 500);
assert.strictEqual(parseActionNumber('-1'), null);
assert.strictEqual(parseActionNumber('2.5'), null);

const actions = {
  500: { line: 9, frames: [{ sprite: [101, 2], offset: [3, -4], time: 5 }, { sprite: [101, 3], offset: [0, 0], time: 2 }] },
  20: { line: 2, frames: [] },
  '-1': { line: 1, frames: [{ sprite: [0, 0], offset: [0, 0], time: 1 }] }
};
const projection = projectEmbeddedActions(actions);
assert.deepStrictEqual(projection.rows.map(row => row.number), [20, 500]);
assert.match(projection.rows[0].description, /no parsed sprite frame/);
assert.match(projection.rows[1].description, /first sprite 101,2 · offset 3,-4 · 5 ticks/);
assert.match(projection.rows[1].detail, /line 10/);
assert.strictEqual(projectEmbeddedActions(actions, 1).truncated, true);

(async () => {
  let items;
  const vscode = { window: { showQuickPick: async input => { items = input; return input.find(item => item.number === 500); }, showInputBox: async () => { throw new Error('manual fallback was not expected'); } } };
  assert.strictEqual(await pickEmbeddedAction(vscode, actions, { value: 500 }), '500');
  assert.strictEqual(items[0].number, 500, 'the currently relevant action is suggested first');
  let inputOptions;
  const manualVscode = { window: { showInputBox: async options => { inputOptions = options; return '42'; } } };
  assert.strictEqual(await pickEmbeddedAction(manualVscode, {}, { value: '7' }), '42');
  assert.strictEqual(inputOptions.validateInput('-2'), 'Enter a whole number from 0 to 2147483647.');
  assert.strictEqual(inputOptions.validateInput('2'), undefined);
  console.log('Shared embedded Begin Action picker tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
