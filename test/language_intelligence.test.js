'use strict';

const assert = require('assert');
const obsoleteBaseline = new RegExp(['night' + 'ly', 'release ' + 'candidate', '\\bR' + 'C\\d*\\b'].join('|'), 'i');
const triggers = require('../data/triggers.json');
const {
  zssControllerContext,
  cnsControllerContext,
  assignedParameters,
  completionModels,
  hoverModel,
  controllerMap
} = require('../src/language_intelligence');

const controllers = [{
  name: 'HitDef',
  description: 'Defines an attack.',
  url: 'https://example.invalid/hitdef',
  params: [
    { name: 'attr', placeholder: 'state, attack', required: true },
    { name: 'ground.velocity', placeholder: 'x, y', required: false }
  ]
}];

const index = controllerMap(controllers);
const zss = 'hitDef{\n\tattr: S, NA;\n\tground.velocity: -4, 0;\n}';
const cns = '[State 200, Hit]\ntype = HitDef\nattr = S, NA\nground.velocity = -4, 0';

assert.strictEqual(zssControllerContext(zss, 2, index).controller.name, 'HitDef');
assert.strictEqual(cnsControllerContext(cns, 3, index).controller.name, 'HitDef');
assert.deepStrictEqual([...assignedParameters(zss, zssControllerContext(zss, 2, index), 'zss')], ['attr', 'ground.velocity']);

const parameterItems = completionModels({
  text: 'hitDef{\n\tattr: S, NA;\n\t', line: 2, linePrefix: '\t',
  languageId: 'zss', controllers, triggers
});
assert.deepStrictEqual(parameterItems.map((item) => item.label), ['ground.velocity']);
assert.ok(parameterItems[0].insertText.includes('${1:x, y}'));

const controllerItems = completionModels({ text: 'hit', line: 0, linePrefix: 'hit', languageId: 'zss', controllers, triggers: [] });
assert.strictEqual(controllerItems[0].label, 'hitDef');
assert.ok(controllerItems[0].insertText.includes('attr: ${1:state, attack};'));
assert.ok(controllerItems[0].insertText.includes('Add optional options'));
const advancedControllerItems = completionModels({ text: 'hit', line: 0, linePrefix: 'hit', languageId: 'zss', experience: 'advanced', controllers, triggers: [] });
assert.ok(!advancedControllerItems[0].insertText.includes('Add optional options'));

const cnsItems = completionModels({ text: '[State 200]\ntype = Hit', line: 1, linePrefix: 'type = Hit', languageId: 'ikemen-cns', controllers, triggers: [] });
assert.strictEqual(cnsItems[0].insertText, 'HitDef');

const triggerItems = completionModels({ text: 'if move', line: 0, linePrefix: 'if move', languageId: 'zss', controllers: [], triggers });
assert.ok(triggerItems.some((item) => item.label === 'MoveCountered'));
assert.ok(triggerItems.some((item) => item.label === 'HelperIndex'));

const learningHover = hoverModel({ word: 'ground.velocity', text: zss, line: 2, languageId: 'zss', experience: 'learning', controllers, triggers });
assert.strictEqual(learningHover.title, 'HitDef.ground.velocity');
assert.ok(learningHover.explanation.includes('belongs to HitDef'));
const advancedHover = hoverModel({ word: 'MoveCountered', text: '', line: 0, experience: 'advanced', controllers, triggers });
assert.strictEqual(advancedHover.explanation, '');
assert.ok(advancedHover.summary.includes('attack contact'));

assert.ok(triggers.length >= 150);
assert.ok(triggers.every((entry) => entry.name && entry.description && entry.url));
assert.ok(!obsoleteBaseline.test(JSON.stringify(triggers)));

console.log('Language intelligence tests passed');
