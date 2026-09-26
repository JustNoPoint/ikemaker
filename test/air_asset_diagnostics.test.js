'use strict';
const assert = require('assert');
const { missingSpriteReferences, literalAnimationReferences, archivedActions, classifyMissingSpriteReferences } = require('../src/animation_standard_diagnostics');

const air = `[Begin Action 5000]\n5000,0,0,0,1\n5000,10,0,0,3\n\n[Begin Action 200]\n200,0,0,0,2\n`;
const archive = { sprites: [{ group: 5000, number: 0 }, { group: 200, number: 0 }] };
const missing = missingSpriteReferences(air, archive);
assert.deepStrictEqual(missing.map((item) => ({ action: item.action, element: item.element, key: item.key, time: item.time })), [
  { action: 5000, element: 2, key: '5000,10', time: 3 }
]);
assert.deepStrictEqual(missingSpriteReferences(`[Begin Action 5000]\n5000,10,0,0,3 ; IKEMAKER: ALLOW MISSING SFF\n`, archive), []);
assert.deepStrictEqual(missingSpriteReferences(`; IKEMAKER: ALLOW MISSING SFF\n[Begin Action 5000]\n5000,10,0,0,3\n`, archive), []);

const references = literalAnimationReferences([
  '[StateDef 200]\nanim = 200\n[State 200, Change]\ntype = ChangeAnim2\nvalue = 2912',
  'explod{ anim: 2605; }\nchangeAnim{value: 3500;}'
]);
assert.deepStrictEqual([...references].sort((a, b) => a - b), [200, 2605, 2912, 3500]);
assert.deepStrictEqual([...archivedActions('; IKEMAKER: ARCHIVED\n[Begin Action 7000]\n7000,0,0,0,1')], [7000]);
const classified = classifyMissingSpriteReferences([
  { action: 5000 }, { action: 2605 }, { action: 3500 }, { action: 7000 }
], {
  requiredAnimations: [{ action: 5000 }], runtimeAnimations: references, archivedAnimations: new Set([7000])
});
assert.deepStrictEqual(classified.required.map((item) => item.action), [5000]);
assert.deepStrictEqual(classified.runtime.map((item) => item.action), [2605, 3500]);
assert.deepStrictEqual(classified.legacy.map((item) => item.action), []);
assert.deepStrictEqual(classified.archived.map((item) => item.action), [7000]);
console.log('AIR/SFF missing-sprite diagnostic tests passed');
