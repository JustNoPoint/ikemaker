'use strict';

const assert = require('assert');
const model = require('../src/throw_creator_model');

const air = `[Begin Action 800]\n800, 0, 0, 0, 3\n800, 1, 0, 0, 4\n800, 2, 0, 0, 5\n\n[Begin Action 801]\n801, 0, 0, 0, 2\n801, 1, 0, 0, 2\n`;
const tracks = model.actionTracks(air), p1 = tracks[0], p2 = tracks[1];
assert.strictEqual(p1.totalTicks, 12);
assert.deepStrictEqual(p1.frames.map(frame => [frame.start, frame.end]), [[0, 3], [3, 7], [7, 12]]);
const ticks = model.timingProposal(p1, p2, 'match-p1-ticks', { startTick: 0, endTick: 12, holdLastP2: true });
assert.deepStrictEqual(ticks.durations, [6, 6]);
const boundaries = model.timingProposal(p1, p2, 'match-p1-boundaries', { startTick: 0, endTick: 12 });
assert.strictEqual(boundaries.durations.reduce((sum, value) => sum + value, 0), 12);
const rewritten = model.replaceActionDurations(air, 801, [6, 6]);
assert.match(rewritten, /801, 0, 0, 0, 6/);
assert.match(rewritten, /801, 1, 0, 0, 6/);

const plan = model.newPlan('Ryu Forward Throw', 'command');
plan.p1Action = 800; plan.p2Action = 801; plan.endTick = 12;
const checked = model.validatePlan(plan, tracks);
assert.strictEqual(checked.valid, true);
const code = model.generateZss(plan, tracks);
assert.match(code, /\[StateDef 800;/);
assert.match(code, /movetype: A;/);
assert.match(code, /\[StateDef 801;/);
assert.match(code, /changeAnim2\{value: 801\}/);
assert.match(code, /targetBind/);
assert.match(code, /targetLifeAdd/);

const unsafe = model.newPlan('Unsafe'); unsafe.p1Action = 800; unsafe.p2Action = 999; unsafe.events = unsafe.events.filter(event => !['bind-release', 'cleanup'].includes(event.type));
const failed = model.validatePlan(unsafe, tracks);
assert.strictEqual(failed.valid, false);
assert(failed.issues.some(issue => issue.code === 'missing-p2-action'));
assert(failed.issues.some(issue => issue.code === 'missing-release'));
assert(failed.issues.some(issue => issue.code === 'missing-cleanup'));

console.log('Throw Creator model tests passed');
