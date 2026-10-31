'use strict';

const assert = require('assert');
const {
  SFF_BUILD_SPECIFICATION_VERSION,
  createSffBuildSpecification,
  specificationHash
} = require('../src/sff_build_specification');

function sprite(entryId, group, number, relativePath) {
  return {
    entryId,
    group,
    number,
    axisX: -4,
    axisY: 12,
    colorDepth: 8,
    format: 'png8',
    compression: 'png8',
    duplicatePolicy: 'keep-independent',
    source: {
      relativePath,
      byteHash: 'AA',
      decodedHash: 'BB',
      width: 16,
      height: 24,
      provenance: { kind: 'test-fixture', manifest: 'fixture.csv', physicalOrder: group }
    }
  };
}

const input = {
  planId: 'plan-1',
  sourceRoot: 'sprites',
  target: { archiveIdentity: 'character.sff', archiveFingerprint: 'old-hash' },
  sprites: [
    sprite('second-physically', 200, 1, 'b.png'),
    sprite('first-identity', 0, 0, 'a.png')
  ],
  requirements: ['sff-v2.1', 'png8'],
  decisions: [{ decisionId: 'dedupe-1', kind: 'duplicate', choice: 'keep-independent' }],
  options: { shared: { autocrop: false }, backends: { sprmake2: { optimize: false } } }
};

const spec = createSffBuildSpecification(input);
assert.strictEqual(spec.version, SFF_BUILD_SPECIFICATION_VERSION);
assert.deepStrictEqual(spec.sprites.map((entry) => entry.entryId), ['second-physically', 'first-identity'], 'physical order must be preserved');
assert.strictEqual(spec.specificationHash, specificationHash(spec));
assert.deepStrictEqual(spec.sprites[0].source.provenance, { kind: 'test-fixture', manifest: 'fixture.csv', physicalOrder: 200 });
assert(Object.isFrozen(spec));
assert(Object.isFrozen(spec.sprites[0].source));
assert(Object.isFrozen(spec.sprites[0].source.provenance));
assert.throws(() => { spec.sprites.push(sprite('later', 1, 1, 'later.png')); }, TypeError);

const same = createSffBuildSpecification({ ...input, options: { backends: input.options.backends, shared: input.options.shared } });
assert.strictEqual(same.specificationHash, spec.specificationHash, 'object key order must not change the hash');

const reordered = createSffBuildSpecification({ ...input, sprites: [...input.sprites].reverse() });
assert.notStrictEqual(reordered.specificationHash, spec.specificationHash, 'authored physical order must affect the hash');

const colors = Array.from({ length: 256 }, (_, index) => [index, 255 - index, index % 7, index === 0 ? 0 : 255]);
const withPalettes = createSffBuildSpecification({
  ...input,
  palettes: [{
    entryId: 'palette:1,1', group: 1, number: 1, colors, duplicatePolicy: 'preserve-separate',
    source: { relativePath: 'input/pal_1_1.act', byteHash: 'CC', width: 256, height: 1 }
  }]
});
assert.deepStrictEqual(withPalettes.palettes[0].colors, colors, 'exact palette RGBA belongs to the reviewed specification');
assert.strictEqual(withPalettes.palettes[0].tableOrder, 'sff', 'specification palette colors are always normalized archive-index colors');

assert.throws(() => createSffBuildSpecification({ ...input, sprites: [input.sprites[0], input.sprites[0]] }), /duplicate entryId/);
assert.throws(() => createSffBuildSpecification({ ...input, sprites: [{ ...input.sprites[0], source: { ...input.sprites[0].source, width: 0 } }] }), /width/);
assert.throws(() => createSffBuildSpecification({ ...input, sourceRoot: 'C:\\private\\snapshot' }), /portable path/);
assert.throws(() => createSffBuildSpecification({ ...input, sprites: [{ ...input.sprites[0], linkTargetEntryId: 'missing', duplicatePolicy: 'share-identical' }] }), /links to missing/);
assert.throws(() => createSffBuildSpecification({ ...input, sprites: [
  { ...input.sprites[0], linkTargetEntryId: 'first-identity', duplicatePolicy: 'share-identical' },
  input.sprites[1]
] }), /link backward/);
assert.throws(() => createSffBuildSpecification({ ...input, options: { shared: { bad: Infinity } } }), /finite JSON/);
assert.throws(() => createSffBuildSpecification({ ...input, sprites: [{ ...input.sprites[0], group: 65536 }] }), /0 through 65535/);
assert.throws(() => createSffBuildSpecification({ ...input, sprites: [{ ...input.sprites[0], axisX: -32769 }] }), /-32768 through 32767/);
assert.throws(() => createSffBuildSpecification({ ...input, sprites: [{ ...input.sprites[0], source: { ...input.sprites[0].source, height: 65536 } }] }), /1 through 65535/);
assert.throws(() => createSffBuildSpecification({ ...withPalettes, palettes: [{ ...withPalettes.palettes[0], number: -1 }] }), /0 through 65535/);
assert.throws(() => createSffBuildSpecification({ ...withPalettes, palettes: [{ ...withPalettes.palettes[0], tableOrder: 'reversed-photoshop' }] }), /tableOrder must be sff/);

console.log('sff_build_specification tests passed');
