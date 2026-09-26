'use strict';
const assert = require('assert');
const { stateNumberAt, actionSummary, previewModel } = require('../src/hitdef_preview_model');

const air = `[Begin Action 200]\nClsn1: 1\nClsn1[0] = 0, -20, 20, 0\n200,0,0,0,3\n200,1,0,0,2\n\n[Begin Action 5000]\n5000,0,0,0,4\n`;
assert.strictEqual(stateNumberAt('[StateDef 100]\n\nstateDef 200 {\n hitDef {}', 45), 200);
assert.deepStrictEqual(actionSummary(air).map((item) => [item.number, item.frames, item.ticks]), [[200, 2, 5], [5000, 1, 4]]);
const model = previewModel(air, { sprites: [] }, null, 200, 5000);
assert.strictEqual(model.state, 'ready');
assert.strictEqual(model.p1.number, 200);
assert.strictEqual(model.p2.number, 5000);
assert.deepStrictEqual(model.p1.frames[0].clsn1[0], [0, -20, 20, 0]);
console.log('HitDef visual preview model tests passed');
