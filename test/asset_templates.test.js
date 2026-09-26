'use strict';

const assert = require('assert');
const { blankSff, blankSnd } = require('../src/asset_templates');
const { parseSffBuffer } = require('../src/sff_reader');
const { parseSndBuffer } = require('../src/snd_reader');

const sff = parseSffBuffer(blankSff(), 'New.sff');
assert.strictEqual(sff.header.version.join('.'), '2.1.0.0');
assert.strictEqual(sff.sprites.length, 0);
assert.strictEqual(sff.palettes.length, 0);
assert.strictEqual(parseSffBuffer(blankSff('2.0'), 'Mugen.sff').header.version.join('.'), '2.0.0.0');
const snd = parseSndBuffer(blankSnd(), 'New.snd');
assert.deepStrictEqual(snd.version, [1, 0]);
assert.strictEqual(snd.entries.length, 0);
assert.deepStrictEqual(snd.issues, []);
console.log('Blank asset template tests passed');
