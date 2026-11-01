'use strict';

const assert = require('assert');
const { detectFilenameIdentity, planSpriteIntake, proposedAxis } = require('../src/sff_creator_model');

const rules = [{ id: 'group-index', pattern: 'g(\\d+)[_-]i(\\d+)', confidence: 'exact-project-rule' }];
assert.deepStrictEqual(detectFilenameIdentity('Ryu_g9000_i12.png', rules), { matched: true, ruleId: 'group-index', confidence: 'exact-project-rule', group: 9000, number: 12, identity: '9000,12' });
assert.strictEqual(detectFilenameIdentity('idle.png', rules).matched, false);
assert.deepStrictEqual(proposedAxis(95, 149, 'bottom-center', -1, 0), { axisX: 46, axisY: 149 });

const sources = [
  { id: 'a', name: 'g1_i5.png', width: 20, height: 30 },
  { id: 'b', name: 'g1_i8.png', width: 40, height: 50 },
  { id: 'c', name: 'g1_i9.png', width: 60, height: 70 }
];

const gapAware = planSpriteIntake(sources, {
  group: 1, startIndex: 5, numberingMode: 'next-free', collisionPolicy: 'next-free', anchor: 'bottom-center',
  reservedRanges: [{ group: 1, start: 6, end: 7, label: 'project templates' }]
}, ['1,5']);
assert.deepStrictEqual(gapAware.ready.map((row) => row.identity), ['1,8', '1,9', '1,10']);
assert.deepStrictEqual(gapAware.ready[0].axisX, 10);
assert.deepStrictEqual(gapAware.summary, { sources: 3, ready: 3, blocked: 0, skipped: 0 });

const detected = planSpriteIntake(sources.slice(0, 2), {
  numberingMode: 'detected', filenameRules: rules, collisionPolicy: 'stop', anchor: 'center',
  overrides: { b: { group: 2, number: 20, axisX: 94, axisY: 148 } }
}, []);
assert.deepStrictEqual(detected.ready.map((row) => row.identity), ['1,5', '2,20']);
assert.deepStrictEqual([detected.ready[1].axisX, detected.ready[1].axisY], [94, 148]);

const stopped = planSpriteIntake(sources.slice(0, 1), { group: 1, startIndex: 5, numberingMode: 'consecutive', collisionPolicy: 'stop' }, ['1,5']);
assert.strictEqual(stopped.summary.blocked, 1);
assert.strictEqual(stopped.ready.length, 0);

const skipped = planSpriteIntake(sources.slice(0, 2), { group: 1, startIndex: 5, numberingMode: 'consecutive', collisionPolicy: 'skip' }, ['1,5']);
assert.deepStrictEqual(skipped.ready.map((row) => row.identity), ['1,6']);
assert.strictEqual(skipped.skipped.length, 1);
assert.strictEqual(skipped.skipped[0].status, 'skipped');
assert.strictEqual(skipped.skipped[0].source.name, 'g1_i5.png');
assert.match(skipped.skipped[0].reason, /will not enter the build/);

const reserved = planSpriteIntake(sources.slice(0, 1), { group: 1, startIndex: 6, numberingMode: 'consecutive', collisionPolicy: 'stop', reservedRanges: [{ group: 1, start: 6, end: 7, label: 'protected' }] }, []);
assert.match(reserved.conflicts[0].reason, /protected/);

const replaced = planSpriteIntake([sources[0], { ...sources[1], id: 'b' }], {
  group: 1, startIndex: 5, numberingMode: 'consecutive', collisionPolicy: 'replace-staged', overrides: { b: { number: 5 } }
}, []);
assert.strictEqual(replaced.ready.length, 1);
assert.strictEqual(replaced.ready[0].sourceId, 'b');

