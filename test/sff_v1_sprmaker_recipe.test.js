'use strict';

const assert = require('assert');
const { makeFixture } = require('./helpers/sff_v1_sprmaker_fixture');
const { hashCanonical } = require('../src/sff_capability_report');
const { createSprMakerRecipe, assertSprMakerRecipe, parseGeneratedSprMakerRecipe } = require('../src/sff_v1_sprmaker_recipe');

const own = makeFixture(), recipe = createSprMakerRecipe(own.specification), repeat = createSprMakerRecipe(own.specification);
assert.deepStrictEqual(recipe.readBytes(), repeat.readBytes()); assertSprMakerRecipe(recipe);
assert.strictEqual(recipe.readBytes().toString('ascii'), 'OUTPUT.SFF\r\nS000000.PCX\r\n10\r\n0\r\n5\r\n-3\r\nS000001.PCX\r\n10\r\n1\r\n-7\r\n9\r\n');
assert.deepStrictEqual(parseGeneratedSprMakerRecipe(recipe.readBytes()).rows.map(row => row.paletteDecision), ['own', 'own']); assert.deepStrictEqual(recipe.arguments, []); assert.strictEqual(recipe.executable, false);
const previous = createSprMakerRecipe(makeFixture({ previous: true }).specification); assert(previous.readBytes().toString('ascii').includes('#\r\n1\r\n2\r\nS000001.PCX')); assert.deepStrictEqual(previous.unprovenFeatures, ['palette.previous']);
assert.throws(() => parseGeneratedSprMakerRecipe(Buffer.from('OUTPUT.SFF\nS000000.PCX\n0\n0\n0\n0\n')), /CRLF/);
assert.throws(() => parseGeneratedSprMakerRecipe(Buffer.from('..\\EVIL.SFF\r\n')), /output alias/);
assert.throws(() => parseGeneratedSprMakerRecipe(Buffer.from('OUTPUT.SFF\r\nCON.PCX\r\n0\r\n0\r\n0\r\n0\r\n')), /aliases/);
const forgedBase = { ...recipe, rows: recipe.rows.map((row, index) => index ? row : { ...row, axisX: row.axisX + 1 }) }; delete forgedBase.recipeHash; delete forgedBase.readBytes;
const forged = { ...forgedBase, recipeHash: hashCanonical(forgedBase), readBytes: () => recipe.readBytes() };
assert.throws(() => assertSprMakerRecipe(forged), /bytes and metadata disagree/);
console.log('SprMaker v1 recipe serialization is deterministic, inert, ASCII/CRLF-bound, DOS-safe, and independently round-tripped');
