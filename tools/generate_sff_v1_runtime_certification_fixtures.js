'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createSffBuildSpecificationV2 } = require('../src/sff_build_specification_v2');
const { createSffV1Pcx8Bytes } = require('../src/sff_v1_pcx8_writer');
const { assertSffV1Pcx8, SFF_V1_PCX8_VALIDATOR_ID, SFF_V1_PCX8_VALIDATOR_VERSION, SFF_V1_PCX8_VALIDATOR_PROFILE } = require('../src/sff_v1_pcx8_strict_validator');
const { encodeIndexed } = require('../src/sff_palette_remap');
const { readIndexedPng8 } = require('../src/sff_png8_source');
const { createCertificationLedger } = require('../src/sff_runtime_certification');

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const colors = seed => Array.from({ length: 256 }, (_, index) => [(index * 7 + seed) & 255, (255 - index + seed) & 255, (index * 13 + seed) & 255, index === 0 ? 0 : 255]);
function image(name, width, height, pixels, palette) { const indices = Buffer.from(pixels), bytes = encodeIndexed(width, height, indices, palette), decoded = readIndexedPng8(bytes); return { name, width, height, indices, bytes, colors: palette, byteHash: sha256(bytes), decodedHash: decoded.decodedHash, relativePath: `input/${name}.png` }; }
function palette(id, number, source) { return { entryId: id, group: 0, number, colors: source.colors, source: { kind: 'complete-image', relativePath: source.relativePath, byteHash: source.byteHash, decodedHash: source.decodedHash, provenance: { kind: 'v1-runtime-certification-palette' } } }; }
function sprite(id, group, number, axisX, axisY, source, paletteEntryId, link = null) { return { entryId: id, group, number, width: source.width, height: source.height, axisX, axisY, pixels: { kind: 'indexed8', decodedHash: source.decodedHash }, paletteEntryId, ...(link ? { contentLinkTargetEntryId: link } : {}), source: { kind: 'complete-image', relativePath: source.relativePath, byteHash: source.byteHash, decodedHash: source.decodedHash, provenance: { kind: 'v1-runtime-certification-sprite' } } }; }
function specification(id, sprites, palettes, choices) { return createSffBuildSpecificationV2({ planId: `v1-runtime-${id}`, selection: { targetId: 'sff-v1', backendId: 'ikemaker-builtin-sff-v1' }, archive: { identity: `${id}.sff` }, logical: { sourceRoot: 'input', sprites, palettes, provenance: { kind: 'v1-runtime-certification', fixtureId: id } }, encodingIntent: { compression: { default: 'pcx-rle8' }, crop: { default: 'none' }, storage: { byEntryId: Object.fromEntries(sprites.filter(item => item.contentLinkTargetEntryId).map(item => [item.entryId, 'share-identical'])) }, paletteMode: 'individual-successive', backendOptions: { 'ikemaker-builtin-sff-v1': { paletteBySpriteEntryId: choices } } }, capabilityRequest: { requiredFeatures: ['transparency.index0-binary'] }, review: { purpose: 'physical runtime certification only', adoptionAllowed: false } }); }
function cases() {
  const tiny = image('tiny', 1, 1, [0], colors(0));
  const odd = image('odd', 3, 2, [0xc0, 0xc0, 0xc0, 1, 2, 3], colors(19));
  const runs = image('runs', 64, 1, Array(64).fill(254), colors(19));
  const alternate = image('alternate', 2, 2, [255, 0, 127, 64], colors(83));
  const definitions = [
    { id: 'minimal-own', purpose: 'Smallest own-palette sprite.', sources: [tiny], palettes: [palette('palette:tiny', 0, tiny)], make(p) { return { sprites: [sprite('sprite:minimal', 0, 0, 0, 0, tiny, p[0].entryId)], choices: { 'sprite:minimal': 'own' } }; } },
    { id: 'successive-reuse-final', purpose: 'SprMaker-style final-row omitted palette with retained declared size.', sources: [odd], palettes: [palette('palette:odd', 0, odd)], make(p) { return { sprites: [sprite('sprite:first', 2, 0, -3, 8, odd, p[0].entryId), sprite('sprite:reuse', 2, 1, 7, -9, odd, p[0].entryId)], choices: { 'sprite:first': 'own', 'sprite:reuse': 'previous' } }; } },
    { id: 'different-own-palettes', purpose: 'Two explicit own palettes and repeated sprite identity.', sources: [tiny, alternate], palettes: [palette('palette:tiny', 0, tiny), palette('palette:alternate', 1, alternate)], make(p) { return { sprites: [sprite('sprite:a', 5, 9, -32768, 32767, tiny, p[0].entryId), sprite('sprite:b', 5, 9, 32767, -32768, alternate, p[1].entryId)], choices: { 'sprite:a': 'own', 'sprite:b': 'own' } }; } },
    { id: 'pcx-rle-boundaries', purpose: 'Odd stride, escaped >=C0 values, and canonical 63/1 run splitting.', sources: [runs], palettes: [palette('palette:runs', 0, runs)], make(p) { return { sprites: [sprite('sprite:runs', 65535, 65535, 1, -1, runs, p[0].entryId)], choices: { 'sprite:runs': 'own' } }; } },
    { id: 'direct-link', purpose: 'Direct backward sprite link with inherited immediately previous palette.', sources: [odd], palettes: [palette('palette:odd', 0, odd)], make(p) { return { sprites: [sprite('sprite:base', 30, 0, -12, 44, odd, p[0].entryId), sprite('sprite:link', 30, 1, 5, -6, odd, p[0].entryId, 'sprite:base')], choices: { 'sprite:base': 'own', 'sprite:link': 'previous' } }; } }
  ];
  return definitions.map(definition => {
    const made = definition.make(definition.palettes), reviewed = specification(definition.id, made.sprites, definition.palettes, made.choices), byPath = new Map(definition.sources.map(source => [source.relativePath, source])), sourceBytesByEntryId = {}, decodedPixelsByEntryId = {};
    for (const entry of [...made.sprites, ...definition.palettes]) sourceBytesByEntryId[entry.entryId] = byPath.get(entry.source.relativePath).bytes;
    for (const entry of made.sprites) decodedPixelsByEntryId[entry.entryId] = byPath.get(entry.source.relativePath).indices;
    return { ...definition, sprites: made.sprites, choices: made.choices, specification: reviewed, sourceBytesByEntryId, decodedPixelsByEntryId };
  });
}
function safeReport(report) { return { kind: report.kind, validatorId: report.validatorId, validatorVersion: report.validatorVersion, profile: report.profile, ok: report.ok, errors: report.errors, header: report.header, sprites: report.sprites.map(row => ({ index: row.index, group: row.group, number: row.number, axisX: row.axisX, axisY: row.axisY, width: row.width, height: row.height, link: row.declaredLength ? null : row.link, paletteSame: row.paletteSame, declaredLength: row.declaredLength, decodedIndexHash: row.decodedIndexHash, paletteRgbHash: row.paletteRgbHash })) }; }
function generate(outputDirectory) {
  const root = path.resolve(String(outputDirectory || '')); if (!outputDirectory) throw new Error('Choose an empty output directory for SFF v1 runtime certification fixtures.');
  if (fs.existsSync(root) && fs.readdirSync(root).length) throw new Error(`Certification output directory is not empty: ${root}`);
  fs.mkdirSync(root, { recursive: true }); const expectedRoot = path.join(root, 'expected'), specificationRoot = path.join(root, 'specifications'), validationRoot = path.join(root, 'strict-validation'); fs.mkdirSync(expectedRoot); fs.mkdirSync(specificationRoot); fs.mkdirSync(validationRoot);
  const fixtures = [];
  for (const item of cases()) {
    const bytes = createSffV1Pcx8Bytes(item.specification, { decodedPixelsByEntryId: item.decodedPixelsByEntryId }), report = assertSffV1Pcx8(bytes, item.specification), filename = `${item.id}.sff`;
    fs.writeFileSync(path.join(root, filename), bytes, { flag: 'wx' });
    const specificationName = `${item.id}.specification.json`, specificationBytes = Buffer.from(`${JSON.stringify(item.specification, null, 2)}\n`); fs.writeFileSync(path.join(specificationRoot, specificationName), specificationBytes, { flag: 'wx' });
    const validationName = `${item.id}.strict-validation.json`, validationBytes = Buffer.from(`${JSON.stringify(safeReport(report), null, 2)}\n`); fs.writeFileSync(path.join(validationRoot, validationName), validationBytes, { flag: 'wx' });
    const paletteMap = new Map(item.specification.logical.palettes.map(entry => [entry.entryId, entry]));
    const sprites = report.sprites.map((entry, index) => { const reviewed = item.specification.logical.sprites[index], logicalPalette = paletteMap.get(reviewed.paletteEntryId), expectedPng = encodeIndexed(entry.width, entry.height, item.decodedPixelsByEntryId[reviewed.entryId], logicalPalette.colors), expectedName = `${item.id}-p${String(index).padStart(5, '0')}-g${String(entry.group).padStart(5, '0')}-i${String(entry.number).padStart(5, '0')}.png`; fs.writeFileSync(path.join(expectedRoot, expectedName), expectedPng, { flag: 'wx' }); return { physicalIndex: index, group: entry.group, number: entry.number, axisX: entry.axisX, axisY: entry.axisY, width: entry.width, height: entry.height, logicalPaletteId: reviewed.paletteEntryId, paletteSame: entry.paletteSame, link: entry.declaredLength ? null : entry.link, expectedPng: `expected/${expectedName}`, expectedPngByteHash: sha256(expectedPng), sourcePngByteHash: reviewed.source.byteHash, expectedDecodedIndexHash: reviewed.pixels.decodedHash, expectedPaletteRgbaHash: sha256(Buffer.from(logicalPalette.colors.flat())) }; });
    fixtures.push({ id: item.id, filename, purpose: item.purpose, builtInOnly: true, byteHash: sha256(bytes), byteLength: bytes.length, specificationHash: item.specification.specificationHash, specification: { filename: `specifications/${specificationName}`, byteHash: sha256(specificationBytes) }, strictValidation: { filename: `strict-validation/${validationName}`, byteHash: sha256(validationBytes) }, sprites, palettes: item.specification.logical.palettes.map((entry, index) => ({ logicalSyntheticIdentity: [0, index], physicallyAddressable: false, expectedRgbaHash: sha256(Buffer.from(entry.colors.flat())) })) });
  }
  const manifest = { kind: 'ikemaker-sff-runtime-certification-fixtures', version: 4, targetId: 'sff-v1', backendId: 'ikemaker-builtin-sff-v1', adapter: { id: 'builtin-v1-pcx8', version: 1 }, strictValidator: { id: SFF_V1_PCX8_VALIDATOR_ID, version: SFF_V1_PCX8_VALIDATOR_VERSION, profile: SFF_V1_PCX8_VALIDATOR_PROFILE }, writerProfile: 'sff-v1.01-pcx8-individual-successive-compare-only', adoptionAllowed: false, manualChecks: ['Record exact WinMUGEN/DOS-era engine, MUGEN 1.0, and IKEMEN builds separately; never generalize one engine result to another.', 'Open and reopen every archive.', 'Verify physical order, duplicate identities, axes, dimensions, index 0 transparency, own/reused palettes, and direct links.', 'Compare every render with its sealed expected PNG.', 'Do not enable adoption from this kit.'], fixtures };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`); fs.writeFileSync(path.join(root, 'certification-manifest.json'), manifestBytes, { flag: 'wx' });
  const ledger = createCertificationLedger(manifest, manifestBytes); fs.writeFileSync(path.join(root, 'certification-results.template.json'), `${JSON.stringify(ledger, null, 2)}\n`, { flag: 'wx' });
  fs.writeFileSync(path.join(root, 'CERTIFICATION-README.md'), '# IKEMaker SFF v1.01 PCX8 runtime certification\n\nThis compare-only evidence kit covers the narrow individual/successive-palette profile. Test legacy MUGEN, MUGEN 1.0, and IKEMEN separately. Global shared-palette mode is not part of this profile.\n', { flag: 'wx' });
  return { root, manifest, manifestBytes, ledger };
}
if (require.main === module) { try { const result = generate(process.argv[2]); console.log(`Wrote ${result.manifest.fixtures.length} SFF v1.01 PCX8 certification fixtures to ${result.root}`); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { cases, generate };
