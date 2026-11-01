'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { createSffBuildSpecification } = require('../src/sff_build_specification');
const { createSffV21Bytes } = require('../src/sff_v21_writer');
const { assertSffV21Mixed, SFF_V21_MIXED_VALIDATOR_ID, SFF_V21_MIXED_VALIDATOR_VERSION, SFF_V21_MIXED_VALIDATOR_PROFILE } = require('../src/sff_v21_mixed_strict_validator');
const { encodeIndexed } = require('../src/sff_palette_remap');
const { crc32, readIndexedPng8 } = require('../src/sff_png8_source');
const { createCertificationLedger } = require('../src/sff_runtime_certification');

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const colors = seed => Array.from({ length: 256 }, (_, index) => [(index * 17 + seed) & 255, (255 - index + seed) & 255, (index * 3 + seed) & 255, index === 0 ? 0 : 255]);

function pngChunk(type, data) {
  const name = Buffer.from(type), result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0); name.copy(result, 4); data.copy(result, 8); result.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return result;
}

function paeth(left, up, upperLeft) {
  const p = left + up - upperLeft, leftDistance = Math.abs(p - left), upDistance = Math.abs(p - up), diagonalDistance = Math.abs(p - upperLeft);
  return leftDistance <= upDistance && leftDistance <= diagonalDistance ? left : upDistance <= diagonalDistance ? up : upperLeft;
}

function noncanonicalIndexedPng(options = {}) {
  const width = 4, height = 5, indices = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  const palette = Buffer.alloc(768); for (let index = 0; index < 256; index += 1) { palette[index * 3] = (index * 11) & 255; palette[index * 3 + 1] = 255 - index; palette[index * 3 + 2] = (index * 7) & 255; }
  const partialTransparency = options.partialTransparency !== false;
  const alpha = partialTransparency ? Buffer.from([0, 48, 96, 144, 192, 224]) : Buffer.from([0]), raw = Buffer.alloc(height * (width + 1));
  for (let y = 0; y < height; y += 1) {
    const filter = y, at = y * (width + 1); raw[at] = filter;
    for (let x = 0; x < width; x += 1) {
      const value = indices[y * width + x], left = x ? indices[y * width + x - 1] : 0, up = y ? indices[(y - 1) * width + x] : 0, upperLeft = x && y ? indices[(y - 1) * width + x - 1] : 0;
      const predictor = filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? paeth(left, up, upperLeft) : 0;
      raw[at + x + 1] = (value - predictor + 256) & 255;
    }
  }
  const compressed = zlib.deflateSync(raw), split = Math.max(1, Math.floor(compressed.length / 2)), ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 3;
  const bytes = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), pngChunk('IHDR', ihdr), pngChunk('tEXt', Buffer.from('IKEMaker\0noncanonical-source')), pngChunk('PLTE', palette), pngChunk('tRNS', alpha), pngChunk('IDAT', compressed.subarray(0, split)), pngChunk('IDAT', compressed.subarray(split)), pngChunk('IEND', Buffer.alloc(0))]);
  const decoded = readIndexedPng8(bytes);
  if (!decoded.indices.equals(indices)) throw new Error('Internal noncanonical PNG fixture encoding did not round-trip its reviewed indexes.');
  return { name: 'mixed-filters-split-idat', bytes, source: { relativePath: 'input/mixed-filters-split-idat.png', byteHash: sha256(bytes), decodedHash: decoded.decodedHash, width, height, provenance: { kind: 'runtime-certification-noncanonical-png8', filters: [0, 1, 2, 3, 4], splitIdat: true, partialTransparency } } };
}

function image(name, width, height, indices, palette) {
  const bytes = encodeIndexed(width, height, Buffer.from(indices), palette), decoded = readIndexedPng8(bytes);
  return { name, bytes, source: { relativePath: `input/${name}.png`, byteHash: sha256(bytes), decodedHash: decoded.decodedHash, width, height, provenance: { kind: 'runtime-certification-fixture' } } };
}

