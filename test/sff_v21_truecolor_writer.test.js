'use strict';

const assert = require('assert');
const crypto = require('crypto');
const zlib = require('zlib');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createCreatorTestBuild, prepareCreatorTestBuild } = require('../src/sff_creator_test_build');
const { crc32 } = require('../src/sff_png8_source');
const { createSffBuildSpecification } = require('../src/sff_build_specification');
const { createSffV21Png8Bytes } = require('../src/sff_v21_png8_writer');
const { createSffV21Bytes } = require('../src/sff_v21_writer');
const { assertSffV21Mixed, SFF_V21_MIXED_VALIDATOR_PROFILE } = require('../src/sff_v21_mixed_strict_validator');
const { encodeIndexedPng } = require('../src/palette_indexed_png');

const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function chunk(type, data) { const name = Buffer.from(type), out = Buffer.alloc(data.length + 12); out.writeUInt32BE(data.length); name.copy(out, 4); data.copy(out, 8); out.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8); return out; }
function png(width, height, type, pixels) { const channels = type === 2 ? 3 : 4, ihdr = Buffer.alloc(13), raw = Buffer.alloc(height * (width * channels + 1)); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = type; for (let y = 0; y < height; y += 1) { const at = y * (width * channels + 1); raw[at] = 0; pixels.copy(raw, at + 1, y * width * channels, (y + 1) * width * channels); } return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); }

const rgbPixels = Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 250, 240, 230]);
const rgbaPixels = Buffer.from([255, 0, 0, 0, 0, 255, 0, 64, 0, 0, 255, 128, 250, 240, 230, 255]);
const png24 = png(2, 2, 2, rgbPixels), png32 = png(2, 2, 6, rgbaPixels);
const source = (name, bytes, pixels) => ({ relativePath: `input/${name}`, byteHash: sha(bytes), decodedHash: sha(pixels), width: 2, height: 2, provenance: { kind: 'truecolor-writer-test' } });
function sprite(id, number, format, bytes, pixels, linkTargetEntryId = null) { return { entryId: id, group: 10, number, axisX: -3, axisY: 7, colorDepth: format === 'png24' ? 24 : 32, format, compression: format, paletteId: null, linkTargetEntryId, duplicatePolicy: linkTargetEntryId ? 'share-identical' : 'preserve-separate', crop: { mode: 'none', axisDeltaX: 0, axisDeltaY: 0 }, source: source(`${format}.png`, bytes, pixels) }; }
function specification(sprites) { return createSffBuildSpecification({ planId: 'truecolor-writer-test', sourceRoot: 'input', target: { archiveIdentity: 'truecolor.sff', sffVersion: '2.1' }, sprites, palettes: [], requirements: ['sff-v2.1', 'preserve-authored-physical-order', 'immutable-source-snapshots', 'candidate-before-adoption', 'sprite-truecolor'], decisions: [], options: { shared: {}, backends: {} } }); }

const spec = specification([sprite('rgb', 0, 'png24', png24, rgbPixels), sprite('rgba', 1, 'png32', png32, rgbaPixels), sprite('rgba-link', 2, 'png32', png32, rgbaPixels, 'rgba')]);
const sources = new Map([['input/png24.png', png24], ['input/png32.png', png32]]);
const first = createSffV21Bytes(spec, { sources }), second = createSffV21Bytes(spec, { sources });
assert.deepStrictEqual(first, second, 'true-color output is deterministic');
const report = assertSffV21Mixed(first, spec);
assert.strictEqual(report.profile, SFF_V21_MIXED_VALIDATOR_PROFILE);
assert.deepStrictEqual(report.sprites.map(row => [row.format, row.colorDepth, row.pixelKind, row.decodedHash]), [[11, 24, 'rgb24', sha(rgbPixels)], [12, 32, 'rgba32', sha(rgbaPixels)], [12, 32, 'rgba32', sha(rgbaPixels)]]);
assert.strictEqual(report.sprites[2].dataSize, 0); assert.strictEqual(report.sprites[2].link, 1); assert.strictEqual(report.palettes.length, 0);

const badType = specification([sprite('bad', 0, 'png24', png32, rgbaPixels)]);
assert.throws(() => createSffV21Bytes(badType, { sources: new Map([['input/png24.png', png32]]) }), /source byte hash|color type 2/);

