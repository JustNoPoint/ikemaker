'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRuntimeCollisionTransformPreview, MAX_BOXES } = require('../src/air_runtime_collision_transform_model');

const box = (group, index, rect) => ({ group, index, rect });
const selectedTransform = (extra = {}) => ({ target: { scope: 'selected' }, ...extra });

test('normalizes AIR rectangles, canonicalizes box order, and returns an immutable deterministic identity', () => {
  const input = {
    boxes: [box('Clsn2', 0, [8, 9, -2, -3]), box('Clsn1', 0, [5, 6, 1, 2])],
    selection: { group: 'Clsn2', index: 0 }, transform: selectedTransform()
  };
  const first = createRuntimeCollisionTransformPreview(input);
  const second = createRuntimeCollisionTransformPreview({ ...input, boxes: [...input.boxes].reverse() });
  assert.deepEqual(first.boxes.map((entry) => [entry.group, entry.airRect]), [['Clsn1', [1, 2, 5, 6]], ['Clsn2', [-2, -3, 8, 9]]]);
  assert.equal(first.previewHash, second.previewHash);
  assert.match(first.previewHash, /^[A-F0-9]{64}$/);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.boxes[0].transformedPolygon));
});

test('applies known character scale to AIR boxes, then reviewed override, then TransformClsn scale and pivot rotation', () => {
  const preview = createRuntimeCollisionTransformPreview({
    boxes: [box('Clsn2', 0, [10, 20, -10, -20])], collisionScale: [2, 0.5],
    selection: { group: 'Clsn2', index: 0 },
    override: { reviewed: true, target: { scope: 'selected' }, rect: [6, 8, 2, -4] },
    transform: selectedTransform({ scale: [2, 0.5], angle: 90, pivot: [0, 0] })
  });
  assert.equal(preview.context.exact, true);
  assert.equal(preview.context.label, 'Exact known character collision-scale preview');
  assert.deepEqual(preview.boxes[0].originalRect, [-20, -10, 20, 10]);
  assert.deepEqual(preview.boxes[0].runtimeRect, [2, -4, 6, 8], 'override coordinates are absolute and are not character-scaled');
  assert.deepEqual(preview.boxes[0].transformedRect, [4, -2, 12, 4]);
  assert.deepEqual(preview.boxes[0].transformedPolygon, [[2, 4], [2, 12], [-4, 12], [-4, 4]]);
  assert.deepEqual(preview.boxes[0].aabb, [-4, 4, 2, 12]);
});

test('defaults the pivot to the character AIR axis and clearly labels an unscaled AIR-local preview', () => {
  const preview = createRuntimeCollisionTransformPreview({ boxes: [box('Clsn1', 0, [0, -10, 5, 0])], selection: { group: 'Clsn1', index: 0 }, transform: selectedTransform({ angle: 180 }) });
  assert.deepEqual(preview.transform.pivot, [0, 0]);
  assert.deepEqual(preview.boxes[0].transformedPolygon, [[0, 10], [-5, 10], [-5, 0], [0, 0]]);
  assert.equal(preview.context.exact, false);
  assert.equal(preview.context.space, 'air-local');
  assert.match(preview.context.label, /AIR-local/);
});

test('distinguishes one exact selected target from explicit all-in-group and all-groups targets', () => {
  const boxes = [box('Clsn1', 0, [0, 0, 1, 1]), box('Clsn1', 1, [1, 1, 2, 2]), box('Clsn2', 0, [2, 2, 3, 3]), box('Size', 0, [-2, -3, 2, 0])];
  const selected = createRuntimeCollisionTransformPreview({ boxes, selection: { group: 'Clsn1', index: 1 }, transform: selectedTransform({ scale: [2, 2] }) });
  assert.deepEqual(selected.boxes.filter((entry) => entry.transformed).map((entry) => [entry.group, entry.index]), [['Clsn1', 1]]);
  const group = createRuntimeCollisionTransformPreview({ boxes, transform: { target: { scope: 'all', group: 'Clsn1' }, scale: [2, 2] } });
  assert.deepEqual(group.boxes.filter((entry) => entry.transformed).map((entry) => [entry.group, entry.index]), [['Clsn1', 0], ['Clsn1', 1]]);
  const every = createRuntimeCollisionTransformPreview({ boxes, transform: { target: { scope: 'all', group: 'All' }, scale: [2, 2] } });
  assert.equal(every.transformedCount, 4);
});

test('character collision scale affects Clsn1 and Clsn2 originals but not runtime Size or Dummy geometry', () => {
  const preview = createRuntimeCollisionTransformPreview({
    boxes: [box('Clsn1', 0, [1, 2, 3, 4]), box('Clsn2', 0, [2, 3, 4, 5]), box('Size', 0, [3, 4, 5, 6]), box('Dummy', 0, [4, 5, 6, 7])],
    collisionScale: [2, 3], transform: { target: { scope: 'all', group: 'All' } }
  });
  assert.deepEqual(preview.boxes.map((entry) => entry.originalRect), [[2, 6, 6, 12], [4, 9, 8, 15], [3, 4, 5, 6], [4, 5, 6, 7]]);
});