function trueColorImage(name, width, height, colorType, pixels) {
  const channels = colorType === 2 ? 3 : 4, ihdr = Buffer.alloc(13), raw = Buffer.alloc(height * (width * channels + 1));
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = colorType;
  for (let y = 0; y < height; y += 1) pixels.copy(raw, y * (width * channels + 1) + 1, y * width * channels, (y + 1) * width * channels);
  const bytes = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
  return { name, bytes, source: { relativePath: `input/${name}.png`, byteHash: sha256(bytes), decodedHash: sha256(pixels), width, height, provenance: { kind: 'runtime-certification-truecolor' } } };
}

function palette(entryId, group, number, sourceImage, linkTargetEntryId = null) {
  return { entryId, group, number, tableOrder: 'sff', duplicatePolicy: linkTargetEntryId ? 'share-identical' : 'preserve-separate', ...(linkTargetEntryId ? { linkTargetEntryId } : {}), colors: readIndexedPng8(sourceImage.bytes).colors, source: sourceImage.source };
}

function sprite(entryId, group, number, axisX, axisY, sourceImage, paletteId, options = {}) {
  return { entryId, group, number, axisX, axisY, colorDepth: 8, format: 'png8', compression: 'png8', paletteId, duplicatePolicy: options.linkTargetEntryId ? 'share-identical' : 'preserve-separate', ...(options.linkTargetEntryId ? { linkTargetEntryId: options.linkTargetEntryId } : {}), crop: { mode: options.cropMode || 'none', axisDeltaX: 0, axisDeltaY: 0 }, source: sourceImage.source };
}

function trueColorSprite(entryId, group, number, axisX, axisY, sourceImage, format, options = {}) {
  const colorDepth = format === 'png24' ? 24 : 32;
  return { entryId, group, number, axisX, axisY, colorDepth, format, compression: format, paletteId: null, duplicatePolicy: options.linkTargetEntryId ? 'share-identical' : 'preserve-separate', ...(options.linkTargetEntryId ? { linkTargetEntryId: options.linkTargetEntryId } : {}), crop: { mode: 'none', axisDeltaX: 0, axisDeltaY: 0 }, source: sourceImage.source };
}

function specification(id, sprites, palettes) {
  return createSffBuildSpecification({
    planId: `runtime-certification-${id}`, sourceRoot: 'input', target: { archiveIdentity: `${id}.sff`, archiveFingerprint: null, sffVersion: '2.1' }, sprites, palettes,
    requirements: ['sff-v2.1', 'preserve-authored-physical-order', 'immutable-source-snapshots', 'candidate-before-adoption', ...(sprites.some(row => row.format === 'png8') ? ['sprite-png8'] : []), ...(sprites.some(row => row.format !== 'png8') ? ['sprite-truecolor'] : []), ...(palettes.length ? ['embedded-palettes'] : [])],
    decisions: [], options: { shared: { runtimeCertification: true, fixtureId: id }, backends: { builtIn: { adoptionAllowed: false } } }
  });
}

