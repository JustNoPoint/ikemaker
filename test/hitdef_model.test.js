'use strict';
const assert = require('assert');
const catalog = require('../data/sctrl.json').find((item) => item.name === 'HitDef');
const { STARTER, parseHitDefs, chooseHitDef, groupedParameters, updateHitDef, newHitDef } = require('../src/hitdef_model');

const zss = `if time = 3 {\n  hitDef {\n    attr: S, NA;\n    damage: 20, 0;\n    # preserve this note\n    custom.option: yes;\n  }\n}\n`;
const zssBlocks = parseHitDefs(zss, 'zss');
assert.strictEqual(zssBlocks.length, 1);
assert.strictEqual(chooseHitDef(zssBlocks, zss.indexOf('damage')).values.damage, '20, 0');
const zssUpdated = updateHitDef(zss, zssBlocks[0], [
  { name: 'damage', enabled: true, value: '35, 5' },
  { name: 'pausetime', enabled: true, value: '9, 10' },
  { name: 'attr', enabled: false, value: '' }
]);
assert.match(zssUpdated, /damage: 35, 5;/);
assert.match(zssUpdated, /pausetime: 9, 10;/);
assert.ok(!/attr:/.test(zssUpdated));
assert.match(zssUpdated, /# preserve this note/);
assert.match(zssUpdated, /custom\.option: yes/);

const cns = `[Statedef 200]\n[State 200, Hit]\ntype = HitDef\ntrigger1 = AnimElem = 2\nattr = S, NA\ndamage = 30, 0\n\n[State 200, End]\ntype = ChangeState\n`;
const cnsBlocks = parseHitDefs(cns, 'cns');
assert.strictEqual(cnsBlocks.length, 1);
const cnsUpdated = updateHitDef(cns, cnsBlocks[0], [{ name: 'damage', enabled: true, value: '40, 0' }, { name: 'fall', enabled: true, value: '1' }]);
assert.match(cnsUpdated, /trigger1 = AnimElem = 2/);
assert.match(cnsUpdated, /damage = 40, 0/);
assert.match(cnsUpdated, /fall = 1/);

const groups = groupedParameters(catalog);
assert.strictEqual(groups[0].id, 'common');
assert.strictEqual(groups[0].open, true);
assert.ok(groups[0].parameters.some((item) => item.name === 'damage'));
assert.ok(groups.slice(1).some((group) => group.parameters.some((item) => item.name === 'attack.depth')));
assert.match(newHitDef('zss', '', STARTER), /hitDef \{/);
assert.match(newHitDef('cns', '200', { attr: 'S, NA' }), /\[State 200, HitDef\]/);
console.log('HitDef model tests passed');