// The generalized entry point is required to preserve the original indexed
// writer byte-for-byte. This is the compatibility promise for existing users.
const colors = Array.from({ length: 256 }, (_, index) => [index, 255 - index, index, index ? 255 : 0]), indices = Buffer.from([0, 1, 2, 3]);
const indexed = encodeIndexedPng({ width: 2, height: 2 }, indices, colors), indexedSource = { relativePath: 'input/indexed.png', byteHash: sha(indexed), decodedHash: sha(indices), width: 2, height: 2, provenance: {} };
const indexedSpec = createSffBuildSpecification({ planId: 'indexed-delegation-test', sourceRoot: 'input', target: { archiveIdentity: 'indexed.sff', sffVersion: '2.1' }, sprites: [{ entryId: 'indexed', group: 0, number: 0, axisX: 0, axisY: 0, colorDepth: 8, format: 'png8', compression: 'png8', paletteId: 'palette', duplicatePolicy: 'preserve-separate', crop: { mode: 'none', axisDeltaX: 0, axisDeltaY: 0 }, source: indexedSource }], palettes: [{ entryId: 'palette', group: 1, number: 1, tableOrder: 'sff', duplicatePolicy: 'preserve-separate', colors, source: indexedSource }], requirements: ['sff-v2.1', 'sprite-png8', 'embedded-palettes'], decisions: [], options: { shared: {}, backends: {} } });
const indexedSources = new Map([['input/indexed.png', indexed]]);
assert.deepStrictEqual(createSffV21Bytes(indexedSpec, { sources: indexedSources }), createSffV21Png8Bytes(indexedSpec, { sources: indexedSources }));

const mixedSpec = createSffBuildSpecification({ ...indexedSpec, planId: 'mixed-writer-test', sprites: [...indexedSpec.sprites, ...spec.sprites] });
const mixedSources = new Map([...indexedSources, ...sources]);
const mixed = createSffV21Bytes(mixedSpec, { sources: mixedSources });
const mixedReport = assertSffV21Mixed(mixed, mixedSpec);
assert.deepStrictEqual(mixedReport.sprites.map(row => row.format), [10, 11, 12, 12]);
assert.deepStrictEqual(assertSffV21Mixed(mixed), mixedReport, 'structural reopen preserves the exact reviewed report hash');
assert.deepStrictEqual(mixedReport.palettes[0].colorsRgba, colors);
assert.strictEqual(mixedReport.sprites[1].decodedPixelHash, sha(rgbPixels));
assert.strictEqual(mixedReport.sprites[3].decodedPixelHash, sha(rgbaPixels));
const overlap = Buffer.from(mixed); overlap.writeUInt32LE(64, 36);
assert.throws(() => assertSffV21Mixed(overlap), /contiguous|overlap/);
const badStorage = Buffer.from(mixed); badStorage.writeUInt32LE(0, mixedReport.header.spriteTable + 16);
assert.throws(() => assertSffV21Mixed(badStorage), /PNG|overlap/);
assert.throws(() => assertSffV21Mixed(mixed, mixedSpec, { compatibilityProfile: 'sprmake2-v2.1' }), /canonical native/);

