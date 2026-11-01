'use strict';

const assert = require('assert');
const model = require('../src/native_visual_layer_adapter');

const rows = [
  { identity: 'screen:Title Info/element:title', name: 'Title', x: 160, y: 28, previewVisible: true, nativeLayer: 1, nativeLayerAssignable: true, nativeMetadata: { screen: 'Title Info', base: 'title' } },
  { identity: 'screen:Title Info/element:cursor', name: 'Cursor', x: 84, y: 90, previewVisible: false, nativeLayer: 0, nativeLayerAssignable: true, nativeMetadata: { screen: 'Title Info', base: 'cursor' } },
  { identity: 'screen:Title Info/element:guide', name: 'Guide', x: 0, y: 0, editorLocked: true, nativeLayer: null, nativeMetadata: { editorOnly: true } }
];
const adapter = model.createNativeVisualLayerAdapter(rows, { binding: 'D:/motif/system.def#CURRENT#Title Info', allowNativeLayerAssignment: true });
const snapshot = adapter.snapshot();

assert.deepStrictEqual(snapshot.rows.map(row => row.encounterOrder), [0, 1, 2]);
assert.deepStrictEqual(snapshot.rows.map(row => [row.x, row.y, row.positionSpace]), [[160, 28, 'absolute'], [84, 90, 'absolute'], [0, 0, 'absolute']]);
assert.strictEqual(snapshot.rows[1].previewVisible, false);
assert.strictEqual(snapshot.rows[2].editorLocked, true);
assert.deepStrictEqual(snapshot.rows[0].nativeMetadata, { screen: 'Title Info', base: 'title' });
assert.deepStrictEqual(snapshot.rows[0].capabilities, {
  position: 'authored-absolute', visibility: 'preview-only', lock: 'editor-local', opacity: 'unsupported', reorder: 'unsupported', nativeLayer: 'authored-explicit'
});
assert.strictEqual(snapshot.rows[2].capabilities.nativeLayer, 'unsupported');

const positionPlan = adapter.plan({
  type: 'set-absolute-positions', binding: adapter.binding,
  positions: [{ identity: rows[0].identity, x: 176, y: 31 }, { identity: rows[1].identity, x: 96, y: 104 }]
});
assert.deepStrictEqual(positionPlan, {
  type: 'delegate-absolute-positions', binding: adapter.binding, positionSpace: 'absolute',
  positions: [{ identity: rows[0].identity, x: 176, y: 31 }, { identity: rows[1].identity, x: 96, y: 104 }]
});
assert.strictEqual(Object.prototype.hasOwnProperty.call(positionPlan.positions[0], 'deltaX'), false, 'absolute positions are never reinterpreted as PSD deltas');
assert.strictEqual(Object.prototype.hasOwnProperty.call(positionPlan.positions[0], 'deltaY'), false, 'absolute positions are never reinterpreted as PSD deltas');

assert.deepStrictEqual(adapter.plan({
  type: 'set-native-layer-numbers', binding: adapter.binding,
  assignments: [{ identity: rows[0].identity, nativeLayer: -1 }, { identity: rows[1].identity, nativeLayer: 2 }]
}), {
  type: 'delegate-native-layer-numbers', binding: adapter.binding,
  assignments: [{ identity: rows[0].identity, nativeLayer: -1 }, { identity: rows[1].identity, nativeLayer: 2 }]
});

for (const type of ['set-visibility', 'set-opacity', 'reorder', 'drag-insert']) {
  assert.throws(() => adapter.plan({ type, binding: adapter.binding }), /unsupported/, `${type} must fail closed`);
}
assert.throws(() => adapter.plan({ type: 'set-absolute-positions', binding: 'D:/motif/system.def#STALE', positions: [{ identity: rows[0].identity, x: 1, y: 2 }] }), /binding is stale/);
assert.throws(() => adapter.plan({ type: 'set-absolute-positions', binding: adapter.binding, positions: [{ identity: 'missing', x: 1, y: 2 }] }), /identity missing is stale/);
assert.throws(() => adapter.plan({ type: 'set-absolute-positions', binding: adapter.binding, positions: [{ identity: rows[0].identity, x: 1, y: 2, visible: false }] }), /unsupported fields/);
assert.throws(() => adapter.plan({ type: 'set-absolute-positions', binding: adapter.binding, positions: [{ identity: rows[0].identity, x: 1, y: 2 }, { identity: rows[0].identity, x: 3, y: 4 }] }), /repeated in the intent/);
assert.throws(() => adapter.plan({ type: 'set-absolute-positions', binding: adapter.binding, positions: [{ identity: rows[2].identity, x: 1, y: 2 }] }), /editor-locked/);
assert.throws(() => adapter.plan({ type: 'set-native-layer-numbers', binding: adapter.binding, assignments: [{ identity: rows[2].identity, nativeLayer: 1 }] }), /editor-locked/);
assert.throws(() => adapter.plan({ type: 'set-native-layer-numbers', binding: adapter.binding, assignments: [{ identity: rows[0].identity, nativeLayer: 1.5 }] }), /invalid or unbounded/);
assert.throws(() => model.createNativeVisualLayerAdapter([{ ...rows[0] }, { ...rows[0] }], { binding: 'current' }), /repeated/);
assert.throws(() => model.createNativeVisualLayerAdapter([{ ...rows[0], identity: 'x'.repeat(model.MAX_IDENTITY_LENGTH + 1) }], { binding: 'current' }), /missing or unbounded/);
assert.throws(() => model.createNativeVisualLayerAdapter(Array.from({ length: model.MAX_ROWS + 1 }, (_, index) => ({ identity: String(index), x: 0, y: 0 })), { binding: 'current' }), /at most/);
assert.throws(() => model.createNativeVisualLayerAdapter([{ ...rows[0], x: model.MAX_ABSOLUTE_COORDINATE + 1 }], { binding: 'current' }), /invalid or unbounded/);

const readOnly = model.createNativeVisualLayerAdapter([{ ...rows[0] }], { binding: 'current' });
assert.strictEqual(readOnly.rows[0].capabilities.nativeLayer, 'unsupported');
assert.throws(() => readOnly.plan({ type: 'set-native-layer-numbers', binding: 'current', assignments: [{ identity: rows[0].identity, nativeLayer: 2 }] }), /unsupported/);

console.log('Native visual layer capability adapter and fail-closed intent tests passed');