function cases() {
  const baseColors = colors(0), alternateColors = colors(29), storedColors = colors(113);
  const pixel = image('one-pixel', 1, 1, [0], baseColors);
  const block = image('indexed-block', 3, 2, [0, 1, 254, 255, 33, 77], alternateColors);
  const afterAxisBlock = { ...block, source: { ...block.source, provenance: { kind: 'approved-manifest-source', preparation: { kind: 'after-axis-crop', bounds: '1,1,3,2', outputByteHash: block.source.byteHash, axisDeltaX: -1, axisDeltaY: -1, originalAxis: '101,-99' } } } };
  const noncanonical = noncanonicalIndexedPng();
  const rgbPixels = Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 250, 240, 230]), rgbaPixels = Buffer.from([255, 0, 0, 0, 0, 255, 0, 64, 0, 0, 255, 128, 250, 240, 230, 255]);
  const rgb24 = trueColorImage('rgb24-block', 2, 2, 2, rgbPixels), rgba32 = trueColorImage('rgba32-block', 2, 2, 6, rgbaPixels);
  return [
    { id: 'empty-built-in-only', purpose: 'Deterministic header-only SFF v2.1 archive; built-in-only until an empty SprMake2 parity route is proven.', builtInOnly: true, sprites: [], palettes: [] },
    { id: 'minimal', purpose: 'Smallest supported PNG8 archive.', sprites: [sprite('sprite:minimal', 0, 0, 0, 0, pixel, 'palette:base')], palettes: [palette('palette:base', 1, 1, pixel)] },
    { id: 'signed-boundaries', purpose: 'Maximum group/index and signed axis limits.', sprites: [sprite('sprite:max', 65535, 65535, -32768, 32767, block, 'palette:block'), sprite('sprite:sparse', 0, 65000, 32767, -32768, block, 'palette:block')], palettes: [palette('palette:block', 65535, 65535, block)] },
    { id: 'prepared-before-axis', purpose: 'A sealed final PNG8 snapshot reviewed as crop-before-axis.', sprites: [sprite('sprite:prepared', 20, 4, 1, 1, block, 'palette:block', { cropMode: 'before-axis' })], palettes: [palette('palette:block', 1, 1, block)] },
    { id: 'prepared-after-axis', purpose: 'A sealed final PNG8 snapshot with an original-canvas axis and exact crop-origin delta.', sprites: [{ ...sprite('sprite:prepared-after', 21, 5, 101, -99, afterAxisBlock, 'palette:after'), crop: { mode: 'after-axis', axisDeltaX: -1, axisDeltaY: -1 } }], palettes: [palette('palette:after', 1, 1, afterAxisBlock)] },
    { id: 'stored-palette-overrides-png', purpose: 'Indexed PNG pixels interpreted through an explicit stored palette whose colors differ from the PNG PLTE; physical SprMake2 parity is golden-certified.', sprites: [sprite('sprite:stored-palette', 12, 34, -27, 61, block, 'palette:stored')], palettes: [{ ...palette('palette:stored', 9, 9, block), colors: storedColors, source: { ...block.source, provenance: { kind: 'portable-sprmake2-recipe-palette' } } }] },
    { id: 'linked-data', purpose: 'Backward sprite and palette links with independent axes.', sprites: [sprite('sprite:base', 30, 0, -12, 44, block, 'palette:base'), sprite('sprite:linked', 30, 1, 5, -6, block, 'palette:linked', { linkTargetEntryId: 'sprite:base' })], palettes: [palette('palette:base', 1, 1, block), palette('palette:linked', 1, 2, block, 'palette:base')] },
    { id: 'own-image-palettes-multihop-alpha', purpose: 'Creator own-image palette identities, non-sorted multihop links, filters 0–4, split IDAT chunks and partial tRNS alpha; built-in-only because SprMake2 cannot preserve partial palette alpha.', builtInOnly: true, sprites: [sprite('sprite:own-base', 40, 9, -15, 38, noncanonical, 'palette:own-base'), sprite('sprite:own-link-1', 3, 700, 4, -5, noncanonical, 'palette:own-link-1', { linkTargetEntryId: 'sprite:own-base' }), sprite('sprite:own-link-2', 60000, 2, 99, -101, noncanonical, 'palette:own-link-2', { linkTargetEntryId: 'sprite:own-link-1' })], palettes: [palette('palette:own-base', 40, 9, noncanonical), palette('palette:own-link-1', 3, 700, noncanonical, 'palette:own-base'), palette('palette:own-link-2', 60000, 2, noncanonical, 'palette:own-link-1')] },
    { id: 'repeated-identity-built-in-only', purpose: 'Distinct physical entries sharing group/index; no bundled-SprMake2 parity claim.', builtInOnly: true, sprites: [sprite('sprite:repeat-a', 3, 7, -4, 9, pixel, 'palette:base'), sprite('sprite:repeat-b', 3, 7, 12, -6, block, 'palette:block')], palettes: [palette('palette:base', 1, 1, pixel), palette('palette:block', 1, 2, block)] },
    { id: 'truecolor-rgb24-rgba32', purpose: 'Exact RGB24 and RGBA32 payloads, alpha, and a backward RGBA32 data link.', builtInOnly: true, sprites: [trueColorSprite('sprite:rgb24', 50, 0, -4, 9, rgb24, 'png24'), trueColorSprite('sprite:rgba32', 50, 1, 4, -9, rgba32, 'png32'), trueColorSprite('sprite:rgba32-link', 50, 2, 11, 12, rgba32, 'png32', { linkTargetEntryId: 'sprite:rgba32' })], palettes: [] }
  ].map(item => ({ ...item, sources: new Map([[pixel.source.relativePath, pixel.bytes], [block.source.relativePath, block.bytes], [noncanonical.source.relativePath, noncanonical.bytes], [rgb24.source.relativePath, rgb24.bytes], [rgba32.source.relativePath, rgba32.bytes]]) }));
}

