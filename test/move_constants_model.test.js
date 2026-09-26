'use strict';

const assert = require('assert');
const { parseConstants, moveGroups, fieldsFor, updateConstant, resolveMoveTargets, copyMoveFields, hitPauseTicks, airTimingProposal, actionTimeline, reactionSummary } = require('../src/move_constants_model');

const constants = `[Constants]\r\nnormal.slp.moveID = 200\r\nnormal.slp.firstActiveElement = 2\r\nnormal.slp.idleElement = 4\r\nnormal.slp.damage = 30 ; reviewed\r\nnormal.slp.groundHitTime = 10\r\nnormal.slp.guardHitTime = 7\r\nnormal.slp.counterHitBonusTime = 2\r\nnormal.slp.counterHitDamagePercent = 120\r\nnormal.slp.punishCounterBonusTime = 4\r\nnormal.slp.punishCounterDamagePercent = 150\r\nnormal.slp.punishCounterDriveDamage = 800\r\nnormal.slp.sparkX = 25\r\nnormal.slp.sparkY = -50\r\n`;
const air = `[Begin Action 200]\n200, 0, 0, 0, 2\nClsn1: 1\nClsn1[0] = 0, 0, 10, 10\n200, 1, 0, 0, 3\n200, 2, 0, 0, 2\n200, 3, 0, 0, 4\n`;
const parsed = parseConstants(constants), moves = moveGroups(parsed), move = moves[0];
assert.strictEqual(moves.length, 1);
assert.strictEqual(move.prefix, 'normal.slp');
assert(fieldsFor(move).find((field) => field.suffix === 'damage').present);
assert.deepStrictEqual(actionTimeline(air, move).frames.map((frame) => frame.phase), ['startup', 'active', 'authored-window', 'recovery']);
assert.deepStrictEqual(actionTimeline(air, move).frames.map((frame) => frame.activeWindow), [0, 1, 0, 0]);
assert.strictEqual(actionTimeline(air, move).totalTicks, 11);
assert.deepStrictEqual(reactionSummary(move, 'counter'), { mode: 'counter', damage: 36, hitstun: 12, guardStun: 7, driveDamage: 0, hardKnockdown: false, downTime: 0 });
assert.strictEqual(reactionSummary(move, 'punish').damage, 45);
assert.strictEqual(reactionSummary(move, 'punish').driveDamage, 800);
const changed = updateConstant(constants, 'normal.slp.damage', 35);
assert.match(changed, /normal\.slp\.damage = 35 ; reviewed\r\n/);
assert.throws(() => updateConstant(constants, 'normal.slp.notReal', 1), /does not silently invent/);
const copySource = `${constants}normal.smp.moveID = 210\r\nnormal.smp.damage = 55\r\nnormal.smp.guardHitTime = 12\r\nnormal.shp.moveID = 220\r\nnormal.shp.damage = 80\r\n`;
const copyMoves = moveGroups(parseConstants(copySource));
assert.deepStrictEqual(resolveMoveTargets(copyMoves, '210, normal.shp', 'normal.slp').selected.map((item) => item.id), ['normal.smp', 'normal.shp']);
assert.deepStrictEqual(resolveMoveTargets(copyMoves, '210, 250', 'normal.slp').unresolved, ['250']);
const copied = copyMoveFields(copySource, 'normal.slp', ['normal.smp', 'normal.shp'], ['damage', 'guardHitTime'], { damage: 42 });
assert.strictEqual(copied.updated, 3);
assert.strictEqual(copied.inserted, 1);
assert.match(copied.text, /normal\.smp\.damage = 42/);
assert.match(copied.text, /normal\.smp\.guardHitTime = 7/);
assert.match(copied.text, /normal\.shp\.damage = 42/);
assert.match(copied.text, /normal\.shp\.guardHitTime = 7/);
const timingFrames = [
  { element: 1, time: 2, clsnActive: false },
  { element: 2, time: 1, clsnActive: true },
  { element: 3, time: 2, clsnActive: true },
  { element: 4, time: 4, clsnActive: false }
];
assert.strictEqual(hitPauseTicks(timingFrames, 2, 4), 3);
assert.deepStrictEqual(airTimingProposal({ frames: timingFrames }, { hitPauseAnimateStartElement: 2, hitPauseFreezeElement: 4 }), {
  state: 'ready', values: { firstActiveElement: 2, idleElement: 4, hitPauseAnimateTicks: 3 }
});
assert.strictEqual(airTimingProposal({ frames: timingFrames.map((frame) => ({ ...frame, clsnActive: false })) }).state, 'missing-active-collision');
const multiHitAir = `[Begin Action 200]\nClsn1: 1\nClsn1[0] = 0, 0, 10, 10\n200, 0, 0, 0, 2\n200, 1, 0, 0, 2\nClsn1: 1\nClsn1[0] = 0, 0, 12, 12\n200, 2, 0, 0, 2\n`;
assert.deepStrictEqual(actionTimeline(multiHitAir, move).frames.map((frame) => frame.activeWindow), [1, 0, 2]);
console.log('move constants model tests passed');
