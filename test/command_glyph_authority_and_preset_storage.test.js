'use strict';

const assert = require('assert');
const Module = require('module');
const vscode = { workspace: {}, Uri: {} };
const original = Module._load;
Module._load = function(request, parent, isMain) { return request === 'vscode' ? vscode : original.call(this, request, parent, isMain); };
const { openExactGlyphAsset, mutatePresetStorage, serializePresetMutation, exactKeys } = require('../src/command_movelist_workspace');
Module._load = original;

(async () => {
  const originalCapture = { filename: 'C:\\game\\data\\glyphs.sff', assignmentIdentity: 'assignment-a', fileHash: 'file-a' };
  let active = true, writes = 0;
  const opened = await openExactGlyphAsset('archive', {
    generation: 7,
    capture: () => ({ ...originalCapture }),
    open: async () => { active = false; },
    sessionState: () => ({ disposed: false, generation: 7, active })
  });
  assert.strictEqual(opened.filename, originalCapture.filename, 'expected focus transfer does not invalidate an exact glyph handoff');
  assert.strictEqual(writes, 0, 'glyph handoff performs no source or draft writes');

  for (const [label, second, state, pattern] of [
    ['same-size content mutation', { ...originalCapture, fileHash: 'file-b' }, { disposed: false, generation: 7 }, /configured glyph asset changed/],
    ['motif reassignment', { ...originalCapture, assignmentIdentity: 'assignment-b' }, { disposed: false, generation: 7 }, /configured glyph asset changed/],
    ['disposed origin', originalCapture, { disposed: true, generation: 7 }, /session changed/],
    ['generation change', originalCapture, { disposed: false, generation: 8 }, /session changed/]
  ]) {
    let captures = 0;
    await assert.rejects(openExactGlyphAsset('archive', {
      generation: 7,
      capture: () => ({ ...(captures++ ? second : originalCapture) }),
      open: async () => {},
      sessionState: () => state
    }), pattern, label);
  }
  assert.strictEqual(exactKeys({ type: 'openGlyphArchive', filename: 'C:\\evil.sff' }, ['type']), false, 'forged client paths are rejected; the host resolves the exact asset');

  const key = 'commandPresets:test', initial = [{ id: 'custom:one', label: 'One', text: '[Command]\nname="one"\ncommand=x' }];
  const storage = {
    value: initial.map(item => ({ ...item })),
    get(requested, fallback) { assert.strictEqual(requested, key); return this.value || fallback; },
    async update(requested, next) { assert.strictEqual(requested, key); writes += 1; this.value = next.map(item => ({ ...item })); }
  };
  const snapshot = JSON.stringify(initial);
  await mutatePresetStorage(storage, key, snapshot, current => [...current, { id: 'custom:two', label: 'Two', text: '[Command]\nname="two"\ncommand=y' }]);
  assert.deepStrictEqual(storage.value.map(item => item.id), ['custom:one', 'custom:two'], 'fresh bounded preset mutation persists exact data');
  const retained = JSON.stringify(storage.value), writesBeforeStale = writes;
  await assert.rejects(mutatePresetStorage(storage, key, snapshot, current => current.slice(1)), /changed while the operation/);
  assert.strictEqual(JSON.stringify(storage.value), retained, 'stale CAS rejection preserves the current store');
  assert.strictEqual(writes, writesBeforeStale, 'stale CAS never calls update');

  const failing = { get: () => initial, update: async () => { throw new Error('storage unavailable'); } };
  await assert.rejects(mutatePresetStorage(failing, key, snapshot, current => current.slice()), /storage unavailable/);
  assert.deepStrictEqual(failing.get(), initial, 'update failure leaves the prior store intact');
  const malformed = { get: () => [{ id: 'custom:one', label: 'One', text: 'x', extra: true }], update: async () => { throw new Error('must not update'); } };
  await assert.rejects(mutatePresetStorage(malformed, key, JSON.stringify(malformed.get()), current => current), /unsupported fields/);

  storage.value = initial.map(item => ({ ...item })); writes = 0;
  const sharedSnapshot = JSON.stringify(storage.value), order = [];
  const first = serializePresetMutation('C:\\project\\one.def', async () => { order.push('save-start'); await Promise.resolve(); const result = await mutatePresetStorage(storage, key, sharedSnapshot, current => [...current, { id: 'custom:two', label: 'Two', text: 'x' }]); order.push('save-end'); return result; });
  const second = serializePresetMutation('C:\\project\\one.def', async () => { order.push('delete-start'); return mutatePresetStorage(storage, key, sharedSnapshot, current => current.slice(1)); });
  await first;
  await assert.rejects(second, /changed while the operation/);
  assert.deepStrictEqual(order, ['save-start', 'save-end', 'delete-start'], 'concurrent save/delete operations serialize and the stale second review fails closed');
  assert.deepStrictEqual(storage.value.map(item => item.id), ['custom:one', 'custom:two']);

  console.log('Exact glyph handoff and bounded preset storage host tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
