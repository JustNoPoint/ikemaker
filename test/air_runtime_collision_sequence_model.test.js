'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PINNED_SOURCE_COMMIT,
  MAX_BOXES,
  MAX_CONTROLLERS,
  EFFECTS,
  createAirRuntimeCollisionSequencePlan
} = require('../src/air_runtime_collision_sequence_model');

const HASH = 'A'.repeat(64);
const box = (sourceIndex, rect) => ({ sourceIndex, rect });
const group = (name, boxes, provenance = name === 'Size' ? 'runtime-plan' : name === 'Dummy' ? 'engine-empty' : 'air-inspection') => ({ name, available: true, provenance, evidenceHash: HASH, boxes, reason: '' });
const baseGroups = () => [group('Clsn1', [box(0, [1, 2, 3, 4]), box(1, [5, 6, 7, 8])]), group('Clsn2', [box(0, [-2, -4, 2, 4])]), group('Size', [box(0, [-10, -20, 10, 0])]), group('Dummy', [])];
const capability = () => ({ target: 'nightly', decision: 'supported', fingerprint: HASH, indexed: true, dummy: true });
const collisionScale = () => ({ available: true, value: [2, 3], provenanceHash: HASH, reason: '' });
const controller = (id, kind, values = {}) => ({ id, kind, provenanceHash: HASH, ...values });
const input = (controllers = [], extra = {}) => ({ sourceCommit: PINNED_SOURCE_COMMIT, capability: capability(), collisionScale: collisionScale(), groups: baseGroups(), controllers, ...extra });
const ready = (controllers = [], extra = {}) => { const result = createAirRuntimeCollisionSequencePlan(input(controllers, extra)); assert.equal(result.status, 'ready', result.reason); return result; };
const final = (plan, name) => plan.groups.find(item => item.name === name).finalLocalBoxes;

test('canonicalizes exact engine defaults and partial arity without inventing translation', () => {
  const plan = ready([
    controller('reset-overrides', 'OverrideClsn'),
    controller('all-transform', 'TransformClsn', { scale: [2], pivot: [4] })
  ]);
  assert.deepEqual(plan.controllers[0], { id: 'reset-overrides', kind: 'OverrideClsn', provenanceHash: HASH, sourceOrder: 0, group: 0, index: 0, rect: [0, 0, 0, 0], defaulted: ['group', 'index', 'rect[0]', 'rect[1]', 'rect[2]', 'rect[3]', 'rect'], targets: [], effect: 'reset-family' });
  assert.deepEqual(plan.controllers[1].scale, [2, 1]); assert.deepEqual(plan.controllers[1].pivot, [4, 0]); assert.equal(plan.controllers[1].angle, 0); assert.deepEqual(plan.controllers[1].defaulted, ['group', 'index', 'angle', 'scale[1]', 'pivot[1]']);
  assert.throws(() => createAirRuntimeCollisionSequencePlan(input([controller('bad', 'TransformClsn', { translation: [1, 2] })])), /has no translation field/);
});

test('maps reset, all, each exact group, and invalid groups source-faithfully', () => {
  const plan = ready([
    controller('o-all-old', 'OverrideClsn', { group: -1, index: -1, rect: [1, 1, 2, 2] }),
    controller('o-reset', 'OverrideClsn', { group: 0 }),
    controller('o-c1', 'OverrideClsn', { group: 1, index: 0, rect: [3, 3, 4, 4] }),
    controller('o-c2', 'OverrideClsn', { group: 2, index: 0, rect: [5, 5, 6, 6] }),
    controller('o-size', 'OverrideClsn', { group: 3, index: 0, rect: [7, 7, 8, 8] }),
    controller('o-dummy', 'OverrideClsn', { group: 4, index: 0, rect: [9, 9, 10, 10] }),
    controller('t-all-old', 'TransformClsn', { group: -1, scale: [2, 2] }),
    controller('t-reset', 'TransformClsn', { group: 0 }),
    controller('t-all', 'TransformClsn', { group: -1, scale: [1, 1] }),
    controller('invalid', 'TransformClsn', { group: 9, scale: [7, 7] })
  ]);
  for (const name of ['Clsn1', 'Clsn2', 'Size', 'Dummy']) { assert.equal(plan.retained[name].transforms.length, 1); assert.equal(plan.retained[name].transforms[0].id, 't-all'); }
  assert.deepEqual(plan.retained.Clsn1.overrides.map(item => item.id), ['o-c1']); assert.deepEqual(plan.retained.Clsn2.overrides.map(item => item.id), ['o-c2']); assert.deepEqual(plan.retained.Size.overrides.map(item => item.id), ['o-size']); assert.deepEqual(plan.retained.Dummy.overrides.map(item => item.id), ['o-dummy']);
  assert.match(plan.warnings[0], /warning\/no-op/); assert.equal(plan.controllers.at(-1).effect, 'invalid-group-noop');
});

