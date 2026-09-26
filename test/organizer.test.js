'use strict';

const assert = require('assert');
const organizer = require('../src/organizer');

assert.strictEqual(organizer.animationCategory(0), 'Required and Movement');
assert.strictEqual(organizer.animationCategory(200), 'Standing Normals');
assert.strictEqual(organizer.animationCategory(3100), 'Hypers');
assert.strictEqual(organizer.animationCategory(4200), 'Hypers');
assert.strictEqual(organizer.animationCategory(10200), 'Cosmetic Layers and Parts');
assert.strictEqual(organizer.soundCategory({ group: 13000, name: 'Shin Shoryu' }), 'Voice · Hypers');
assert.strictEqual(organizer.paletteCategory({ group: 1, number: 0, role: '' }), 'Master and Full Color Separation');
assert.deepStrictEqual(organizer.sorted([{ group: 10, number: 0 }, { group: 2, number: 0 }], 'number').map((x) => x.group), [2, 10]);
assert.deepStrictEqual(organizer.validateIdentityMapping([{ group: 1, number: 0 }, { group: 2, number: 0 }], [{ fromGroup: 1, fromNumber: 0, toGroup: 2, toNumber: 0 }]).errors, ['Destination 2,0 is already occupied.']);
console.log('Shared organizer tests passed');
