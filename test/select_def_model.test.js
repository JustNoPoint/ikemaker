'use strict';

const assert = require('assert');
const { splitComma, parseSelectDef, insertionLine, orderGroups } = require('../src/select_def_model');

const source = `; roster\n[Characters]\nRyu/Ryu.def, stages/grid.def, order=1, hidden=0\nslot = {\nKen/Ken.def, order=2, unlock=stats.wins > 2\n}\n\n[ExtraStages]\nstages/grid.def, order=1, includestage=1\n\n[Options]\narcade.maxmatches = 6,1,1,0\n\n[StoryMode]\nname = Ryu Story\npath = data/story/ryu.def\n\n[Community]\ncustom = retained\n`;
assert.deepStrictEqual(splitComma('a, slot={x,y}, name="a,b"'), ['a', 'slot={x,y}', 'name="a,b"']);
const model = parseSelectDef(source);
assert.strictEqual(model.characters.length, 2); assert.strictEqual(model.characters[1].inSlot, true);
assert.strictEqual(model.stages.length, 1); assert.strictEqual(model.options.length, 1); assert.strictEqual(model.story.length, 2);
assert.strictEqual(model.options[0].name, 'arcade.maxmatches'); assert.strictEqual(model.story[0].name, 'Ryu Story');
assert.strictEqual(model.unknownSections[0].name, 'community'); assert.strictEqual(model.other[0].code, 'custom = retained');
assert.deepStrictEqual(model.characters[0].stages, ['stages/grid.def']); assert.strictEqual(model.characters[0].order, '1'); assert.strictEqual(model.characters[0].hidden, '0');
assert.ok(insertionLine(model, 'characters') > model.characters[1].line); assert.deepStrictEqual(orderGroups(model).map((x) => x.order), ['1', '2']);
console.log('select.def model tests passed');