test('applies character scale before absolute overrides while preserving Size and exact empty Dummy authority', () => {
  const plan = ready([
    controller('c1-absolute', 'OverrideClsn', { group: 1, index: 0, rect: [10, 20, 30, 40] }),
    controller('dummy-create', 'OverrideClsn', { group: 4, index: 99, rect: [-3, -4, 5, 6] })
  ]);
  assert.deepEqual(plan.groups[0].postCharacterScaleBoxes.map(item => item.rect), [[2, 6, 6, 12], [10, 18, 14, 24]]);
  assert.deepEqual(final(plan, 'Clsn1')[0].rect, [10, 20, 30, 40], 'absolute override is not character-scaled');
  assert.deepEqual(plan.groups.find(item => item.name === 'Size').postCharacterScaleBoxes[0].rect, [-10, -20, 10, 0]);
  assert.equal(plan.groups.find(item => item.name === 'Dummy').rawBoxes.length, 0); assert.deepEqual(final(plan, 'Dummy')[0].rect, [-3, -4, 5, 6]);
});

test('fails closed when a retained controller targets unavailable Size or Dummy evidence', () => {
  for (const [name, number] of [['Size', 3], ['Dummy', 4]]) {
    const groups = baseGroups().map(item => item.name === name ? { name, available: false, provenance: '', evidenceHash: HASH, boxes: [], reason: `${name} unavailable` } : item);
    const plan = createAirRuntimeCollisionSequencePlan(input([controller(`target-${name}`, 'OverrideClsn', { group: number, index: 0, rect: [1, 2, 3, 4] })], { groups }));
    assert.equal(plan.status, 'unavailable'); assert(plan.conflicts.some(item => item.includes(name)));
  }
  const partialGroups = baseGroups().map(item => item.name === 'Dummy' ? { name: 'Dummy', available: false, provenance: '', evidenceHash: HASH, boxes: [], reason: 'Dummy unavailable' } : item);
  assert.equal(createAirRuntimeCollisionSequencePlan(input([], { groups: partialGroups })).status, 'partial', 'an untargeted unavailable group remains explicit rather than fabricated');
  const reset = createAirRuntimeCollisionSequencePlan(input([controller('old', 'OverrideClsn', { group: 4, index: 0, rect: [1, 2, 3, 4] }), controller('clear', 'OverrideClsn', { group: 0 })], { groups: partialGroups })); assert.equal(reset.status, 'partial', 'a reset removes the unavailable-group dependency with the discarded modifier list');
});

test('applies sequential replace, delete, all, out-of-range append/no-op, and immediate reindexing', () => {
  const plan = ready([
    controller('replace-zero', 'OverrideClsn', { group: 1, index: 0, rect: [10, 10, 20, 20] }),
    controller('delete-zero', 'OverrideClsn', { group: 1, index: 0, rect: [0, 0, 0, 0] }),
    controller('append-far', 'OverrideClsn', { group: 1, index: 99, rect: [30, 30, 40, 40] }),
    controller('delete-far', 'OverrideClsn', { group: 1, index: 99, rect: [0, 0, 0, 0] }),
    controller('replace-all', 'OverrideClsn', { group: 1, index: -1, rect: [-1, -2, 3, 4] })
  ]);
  const boxes = final(plan, 'Clsn1'); assert.equal(boxes.length, 2); assert.deepEqual(boxes.map(item => item.rect), [[-1, -2, 3, 4], [-1, -2, 3, 4]]); assert.equal(boxes[0].sourceIndex, 1); assert.equal(boxes[1].sourceIndex, null);
  assert(plan.lineage.removed.some(item => item.controllerId === 'delete-zero')); assert(plan.lineage.created.some(item => item.controllerId === 'append-far')); assert(plan.lineage.reindexed.some(item => item.controllerId === 'delete-zero' && item.from === 1 && item.to === 0));
});

