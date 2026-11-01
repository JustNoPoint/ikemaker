'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { spawnSync } = require('child_process');
const zlib = require('zlib');
const { crc32, readIndexedPng8 } = require('../src/sff_png8_source');

const original = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return { Uri: { file: (fsPath) => ({ fsPath }) }, workspace: { workspaceFolders: [], getConfiguration: () => ({ get: (_key, fallback) => fallback }) }, window: {}, commands: {}, env: {}, UIKind: { Web: 2 }, ProgressLocation: { Notification: 1 } };
  return original.call(this, request, parent, main);
};
const { createBuildPackage, executeGeneratedBuild, verifyCandidateArchive, expectedPaletteContract, spriteSharingKey, builtInComparisonAvailability, sprMake2Compatibility } = require('../src/sff_commands');
const { canonicalize, specificationHash, createSffBuildSpecification } = require('../src/sff_build_specification');
const { createSffV21Png8Bytes } = require('../src/sff_v21_png8_writer');
const { readSff } = require('../src/sff_reader');
const { archiveTemporaryPaletteCleanupReview, lifecycleRegistryPath, mergeLifecycleRegistry } = require('../src/sff_placeholder_lifecycle');
const { noncanonicalIndexedPng } = require('../tools/generate_sff_runtime_certification_fixtures');
Module._load = original;