// Exercise both public Creator test-build paths with immutable on-disk sources.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-mixed-test-build-'));
try {
  const { buildFixture, certification, kits } = require('./sff_creator_candidate_dispatch.test');
  const { persistenceInput } = require('./sff_creator_candidate_persistence.test');
  const { persistCreatorCandidate } = require('../src/sff_creator_candidate_persistence');
  const evidence = certification(kits['sff-v2.1'].generate(path.join(root, 'certification')));
  const activeDirectory = path.join(root, 'protected'); fs.mkdirSync(activeDirectory);
  const activeArchivePath = path.join(activeDirectory, 'active.sff'); fs.writeFileSync(activeArchivePath, mixed);
  for (const [name, reviewed, sourceMap] of [['truecolor', spec, sources], ['mixed', mixedSpec, mixedSources]]) {
    const outputDirectory = path.join(root, name); fs.mkdirSync(path.join(outputDirectory, 'input'), { recursive: true });
    for (const [relative, bytes] of sourceMap) fs.writeFileSync(path.join(outputDirectory, relative), bytes);
    const specificationPath = path.join(outputDirectory, 'specification.json'), artifact = Buffer.from(JSON.stringify(reviewed)); fs.writeFileSync(specificationPath, artifact);
    const input = { packageRoot: root, targetId: 'sff-v2.1', build: { outputDirectory, specificationPath, specificationHash: reviewed.specificationHash, specificationArtifactByteHash: sha(artifact) } };
    const prepared = prepareCreatorTestBuild(input); prepared.revalidate();
    const result = createCreatorTestBuild(input);
    assert(fs.readFileSync(result.candidatePath).equals(prepared.candidate));
    assert.strictEqual(result.adoptionAllowed, false);
    assert.deepStrictEqual(assertSffV21Mixed(prepared.candidate).sprites.map(row => row.format), name === 'mixed' ? [10, 11, 12, 12] : [11, 12, 12]);
    const sourceBytesByEntryId = Object.fromEntries([...reviewed.sprites, ...reviewed.palettes].map(row => [row.entryId, sourceMap.get(row.source.relativePath)]));
    const fixture = buildFixture('sff-v2.1', evidence, { legacy: reviewed, sourceBytesByEntryId });
    const stagingParent = path.join(root, `${name}-production`); fs.mkdirSync(stagingParent);
    const persistInput = persistenceInput(fixture.input, stagingParent, activeArchivePath), persisted = persistCreatorCandidate(persistInput);
    assert.strictEqual(persisted.receipt.candidatePersisted, true);
    assert.strictEqual(persisted.receipt.activeArchiveModified, false);
    assert(fs.readFileSync(activeArchivePath).equals(mixed));
    assert.deepStrictEqual(assertSffV21Mixed(fs.readFileSync(persisted.stagingCandidatePath)).sprites.map(row => row.format), name === 'mixed' ? [10, 11, 12, 12] : [11, 12, 12]);
    const { adoptionInput } = require('./sff_creator_adoption_plan.test');
    const adoption = require('../src/sff_creator_adoption_plan').createCreatorAdoptionPlan(adoptionInput(persistInput, persisted, `before-${name}.sff.bak`));
    assert.strictEqual(adoption.active.inspection.status, 'recognized-supported-profile');
    assert.strictEqual(adoption.comparison.categories.decodedPixels.unknown, 0);
    assert.strictEqual(adoption.comparison.categories.decodedPixels.changed, 0);
    assert.strictEqual(adoption.comparison.categories.decodedPixels.equal, reviewed.sprites.length);
  }
  const sync = require('../src/palette_reverse_sync_candidate'), domain = require('../src/palette_domain_model');
  const sffFilename = path.join(root, 'active.sff'), metadataFilename = path.join(root, 'domains.json'), candidatePath = path.join(root, 'reverse-candidate.sff');
  fs.writeFileSync(sffFilename, mixed);
  fs.writeFileSync(metadataFilename, JSON.stringify(domain.normalizeRegistry({ schema: domain.SCHEMA, version: 2, revision: 1, archives: { 'active.sff': domain.emptyArchive() } })));
  const replacement = colors.map(color => [...color]); replacement[2] = [12, 34, 56, 255];
  const input = { sffFilename, metadataFilename, candidatePath, archiveKey: 'active.sff', operationId: 'reverse:mixed:test', proposals: [{ kind: 'colors', physicalIndex: 0, colors: replacement }], aliasDecisions: {}, referenceFiles: [] };
  const plan = sync.normalizePlan(input); assert(plan.ready, JSON.stringify(plan.blockers));
  const built = sync.buildCandidate({ ...input, plan }); assert(built.verification.verified);
  const updated = assertSffV21Mixed(fs.readFileSync(candidatePath));
  assert.deepStrictEqual(updated.sprites.map(row => [row.format, row.decodedHash, row.link]), mixedReport.sprites.map(row => [row.format, row.decodedHash, row.link]));
  assert.deepStrictEqual(updated.palettes[0].colorsRgba, replacement);
  assert(fs.readFileSync(sffFilename).equals(mixed), 'reverse-sync candidate does not adopt itself');
} finally { fs.rmSync(root, { recursive: true, force: true }); }

console.log('SFF v2.1 true-color writer tests passed');
