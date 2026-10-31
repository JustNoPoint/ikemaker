'use strict';

const assert = require('assert');
const { encodeIndexedPng, readIndexedPng } = require('../src/palette_indexed_png');
const { createSffBuildSpecification } = require('../src/sff_build_specification');
const { createSffV21Bytes } = require('../src/sff_v21_writer');
const { parseSffBuffer } = require('../src/sff_reader');
const { dedupeSffSprites, dedupeIndexedFiles } = require('../src/palette_cs_sff_model');

const colors = Array.from({ length: 256 }, (_, index) => [index, index, index, index === 0 ? 0 : 255]);
const alternate = colors.map(color => color.slice()); alternate[1] = [255, 0, 0, 255];
const decoded = { width: 2, height: 1 }, indices = Buffer.from([0, 1]), png = encodeIndexedPng(decoded, indices, colors), pngInfo = readIndexedPng(png);
const palette = (entryId, number, table) => ({ entryId, group: 1, number, tableOrder: 'sff', duplicatePolicy: 'preserve-separate', colors: table, source: { relativePath: 'sprite.png', byteHash: pngInfo.byteHash, decodedHash: pngInfo.indexPlaneHash, width: 2, height: 1, provenance: null } });
const sprite = (entryId, group, number, axisX, paletteId) => ({ entryId, group, number, axisX, axisY: 0, colorDepth: 8, format: 'png8', compression: 'png8', paletteId, duplicatePolicy: 'preserve-separate', crop: { mode: 'none', axisDeltaX: 0, axisDeltaY: 0 }, source: { relativePath: 'sprite.png', byteHash: pngInfo.byteHash, decodedHash: pngInfo.indexPlaneHash, width: 2, height: 1, provenance: null } });
const specification = createSffBuildSpecification({ planId: 'cs-dedupe-test', sourceRoot: '.', target: { archiveIdentity: 'test.sff', sffVersion: '2.1' }, palettes: [palette('palette-a', 0, colors), palette('palette-b', 1, alternate)], sprites: [sprite('first', 10, 0, 2, 'palette-a'), sprite('duplicate', 20, 4, 9, 'palette-a'), sprite('different-palette', 30, 7, 3, 'palette-b')], requirements: [], decisions: [], options: {} });
const archive = parseSffBuffer(createSffV21Bytes(specification, { sources: new Map([['sprite.png', png]]) }));
const plan = dedupeSffSprites(archive, archive.sprites, { filename: 'source.sff', byteHash: 'a'.repeat(64) });
assert.strictEqual(plan.canonical.length, 2, 'same indexes and effective palette deduplicate, while a different palette remains separate');
assert.deepStrictEqual(plan.sourceMap.summary, { originalSpriteCount: 3, canonicalSpriteCount: 2, removedDuplicateCount: 1 });
assert.strictEqual(plan.sourceMap.replacements[1].canonicalPhysicalIndex, 0);
assert.strictEqual(plan.sourceMap.replacements[1].original.axisX, 9, 'duplicate axes remain in the reversible replacement map');
assert.strictEqual(plan.sourceMap.source.filename.endsWith('source.sff'), true);

const sameRgbSpec = createSffBuildSpecification({ planId: 'cs-family-test', sourceRoot: '.', target: { archiveIdentity: 'families.sff', sffVersion: '2.1' }, palettes: [palette('palette-a', 0, colors), palette('palette-b', 1, colors)], sprites: [sprite('first', 10, 0, 2, 'palette-a'), sprite('independent-family', 20, 0, 2, 'palette-b')], requirements: [], decisions: [], options: {} });
const sameRgbArchive = parseSffBuffer(createSffV21Bytes(sameRgbSpec, { sources: new Map([['sprite.png', png]]) }));
assert.strictEqual(dedupeSffSprites(sameRgbArchive).canonical.length, 2, 'identical pixels and RGB in independently authored families must not deduplicate');
sameRgbArchive.palettes[0].dataSize=0;sameRgbArchive.palettes[0].link=0;
assert.throws(()=>dedupeSffSprites(sameRgbArchive),/Cyclic/, 'cyclic ownership cannot produce duplicate identities');

const folder = dedupeIndexedFiles([{ filename: 'one.png', bytes: png }, { filename: 'two.png', bytes: png }]);
assert.strictEqual(folder.canonical.length, 1);
assert.strictEqual(folder.sourceMap, null, 'folder-only intake deliberately omits original-SFF replacement metadata');
console.log('CS SFF intake uses exact index-safe deduplication and retains reversible source metadata');