const sha = (data) => crypto.createHash('sha256').update(data).digest('hex').toUpperCase();
const canonicalSha = (value) => crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
assert.deepStrictEqual(expectedPaletteContract({ palettes: [{ group: 1, number: 1, index: 0, dataSize: 768, link: null }, { group: 9, number: 1, index: 1, dataSize: 768, link: null }] }, [], [], null, (_archive, index) => [[index, 0, 0, 255]], { deletedOriginalIds: ['9,1'] }).map((entry) => `${entry.group},${entry.number}`), ['1,1'], 'reviewed deletions are absent from candidate verification expectations');
const decodedSprite = { image: { decodedHash: 'd'.repeat(64), width: 4, height: 3, colorDepth: 8, format: 'png8', compression: 'png8' }, palette: '1,1', sourceByteHash: 'a'.repeat(64) };
assert.strictEqual(spriteSharingKey(decodedSprite), spriteSharingKey({ ...decodedSprite, sourceByteHash: 'b'.repeat(64) }), 'equivalent decoded pixels may share despite different PNG container bytes');
assert.notStrictEqual(spriteSharingKey(decodedSprite), spriteSharingKey({ ...decodedSprite, palette: '2,1' }), 'different palette interpretation must never be proposed as identical sprite data');
assert.notStrictEqual(spriteSharingKey(decodedSprite), spriteSharingKey({ ...decodedSprite, image: { ...decodedSprite.image, width: 5 } }), 'dimensions are part of the exact duplicate signature');
const comparisonSprite = { format: 'png8', compression: 'png8', colorDepth: 8, paletteId: '1,1', crop: { mode: 'none' } };
assert.strictEqual(builtInComparisonAvailability({ specification: { sprites: [comparisonSprite], palettes: [{ colors: Array(256) }] } }).available, true);
assert.strictEqual(builtInComparisonAvailability({ specification: { sprites: [], palettes: [] } }).available, true, 'the certified empty-archive profile does not require an unused palette');
assert.strictEqual(builtInComparisonAvailability({ specification: { sprites: [{ ...comparisonSprite, crop: { mode: 'before-axis' } }], palettes: [{ colors: Array(256) }] } }).available, true, 'prepared before-axis snapshots are already final PNG8 inputs');
const croppedComparison = builtInComparisonAvailability({ specification: { sprites: [{ ...comparisonSprite, crop: { mode: 'after-axis' } }], palettes: [{ colors: Array(256) }] } });
assert.strictEqual(croppedComparison.available, false); assert.match(croppedComparison.reasons.join(' '), /sealed final crop snapshot/);
assert.strictEqual(builtInComparisonAvailability({ specification: { sprites: [{ ...comparisonSprite, crop: { mode: 'after-axis' }, source: { provenance: { preparation: { kind: 'after-axis-crop' } } } }], palettes: [{ colors: Array(256) }] } }).available, true, 'prepared after-axis snapshots are eligible for built-in comparison');
assert.strictEqual(sprMake2Compatibility({ sprites: [{ entryId: 'a', group: 3, number: 7 }, { entryId: 'b', group: 3, number: 8 }] }).available, true);
const mixedPolicyCompatibility = sprMake2Compatibility({ sprites: [{ entryId: 'a', group: 3, number: 7, duplicatePolicy: 'preserve-separate' }, { entryId: 'b', group: 3, number: 8, duplicatePolicy: 'share-identical' }] });
assert.strictEqual(mixedPolicyCompatibility.available, false);
assert.strictEqual(mixedPolicyCompatibility.mixedSpriteDuplicatePolicies, true);
assert.match(mixedPolicyCompatibility.reasons[0], /one build-wide/);
const repeatedSprMake2Identity = sprMake2Compatibility({ sprites: [{ entryId: 'a', group: 3, number: 7 }, { entryId: 'b', group: 3, number: 7 }] });
assert.strictEqual(repeatedSprMake2Identity.available, false);
assert.deepStrictEqual(repeatedSprMake2Identity.repeatedSpriteIdentities[0], { identity: '3,7', entryIds: ['a', 'b'] });
const partialAlphaCompatibility = sprMake2Compatibility({ sprites: [], palettes: [{ entryId: 'partial', group: 9, number: 1, colors: [[[0, 0, 0, 128]]].flat() }] });
assert.strictEqual(partialAlphaCompatibility.available, false);
assert.deepStrictEqual(partialAlphaCompatibility.partialAlphaPalettes[0].indexes, [0]);
assert.match(partialAlphaCompatibility.reasons[0], /cannot preserve/);
function png(width, height, marker, paletteSeed = 0) {
  const chunk = (type, data) => { const name = Buffer.from(type), out = Buffer.alloc(data.length + 12); out.writeUInt32BE(data.length, 0); name.copy(out, 4); data.copy(out, 8); out.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8); return out; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 3;
  const palette = Buffer.alloc(768); for (let index = 0; index < 256; index += 1) { palette[index * 3] = (index + paletteSeed) & 0xff; palette[index * 3 + 1] = (255 - index + paletteSeed) & 0xff; palette[index * 3 + 2] = (index ^ 0x55 ^ paletteSeed) & 0xff; }
  const raw = Buffer.alloc(height * (width + 1)), seed = Buffer.from(String(marker))[0] || 0;
  for (let y = 0; y < height; y += 1) { raw[y * (width + 1)] = 0; for (let x = 0; x < width; x += 1) raw[y * (width + 1) + 1 + x] = (seed + x + y) & 0xff; }
  const alpha = Buffer.alloc(256, 255); alpha[0] = 0;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('PLTE', palette), chunk('tRNS', alpha), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function trueColorPng(width, height, colorType, pixels) {
  const channels = colorType === 2 ? 3 : 4, chunk = (type, data) => { const name = Buffer.from(type), out = Buffer.alloc(data.length + 12); out.writeUInt32BE(data.length); name.copy(out, 4); data.copy(out, 8); out.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8); return out; }, ihdr = Buffer.alloc(13), raw = Buffer.alloc(height * (width * channels + 1));
  ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = colorType;
  for (let y = 0; y < height; y += 1) pixels.copy(raw, y * (width * channels + 1) + 1, y * width * channels, (y + 1) * width * channels);
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function fixturePalette() { return Array.from({ length: 256 }, (_, index) => [index, 255 - index, index ^ 0x55, index === 0 ? 0 : 255]); }
function fixtureSource(relativePath, bytes, width, height) {
  const decoded = Buffer.alloc(width * height), seed = Buffer.from(path.basename(relativePath))[0] || 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) decoded[y * width + x] = (seed + x + y) & 0xff;
  return { relativePath, byteHash: sha(bytes).toLowerCase(), decodedHash: sha(decoded).toLowerCase(), width, height, provenance: { kind: 'small-batch-fixture' } };
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-sff-package-order-'));
  try {
    const first = png(16, 24, 'authored-first'), second = png(32, 12, 'authored-second');
    fs.writeFileSync(path.join(root, 'first.png'), first); fs.writeFileSync(path.join(root, 'second.png'), second);
    const manifest = path.join(root, 'manifest.csv');
    fs.writeFileSync(manifest, [
      'OriginalRelativePath,ComputedGroup,ImageIndex,AxisX,AxisY,SourceSHA256,ReviewStatus',
      `first.png,900,2,5,6,${sha(first)},APPROVED`,
      `second.png,0,0,7,8,${sha(second)},APPROVED`,
      ''
    ].join('\r\n'));
    const build = path.join(root, 'build'), target = path.join(root, 'active.sff'), candidate = path.join(build, '.candidate.sff');
    const userOwnedInput = path.join(build, 'input', 'artist-reference.png');
    fs.mkdirSync(path.dirname(userOwnedInput), { recursive: true }); fs.writeFileSync(userOwnedInput, 'not generated by IKEMaker');
    const activeBytes = Buffer.from('reviewed-active-target'); fs.writeFileSync(target, activeBytes);
    const result = await createBuildPackage({ sourceRoot: root, manifestPath: manifest, outputDirectory: build, outputSff: target, candidateOutputSff: candidate, buildProfile: { getHitIndexing: { enabled: false } }, duplicateHandling: { sprites: 'preserve-separate', palettes: 'share-identical' } });
    assert.deepStrictEqual(result.mapping.map((entry) => `${entry.group},${entry.index}`), ['900,2', '0,0'], 'build mappings preserve reviewed manifest order');
    const definition = fs.readFileSync(result.definitionPath, 'utf8');
    assert(definition.indexOf('900,2,') < definition.indexOf('0,0,'), 'SprMaker2 specification preserves reviewed physical order');
    assert.match(definition, /filename = .*\.candidate\.sff/);
    assert.match(definition, /sprite\.detectduplicates = 0/);
    assert.match(definition, /pal\.detectduplicates = 1/);
    assert.strictEqual(fs.readFileSync(userOwnedInput, 'utf8'), 'not generated by IKEMaker', 'package refresh does not delete unrelated user-owned inputs');
    const mapping = fs.readFileSync(path.join(build, 'production_mapping.csv'), 'utf8');
    assert.match(mapping, /^PhysicalOrder,/);
    assert.match(mapping, /\r?\n0,900,2,/);
    assert.match(mapping, /\r?\n1,0,0,/);
    assert.strictEqual(result.specificationHash, result.specification.specificationHash);
    assert.strictEqual(result.specification.target.archiveIdentity, path.basename(target));
    assert.strictEqual(result.specification.target.archiveFingerprint, sha(activeBytes).toLowerCase());
    assert.deepStrictEqual(result.specification.sprites.map((entry) => `${entry.group},${entry.number}`), ['900,2', '0,0']);
    assert.deepStrictEqual(result.specification.sprites.map((entry) => entry.source.byteHash), [sha(first).toLowerCase(), sha(second).toLowerCase()]);
    assert(result.specification.sprites.every((entry) => /^[a-f0-9]{64}$/.test(entry.source.decodedHash)), 'indexed sprite contracts include decoded index hashes');
    assert.deepStrictEqual(result.specification.sprites.map((entry) => [entry.source.width, entry.source.height]), [[16, 24], [32, 12]]);
    assert.strictEqual(result.specification.sprites[0].source.provenance.kind, 'approved-manifest-source');
    assert.strictEqual(result.specification.sprites[0].duplicatePolicy, 'preserve-separate');
    assert.strictEqual(result.specification.options.backends.sprmake2.detectDuplicateSprites, false);
    assert.strictEqual(result.specification.options.backends.sprmake2.detectDuplicatePalettes, true);
    assert.deepStrictEqual(result.specification.options.backends.sprmake2.spriteCompression, { 5: 'lz5', 8: 'png8', 24: 'png24', 32: 'png32' });
    assert.deepStrictEqual(result.specification.palettes.map((entry) => entry.entryId), ['palette:900,2', 'palette:0,0'], 'new PNG8 archives expose SprMake2 own-image palette identities to every backend');
    assert.deepStrictEqual(result.specification.sprites.map((entry) => entry.paletteId), ['palette:900,2', 'palette:0,0'], 'each sprite explicitly references its reviewed image palette in the shared specification');
    assert.deepStrictEqual(result.specification.palettes.map((entry) => entry.source.byteHash), [sha(first).toLowerCase(), sha(second).toLowerCase()], 'image-palette contracts retain their immutable PNG snapshot identities');
    assert(result.specification.palettes.every((entry) => entry.source.provenance.kind === 'indexed-png-image-palette'));
    assert.deepStrictEqual(result.specification.palettes[0].colors, fixturePalette(), 'the indexed PNG color table is materialized without reordering');
    assert.strictEqual(result.specification.palettes[1].linkTargetEntryId, 'palette:900,2', 'reviewed duplicate-palette sharing is represented explicitly');
    assert.deepStrictEqual(result.expectedPalettes.map((entry) => entry.aliasOf), [null, { group: 900, number: 2 }], 'candidate verification receives the same duplicate-palette contract');
    assert.strictEqual(builtInComparisonAvailability(result).available, true, 'a new all-PNG8 package can now use Compare Both');
    assert.match(definition, /sprite\.usepal = -1/, 'SprMake2 retains its native per-image palette route');
    assert(!definition.includes('sprite.usepal = palette:'), 'backend-neutral palette IDs never leak into SprMake2 syntax');
    assert(result.specification.requirements.includes('preserve-authored-physical-order'));
    assert(result.specification.requirements.includes('candidate-before-adoption'));
    assert(fs.existsSync(result.specificationPath));
    assert(fs.existsSync(result.receiptPath));
    assert(path.dirname(result.specificationPath) !== path.dirname(target), 'reviewed specification remains outside the active archive');
    const persistedSpec = JSON.parse(fs.readFileSync(result.specificationPath, 'utf8'));
    const persistedReceipt = JSON.parse(fs.readFileSync(result.receiptPath, 'utf8'));
    assert.strictEqual(persistedSpec.specificationHash, result.specificationHash);
    assert.strictEqual(specificationHash(persistedSpec), result.specificationHash);
    assert.strictEqual(persistedReceipt.receiptHash, result.receiptHash);
    const receiptBody = { ...persistedReceipt }; delete receiptBody.receiptHash;
    assert.strictEqual(canonicalSha(receiptBody), result.receiptHash);
    assert.strictEqual(persistedReceipt.specification.specificationHash, result.specificationHash);
    assert.strictEqual(persistedReceipt.specification.byteHash, sha(fs.readFileSync(result.specificationPath)).toLowerCase());
    assert.strictEqual(persistedReceipt.sourceSnapshots[0].byteHash, sha(first).toLowerCase());
    for (const snapshot of persistedReceipt.sourceSnapshots) {
      assert.strictEqual(sha(fs.readFileSync(path.join(build, snapshot.relativePath))).toLowerCase(), snapshot.byteHash);
    }
    assert.match(path.basename(result.specificationPath), new RegExp(result.specificationHash));
    assert.match(path.basename(result.receiptPath), new RegExp(result.receiptHash));
    if (process.platform === 'win32' && fs.existsSync(result.sprmake)) {
      const built = spawnSync(result.sprmake, [result.definitionPath], { cwd: result.outputDirectory, windowsHide: true, encoding: 'utf8' });
      assert.strictEqual(built.status, 0, `new-archive SprMake2 candidate failed: ${built.stdout || ''}\n${built.stderr || ''}`);
      const verified = verifyCandidateArchive(result.candidateOutputSff, result);
      assert.strictEqual(verified.strict.status, 'passed', 'new-archive candidate with own PNG palettes passes strict verification');
    }

    const rgbPixels = Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 240, 230, 220]), rgbaPixels = Buffer.from([255, 0, 0, 0, 0, 255, 0, 64, 0, 0, 255, 128, 240, 230, 220, 255]);
    const rgbFile = path.join(root, 'rgb24.png'), rgbaFile = path.join(root, 'rgba32.png'), rgbBytes = trueColorPng(2, 2, 2, rgbPixels), rgbaBytes = trueColorPng(2, 2, 6, rgbaPixels);
    fs.writeFileSync(rgbFile, rgbBytes); fs.writeFileSync(rgbaFile, rgbaBytes);
    const trueManifest = path.join(root, 'truecolor-manifest.csv'); fs.writeFileSync(trueManifest, ['OriginalRelativePath,ComputedGroup,ImageIndex,AxisX,AxisY,SourceSHA256,ReviewStatus', `rgb24.png,50,0,-4,9,${sha(rgbBytes)},APPROVED`, `rgba32.png,50,1,4,-9,${sha(rgbaBytes)},APPROVED`, ''].join('\r\n'));
    const trueBuild = path.join(root, 'truecolor-build'), trueResult = await createBuildPackage({ sourceRoot: root, manifestPath: trueManifest, outputDirectory: trueBuild, outputSff: path.join(root, 'truecolor.sff'), candidateOutputSff: path.join(trueBuild, 'candidate.sff'), buildProfile: { getHitIndexing: { enabled: false } }, duplicateHandling: { sprites: 'preserve-separate', palettes: 'preserve-separate' } });
    assert.deepStrictEqual(trueResult.specification.sprites.map(entry => [entry.format, entry.colorDepth, entry.source.decodedHash]), [['png24', 24, sha(rgbPixels).toLowerCase()], ['png32', 32, sha(rgbaPixels).toLowerCase()]]);
    assert.deepStrictEqual(trueResult.specification.sprites.map(entry => entry.paletteId), [null, null]); assert.deepStrictEqual(trueResult.specification.palettes, []);
    assert.strictEqual(builtInComparisonAvailability(trueResult).available, true, 'sealed PNG24/PNG32 packages are eligible for the built-in SFF 2.1 writer');

    const noncanonical = noncanonicalIndexedPng({ partialTransparency: false }), noncanonicalFile = path.join(root, 'noncanonical.png'); fs.writeFileSync(noncanonicalFile, noncanonical.bytes);
    const noncanonicalManifest = path.join(root, 'noncanonical-manifest.csv');
    fs.writeFileSync(noncanonicalManifest, ['OriginalRelativePath,ComputedGroup,ImageIndex,AxisX,AxisY,SourceSHA256,ReviewStatus', `noncanonical.png,40,9,-15,38,${sha(noncanonical.bytes)},APPROVED`, ''].join('\r\n'));
    const noncanonicalBuild = path.join(root, 'noncanonical-build'), noncanonicalTarget = path.join(root, 'noncanonical-target.sff');
    const noncanonicalResult = await createBuildPackage({ sourceRoot: root, manifestPath: noncanonicalManifest, outputDirectory: noncanonicalBuild, outputSff: noncanonicalTarget, candidateOutputSff: path.join(noncanonicalBuild, 'candidate.sff'), buildProfile: { getHitIndexing: { enabled: false } }, duplicateHandling: { sprites: 'preserve-separate', palettes: 'preserve-separate' } });
    const normalizedSprite = noncanonicalResult.specification.sprites[0], normalization = normalizedSprite.source.provenance.sprMake2Normalization;
    assert.strictEqual(normalization.kind, 'lossless-indexed-png8-canonicalization');
    assert.strictEqual(normalization.originalByteHash, sha(noncanonical.bytes).toLowerCase());
    assert.strictEqual(normalization.outputByteHash, normalizedSprite.source.byteHash);
    assert.notStrictEqual(normalization.outputByteHash, normalization.originalByteHash, 'noncanonical container bytes are replaced only inside the reviewed build snapshot');
    const retainedApprovedSource = path.join(noncanonicalBuild, ...normalization.originalSnapshotRelativePath.split('/'));
    assert.deepStrictEqual(fs.readFileSync(retainedApprovedSource), noncanonical.bytes, 'the package retains the exact approved noncanonical source beside its normalized adapter input');
    assert.deepStrictEqual(noncanonicalResult.receipt.approvedSourceSnapshots, [{ entryId: normalizedSprite.entryId, relativePath: normalization.originalSnapshotRelativePath, byteHash: normalization.originalByteHash }]);
    assert.deepStrictEqual(readIndexedPng8(fs.readFileSync(path.join(noncanonicalBuild, normalizedSprite.source.relativePath))).indices, readIndexedPng8(noncanonical.bytes).indices, 'package normalization preserves the exact reviewed index plane');
    if (process.platform === 'win32' && fs.existsSync(noncanonicalResult.sprmake)) {
      const built = spawnSync(noncanonicalResult.sprmake, [noncanonicalResult.definitionPath], { cwd: noncanonicalResult.outputDirectory, windowsHide: true, encoding: 'utf8' });
      assert.strictEqual(built.status, 0, `normalized noncanonical SprMake2 candidate failed: ${built.stdout || ''}\n${built.stderr || ''}`);
      assert(fs.existsSync(noncanonicalResult.candidateOutputSff), `normalized noncanonical SprMake2 produced no candidate: ${built.stdout || ''}\n${built.stderr || ''}`);
      assert.strictEqual(verifyCandidateArchive(noncanonicalResult.candidateOutputSff, noncanonicalResult).strict.status, 'passed');
    }
    const partialAlpha = noncanonicalIndexedPng(), partialAlphaFile = path.join(root, 'partial-alpha.png'); fs.writeFileSync(partialAlphaFile, partialAlpha.bytes);
    const partialAlphaManifest = path.join(root, 'partial-alpha-manifest.csv');
    fs.writeFileSync(partialAlphaManifest, ['OriginalRelativePath,ComputedGroup,ImageIndex,AxisX,AxisY,SourceSHA256,ReviewStatus', `partial-alpha.png,41,0,0,0,${sha(partialAlpha.bytes)},APPROVED`, ''].join('\r\n'));
    const partialAlphaBuild = path.join(root, 'partial-alpha-build');
    const partialAlphaResult = await createBuildPackage({ sourceRoot: root, manifestPath: partialAlphaManifest, outputDirectory: partialAlphaBuild, outputSff: path.join(root, 'partial-alpha-target.sff'), candidateOutputSff: path.join(partialAlphaBuild, 'candidate.sff'), buildProfile: { getHitIndexing: { enabled: false } }, duplicateHandling: { sprites: 'preserve-separate', palettes: 'preserve-separate' } });
    assert.strictEqual(partialAlphaResult.specification.sprites[0].source.provenance.sprMake2Normalization.kind, 'unsupported-partial-alpha');
    assert.strictEqual(partialAlphaResult.specification.sprites[0].source.byteHash, sha(partialAlpha.bytes).toLowerCase(), 'unsupported source bytes remain exact for package-only and built-in comparison use');
    const partialCapability = sprMake2Compatibility(partialAlphaResult.specification);
    assert.strictEqual(partialCapability.available, false);
    assert.match(partialCapability.reasons.join(' '), /partially transparent/);

    const sharedPalette = Buffer.alloc(768); for (let index = 0; index < sharedPalette.length; index += 1) sharedPalette[index] = index % 251;
    const sharedPalettePath = path.join(root, 'shared.act'); fs.writeFileSync(sharedPalettePath, sharedPalette);
    const mixedManifest = path.join(root, 'mixed-duplicate-manifest.csv');
    fs.writeFileSync(mixedManifest, [
      'OriginalRelativePath,ComputedGroup,ImageIndex,AxisX,AxisY,SourceSHA256,DuplicatePolicy,ReviewStatus',
      `first.png,50,0,0,0,${sha(first)},preserve-separate,APPROVED`,
      `first.png,50,1,4,5,${sha(first)},share-identical,APPROVED`,
      ''
    ].join('\r\n'));
    const mixedBuild = path.join(root, 'mixed-duplicate-build');
    const mixedResult = await createBuildPackage({ sourceRoot: root, manifestPath: mixedManifest, outputDirectory: mixedBuild, outputSff: path.join(root, 'mixed-output.sff'), candidateOutputSff: path.join(mixedBuild, 'candidate.sff'), sharedPalettePath, sharedPaletteId: '1,1', buildProfile: { getHitIndexing: { enabled: false } }, duplicateHandling: { sprites: 'preserve-separate', palettes: 'preserve-separate' } });
    assert.strictEqual(mixedResult.sprMake2Available, false);
    assert.deepStrictEqual(mixedResult.specification.sprites.map(entry => entry.duplicatePolicy), ['preserve-separate', 'share-identical']);
    assert.strictEqual(mixedResult.specification.sprites[1].linkTargetEntryId, mixedResult.specification.sprites[0].entryId, 'per-sprite sharing links compatible decoded data even when its earlier target remains explicitly independent');
    assert.strictEqual(mixedResult.receipt.backend.id, 'backend-neutral-review');
    assert.deepStrictEqual(mixedResult.specification.options.shared.spriteDuplicatePolicies.map(entry => entry.policy), ['preserve-separate', 'share-identical']);
    assert(!fs.existsSync(path.join(mixedBuild, 'sprmake2.def')) && !fs.existsSync(path.join(mixedBuild, 'build.cmd')));
    const staleMixedBuild = path.join(root, 'stale-mixed-build'); fs.mkdirSync(staleMixedBuild); fs.writeFileSync(path.join(staleMixedBuild, 'build.cmd'), '@echo stale');
    await assert.rejects(createBuildPackage({ sourceRoot: root, manifestPath: mixedManifest, outputDirectory: staleMixedBuild, outputSff: path.join(root, 'stale-mixed-output.sff'), sharedPalettePath, sharedPaletteId: '1,1', buildProfile: { getHitIndexing: { enabled: false } }, duplicateHandling: { sprites: 'preserve-separate', palettes: 'preserve-separate' } }), /stale runnable SprMake2 artifact/);
    assert.strictEqual(fs.readFileSync(path.join(staleMixedBuild, 'build.cmd'), 'utf8'), '@echo stale', 'fail-closed review never rewrites or disguises a pre-existing runnable artifact');
    const invalidMixedManifest = path.join(root, 'invalid-duplicate-manifest.csv');
    fs.writeFileSync(invalidMixedManifest, fs.readFileSync(mixedManifest, 'utf8').replace('share-identical', 'invented-policy'));
    await assert.rejects(createBuildPackage({ sourceRoot: root, manifestPath: invalidMixedManifest, outputDirectory: path.join(root, 'invalid-duplicate-build'), outputSff: path.join(root, 'invalid-output.sff'), buildProfile: { getHitIndexing: { enabled: false } }, duplicateHandling: { sprites: 'preserve-separate', palettes: 'preserve-separate' } }), /unsupported duplicate policy/);
    const paletteBuild = path.join(root, 'palette-build');
    const paletteResult = await createBuildPackage({ sourceRoot: root, manifestPath: manifest, outputDirectory: paletteBuild, outputSff: target, candidateOutputSff: path.join(paletteBuild, '.candidate.sff'), sharedPalettePath, sharedPaletteId: '1,1', buildProfile: { getHitIndexing: { enabled: false } }, duplicateHandling: { sprites: 'preserve-separate', palettes: 'share-identical' } });
    assert.strictEqual(paletteResult.specification.palettes.length, 1);
    assert.strictEqual(paletteResult.specification.palettes[0].entryId, 'palette:1,1');
    assert.strictEqual(paletteResult.specification.palettes[0].duplicatePolicy, 'share-identical');
    assert.strictEqual(paletteResult.specification.palettes[0].colors.length, 256);
    assert.deepStrictEqual(paletteResult.specification.palettes[0].colors[0], [0, 1, 2, 0]);
    assert.strictEqual(paletteResult.specification.palettes[0].source.byteHash, sha(sharedPalette).toLowerCase());
    assert.strictEqual(paletteResult.specification.palettes[0].source.provenance.originalByteHash, sha(sharedPalette).toLowerCase());
    assert.strictEqual(paletteResult.specification.options.backends.sprmake2.reverseAct, true);
    assert(paletteResult.receipt.sourceSnapshots.some((entry) => entry.entryId === 'palette:1,1'));
    const reversedPaletteBuild = path.join(root, 'reversed-palette-build');
    const reversedPaletteResult = await createBuildPackage({ sourceRoot: root, manifestPath: manifest, outputDirectory: reversedPaletteBuild, outputSff: target, candidateOutputSff: path.join(reversedPaletteBuild, '.candidate.sff'), sharedPalettePath, sharedPaletteId: '1,1', sharedPaletteOrder: 'reversed', buildProfile: { getHitIndexing: { enabled: false } }, duplicateHandling: { sprites: 'preserve-separate', palettes: 'share-identical' } });
    assert.deepStrictEqual(reversedPaletteResult.specification.palettes[0].colors[0], [12, 13, 14, 0], 'reversed Photoshop source order changes the reviewed logical index table without changing transparency ownership');
    assert.strictEqual(reversedPaletteResult.specification.palettes[0].source.provenance.sourceTableOrder, 'reversed');
    assert.strictEqual(reversedPaletteResult.specification.options.shared.paletteSource.tableOrder, 'reversed', 'the immutable specification seals the chosen external palette interpretation');
    assert.notStrictEqual(reversedPaletteResult.specification.specificationHash, paletteResult.specification.specificationHash, 'palette interpretation participates in the sealed build identity');
    if (process.platform === 'win32' && fs.existsSync(reversedPaletteResult.sprmake)) {
      const reversedBuilt = spawnSync(reversedPaletteResult.sprmake, [reversedPaletteResult.definitionPath], { cwd: reversedPaletteResult.outputDirectory, windowsHide: true, encoding: 'utf8' });
      assert.strictEqual(reversedBuilt.status, 0, `reversed-order SprMake2 candidate failed: ${reversedBuilt.stdout || ''}\n${reversedBuilt.stderr || ''}`);
      assert.strictEqual(verifyCandidateArchive(reversedPaletteResult.candidateOutputSff, reversedPaletteResult).strict.status, 'passed', 'the normalized reversed-order adapter output passes physical SprMake2 and independent strict verification');
    }

    const existingA = png(4, 3, 'a'), existingB = png(5, 2, 'b'), added = png(3, 4, 'c');
    const existingSpec = createSffBuildSpecification({
      planId: 'small-batch-existing', sourceRoot: 'input', target: { archiveIdentity: 'existing.sff', archiveFingerprint: null, sffVersion: '2.1' },
      requirements: ['sff-v2.1', 'preserve-authored-physical-order', 'immutable-source-snapshots', 'candidate-before-adoption', 'sprite-png8', 'embedded-palettes'],
      sprites: [
        { entryId: 'old-a', group: 0, number: 0, axisX: 10, axisY: 20, colorDepth: 8, format: 'png8', compression: 'png8', paletteId: '1,1', duplicatePolicy: 'preserve-separate', crop: { mode: 'none', axisDeltaX: 0, axisDeltaY: 0 }, source: fixtureSource('input/a.png', existingA, 4, 3) },
        { entryId: 'old-b', group: 10, number: 4, axisX: -7, axisY: 9, colorDepth: 8, format: 'png8', compression: 'png8', paletteId: '1,1', duplicatePolicy: 'preserve-separate', crop: { mode: 'none', axisDeltaX: 0, axisDeltaY: 0 }, source: fixtureSource('input/b.png', existingB, 5, 2) },
        { entryId: 'old-c', group: 10, number: 5, axisX: 14, axisY: 18, colorDepth: 8, format: 'png8', compression: 'png8', paletteId: '1,1', duplicatePolicy: 'preserve-separate', crop: { mode: 'none', axisDeltaX: 0, axisDeltaY: 0 }, source: fixtureSource('input/a.png', existingA, 4, 3) }
      ],
      palettes: [{ entryId: 'palette:1,1', group: 1, number: 1, tableOrder: 'sff', duplicatePolicy: 'preserve-separate', colors: fixturePalette(), source: fixtureSource('input/a.png', existingA, 4, 3) }],
      decisions: [], options: { shared: {}, backends: {} }
    });
    const existingSff = path.join(root, 'existing.sff');
    fs.writeFileSync(existingSff, createSffV21Png8Bytes(existingSpec, { sources: new Map([['input/a.png', existingA], ['input/b.png', existingB]]) }));
    fs.writeFileSync(path.join(root, 'added.png'), added);
    const addManifest = path.join(root, 'add-manifest.csv');
    fs.writeFileSync(addManifest, ['OriginalRelativePath,ComputedGroup,ImageIndex,AxisX,AxisY,SourceSHA256,ReviewStatus', `added.png,20,6,30,40,${sha(added)},APPROVED`, ''].join('\r\n'));
    const addBuild = path.join(root, 'add-build'), addCandidate = path.join(addBuild, 'candidate.sff');
    const addResult = await createBuildPackage({ sourceRoot: root, manifestPath: addManifest, outputDirectory: addBuild, outputSff: existingSff, candidateOutputSff: addCandidate, paletteSourceSff: existingSff, preserveArchiveSprites: true, addedSpritePaletteId: '1,1', includeStagedPalettes: false, buildProfile: { getHitIndexing: { enabled: false } }, duplicateHandling: { sprites: 'preserve-separate', palettes: 'share-identical' } });
    assert.deepStrictEqual(addResult.mapping.map(entry => `${entry.group},${entry.index}`), ['0,0', '10,4', '10,5', '20,6'], 'small-batch intake preserves every existing physical entry and appends new sprites');
    assert.deepStrictEqual(addResult.mapping.slice(0, 3).map(entry => [entry.axisX, entry.axisY]), [[10, 20], [-7, 9], [14, 18]], 'untouched axes and physical entries are preserved');
    assert.strictEqual(addResult.mapping[3].palette, '1,1', 'new sprites receive the explicitly reviewed target palette');
    assert.strictEqual(addResult.specification.options.shared.preserveArchiveSprites, true);
    assert.strictEqual(addResult.specification.options.shared.addedSpritePaletteId, '1,1');
    assert.strictEqual(addResult.specification.target.archiveFingerprint, sha(fs.readFileSync(existingSff)).toLowerCase());
    const insertedBuild = path.join(root, 'inserted-build'), insertedResult = await createBuildPackage({ sourceRoot: root, manifestPath: addManifest, outputDirectory: insertedBuild, outputSff: existingSff, candidateOutputSff: path.join(insertedBuild, 'candidate.sff'), paletteSourceSff: existingSff, preserveArchiveSprites: true, reviewedInsertionPhysicalIndex: 1, addedSpritePaletteId: '1,1', includeStagedPalettes: false, buildProfile: { getHitIndexing: { enabled: false } }, duplicateHandling: { sprites: 'preserve-separate', palettes: 'share-identical' } });
    assert.deepStrictEqual(insertedResult.mapping.map(entry => `${entry.group},${entry.index}`), ['0,0', '20,6', '10,4', '10,5'], 'an exact reviewed Transfer boundary inserts new sprites into the preserved physical table');
    const reviewedManifest = path.join(root, 'reviewed-physical-manifest.csv');
    fs.writeFileSync(reviewedManifest, ['OriginalRelativePath,SourceIdentity,ComputedGroup,ImageIndex,AxisX,AxisY,SourceSHA256,ReviewStatus,DuplicatePolicy', `added.png,owner@0,20,6,30,40,${sha(added)},APPROVED,preserve-separate`, `added.png,link@1,20,7,31,41,${sha(added)},APPROVED,share-identical`, ''].join('\r\n'));
    const reviewedPlan = { schema: 'ikemaker.reviewed-physical-sprite-plan', version: 1, destinationFingerprint: sha(fs.readFileSync(existingSff)), insertionPhysicalIndex: 1, rows: [
      { manifestOrdinal: 0, sourceIdentity: 'owner@0', action: 'insert', destinationPhysicalIndex: null, linkTargetManifestOrdinal: null },
      { manifestOrdinal: 1, sourceIdentity: 'link@1', action: 'insert', destinationPhysicalIndex: null, linkTargetManifestOrdinal: 0 }
    ] };
    const reviewedEvidence = Buffer.from('{"schema":"reviewed-link-test"}\n'), reviewedEvidencePath = path.join(root, 'reviewed-link-evidence.json'); fs.writeFileSync(reviewedEvidencePath, reviewedEvidence);
    const reviewedBuild = path.join(root, 'reviewed-physical-build'), reviewedResult = await createBuildPackage({ sourceRoot: root, manifestPath: reviewedManifest, outputDirectory: reviewedBuild, outputSff: existingSff, candidateOutputSff: path.join(reviewedBuild, 'candidate.sff'), paletteSourceSff: existingSff, preserveArchiveSprites: true, reviewedInsertionPhysicalIndex: 1, reviewedPhysicalSpritePlan: reviewedPlan, reviewEvidence: { identity: path.basename(reviewedEvidencePath), byteHash: sha(reviewedEvidence) }, addedSpritePaletteId: '1,1', includeStagedPalettes: false, buildProfile: { getHitIndexing: { enabled: false } }, duplicateHandling: { sprites: 'preserve-separate', palettes: 'share-identical' } });
    assert.deepStrictEqual(reviewedResult.mapping.map(entry => `${entry.group},${entry.index}`), ['0,0', '20,6', '20,7', '10,4', '10,5']);
    assert.strictEqual(reviewedResult.specification.sprites[2].linkTargetEntryId, reviewedResult.specification.sprites[1].entryId, 'reviewed incoming topology links to the exact incoming owner');
    assert.deepStrictEqual(reviewedResult.specification.options.shared.reviewedPhysicalSpritePlan.rows, reviewedPlan.rows);
    const linkTargetBefore=Buffer.from(fs.readFileSync(existingSff)),reviewedLinkCandidate=await executeGeneratedBuild(reviewedResult,{confirmAdoption:async()=>false});assert.equal(reviewedLinkCandidate.backend.id,'ikemaker-builtin-reviewed-physical-transfer');assert.equal(reviewedLinkCandidate.cancelled,true);assert(fs.readFileSync(existingSff).equals(linkTargetBefore),'reviewed exact-link candidate validation does not mutate the active SFF when adoption is cancelled');
    await assert.rejects(createBuildPackage({ sourceRoot: root, manifestPath: reviewedManifest, outputDirectory: path.join(root, 'tampered-reviewed-build'), outputSff: existingSff, candidateOutputSff: path.join(root, 'tampered-reviewed-candidate.sff'), paletteSourceSff: existingSff, preserveArchiveSprites: true, reviewedInsertionPhysicalIndex: 1, reviewedPhysicalSpritePlan: { ...reviewedPlan, unexpected: true }, addedSpritePaletteId: '1,1', includeStagedPalettes: false, buildProfile: { getHitIndexing: { enabled: false } }, duplicateHandling: { sprites: 'preserve-separate', palettes: 'share-identical' } }), /missing or unsupported fields/);
    const duplicateSpec = createSffBuildSpecification({ ...existingSpec, planId: 'duplicate-coordinate-destination', sprites: [existingSpec.sprites[0], existingSpec.sprites[1], { ...existingSpec.sprites[2], number: 4 }] });
    const reviewedDuplicateSff = path.join(root, 'duplicate-coordinate.sff'); fs.writeFileSync(reviewedDuplicateSff, createSffV21Png8Bytes(duplicateSpec, { sources: new Map([['input/a.png', existingA], ['input/b.png', existingB]]) }));
    const replacementManifest = path.join(root, 'reviewed-replacement-manifest.csv'); fs.writeFileSync(replacementManifest, ['OriginalRelativePath,SourceIdentity,ComputedGroup,ImageIndex,AxisX,AxisY,SourceSHA256,ReviewStatus', `added.png,replacement@0,10,4,30,40,${sha(added)},APPROVED`, ''].join('\r\n'));
    const replacementPlan = { schema: 'ikemaker.reviewed-physical-sprite-plan', version: 1, destinationFingerprint: sha(fs.readFileSync(reviewedDuplicateSff)), insertionPhysicalIndex: 3, rows: [{ manifestOrdinal: 0, sourceIdentity: 'replacement@0', action: 'replace', destinationPhysicalIndex: 2, linkTargetManifestOrdinal: null }] };
    const replacementEvidence = Buffer.from('{"schema":"reviewed-physical-test"}\n'), replacementEvidencePath = path.join(root, 'replacement-review.json'); fs.writeFileSync(replacementEvidencePath, replacementEvidence);
    const replacementResult = await createBuildPackage({ sourceRoot: root, manifestPath: replacementManifest, outputDirectory: path.join(root, 'reviewed-replacement-build'), outputSff: reviewedDuplicateSff, candidateOutputSff: path.join(root, 'reviewed-replacement-candidate.sff'), paletteSourceSff: reviewedDuplicateSff, preserveArchiveSprites: true, reviewedInsertionPhysicalIndex: 3, reviewedPhysicalSpritePlan: replacementPlan, reviewEvidence: { identity: path.basename(replacementEvidencePath), byteHash: sha(replacementEvidence) }, addedSpritePaletteId: '1,1', includeStagedPalettes: false, buildProfile: { getHitIndexing: { enabled: false } }, duplicateHandling: { sprites: 'preserve-separate', palettes: 'share-identical' } });
    assert.deepStrictEqual(replacementResult.mapping.map(entry => `${entry.group},${entry.index}`), ['0,0', '10,4', '10,4']);
    assert.equal(replacementResult.mapping[1].sourcePhysicalIndex, 1, 'the first duplicate Destination occurrence remains exact and untouched');
    assert.equal(replacementResult.mapping[2].incomingSourceIdentity, 'replacement@0', 'the reviewed second physical occurrence alone is replaced');
    const replacementBefore = Buffer.from(fs.readFileSync(reviewedDuplicateSff)), cancelledReplacement = await executeGeneratedBuild(replacementResult, { confirmAdoption: async () => false });
    assert.equal(cancelledReplacement.cancelled, true); assert.equal(cancelledReplacement.backend.id, 'ikemaker-builtin-reviewed-physical-transfer'); assert(fs.readFileSync(reviewedDuplicateSff).equals(replacementBefore), 'cancelled built-in physical adoption leaves the active SFF unchanged');
    const adoptedReplacement = await executeGeneratedBuild(replacementResult, { confirmAdoption: async () => true });
    assert.equal(adoptedReplacement.cancelled, false); assert.equal(adoptedReplacement.backend.id, 'ikemaker-builtin-reviewed-physical-transfer'); assert(fs.existsSync(adoptedReplacement.durableBackup.path)); assert(fs.existsSync(adoptedReplacement.executionReceiptPath));
    const adoptedDuplicateArchive = readSff(reviewedDuplicateSff); assert.deepStrictEqual(adoptedDuplicateArchive.sprites.map(sprite => `${sprite.group},${sprite.number}`), ['0,0','10,4','10,4']); assert.equal(adoptedDuplicateArchive.sprites[2].axisX, 30); assert.equal(adoptedDuplicateArchive.sprites[2].axisY, 40);
    await assert.rejects(createBuildPackage({ sourceRoot: root, manifestPath: addManifest, outputDirectory: path.join(root, 'bad-insertion-build'), outputSff: existingSff, candidateOutputSff: path.join(root, 'bad-insertion.sff'), paletteSourceSff: existingSff, preserveArchiveSprites: true, reviewedInsertionPhysicalIndex: 99, addedSpritePaletteId: '1,1', includeStagedPalettes: false, buildProfile: { getHitIndexing: { enabled: false } } }), /outside the Destination SFF physical table/);
    const imagePalettePng = png(3, 4, 'image-palette', 19), imagePaletteFile = path.join(root, 'image-palette.png'); fs.writeFileSync(imagePaletteFile, imagePalettePng);
    const imagePaletteManifest = path.join(root, 'image-palette-manifest.csv');
    fs.writeFileSync(imagePaletteManifest, ['OriginalRelativePath,ComputedGroup,ImageIndex,AxisX,AxisY,SourceSHA256,ReviewStatus', `image-palette.png,21,0,12,13,${sha(imagePalettePng)},APPROVED`, ''].join('\r\n'));
    const imagePaletteBuild = path.join(root, 'image-palette-build');
    const imagePaletteResult = await createBuildPackage({ sourceRoot: root, manifestPath: imagePaletteManifest, outputDirectory: imagePaletteBuild, outputSff: existingSff, candidateOutputSff: path.join(imagePaletteBuild, 'candidate.sff'), paletteSourceSff: existingSff, preserveArchiveSprites: true, imagePaletteIntake: { group: 7 }, includeStagedPalettes: false, buildProfile: { getHitIndexing: { enabled: false } }, duplicateHandling: { sprites: 'preserve-separate', palettes: 'preserve-separate' } });
    assert.strictEqual(imagePaletteResult.mapping.find(entry => entry.group === 21 && entry.index === 0).palette, '7,0', 'existing-archive image palette intake assigns the exact append slot');
    assert.deepStrictEqual(imagePaletteResult.specification.palettes.map(entry => `${entry.group},${entry.number}`), ['1,1', '7,0'], 'the source table is preserved and the reviewed image palette is appended');
    assert.strictEqual(imagePaletteResult.specification.palettes[1].source.provenance.kind, 'staged-image-palette');
    assert.deepStrictEqual(imagePaletteResult.specification.options.shared.imagePaletteIntake, { group: 7, tableOrder: 'index' });
    const photoshopOrderBuild = path.join(root, 'image-palette-reversed-build');
    const photoshopOrderResult = await createBuildPackage({ sourceRoot: root, manifestPath: imagePaletteManifest, outputDirectory: photoshopOrderBuild, outputSff: existingSff, candidateOutputSff: path.join(photoshopOrderBuild, 'candidate.sff'), paletteSourceSff: existingSff, preserveArchiveSprites: true, imagePaletteIntake: { group: 7, tableOrder: 'reversed' }, includeStagedPalettes: false, buildProfile: { getHitIndexing: { enabled: false } }, duplicateHandling: { sprites: 'preserve-separate', palettes: 'preserve-separate' } });
    assert.deepStrictEqual(photoshopOrderResult.specification.palettes[1].colors.map(color => color.slice(0, 3)), [...imagePaletteResult.specification.palettes[1].colors].reverse().map(color => color.slice(0, 3)), 'Photoshop order reverses the retained image palette RGB table');
    assert.strictEqual(photoshopOrderResult.specification.palettes[1].colors[0][3], 0, 'the reversed table still normalizes SFF transparent index 0');
    assert.deepStrictEqual(photoshopOrderResult.specification.options.shared.imagePaletteIntake, { group: 7, tableOrder: 'reversed' });
    assert.strictEqual(builtInComparisonAvailability(imagePaletteResult).available, true, 'reviewed existing-archive image palette intake remains eligible for Compare Both');
    const deletionManifest = path.join(root, 'deletion-manifest.csv');
    fs.writeFileSync(deletionManifest, 'OriginalRelativePath,ComputedGroup,ImageIndex,AxisX,AxisY,SourceSHA256,ReviewStatus\r\n');
    const deletionBuild = path.join(root, 'deletion-build');
    const deletionResult = await createBuildPackage({ sourceRoot: root, manifestPath: deletionManifest, outputDirectory: deletionBuild, outputSff: existingSff, candidateOutputSff: path.join(deletionBuild, 'candidate.sff'), paletteSourceSff: existingSff, preserveArchiveSprites: true, deletedSpriteIdentities: ['10,4'], includeStagedPalettes: false, buildProfile: { getHitIndexing: { enabled: false } }, duplicateHandling: { sprites: 'preserve-separate', palettes: 'preserve-separate' } });
    assert.deepStrictEqual(deletionResult.mapping.map(entry => `${entry.group},${entry.index}`), ['0,0', '10,5'], 'reviewed deletion removes exactly one identity while preserving physical order');
    assert.deepStrictEqual(deletionResult.specification.options.shared.deletedSpriteIdentities, ['10,4']);
    assert(!deletionResult.specification.sprites.some(entry => entry.group === 10 && entry.number === 4));
    await assert.rejects(createBuildPackage({ sourceRoot: root, manifestPath: deletionManifest, outputDirectory: path.join(root, 'deletion-missing'), outputSff: existingSff, candidateOutputSff: path.join(root, 'deletion-missing.sff'), paletteSourceSff: existingSff, preserveArchiveSprites: true, deletedSpriteIdentities: ['99,99'], includeStagedPalettes: false, buildProfile: { getHitIndexing: { enabled: false } } }), /requires exactly one matching physical archive entry; found 0/);
    await assert.rejects(createBuildPackage({ sourceRoot: root, manifestPath: deletionManifest, outputDirectory: path.join(root, 'deletion-unpreserved'), outputSff: existingSff, candidateOutputSff: path.join(root, 'deletion-unpreserved.sff'), paletteSourceSff: existingSff, preserveArchiveSprites: false, deletedSpriteIdentities: ['10,4'], includeStagedPalettes: false, buildProfile: { getHitIndexing: { enabled: false } } }), /requires preserveArchiveSprites/);
    const mixedCropManifest = path.join(root, 'mixed-crop-add-manifest.csv');
    fs.writeFileSync(mixedCropManifest, ['OriginalRelativePath,ComputedGroup,ImageIndex,AxisX,AxisY,SourceSHA256,ReviewStatus', `added.png,20,6,30,40,${sha(added)},APPROVED`, `added.png,20,7,31,41,${sha(added)},APPROVED`, ''].join('\r\n'));
    const mixedCropBuild = path.join(root, 'mixed-crop-build');
    const mixedCropResult = await createBuildPackage({ sourceRoot: root, manifestPath: mixedCropManifest, outputDirectory: mixedCropBuild, outputSff: existingSff, candidateOutputSff: path.join(mixedCropBuild, 'candidate.sff'), paletteSourceSff: existingSff, preserveArchiveSprites: true, addedSpritePaletteId: '1,1', autocropIdentities: ['20,6'], includeStagedPalettes: false, buildProfile: { getHitIndexing: { enabled: false } }, duplicateHandling: { sprites: 'preserve-separate', palettes: 'share-identical' } });
    assert.deepStrictEqual(mixedCropResult.mapping.map(entry => `${entry.group},${entry.index}`), ['0,0', '10,4', '10,5', '20,6', '20,7'], 'autocrop selection must not silently filter uncropped incoming Creator rows');
    assert.strictEqual(mixedCropResult.specification.sprites.find(entry => `${entry.group},${entry.number}` === '20,6').crop.mode, 'autocrop');
    assert.strictEqual(mixedCropResult.specification.sprites.find(entry => `${entry.group},${entry.number}` === '20,7').crop.mode, 'none');
    assert.strictEqual(mixedCropResult.specification.options.shared.manifestScopeIdentities, null, 'Creator autocrop is distinct from a partial-manifest rebuild scope');
    const temporaryManifest = path.join(root, 'temporary-add-manifest.csv');
    fs.writeFileSync(temporaryManifest, ['OriginalRelativePath,ComputedGroup,ImageIndex,AxisX,AxisY,SourceSHA256,ReviewStatus,Placeholder,PlaceholderNote,PlaceholderOwnerId', `added.png,20,7,30,40,${sha(added)},APPROVED,YES,Temporary beard alignment,owner-beard-001`, ''].join('\r\n'));
    const temporaryBuild = path.join(root, 'temporary-build');
    const temporaryResult = await createBuildPackage({
      sourceRoot: root, manifestPath: temporaryManifest, outputDirectory: temporaryBuild, outputSff: existingSff, candidateOutputSff: path.join(temporaryBuild, 'candidate.sff'),
      paletteSourceSff: existingSff, preserveArchiveSprites: true, includeStagedPalettes: false,
      sharedPalettePath, sharedPaletteId: '9,1', addedSpritePaletteId: '9,1',
      temporaryPaletteLifecycle: { lifecycleId: 'temp-beard-alignment', paletteId: '9,1', note: 'Temporary beard alignment' },
      buildProfile: { getHitIndexing: { enabled: false } }, duplicateHandling: { sprites: 'preserve-separate', palettes: 'preserve-separate' }
    });
    assert.deepStrictEqual(temporaryResult.mapping.slice(0, 3).map(entry => entry.palette), ['1,1', '1,1', '1,1'], 'temporary palette intake preserves existing sprite assignments');
    assert.strictEqual(temporaryResult.mapping[3].palette, '9,1', 'only the reviewed placeholder batch receives the temporary palette');
    assert.deepStrictEqual(temporaryResult.specification.palettes.map(entry => `${entry.group},${entry.number}`), ['1,1', '9,1'], 'the temporary palette appends after the preserved palette table');
    assert.strictEqual(temporaryResult.specification.palettes[1].source.provenance.kind, 'temporary-placeholder-palette');
    assert.deepStrictEqual(temporaryResult.specification.options.shared.temporaryPalettes[0].ownerSpriteIds, ['sprite:3:20,7']);
    assert.strictEqual(temporaryResult.specification.options.shared.temporaryPalettes[0].owners[0].ownerId, 'owner-beard-001');
    assert.strictEqual(temporaryResult.specification.options.shared.temporaryPalettes[0].paletteId, '9,1');
    assert.deepStrictEqual(temporaryResult.receipt.temporaryPalettes, temporaryResult.specification.options.shared.temporaryPalettes);
    const lifecycleSpec = createSffBuildSpecification({
      planId: 'temporary-lifecycle-fixture', sourceRoot: 'input', target: { archiveIdentity: 'temporary-lifecycle.sff', archiveFingerprint: null, sffVersion: '2.1' },
      requirements: existingSpec.requirements,
      sprites: [...existingSpec.sprites.map(entry => ({ ...entry })), { ...existingSpec.sprites[0], entryId: 'temporary-owner', group: 20, number: 7, axisX: 30, axisY: 40, paletteId: '9,1', source: fixtureSource('input/a.png', existingA, 4, 3) }],
      palettes: [...existingSpec.palettes.map(entry => ({ ...entry })), { ...existingSpec.palettes[0], entryId: 'palette:9,1', group: 9, number: 1 }], decisions: [], options: { shared: {}, backends: {} }
    });
    const lifecycleSff = path.join(root, 'temporary-lifecycle.sff');
    fs.writeFileSync(lifecycleSff, createSffV21Png8Bytes(lifecycleSpec, { sources: new Map([['input/a.png', existingA], ['input/b.png', existingB]]) }));
    const lifecycleRecord = { lifecycleId: 'temp-beard-alignment', paletteId: '9,1', ownerSpriteIds: ['sprite:3:20,7'], owners: [{ ownerId: 'owner-beard-001', entryId: 'sprite:3:20,7', group: 20, number: 7 }], note: 'Temporary beard alignment' };
    const registry = mergeLifecycleRegistry(lifecycleSff, [lifecycleRecord], { sourceSffHash: sha(fs.readFileSync(lifecycleSff)).toLowerCase(), specificationHash: lifecycleSpec.specificationHash });
    fs.mkdirSync(path.dirname(lifecycleRegistryPath(lifecycleSff)), { recursive: true }); fs.writeFileSync(lifecycleRegistryPath(lifecycleSff), `${JSON.stringify(registry, null, 2)}\n`);
    const cleanupReview = archiveTemporaryPaletteCleanupReview(lifecycleSff, readSff(lifecycleSff), ['20,7']);
    assert.deepStrictEqual(cleanupReview.eligible.map(entry => entry.paletteId), ['9,1'], 'removing the last exact placeholder owner proposes its temporary palette for the same atomic rebuild');
    const cleanupBuild = path.join(root, 'temporary-cleanup-build');
    const cleanupResult = await createBuildPackage({ sourceRoot: root, manifestPath: deletionManifest, outputDirectory: cleanupBuild, outputSff: lifecycleSff, candidateOutputSff: path.join(cleanupBuild, 'candidate.sff'), paletteSourceSff: lifecycleSff, preserveArchiveSprites: true, deletedSpriteIdentities: ['20,7'], reviewedTemporaryPaletteCleanup: cleanupReview, includeStagedPalettes: false, buildProfile: { getHitIndexing: { enabled: false } }, duplicateHandling: { sprites: 'preserve-separate', palettes: 'preserve-separate' } });
    assert(!cleanupResult.specification.sprites.some(entry => entry.group === 20 && entry.number === 7), 'the reviewed last placeholder owner is removed');
    assert(!cleanupResult.specification.palettes.some(entry => entry.group === 9 && entry.number === 1), 'the now-unowned temporary palette is removed from the same candidate');
    assert.deepStrictEqual(cleanupResult.placeholderLifecycleRegistry.removeLifecycleIds, ['temp-beard-alignment'], 'the matching lifecycle record is removed only with candidate adoption');
    assert.strictEqual(cleanupResult.reviewedTemporaryPaletteCleanup.eligible[0].paletteId, '9,1', 'the immutable package seals the exact cleanup evidence');
    assert.strictEqual(cleanupResult.reviewedTemporaryPaletteCleanup.sourceSff, undefined, 'portable cleanup evidence does not leak an absolute workspace path into the build specification');
    fs.writeFileSync(path.join(root, 'late-reference.zss'), 'RemapPal { source: 9,1; destination: 1,1 }\n');
    await assert.rejects(createBuildPackage({ sourceRoot: root, manifestPath: deletionManifest, outputDirectory: path.join(root, 'temporary-cleanup-stale'), outputSff: lifecycleSff, candidateOutputSff: path.join(root, 'temporary-cleanup-stale.sff'), paletteSourceSff: lifecycleSff, preserveArchiveSprites: true, deletedSpriteIdentities: ['20,7'], reviewedTemporaryPaletteCleanup: cleanupReview, includeStagedPalettes: false, buildProfile: { getHitIndexing: { enabled: false } } }), /cleanup evidence changed after review/, 'authored palette references added after review must invalidate cleanup');
    fs.unlinkSync(path.join(root, 'late-reference.zss'));
    await assert.rejects(createBuildPackage({ sourceRoot: root, manifestPath: temporaryManifest, outputDirectory: path.join(root, 'temporary-conflict'), outputSff: existingSff, candidateOutputSff: path.join(root, 'temporary-conflict.sff'), paletteSourceSff: existingSff, preserveArchiveSprites: true, includeStagedPalettes: false, sharedPalettePath, sharedPaletteId: '1,1', addedSpritePaletteId: '1,1', temporaryPaletteLifecycle: { lifecycleId: 'conflict', paletteId: '1,1' }, buildProfile: { getHitIndexing: { enabled: false } } }), /conflicts with an existing/);
    if (process.platform === 'win32' && fs.existsSync(addResult.sprmake)) {
      const built = spawnSync(addResult.sprmake, [addResult.definitionPath], { cwd: addResult.outputDirectory, windowsHide: true, encoding: 'utf8' });
      assert.strictEqual(built.status, 0, `small-batch SprMake2 candidate failed: ${built.stdout || ''}\n${built.stderr || ''}`);
      assert(fs.existsSync(addResult.candidateOutputSff), `small-batch SprMake2 produced no candidate: ${built.stdout || ''}\n${built.stderr || ''}`);
      const verified = verifyCandidateArchive(addResult.candidateOutputSff, addResult);
      assert.strictEqual(verified.strict.status, 'passed', 'small-batch candidate passes the independent strict validator');
      assert.strictEqual(sha(fs.readFileSync(existingSff)).toLowerCase(), addResult.specification.target.archiveFingerprint, 'building the candidate does not mutate the active target');
      const imagePaletteBuilt = spawnSync(imagePaletteResult.sprmake, [imagePaletteResult.definitionPath], { cwd: imagePaletteResult.outputDirectory, windowsHide: true, encoding: 'utf8' });
      assert.strictEqual(imagePaletteBuilt.status, 0, `image-palette SprMake2 candidate failed: ${imagePaletteBuilt.stdout || ''}\n${imagePaletteBuilt.stderr || ''}`);
      assert.strictEqual(verifyCandidateArchive(imagePaletteResult.candidateOutputSff, imagePaletteResult).strict.status, 'passed', 'existing-archive image palette intake passes independent strict verification');
      const deletionBuilt = spawnSync(deletionResult.sprmake, [deletionResult.definitionPath], { cwd: deletionResult.outputDirectory, windowsHide: true, encoding: 'utf8' });
      assert.strictEqual(deletionBuilt.status, 0, `deletion SprMake2 candidate failed: ${deletionBuilt.stdout || ''}\n${deletionBuilt.stderr || ''}`);
      assert.strictEqual(verifyCandidateArchive(deletionResult.candidateOutputSff, deletionResult).strict.status, 'passed', 'reviewed deletion candidate passes independent strict verification');
    }
    const duplicateSff = path.join(root, 'duplicate-identity.sff'), duplicateBytes = Buffer.from(fs.readFileSync(existingSff));
    const spriteTable = duplicateBytes.readUInt32LE(36), thirdSprite = spriteTable + (2 * 28);
    duplicateBytes.writeUInt16LE(10, thirdSprite); duplicateBytes.writeUInt16LE(4, thirdSprite + 2); fs.writeFileSync(duplicateSff, duplicateBytes);
    await assert.rejects(createBuildPackage({ sourceRoot: root, manifestPath: addManifest, outputDirectory: path.join(root, 'ambiguous-build'), outputSff: duplicateSff, candidateOutputSff: path.join(root, 'ambiguous.sff'), paletteSourceSff: duplicateSff, preserveArchiveSprites: true, addedSpritePaletteId: '1,1', includeStagedPalettes: false, buildProfile: { getHitIndexing: { enabled: false } } }), /SprMake2 requires unique group\/index pairs/);
    await assert.rejects(createBuildPackage({ sourceRoot: root, manifestPath: addManifest, outputDirectory: path.join(root, 'bad-palette-build'), outputSff: existingSff, candidateOutputSff: path.join(root, 'bad.sff'), paletteSourceSff: existingSff, preserveArchiveSprites: true, addedSpritePaletteId: '9,9', includeStagedPalettes: false, buildProfile: { getHitIndexing: { enabled: false } } }), /selected target palette 9,9 does not exist/);

    const staleBuild = path.join(root, 'stale-build'), reviewedTargetSnapshot = { filename: target, exists: true, hash: sha(activeBytes).toLowerCase() };
    fs.writeFileSync(target, Buffer.from('target-changed-after-review'));
    await assert.rejects(
      createBuildPackage({ sourceRoot: root, manifestPath: manifest, outputDirectory: staleBuild, outputSff: target, candidateOutputSff: path.join(staleBuild, '.candidate.sff'), targetSnapshot: reviewedTargetSnapshot, buildProfile: { getHitIndexing: { enabled: false } }, duplicateHandling: { sprites: 'preserve-separate', palettes: 'share-identical' } }),
      /target SFF changed/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log('SFF package physical order, immutable specification/receipt, target fingerprint, and duplicate-policy tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