test('compounds transform scale in list order, uses the last angle/pivot, and ignores out-of-range indexes', () => {
  const plan = ready([
    controller('first', 'TransformClsn', { group: 2, index: 0, scale: [2, 0.5], angle: 15, pivot: [1, 2] }),
    controller('missing', 'TransformClsn', { group: 2, index: 99, scale: [99, 99], angle: 99, pivot: [99, 99] }),
    controller('second', 'TransformClsn', { group: 2, index: 0, scale: [0.5, 3], angle: -30, pivot: [4, 5] })
  ]);
  const result = final(plan, 'Clsn2')[0]; assert.deepEqual(result.rect, [-4, -18, 4, 18]); assert.equal(result.storedAngle, -30); assert.deepEqual(result.storedPivot, [4, 5]); assert.deepEqual(result.transformHistory.map(item => item.controllerId), ['first', 'second']);
});

test('preserves engine family ordering under cross-family interleaving and keeps same-family order meaningful', () => {
  const o1 = controller('o1', 'OverrideClsn', { group: 1, index: 0, rect: [2, 2, 4, 4] }), o2 = controller('o2', 'OverrideClsn', { group: 1, index: 0, rect: [3, 3, 5, 5] }), t1 = controller('t1', 'TransformClsn', { group: 1, index: 0, scale: [2, 2], angle: 10 }), t2 = controller('t2', 'TransformClsn', { group: 1, index: 0, scale: [0.5, 1], angle: 20 });
  const interleaved = final(ready([o1, t1, o2, t2]), 'Clsn1'), grouped = final(ready([o1, o2, t1, t2]), 'Clsn1'), geometry = boxes => boxes.map(item => ({ rect: item.rect, storedAngle: item.storedAngle, storedPivot: item.storedPivot, overrideIds: item.overrideHistory.map(entry => entry.controllerId), transformIds: item.transformHistory.map(entry => entry.controllerId) })); assert.deepEqual(geometry(interleaved), geometry(grouped), 'cross-family source interleaving does not alter override-before-transform evaluation');
  assert.notDeepEqual(final(ready([o1, o2]), 'Clsn1'), final(ready([o2, o1]), 'Clsn1'), 'swapping same-family replacements changes the result');
  const resetTransformOnly = ready([o1, t1, controller('tr', 'TransformClsn', { group: 0 })]); assert.equal(resetTransformOnly.retained.Clsn1.overrides.length, 1); assert.equal(resetTransformOnly.retained.Clsn1.transforms.length, 0);
  const identity = final(ready([controller('identity', 'TransformClsn', { group: -1, index: -1, scale: [1, 1], angle: 0, pivot: [0, 0] })]), 'Clsn1'); assert.deepEqual(identity.map(item => item.rect), [[2, 6, 6, 12], [10, 18, 14, 24]]);
});

test('emits deterministic normalized rectangles and pinned unfaced RectRotate polygons around the character axis', () => {
  const groups = baseGroups(); groups[0] = group('Clsn1', [box(0, [5, 0, 0, -10])]);
  const first = ready([controller('rotate', 'TransformClsn', { group: 1, index: 0, angle: 90, pivot: [0, 0] })], { groups, collisionScale: { available: true, value: [1, 1], provenanceHash: HASH, reason: '' } }), second = ready([controller('rotate', 'TransformClsn', { group: 1, index: 0, angle: 90, pivot: [0, 0] })], { groups, collisionScale: { available: true, value: [1, 1], provenanceHash: HASH, reason: '' } });
  const result = final(first, 'Clsn1')[0]; assert.deepEqual(result.rect, [0, -10, 5, 0]); assert.equal(result.unfacedCollisionAngle, -90); assert.deepEqual(result.unfacedPolygon, [[-10, 0], [-10, -5], [0, -5], [0, 0]]); assert.match(result.geometryLabel, /unfaced/); assert.deepEqual(first.axis, [0, 0]); assert.equal(first.planHash, second.planHash);
});

