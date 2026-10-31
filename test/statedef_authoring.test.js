'use strict';

const assert = require('assert');
const model = require('../src/statedef_authoring');

const catalog = [
  { name: 'ChangeState', description: 'Changes state.', params: [{ name: 'value', placeholder: 'state_no', required: true }, { name: 'ctrl', placeholder: 'value', required: false }] },
  { name: 'NightlyOnly', description: 'Nightly controller.', capabilityId: 'nightly.test', params: [] }
];

assert.deepStrictEqual(model.HEADER_PRESETS.map((item) => item.id), ['minimal', 'standing-idle', 'standing-attack', 'crouching', 'airborne', 'unchanged', 'custom']);
assert.deepStrictEqual(model.controllerChoices(catalog, {}, '').map((item) => item.name), ['ChangeState']);
assert.deepStrictEqual(model.controllerChoices(catalog, { enabledCapabilities: ['nightly.test'] }, 'night').map((item) => item.name), ['NightlyOnly']);

const zss = model.createStateDefPlan({
  language: 'zss', number: '200', name: 'Standing punch', stateType: 's', moveType: 'a', physics: 's', anim: '200', ctrl: '0',
  controllerName: 'changestate', optionalNames: ['ctrl'], values: { value: '0', ctrl: '1' }, condition: 'animTime = 0', experience: 'advanced'
}, { catalog });
assert(Object.isFrozen(zss));
assert.strictEqual(zss.summary, 'Create StateDef 200 with first ChangeState controller');
assert.strictEqual(zss.text, '# Standing punch\n[StateDef 200; type: S; movetype: A; physics: S; anim: 200; ctrl: 0;]\n\nif animTime = 0 {\n\tchangeState{\n\t\tvalue: 0;\n\t\tctrl: 1;\n\t}\n}\n');

const cns = model.createStateDefPlan({
  language: 'cns', number: 201, name: 'Return to idle', stateType: 'S', moveType: 'I', physics: 'S',
  controllerName: 'ChangeState', values: { value: '0' }, experience: 'advanced'
}, { catalog });
assert(cns.text.includes('[StateDef 201]\ntype = S\nmovetype = I\nphysics = S'));
assert(cns.text.includes('[State 201, ChangeState]\ntype = ChangeState\ntrigger1 = 1\nvalue = 0'));

const empty = model.createStateDefPlan({ language: 'zss', number: -2, name: 'Global hook' }, { catalog });
assert.strictEqual(empty.text, '# Global hook\n[StateDef -2]\n');
assert.strictEqual(empty.controller, null);

const sources = [
  { filename: 'a.zss', languageId: 'zss', text: '# [StateDef 300]\n[StateDef 200 + 100]\n[StateDef 300]\n' },
  { filename: 'b.cns', languageId: 'ikemen-cns', text: '; [StateDef 300]\n[StateDef 300]\ntype=S\n' }
];
assert.deepStrictEqual(model.existingStateDefs(sources, 300).map((item) => [item.filename, item.line]), [['a.zss', 2], ['b.cns', 1]]);
assert.throws(() => model.createStateDefPlan({ number: 300 }, { catalog, sources }), /already exists.*a\.zss:3.*b\.cns:2/);
assert.throws(() => model.createStateDefPlan({ number: '2.5' }, { catalog }), /whole-number literal/);
assert.throws(() => model.createStateDefPlan({ number: 1, stateType: 'X' }, { catalog }), /State type must be one of/);
assert.throws(() => model.createStateDefPlan({ number: 1, controllerName: 'NightlyOnly' }, { catalog }), /unavailable for the active engine target/);
assert.throws(() => model.createStateDefPlan({ number: 1, controllerName: 'ChangeState', values: {} }, { catalog }), /value needs a reviewed value/);
assert.throws(() => model.createStateDefPlan({ number: 1, controllerName: 'ChangeState', values: { value: '0' }, condition: 'time = 0 {' }, { catalog }), /cannot contain a block or section delimiter/);
assert.throws(() => model.createStateDefPlan({ number: 1, anim: '2\n[StateDef 3]' }, { catalog }), /cannot contain a block or section delimiter/);

console.log('Guided StateDef authoring model tests passed');