test('warns about negative and zero scale while preserving engine-style normalization', () => {
  const preview = createRuntimeCollisionTransformPreview({
    boxes: [box('Clsn2', 0, [1, 2, 4, 8])], collisionScale: [-2, 0],
    selection: { group: 'Clsn2', index: 0 }, transform: selectedTransform({ scale: [-3, 0] })
  });
  assert.deepEqual(preview.boxes[0].originalRect, [-8, 0, -2, 0]);
  assert.deepEqual(preview.boxes[0].transformedRect, [6, 0, 24, 0]);
  assert.deepEqual(preview.warnings, [
    'Character collision X scale is negative; targeted geometry is mirrored before normalization.',
    'Character collision Y scale is zero; targeted geometry collapses vertically.',
    'TransformClsn X scale is negative; targeted geometry is mirrored before normalization.',
    'TransformClsn Y scale is zero; targeted geometry collapses vertically.'
  ]);
});

test('requires explicit review for OverrideClsn and mirrors zero-rectangle deletion before transform targeting', () => {
  const base = { boxes: [box('Clsn2', 0, [0, 0, 5, 5]), box('Clsn2', 1, [5, 5, 10, 10])], selection: { group: 'Clsn2', index: 0 }, transform: selectedTransform({ scale: [2, 2] }) };
  assert.throws(() => createRuntimeCollisionTransformPreview({ ...base, override: { target: { scope: 'selected' }, rect: [1, 1, 2, 2] } }), /reviewed: true/);
  const deleted = createRuntimeCollisionTransformPreview({ ...base, override: { reviewed: true, target: { scope: 'selected' }, rect: [0, 0, 0, 0] } });
  assert.equal(deleted.removed.length, 1);
  assert.equal(deleted.boxes.length, 1);
  assert.equal(deleted.boxes[0].index, 0, 'runtime indexes close after an OverrideClsn deletion');
  assert.equal(deleted.transformedCount, 1, 'the same runtime index now identifies the shifted box, matching engine index lookup order');
});

test('an explicit all-box zero override leaves a visible no-target warning instead of inventing geometry', () => {
  const preview = createRuntimeCollisionTransformPreview({
    boxes: [box('Clsn1', 0, [0, 0, 5, 5])],
    override: { reviewed: true, target: { scope: 'all', group: 'Clsn1' }, rect: [0, 0, 0, 0] },
    transform: { target: { scope: 'all', group: 'Clsn1' }, angle: 45 }
  });
  assert.deepEqual(preview.boxes, []);
  assert.equal(preview.removed.length, 1);
  assert.match(preview.warnings.at(-1), /resolves to no box/);
});

test('rejects ambiguous effective indexes, malformed targets, non-finite values, and excessive work', () => {
  assert.throws(() => createRuntimeCollisionTransformPreview({ boxes: [box('Clsn1', 1, [0, 0, 1, 1])], transform: { target: { scope: 'all', group: 'Clsn1' } } }), /contiguous/);
  assert.throws(() => createRuntimeCollisionTransformPreview({ boxes: [box('Clsn1', 0, [0, 0, 1, 1])], transform: selectedTransform() }), /requires an exact selection/);
  assert.throws(() => createRuntimeCollisionTransformPreview({ boxes: [box('Clsn1', 0, [0, 0, 1, 1])], selection: { group: 'Clsn1', index: 0 }, transform: { target: { scope: 'selected', group: 'Clsn1' } } }), /do not provide a second target/);
  assert.throws(() => createRuntimeCollisionTransformPreview({ boxes: [box('Clsn1', 0, [0, 0, Infinity, 1])], transform: { target: { scope: 'all', group: 'Clsn1' } } }), /finite/);
  assert.throws(() => createRuntimeCollisionTransformPreview({ boxes: Array.from({ length: MAX_BOXES + 1 }, (_, index) => box('Clsn1', index, [0, 0, 1, 1])), transform: { target: { scope: 'all', group: 'Clsn1' } } }), /preview limit/);
});

test('does not mutate caller-owned input and changes identity for semantic changes', () => {
  const input = { boxes: [box('Clsn2', 0, [4, 5, 1, 2])], selection: { group: 'Clsn2', index: 0 }, transform: selectedTransform({ angle: 10 }) };
  const before = JSON.stringify(input), first = createRuntimeCollisionTransformPreview(input), second = createRuntimeCollisionTransformPreview({ ...input, transform: selectedTransform({ angle: 11 }) });
  assert.equal(JSON.stringify(input), before);
  assert.notEqual(first.previewHash, second.previewHash);
});