test('is deeply frozen, deterministic, non-mutating, non-writing, and hash-sensitive', () => {
  const original = input([controller('t', 'TransformClsn', { group: 1, index: 0, angle: 5 })]), before = JSON.stringify(original), first = createAirRuntimeCollisionSequencePlan(original), second = createAirRuntimeCollisionSequencePlan(JSON.parse(JSON.stringify(original))), changed = createAirRuntimeCollisionSequencePlan(input([controller('t', 'TransformClsn', { group: 1, index: 0, angle: 6 })]));
  assert.equal(JSON.stringify(original), before); assert.equal(first.planHash, second.planHash); assert.notEqual(first.planHash, changed.planHash); assert(Object.isFrozen(first) && Object.isFrozen(first.groups[0].finalLocalBoxes[0])); assert.deepEqual(first.effects, EFFECTS); assert(!/(?:patch|destination|token|controllerText)/i.test(JSON.stringify(first)));
});

test('rejects hostile structure, coercion, unknown fields, numeric overflow, and bounded-work excess', () => {
  assert.throws(() => createAirRuntimeCollisionSequencePlan(new Proxy(input(), {})), /canonical plain data/);
  let getterRuns = 0; const accessor = input(); Object.defineProperty(accessor, 'extra', { enumerable: true, get() { getterRuns += 1; return 1; } }); assert.throws(() => createAirRuntimeCollisionSequencePlan(accessor), /canonical plain data/); assert.equal(getterRuns, 0);
  const cycle = input(); cycle.self = cycle; assert.throws(() => createAirRuntimeCollisionSequencePlan(cycle), /canonical plain data/);
  const sparse = input(); sparse.controllers = new Array(2); sparse.controllers[1] = controller('x', 'TransformClsn'); assert.throws(() => createAirRuntimeCollisionSequencePlan(sparse), /canonical plain data/);
  assert.throws(() => createAirRuntimeCollisionSequencePlan({ ...input(), extra: true }), /contain only/);
  assert.throws(() => createAirRuntimeCollisionSequencePlan(input([controller('x', 'TransformClsn', { angle: '5' })])), /primitive finite number/);
  assert.throws(() => createAirRuntimeCollisionSequencePlan(input([controller('x', 'TransformClsn', { angle: Infinity })])), /canonical plain data/);
  assert.throws(() => createAirRuntimeCollisionSequencePlan(input([controller('x', 'TransformClsn', { angle: 1e10 })])), /magnitude/);
  assert.throws(() => createAirRuntimeCollisionSequencePlan(input(Array.from({ length: MAX_CONTROLLERS + 1 }, (_, index) => controller(`c${index}`, 'TransformClsn')))), /at most 128/);
  const tooManyGroups = baseGroups(); tooManyGroups[0] = group('Clsn1', Array.from({ length: MAX_BOXES + 1 }, (_, index) => box(index, [0, 0, 1, 1]))); assert.throws(() => createAirRuntimeCollisionSequencePlan(input([], { groups: tooManyGroups })), /box limit/);
  const effectiveOverflow = baseGroups(); effectiveOverflow[0] = group('Clsn1', Array.from({ length: MAX_BOXES - 2 }, (_, index) => box(index, [0, 0, 1, 1]))); assert.throws(() => createAirRuntimeCollisionSequencePlan(input([controller('append', 'OverrideClsn', { group: 4, index: 0, rect: [1, 1, 2, 2] })], { groups: effectiveOverflow })), /effective boxes exceed/);
  const maximumGroups = baseGroups(); maximumGroups[0] = group('Clsn1', Array.from({ length: MAX_BOXES - 2 }, (_, index) => box(index, [0, 0, 1, 1]))); maximumGroups[1] = group('Clsn2', []); const many = Array.from({ length: MAX_CONTROLLERS }, (_, index) => controller(`o${index}`, 'OverrideClsn', { group: 1, index: -1, rect: [index + 1, 0, index + 2, 1] })); assert.throws(() => createAirRuntimeCollisionSequencePlan(input(many, { groups: maximumGroups })), /work exceeds/);
});

test('returns deterministic unavailable plans for commit and capability mismatch', () => {
  const commit = createAirRuntimeCollisionSequencePlan(input([], { sourceCommit: '0'.repeat(40) })); assert.equal(commit.status, 'unavailable'); assert.match(commit.reason, /pinned/);
  const stable = createAirRuntimeCollisionSequencePlan(input([], { capability: { ...capability(), target: 'stable', indexed: false, dummy: false } })); assert.equal(stable.status, 'unavailable'); assert.match(stable.reason, /Nightly/); assert.deepEqual(stable.effects, EFFECTS);
});
