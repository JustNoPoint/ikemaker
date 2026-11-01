'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createSffBuildSpecificationV2 } = require('../src/sff_build_specification_v2');
const { createSffV20Raw8Bytes } = require('../src/sff_v20_raw8_writer');
const { assertSffV20Raw8, SFF_V20_RAW8_VALIDATOR_ID, SFF_V20_RAW8_VALIDATOR_VERSION, SFF_V20_RAW8_VALIDATOR_PROFILE } = require('../src/sff_v20_strict_validator');
const { encodeIndexed } = require('../src/sff_palette_remap');
const { readIndexedPng8 } = require('../src/sff_png8_source');
const { createCertificationLedger } = require('../src/sff_runtime_certification');

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const colors = seed => Array.from({ length: 256 }, (_, index) => [(index * 7 + seed) & 255, (255 - index + seed) & 255, (index * 13 + seed) & 255, index === 0 ? 0 : 255]);
function image(name, width, height, pixels, palette) {
  const indices = Buffer.from(pixels), bytes = encodeIndexed(width, height, indices, palette), decoded = readIndexedPng8(bytes);
  return { name, bytes, indices, width, height, colors: palette, byteHash: sha256(bytes), decodedHash: decoded.decodedHash, relativePath: `input/${name}.png` };
}
function palette(entryId, group, number, source, linkTargetEntryId = null) {
  return { entryId, group, number, colors: source.colors, ...(linkTargetEntryId ? { contentLinkTargetEntryId: linkTargetEntryId } : {}), source: { kind: 'complete-image', relativePath: source.relativePath, byteHash: source.byteHash, decodedHash: source.decodedHash, provenance: { kind: 'v20-runtime-certification-palette' } } };
}
function sprite(entryId, group, number, axisX, axisY, source, paletteEntryId, linkTargetEntryId = null) {
  return { entryId, group, number, width: source.width, height: source.height, axisX, axisY, pixels: { kind: 'indexed8', decodedHash: source.decodedHash }, paletteEntryId, ...(linkTargetEntryId ? { contentLinkTargetEntryId: linkTargetEntryId } : {}), source: { kind: 'complete-image', relativePath: source.relativePath, byteHash: source.byteHash, decodedHash: source.decodedHash, provenance: { kind: 'v20-runtime-certification-sprite' } } };
}
function makeSpecification(id, sprites, palettes) {
  return createSffBuildSpecificationV2({
    planId: `v20-runtime-${id}`, selection: { targetId: 'sff-v2.0', backendId: 'ikemaker-builtin-sff-v2.0' }, archive: { identity: `${id}.sff` },
    logical: { sourceRoot: 'input', sprites, palettes, provenance: { kind: 'v20-runtime-certification', fixtureId: id } },
    encodingIntent: { compression: { default: 'raw8' }, crop: { default: 'none' }, storage: { byEntryId: Object.fromEntries([...sprites, ...palettes].filter(item => item.contentLinkTargetEntryId).map(item => [item.entryId, 'share-identical'])) }, paletteMode: 'embedded', backendOptions: { 'ikemaker-builtin-sff-v2.0': {} } },
    capabilityRequest: { requiredFeatures: ['transparency.index0-binary'] }, review: { purpose: 'physical runtime certification only', adoptionAllowed: false }
  });
}
function cases() {
  const tiny = image('tiny', 1, 1, [0], colors(0)), block = image('block', 3, 2, [0, 1, 254, 255, 33, 77], colors(31)), alternate = image('alternate', 2, 2, [255, 0, 127, 64], colors(83));
  return [
    { id: 'empty', purpose: 'Header-only canonical MUGEN 1.0-compatible archive.', sprites: [], palettes: [] },
    { id: 'minimal', purpose: 'Smallest stored RAW8 sprite and embedded palette.', sprites: [sprite('sprite:minimal', 0, 0, 0, 0, tiny, 'palette:minimal')], palettes: [palette('palette:minimal', 1, 1, tiny)] },
    { id: 'signed-boundaries', purpose: 'Physical ordering, group/index maxima, and signed axis extrema.', sprites: [sprite('sprite:a', 65535, 65535, -32768, 32767, block, 'palette:block'), sprite('sprite:b', 0, 65000, 32767, -32768, alternate, 'palette:alternate')], palettes: [palette('palette:block', 1, 1, block), palette('palette:alternate', 2, 1, alternate)] },
    { id: 'direct-links', purpose: 'Direct backward sprite and palette links with independent axes and palette assignment.', sprites: [sprite('sprite:base', 30, 0, -12, 44, block, 'palette:base'), sprite('sprite:link', 30, 1, 5, -6, block, 'palette:link', 'sprite:base')], palettes: [palette('palette:base', 1, 1, block), palette('palette:link', 1, 2, block, 'palette:base')] },
    { id: 'repeated-identities', purpose: 'Distinct physical sprite rows retain repeated group/index identities.', sprites: [sprite('sprite:first', 3, 7, -4, 9, tiny, 'palette:tiny'), sprite('sprite:second', 3, 7, 12, -6, block, 'palette:block')], palettes: [palette('palette:tiny', 1, 1, tiny), palette('palette:block', 1, 2, block)] }
  ].map(item => {
    const allSources = new Map([[tiny.relativePath, tiny], [block.relativePath, block], [alternate.relativePath, alternate]]), specification = makeSpecification(item.id, item.sprites, item.palettes);
    const sourceBytesByEntryId = {}, decodedPixelsByEntryId = {};
    for (const entry of [...item.sprites, ...item.palettes]) sourceBytesByEntryId[entry.entryId] = allSources.get(entry.source.relativePath).bytes;
    for (const entry of item.sprites) decodedPixelsByEntryId[entry.entryId] = allSources.get(entry.source.relativePath).indices;
    return { ...item, specification, sourceBytesByEntryId, decodedPixelsByEntryId };
  });
}
function serializableReport(report) {
  return {
    kind: report.kind, validatorId: report.validatorId, validatorVersion: report.validatorVersion, profile: report.profile,
    compatibilityProfile: report.compatibilityProfile, ok: report.ok, errors: report.errors,
    primaryVersion: report.primaryVersion, compatibleVersion: report.compatibleVersion,
    header: report.header && { primaryVersion: report.header.primaryVersion, compatibleVersion: report.header.compatibleVersion, firstSpriteHeaderOffset: report.header.firstSpriteHeaderOffset, numberOfSprites: report.header.numberOfSprites, firstPaletteHeaderOffset: report.header.firstPaletteHeaderOffset, numberOfPalettes: report.header.numberOfPalettes, literalDataOffset: report.header.literalDataOffset, literalDataLength: report.header.literalDataLength, translatedDataOffset: report.header.translatedDataOffset, translatedDataLength: report.header.translatedDataLength },
    sprites: report.sprites.map(item => ({ index: item.index, group: item.group, number: item.number, width: item.width, height: item.height, axisX: item.axisX, axisY: item.axisY, link: item.link, format: item.format, colorDepth: item.colorDepth, dataSize: item.dataSize, paletteIndex: item.paletteIndex, flags: item.flags, decodedIndexHash: item.resolvedDecodedIndexHash })),
    palettes: report.palettes.map(item => ({ index: item.index, group: item.group, number: item.number, colors: item.colors, link: item.link, dataSize: item.dataSize, rgbaHash: item.dataSize ? item.rgbaHash : null }))
  };
}
function generate(outputDirectory) {
  const root = path.resolve(String(outputDirectory || ''));
  if (!outputDirectory) throw new Error('Choose an empty output directory for SFF v2.0 runtime certification fixtures.');
  if (fs.existsSync(root) && fs.readdirSync(root).length) throw new Error(`Certification output directory is not empty: ${root}`);
  fs.mkdirSync(root, { recursive: true });
  const expectedRoot = path.join(root, 'expected'), specificationRoot = path.join(root, 'specifications'), validationRoot = path.join(root, 'strict-validation');
  fs.mkdirSync(expectedRoot); fs.mkdirSync(specificationRoot); fs.mkdirSync(validationRoot);
  const fixtures = [];
  for (const item of cases()) {
    const bytes = createSffV20Raw8Bytes(item.specification, { decodedPixelsByEntryId: item.decodedPixelsByEntryId });
    const report = assertSffV20Raw8(bytes, item.specification), safeReport = serializableReport(report);
    const filename = `${item.id}.sff`; fs.writeFileSync(path.join(root, filename), bytes, { flag: 'wx' });
    const specificationName = `${item.id}.specification.json`, specificationBytes = Buffer.from(`${JSON.stringify(item.specification, null, 2)}\n`);
    fs.writeFileSync(path.join(specificationRoot, specificationName), specificationBytes, { flag: 'wx' });
    const validationName = `${item.id}.strict-validation.json`, validationBytes = Buffer.from(`${JSON.stringify(safeReport, null, 2)}\n`);
    fs.writeFileSync(path.join(validationRoot, validationName), validationBytes, { flag: 'wx' });
    const sprites = report.sprites.map((entry, index) => {
      const reviewed = item.specification.logical.sprites[index], paletteEntry = item.specification.logical.palettes[entry.paletteIndex];
      const expectedPng = encodeIndexed(entry.width, entry.height, item.decodedPixelsByEntryId[reviewed.entryId], paletteEntry.colors), expectedName = `${item.id}-p${String(index).padStart(5, '0')}-g${String(entry.group).padStart(5, '0')}-i${String(entry.number).padStart(5, '0')}.png`;
      fs.writeFileSync(path.join(expectedRoot, expectedName), expectedPng, { flag: 'wx' });
      return { physicalIndex: index, group: entry.group, number: entry.number, axisX: entry.axisX, axisY: entry.axisY, width: entry.width, height: entry.height, paletteIndex: entry.paletteIndex, link: entry.dataSize ? null : entry.link, expectedPng: `expected/${expectedName}`, expectedPngByteHash: sha256(expectedPng), sourcePngByteHash: reviewed.source.byteHash, expectedDecodedIndexHash: reviewed.pixels.decodedHash, expectedPaletteRgbaHash: sha256(Buffer.from(paletteEntry.colors.flat())) };
    });
    fixtures.push({ id: item.id, filename, purpose: item.purpose, builtInOnly: true, byteHash: sha256(bytes), byteLength: bytes.length, specificationHash: item.specification.specificationHash, specification: { filename: `specifications/${specificationName}`, byteHash: sha256(specificationBytes) }, strictValidation: { filename: `strict-validation/${validationName}`, byteHash: sha256(validationBytes) }, sprites, palettes: report.palettes.map((entry, index) => ({ physicalIndex: index, group: entry.group, number: entry.number, link: entry.dataSize ? null : entry.link, expectedRgbaHash: sha256(Buffer.from(item.specification.logical.palettes[index].colors.flat())) })) });
  }
  const manifest = {
    kind: 'ikemaker-sff-runtime-certification-fixtures', version: 4,
    targetId: 'sff-v2.0', backendId: 'ikemaker-builtin-sff-v2.0', adapter: { id: 'builtin-v20-raw8', version: 1 },
    strictValidator: { id: SFF_V20_RAW8_VALIDATOR_ID, version: SFF_V20_RAW8_VALIDATOR_VERSION, profile: SFF_V20_RAW8_VALIDATOR_PROFILE },
    writerProfile: 'sff-v2.0-raw8-compare-only', adoptionAllowed: false,
    manualChecks: ['Record exact MUGEN 1.0 and IKEMEN builds separately.', 'Open and reopen every archive.', 'Verify physical identity, axes, dimensions, assigned palette, binary transparency, and links.', 'Compare every render with its sealed expected PNG.', 'Do not enable adoption from this kit.'], fixtures
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`), manifestPath = path.join(root, 'certification-manifest.json');
  fs.writeFileSync(manifestPath, manifestBytes, { flag: 'wx' });
  const ledger = createCertificationLedger(manifest, manifestBytes), ledgerPath = path.join(root, 'certification-results.template.json');
  fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, { flag: 'wx' });
  fs.writeFileSync(path.join(root, 'CERTIFICATION-README.md'), '# IKEMaker SFF v2.0 RAW8 runtime certification\n\nThis evidence kit is compare-only. Test MUGEN 1.0 and IKEMEN separately, attach exact hashed evidence for every required check, and never infer adoption authority from generated or parser-only results.\n', { flag: 'wx' });
  return { root, manifest, manifestBytes, manifestPath, ledger, ledgerPath };
}

if (require.main === module) {
  try { const result = generate(process.argv[2]); console.log(`Wrote ${result.manifest.fixtures.length} SFF v2.0 RAW8 certification fixtures to ${result.root}`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { cases, generate };
