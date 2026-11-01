'use strict';

const assert = require('assert');
const {
  createDualPaletteModel, selectIndices, setIndexLocked, editColor, moveWithinBank,
  copyAcrossBanks, cloneAToB, setFollowA, previewColors,
  beginGesture, updateGesture, commitGesture, cancelGesture, undo
} = require('../src/dual_palette_edit_model');

const color = n => [n & 255, (n + 1) & 255, (n + 2) & 255, 255];
const palette = offset => Array.from({ length: 256 }, (_, i) => color(i + offset));
const fresh = options => createDualPaletteModel({ bankA: palette(0), bankB: palette(64), idA: 'master-1,0', idB: 'linked-1,1', ...options });

function run() {
  let state = fresh();
  assert.strictEqual(state.banks.A.colors.length, 256);
  assert.strictEqual(state.banks.B.colors.length, 256);
  assert.strictEqual(state.banks.A.id, 'master-1,0');
  assert.deepStrictEqual(state.banks.A.locked, [0]);
  assert.throws(() => fresh({ bankA: palette(0).slice(1) }), /exactly 256/);
  assert.throws(() => createDualPaletteModel({ bankA: palette(0), bankB: palette(0), idA: '' }), /identity/);

  state = selectIndices(state, 'A', 3);
  state = selectIndices(state, 'A', 6, { ctrl: true });
  assert.deepStrictEqual(state.selection.indices, [3, 6]);
  state = selectIndices(state, 'A', 9, { shift: true });
  assert.deepStrictEqual(state.selection.indices, [6, 7, 8, 9]);
  state = selectIndices(state, 'A', 2, { ctrl: true, shift: true });
  assert.deepStrictEqual(state.selection.indices, [2, 3, 4, 5, 6, 7, 8, 9]);
  state = selectIndices(state, 'A', 4, { ctrl: true });
  assert(!state.selection.indices.includes(4));
  state = selectIndices(state, 'B', 8, { ctrl: true });
  assert.deepStrictEqual(state.selection.indices, [8]);

  assert.throws(() => editColor(state, 'A', 0, color(99)), /locked/);
  assert.throws(() => setIndexLocked(state, 'A', 0, false), /permanently protected/);
  state = setIndexLocked(state, 'A', 7, true);
  assert.throws(() => editColor(state, 'A', 7, color(99)), /locked/);

  state = fresh();
  const beforeMove = state.banks.A.colors.map(c => c.slice());
  state = moveWithinBank(state, 'A', [4, 2], 7);
  assert.deepStrictEqual(state.banks.A.colors.slice(5, 7), [beforeMove[2], beforeMove[4]], 'multi-move preserves source order');
  assert.deepStrictEqual(state.selection.indices, [5, 6]);
  assert.throws(() => moveWithinBank(fresh(), 'A', [1], 0), /displace locked/);

  state = fresh();
  state = copyAcrossBanks(state, 'A', [9, 3, 5], 'B', 10);
  assert.deepStrictEqual(state.banks.B.colors.slice(10, 13), [color(3), color(5), color(9)]);
  assert.throws(() => copyAcrossBanks(fresh(), 'A', [1, 2], 'B', 255), /do not fit/);
  assert.throws(() => copyAcrossBanks(fresh(), 'A', [1], 'B', 0), /locked/);

  state = cloneAToB(fresh());
  assert.deepStrictEqual(state.banks.B.colors[0], color(64), 'clone preserves protected transparency slot');
  assert.deepStrictEqual(state.banks.B.colors[1], color(1));
  assert.strictEqual(state.banks.B.id, 'linked-1,1', 'clone retains destination identity');

  state = setFollowA(fresh(), true);
  assert.deepStrictEqual(previewColors(state, 'B')[12], state.banks.A.colors[12]);
  assert.throws(() => editColor(state, 'B', 12, color(200)), /Follow A/);
  assert.throws(() => copyAcrossBanks(state, 'A', [12], 'B', 12), /Follow A/);

  state = beginGesture(fresh());
  state = updateGesture(state, 'A', 2, [1, 2, 3, 255]);
  state = updateGesture(state, 'A', 2, [4, 5, 6, 255]);
  state = updateGesture(state, 'A', 2, [7, 8, 9, 255]);
  assert.strictEqual(state.history.length, 0);
  state = commitGesture(state);
  assert.strictEqual(state.history.length, 1, 'one gesture creates exactly one checkpoint');
  assert.deepStrictEqual(state.banks.A.colors[2], [7, 8, 9, 255]);
  state = undo(state);
  assert.deepStrictEqual(state.banks.A.colors[2], color(2));

  state = beginGesture(fresh());
  state = updateGesture(state, 'A', 2, [9, 9, 9, 255]);
  state = cancelGesture(state);
  assert.deepStrictEqual(state.banks.A.colors[2], color(2));
  assert.strictEqual(state.history.length, 0);

  state = editColor(fresh(), 'A', 3, [8, 8, 8, 255]);
  assert.strictEqual(state.history.length, 1);
  state = undo(state);
  assert.deepStrictEqual(state.banks.A.colors[3], color(3));

  assert.throws(() => editColor(fresh(), 'A', 256, color(1)), /0 to 255/);
  assert.throws(() => editColor(fresh(), 'A', 1, [0, 0, 0, 256]), /RGBA/);
  assert.throws(() => moveWithinBank(fresh(), 'A', [], 2), /at least one/);
  console.log('dual_palette_edit_model tests passed');
}

run();
