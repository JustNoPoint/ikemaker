'use strict';

const assert = require('assert');
const view = require('../src/move_constants_view_transform');
const profile = require('../src/move_constants_shared_profile');

const world = { x: 40, y: -12 };
assert.deepStrictEqual(view.screenPoint(480, 432, world.x, world.y, 2), { x: 560, y: 408 });
assert.deepStrictEqual(view.worldPoint(480, 432, 560, 408, 2), world);
assert.deepStrictEqual(view.screenPoint(480, 432, world.x, world.y, 4), { x: 640, y: 384 });
assert.deepStrictEqual(view.migrateOpponent({ opponentX: 560, opponentY: 408 }, 2, 960, 540), world);
assert.deepStrictEqual(view.migrateOpponent({ opponentWorldX: -30, opponentWorldY: 5 }, 8, 100, 100), { x: -30, y: 5 });
const clientView = new Function(`${view.clientScript()}return moveView;`)();
assert.deepStrictEqual(clientView.screenPoint(480, 432, 40, -12, 2), { x: 560, y: 408 });

const defaultAxes = view.previewAxes(1000, 500);
assert.deepStrictEqual(defaultAxes, { origin: { x: 500, y: 390 }, p1: { x: 420, y: 390 }, p2: { x: 580, y: 390 } }, 'world defaults must reproduce the old 200% visual placement once');
for (const zoom of [2, 1, .25, 2]) {
  const axes = view.previewAxes(1000, 500, { zoom, panX: 17, panY: -9, p1WorldX: -40, p1WorldY: 3, p2WorldX: 40, p2WorldY: -5 });
  assert.strictEqual((axes.p2.x - axes.p1.x) / zoom, 80, 'fighter world separation must survive zoom');
  assert.strictEqual((axes.p2.y - axes.p1.y) / zoom, -8, 'vertical world separation must survive zoom');
  assert.deepStrictEqual(view.worldPoint(axes.origin.x, axes.origin.y, axes.p2.x, axes.p2.y, zoom), { x: 40, y: -5 });
  const offset = { x: axes.p2.x + 7 * zoom, y: axes.p2.y - 3 * zoom };
  assert.deepStrictEqual(view.worldPoint(axes.origin.x, axes.origin.y, offset.x, offset.y, zoom), { x: 47, y: -8 }, 'AIR offsets must use the same scale as participant axes');
}
const resizedAxes = view.previewAxes(640, 360, { zoom: .25, panX: 17, panY: -9, p1WorldX: -40, p2WorldX: 40 });
assert.strictEqual((resizedAxes.p2.x - resizedAxes.p1.x) / .25, 80, 'resize may move the viewport origin but not world separation');
assert.deepStrictEqual(clientView.previewAxes(1000, 500), defaultAxes, 'the generated client helper must match the host helper');

const before = view.screenPoint(480 + 10, 432 - 5, 25, -8, 2);
const pan = view.zoomPan(2, 4, 10, -5, before.x, before.y, 480, 432);
const after = view.screenPoint(480 + pan.x, 432 + pan.y, 25, -8, 4);
assert.deepStrictEqual(after, before, 'pointer-anchored zoom must retain the same world point under the pointer');
let repeatedZoom = 2, repeatedPan = { x: 10, y: -5 };
const repeatedWorld = { x: 25, y: -8 }, pivot = { x: 480, y: 432 };
const fixedPointer = view.screenPoint(pivot.x + repeatedPan.x, pivot.y + repeatedPan.y, repeatedWorld.x, repeatedWorld.y, repeatedZoom);
for (const nextZoom of [1, .25, 2, 8, 2]) {
  repeatedPan = view.zoomPan(repeatedZoom, nextZoom, repeatedPan.x, repeatedPan.y, fixedPointer.x, fixedPointer.y, pivot.x, pivot.y);
  repeatedZoom = nextZoom;
  assert.deepStrictEqual(view.screenPoint(pivot.x + repeatedPan.x, pivot.y + repeatedPan.y, repeatedWorld.x, repeatedWorld.y, repeatedZoom), fixedPointer);
}

assert.deepStrictEqual(profile.parseDraft('-4.8165625'), { text: '-4.8165625', value: -4.8165625 });
assert.deepStrictEqual(profile.parseDraft('.5'), { text: '.5', value: .5 });
assert.strictEqual(profile.parseDraft('-'), null);
assert.strictEqual(profile.parseDraft('1e3'), null);
assert.deepStrictEqual(profile.assignmentEdit('  map(JNP_SF6_cfg_normal_light_ground_velocity_x) := -4.8; # shared', 'JNP_SF6_cfg_normal_light_ground_velocity_x', -4.8, '-5.125'), { start: 53, end: 57, text: '-5.125', value: -5.125 });
assert.deepStrictEqual(profile.parseAssignmentLine('  map(wanted) := .5; // shared'), { name: 'wanted', value: .5, text: '.5', start: 17, end: 19 });
assert.strictEqual(profile.assignmentEdit('map(other) := -4.8;', 'wanted', -4.8, '2'), null);
assert.strictEqual(profile.assignmentEdit('map(wanted) := -4.8;', 'wanted', -4.7, '2'), null);
assert.strictEqual(profile.assignmentEdit('map(wanted) := 2 * 3;', 'wanted', 2, '7'), null);
assert.strictEqual(profile.assignmentEdit('# map(wanted) := 2;', 'wanted', 2, '7'), null);
assert.strictEqual(profile.assignmentEdit('// map(wanted) := 2;', 'wanted', 2, '7'), null);
assert.strictEqual(profile.parseAssignmentLine('text: "map(wanted) := 2";'), null);

const item = { value: -4.8, sourceHash: 'hash-a' };
const firstDraft = profile.createDraft('-5.125', item);
assert.deepStrictEqual(firstDraft, { value: '-5.125', base: -4.8, sourceHash: 'hash-a', revision: 1 });
const newerDraft = profile.createDraft('-6.25', item, firstDraft);
assert.deepStrictEqual(profile.acknowledgeDraft(newerDraft, { value: '-5.125', draftBase: -4.8, draftSourceHash: 'hash-a', draftRevision: 1 }), newerDraft, 'an older Apply must not erase newer typing');
assert.strictEqual(profile.acknowledgeDraft(firstDraft, { value: '-5.125', draftBase: -4.8, draftSourceHash: 'hash-a', draftRevision: 1 }), null, 'an exact acknowledgment clears only its own draft');
assert.strictEqual(profile.draftConflict(firstDraft, { value: -4.7, sourceHash: 'hash-b' }), true, 'refresh must expose a stale shared draft');
assert.deepStrictEqual(profile.rebaseDraft(firstDraft, { value: -4.7, sourceHash: 'hash-b' }), { value: '-5.125', base: -4.7, sourceHash: 'hash-b', revision: 2 });
const clientProfile = new Function(`${profile.clientScript()}return sharedProfile;`)();
assert.deepStrictEqual(clientProfile.acknowledgeDraft(newerDraft, { value: '-5.125', draftBase: -4.8, draftSourceHash: 'hash-a', draftRevision: 1 }), newerDraft);

console.log('move constants transform and shared profile tests passed');