function generate(outputDirectory) {
  const root = path.resolve(String(outputDirectory || ''));
  if (!outputDirectory) throw new Error('Choose an empty output directory for SFF runtime certification fixtures.');
  if (fs.existsSync(root) && fs.readdirSync(root).length) throw new Error(`Certification output directory is not empty: ${root}`);
  fs.mkdirSync(root, { recursive: true });
  const expectedRoot = path.join(root, 'expected');
  fs.mkdirSync(expectedRoot, { recursive: false });
  const specificationRoot = path.join(root, 'specifications'), validationRoot = path.join(root, 'strict-validation');
  fs.mkdirSync(specificationRoot, { recursive: false }); fs.mkdirSync(validationRoot, { recursive: false });
  const fixtures = [];
  for (const item of cases()) {
    const spec = specification(item.id, item.sprites, item.palettes), bytes = createSffV21Bytes(spec, { sources: item.sources }), validation = assertSffV21Mixed(bytes, spec);
    const filename = path.join(root, `${item.id}.sff`);
    fs.writeFileSync(filename, bytes, { flag: 'wx' });
    const specificationName = `${item.id}.specification.json`, specificationBytes = Buffer.from(`${JSON.stringify(spec, null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(specificationRoot, specificationName), specificationBytes, { flag: 'wx' });
    const validationName = `${item.id}.strict-validation.json`, validationBytes = Buffer.from(`${JSON.stringify(validation, null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(validationRoot, validationName), validationBytes, { flag: 'wx' });
    const sprites = validation.sprites.map((entry, index) => {
      const reviewed = spec.sprites[index], sourcePng = item.sources.get(reviewed.source.relativePath);
      if (!Buffer.isBuffer(sourcePng)) throw new Error(`Certification fixture ${item.id} sprite #${index} has no sealed source PNG.`);
      const reviewedPalette = reviewed.format === 'png8' ? spec.palettes[entry.paletteIndex] : null;
      if (reviewed.format === 'png8' && !reviewedPalette) throw new Error(`Certification fixture ${item.id} sprite #${index} assigns a missing reviewed palette.`);
      const expectedPng = reviewedPalette ? (() => { const decodedSource = readIndexedPng8(sourcePng); return encodeIndexed(decodedSource.width, decodedSource.height, decodedSource.indices, reviewedPalette.colors); })() : Buffer.from(sourcePng);
      const expectedName = `${item.id}-p${String(index).padStart(5, '0')}-g${String(entry.group).padStart(5, '0')}-i${String(entry.number).padStart(5, '0')}.png`;
      fs.writeFileSync(path.join(expectedRoot, expectedName), expectedPng, { flag: 'wx' });
      return { physicalIndex: entry.index, group: entry.group, number: entry.number, axisX: entry.axisX, axisY: entry.axisY, width: entry.width, height: entry.height, format: reviewed.format, colorDepth: reviewed.colorDepth, paletteIndex: reviewedPalette ? entry.paletteIndex : null, link: entry.dataSize ? null : entry.link, expectedPng: `expected/${expectedName}`, expectedPngByteHash: sha256(expectedPng), sourcePngByteHash: sha256(sourcePng), ...(reviewedPalette ? { expectedDecodedIndexHash: reviewed.source.decodedHash, expectedPaletteRgbaHash: sha256(Buffer.from(reviewedPalette.colors.flat())) } : { expectedDecodedHash: reviewed.source.decodedHash }) };
    });
    fixtures.push({ id: item.id, filename: path.basename(filename), purpose: item.purpose, builtInOnly: Boolean(item.builtInOnly), byteHash: sha256(bytes), byteLength: bytes.length, specificationHash: spec.specificationHash, specification: { filename: `specifications/${specificationName}`, byteHash: sha256(specificationBytes) }, strictValidation: { filename: `strict-validation/${validationName}`, byteHash: sha256(validationBytes) }, sprites, palettes: validation.palettes.map((entry, index) => ({ physicalIndex: entry.index, group: entry.group, number: entry.number, link: entry.dataSize ? null : entry.link, expectedRgbaHash: sha256(Buffer.from(spec.palettes[index].colors.flat())) })) });
  }
  const manifest = {
    kind: 'ikemaker-sff-runtime-certification-fixtures', version: 4,
    targetId: 'sff-v2.1', backendId: 'ikemaker-builtin-sff-v21-png8-prerelease', adapter: { id: 'builtin-v21-png8', version: 1 },
    strictValidator: { id: SFF_V21_MIXED_VALIDATOR_ID, version: SFF_V21_MIXED_VALIDATOR_VERSION, profile: SFF_V21_MIXED_VALIDATOR_PROFILE },
    writerProfile: 'sff-v2.1-mixed-png', adoptionAllowed: false,
    manualChecks: ['Record exact IKEMEN build, operating system and architecture.', 'Open each archive and verify every listed physical sprite identity, axis, dimensions and applicable palette assignment.', 'Render every sprite over a contrasting background and compare it to its sealed expectedPng; verify RGB24, RGBA32 alpha, transparency and linked-payload entries.', 'Where tooling permits, compare decoded true-color pixels or indexed palette indexes and RGBA palette bytes to their sealed hashes.', 'Close and reopen the archive before recording the result.', 'Do not enable built-in adoption from these fixtures alone; complete the documented platform matrix.'],
    fixtures
  };
  const manifestPath = path.join(root, 'certification-manifest.json');
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  fs.writeFileSync(manifestPath, manifestBytes, { flag: 'wx' });
  const ledger = createCertificationLedger(manifest, manifestBytes), ledgerPath = path.join(root, 'certification-results.template.json');
  fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, { flag: 'wx' });
  const instructionsPath = path.join(root, 'CERTIFICATION-README.md');
  fs.writeFileSync(instructionsPath, `# IKEMaker SFF runtime certification\n\nThis kit is compare-only and cannot authorize built-in adoption.\n\n1. Keep certification-manifest.json and every fixture byte-exact.\n2. Copy certification-results.template.json for the test run.\n3. Record the tester, exact UTC timestamp, exact OS/architecture, and exact IKEMEN build.\n4. For every fixture, complete every required check only after opening, inspecting, rendering, closing, and reopening the archive.\n5. Every pass or fail must add at least one checkEvidence entry with a stable evidence identifier, SHA-256 hash, and description. Parser output alone is not physical evidence.\n6. Use each fixture's sealed specification and strict-validation report to identify the exact expected binary contract; do not edit either artifact.\n7. Windows x64 and Linux x64 are both required. macOS rows remain optional until physically exercised.\n8. Even a complete ledger requires separate human review and a deliberate future code change; this kit never changes adoptionAllowed.\n`, { flag: 'wx' });
  return { root, manifestPath, manifest, ledgerPath, ledger, instructionsPath };
}

if (require.main === module) {
  try { const result = generate(process.argv[2]); console.log(`Wrote ${result.manifest.fixtures.length} SFF certification fixtures to ${result.root}`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { cases, generate, noncanonicalIndexedPng };
