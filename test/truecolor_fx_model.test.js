'use strict';

const assert = require('assert');
const { normalizeProfile, cloneLayer, composerZss, modifyLayerZss } = require('../src/truecolor_fx_model');

const base = normalizeProfile({ name: 'Hadouken Blue', baseId: 12000, anim: 1000, pos: [12, -24] });
assert.strictEqual(base.formatVersion, 2);
assert.strictEqual(base.layers.length, 1);
assert.strictEqual(base.layers[0].anim, 1000);
assert.deepStrictEqual(base.layers[0].palfx.mul, [256, 256, 256]);
assert.deepStrictEqual(base.selection, { category: 'fx-color', parentColorId: '', visibleByDefault: true, order: 0 });

const classified = normalizeProfile({ selection: { category: 'color-variant', parentColorId: 'color-01', visibleByDefault: false, order: 8 } });
assert.deepStrictEqual(classified.selection, { category: 'color-variant', parentColorId: 'color-01', visibleByDefault: false, order: 8 });

const layered = cloneLayer(base, 0);
layered.layers[1].name = 'White core';
layered.layers[1].trans = 'addalpha';
layered.layers[1].alpha = [192, 64];
layered.layers[1].palfx.add = [80, 80, 100];
layered.layers[1].palfx.hue = 32;
const text = composerZss(layered);
assert.match(text, /# Base FX[\s\S]*id: 12000;/);
assert.match(text, /# White core[\s\S]*id: 12001;/);
assert.match(text, /trans: addalpha;/);
assert.match(text, /alpha: 192, 64;/);
assert.match(text, /palfx\.add: 80, 80, 100;/);
assert.match(text, /palfx\.hue: 32;/);
assert.match(modifyLayerZss(layered, 1), /modifyExplod\{[\s\S]*id: 12001;/);

let maximum = layered;
maximum = cloneLayer(maximum, 1); maximum = cloneLayer(maximum, 2); maximum = cloneLayer(maximum, 3);
assert.strictEqual(maximum.layers.length, 5);
assert.throws(() => cloneLayer(maximum, 4), /one base plus four/);

console.log('true-color FX model tests passed');
