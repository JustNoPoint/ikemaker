'use strict';

const assert = require('assert');
const { systemName, spriteSystemName, transformationInfo, transformationItem } = require('../src/sff_names');

assert.equal(systemName(200).name, 'Standing Light Punch');
assert.equal(systemName(1000).family, 'Fireball');
assert(systemName(1000).aliases.includes('Hadouken'));
assert.equal(systemName(1200).family, 'AirborneAdvance');
assert.equal(systemName(1250).name, 'Special: AirborneAdvance · Air sequence 1');
assert.equal(systemName(3100).name, 'Hyper: DP · Ground sequence 1');
assert.equal(systemName(4000).name, 'Hyper: FloatAerialControl · Ground sequence 1');
assert.equal(systemName(11000).name, 'Layer 1: Special: Fireball · Ground sequence 1');
assert.equal(systemName(60000).family, 'Archive');
assert.equal(systemName(59000).name, 'Protected master palette template');
assert.deepStrictEqual(transformationInfo(20003), { form: 2, baseItem: 3, reserved: false });
assert.equal(transformationItem(3, 4), 40003);
assert.equal(spriteSystemName(10200, 10003).name, 'Form 1: Layer 1: Standing Light Punch');
assert.equal(spriteSystemName(10200, 10003).baseItem, 3);
assert.throws(() => transformationItem(10000, 1), /0-9999/);
console.log('SFF system-name tests passed.');
