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

const before = view.screenPoint(480 + 10, 432 - 5, 25, -8, 2);
const pan = view.zoomPan(2, 4, 10, -5, before.x, before.y, 480, 432);
const after = view.screenPoint(480 + pan.x, 432 + pan.y, 25, -8, 4);
assert.deepStrictEqual(after, before, 'pointer-anchored zoom must retain the same world point under the pointer');

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
