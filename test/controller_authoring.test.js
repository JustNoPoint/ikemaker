'use strict';

const assert = require('assert');
const {
  normalizeValue,
  controllerParameters,
  controllerAuthoringPlan,
  controllerAuthoringText,
  cnsControllerAuthoringText
} = require('../src/controller_authoring');

const controller = {
  name: 'ChangeState',
  description: 'Changes the player state.',
  params: [
    { name: 'value', placeholder: 'state_no', required: true },
    { name: 'ctrl', placeholder: 'value', required: false },
    { name: 'anim', placeholder: 'anim_no', required: false }
  ]
};

assert.strictEqual(normalizeValue(' 200;\n'), '200');
assert.deepStrictEqual(controllerParameters(controller, ['CTRL']).map((item) => item.name), ['value', 'ctrl']);
const plan = controllerAuthoringPlan(controller, ['ctrl']);
assert.deepStrictEqual(plan.required.map((item) => item.name), ['value']);
assert.deepStrictEqual(plan.optional.map((item) => item.name), ['ctrl']);
const learning = controllerAuthoringText(plan, { value: '200', ctrl: 'true' }, 'learning');
assert.ok(learning.includes('# ChangeState — Changes the player state.'));
assert.ok(learning.includes('\tvalue: 200;'));
assert.ok(learning.includes('\tctrl: true;'));
const advanced = controllerAuthoringText(plan, { value: '200', ctrl: 'true' }, 'advanced');
assert.ok(advanced.startsWith('changeState{'));
assert.ok(!advanced.includes('# Required'));
const cnsLearning = cnsControllerAuthoringText(plan, { value: '200', ctrl: '1' }, 'learning');
assert.ok(cnsLearning.includes('; ChangeState — Changes the player state.'));
assert.ok(cnsLearning.includes('[State IKEMEN Tools, ChangeState]'));
assert.ok(cnsLearning.includes('type = ChangeState'));
assert.ok(cnsLearning.includes('value = 200'));
assert.ok(cnsLearning.includes('ctrl = 1'));
const cnsAdvanced = cnsControllerAuthoringText(plan, { value: '200', ctrl: '1' }, 'advanced');
assert.ok(cnsAdvanced.startsWith('[State IKEMEN Tools, ChangeState]'));
assert.ok(!cnsAdvanced.includes('; Required'));
assert.throws(() => controllerAuthoringText(plan, { value: '200' }), /ctrl needs a reviewed value/);
assert.throws(() => cnsControllerAuthoringText(plan, { value: '200' }), /ctrl needs a reviewed value/);
assert.throws(() => controllerAuthoringPlan(null), /Choose an IKEMEN state controller/);

console.log('Controller authoring tests passed');
