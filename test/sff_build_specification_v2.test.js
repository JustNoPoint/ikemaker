'use strict';

const assert = require('assert');
const { createSffBuildSpecificationV2, assertSffBuildSpecificationV2 } = require('../src/sff_build_specification_v2');

const H = 'a'.repeat(64), D = 'b'.repeat(64);
const evidence = { tool: { available: true, byteHash: H, version: 'test' }, targetProbe: { status: 'passed', targetId: 'sff-v2.1', observedTargetId: 'sff-v2.1', backendId: 'sprmake2-sff-v2.1', adapterId: 'sprmake2-v21', adapterVersion: 1, toolByteHash: H, outputByteHash: D, validatorId: 'strict-v21', validatorVersion: 1, semanticComparisonPassed: true } };
const input = {
  planId: 'v2-plan', selection: { targetId: 'sff-v2.1', backendId: 'sprmake2-sff-v2.1' },
  logical: { sourceRoot: 'input', archiveIdentity: 'hero.sff', sprites: [{ entryId: 'sprite:0', group: 0, number: 0, width: 2, height: 2, axisX: 1, axisY: 2, pixels: { kind: 'indexed8', decodedHash: D }, paletteEntryId: 'palette:1', source: { relativePath: 'a.png', byteHash: H, decodedHash: D, provenance: { frame: 0 } } }], palettes: [{ entryId: 'palette:1', group: 1, number: 1, colors: [[0, 0, 0, 0], [1, 2, 3, 255]], source: { relativePath: 'a.act', byteHash: D, provenance: {} } }], provenance: { authored: true } },
  encodingIntent: { compression: { default: 'png8' }, storage: { spriteDefault: 'separate' }, backendOptions: { 'sprmake2-sff-v2.1': { optimize: false } } }, capabilityRequest: { evidence }, review: { reviewer: 'test' }
};
const spec = createSffBuildSpecificationV2(input);
assert.strictEqual(spec.version, 2); assert.strictEqual(spec.selection.adapter.id, 'sprmake2-v21'); assert(Object.isFrozen(spec.logical.sprites[0]));
assert.strictEqual(assertSffBuildSpecificationV2(spec), spec);
assert(spec.capabilityAssessment.requiredFeatures.includes('sprite.indexed8')); assert(spec.capabilityAssessment.requiredFeatures.includes('palette.embedded'));
assert.throws(() => createSffBuildSpecificationV2({ ...input, selection: {} }), /explicit SFF targetId/);
assert.throws(() => createSffBuildSpecificationV2({ ...input, selection: { targetId: 'sff-v1', backendId: 'sprmake2-sff-v2.1' } }), /incompatible/);
assert.throws(() => createSffBuildSpecificationV2({ ...input, encodingIntent: { backendOptions: { 'sprmake2-sff-v2.0': { active: true } } } }), /selected backend/);
const encodingChanged = createSffBuildSpecificationV2({ ...input, encodingIntent: { ...input.encodingIntent, compression: { default: 'raw' } } });
assert.strictEqual(encodingChanged.logicalHash, spec.logicalHash); assert.notStrictEqual(encodingChanged.specificationHash, spec.specificationHash);
const orderChanged = createSffBuildSpecificationV2({ ...input, logical: { ...input.logical, sprites: [...input.logical.sprites, { ...input.logical.sprites[0], entryId: 'sprite:1', number: 1 }] } });
assert.notStrictEqual(orderChanged.logicalHash, spec.logicalHash);
assert.throws(() => createSffBuildSpecificationV2({ ...input, logical: { ...input.logical, sourceRoot: '../escape' } }), /portable path/);
assert.throws(() => createSffBuildSpecificationV2({ ...input, logical: { ...input.logical, sprites: [{ ...input.logical.sprites[0], source: { ...input.logical.sprites[0].source, byteHash: 'bad' } }] } }), /SHA-256/);
assert.throws(() => createSffBuildSpecificationV2({ ...input, logical: { ...input.logical, sprites: [{ ...input.logical.sprites[0], pixels: { ...input.logical.sprites[0].pixels, decodedHash: H } }] } }), /decoded hashes must match/);
assert.throws(() => createSffBuildSpecificationV2({ ...input, logical: { ...input.logical, sprites: [
  { ...input.logical.sprites[0], contentLinkTargetEntryId: 'sprite:1' },
  { ...input.logical.sprites[0], entryId: 'sprite:1', number: 1, contentLinkTargetEntryId: 'sprite:0' }
] } }), /link cycle/);
const converted = createSffBuildSpecificationV2({ ...input, encodingIntent: { ...input.encodingIntent, reviewedConversions: [{ feature: 'sprite.alpha32', status: 'planned' }] } });
assert.strictEqual(converted.capabilityAssessment.exactBuildAllowed, false);
console.log('SFF v2 specification separates logical content, encoding intent, and capability evidence');