const cropSource = { id: 'crop', name: 'crop.png', width: 10, height: 12, cropBounds: { empty: false, x: 2, y: 3, width: 4, height: 5, visiblePixels: 12 } };
const beforeAxis = planSpriteIntake([cropSource], { group: 2, startIndex: 0, cropMode: 'before-axis', anchor: 'bottom-center' }, []);
assert.deepStrictEqual([beforeAxis.ready[0].axisX, beforeAxis.ready[0].axisY], [2, 5], 'before-axis crop calculates the anchor against reviewed cropped dimensions');
assert.deepStrictEqual(beforeAxis.ready[0].axisBasis, { width: 4, height: 5, stage: 'after-reviewed-source-crop' });
const afterAxis = planSpriteIntake([cropSource], { group: 2, startIndex: 0, cropMode: 'after-axis', anchor: 'bottom-center' }, []);
assert.deepStrictEqual([afterAxis.ready[0].axisX, afterAxis.ready[0].axisY], [5, 12], 'after-axis crop calculates the anchor against the original canvas');
const mixedCrop = planSpriteIntake([cropSource, { ...cropSource, id: 'plain' }], { group: 2, startIndex: 0, cropMode: 'none', anchor: 'bottom-center', overrides: { crop: { cropMode: 'before-axis' }, plain: { cropMode: 'after-axis' } } }, []);
assert.deepStrictEqual(mixedCrop.ready.map(row => [row.cropMode, row.axisX, row.axisY]), [['before-axis', 2, 5], ['after-axis', 5, 12]], 'each source can override the batch crop order without changing other rows');
assert.throws(() => planSpriteIntake([{ ...cropSource, cropBounds: null }], { cropMode: 'before-axis' }, []), /reviewed indexed transparency bounds/);
assert.throws(() => planSpriteIntake(sources.slice(0, 1), { group: -1 }, []), /0 through 65535/);
assert.throws(() => planSpriteIntake(sources.slice(0, 1), { group: 1, startIndex: 65535, numberingMode: 'next-free' }, ['1,65535']), /No free sprite index remains/);
assert.throws(() => planSpriteIntake(sources.slice(0, 2), { group: 1, startIndex: 65535, numberingMode: 'consecutive' }, []), /0 through 65535/);
assert.throws(() => planSpriteIntake([{ ...sources[0], width: 65536 }], { group: 1 }, []), /1 through 65535/);
assert.throws(() => planSpriteIntake(sources.slice(0, 1), { group: 1, overrides: { a: { axisX: 32768, axisY: 0 } } }, []), /-32768 through 32767/);
assert.match(detectFilenameIdentity('g70000_i1.png', rules).error, /0-65535/);
assert.throws(() => planSpriteIntake(sources.slice(0, 1), { duplicatePolicy: 'ask-each' }, []), /unsupported identical-sprite policy/);
assert.strictEqual(planSpriteIntake(sources.slice(0, 1), { overrides: { a: { paletteId: '12,34' } } }, []).ready[0].paletteId, '12,34', 'per-source stored palette identity survives ordinary intake planning');
assert.throws(() => planSpriteIntake(sources.slice(0, 1), { overrides: { a: { paletteId: '12' } } }, []), /palette must use group,index/);
assert.throws(() => planSpriteIntake(sources.slice(0, 1), { overrides: { a: { paletteId: '12,65536' } } }, []), /0 through 65535/);
assert.throws(() => planSpriteIntake(sources.slice(0, 1), {}, ['bad identity']), /must use group,index/);
assert.throws(() => planSpriteIntake(sources.slice(0, 1), {}, ['1,65536']), /0 through 65535/);
assert.throws(() => planSpriteIntake(sources.slice(0, 1), { reservedRanges: [{ group: 1, start: 9, end: 3 }] }, []), /ordered start-to-end/);
assert.throws(() => planSpriteIntake(sources.slice(0, 1), { reservedRanges: [{ group: NaN, start: 1, end: 3 }] }, []), /Reserved range 1 group/);

assert.throws(() => planSpriteIntake(sources, { numberingMode: 'unknown' }), /numbering mode/);
assert.throws(() => detectFilenameIdentity('x.png', [{ id: 'bad', pattern: '(' }]), /invalid/);

console.log('SFF Creator filename, numbering, collision, reserved-range, axis, and override planning tests passed');
