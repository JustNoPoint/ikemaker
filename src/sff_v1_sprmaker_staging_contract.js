'use strict';

const crypto = require('crypto');
const { hashCanonical } = require('./sff_capability_report');
const { assertSffBuildSpecificationV2 } = require('./sff_build_specification_v2');
const { SPRMAKER_SHA256, MTOOLS_SHA256 } = require('./sff_v1_sprmaker_toolchain_contract');
const { OUTPUT_ALIAS, assertSprMakerRecipe, parseGeneratedSprMakerRecipe } = require('./sff_v1_sprmaker_recipe');

const SHA = /^[0-9a-f]{64}$/;
const DERIVATION_PROFILE = 'pcx8-rle-complete-image-v1';
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(freeze); return value; }
function exactBytes(value, label) { if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) throw new Error(`${label} exact bytes are required.`); return Buffer.from(value); }
function safeAlias(value) {
  const name = String(value || '');
  if (!/^[A-Z0-9_]{1,8}(?:\.[A-Z0-9_]{1,3})?$/.test(name) || /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/.test(name)) throw new Error(`Unsafe DOS 8.3 staging alias: ${value}.`);
  return name;
}
function validateInventoryDescriptors(plan, descriptors) {
  if (!Array.isArray(descriptors) || descriptors.length !== plan.inventory.length) throw new Error('Staged inventory must contain exactly every planned file.');
  const found = new Map();
  for (const row of descriptors) {
    const alias = safeAlias(row.relativePath), key = alias.toLowerCase(); if (found.has(key)) throw new Error('Staged inventory has a case-insensitive 8.3 collision.'); found.set(key, row);
    if (row.type !== 'file' || row.symlink === true || row.reparsePoint === true || !Number.isSafeInteger(row.linkCount) || row.linkCount !== 1 || !Number.isSafeInteger(row.byteLength) || row.byteLength < 0) throw new Error(`Staged entry ${alias} must be one regular, non-link file with canonical numeric metadata.`);
    if (!SHA.test(String(row.byteHash || '').toLowerCase())) throw new Error(`Staged entry ${alias} has no exact byte hash.`);
  }
  for (const expected of plan.inventory) { const actual = found.get(expected.relativePath.toLowerCase()); if (!actual || String(actual.byteHash).toLowerCase() !== expected.byteHash || actual.byteLength !== expected.byteLength) throw new Error(`Staged entry ${expected.relativePath} drifted.`); }
  return true;
}
function canonicalRle(row) {
  const chunks = [];
  for (let at = 0; at < row.length;) { const value = row[at]; let run = 1; while (at + run < row.length && row[at + run] === value && run < 63) run += 1; chunks.push(run > 1 || value >= 0xc0 ? Buffer.from([0xc0 | run, value]) : Buffer.from([value])); at += run; }
  return Buffer.concat(chunks);
}
function inspectDerivedPcx(bytes, sprite, palette) {
  if (bytes.length < 898 || bytes[0] !== 0x0a || bytes[1] !== 5 || bytes[2] !== 1 || bytes[3] !== 8 || bytes[65] !== 1) throw new Error(`Derived PCX ${sprite.entryId} is not canonical indexed PCX8 RLE.`);
  const xmin = bytes.readUInt16LE(4), ymin = bytes.readUInt16LE(6), xmax = bytes.readUInt16LE(8), ymax = bytes.readUInt16LE(10), width = xmax - xmin + 1, height = ymax - ymin + 1, stride = bytes.readUInt16LE(66);
  if (xmin !== 0 || ymin !== 0 || width !== sprite.width || height !== sprite.height || stride !== width + (width & 1) || bytes.readUInt16LE(12) !== width || bytes.readUInt16LE(14) !== height || bytes.readUInt16LE(68) !== 1) throw new Error(`Derived PCX ${sprite.entryId} header/dimensions/stride drifted.`);
  for (let at = 16; at < 65; at += 1) if (bytes[at] !== 0) throw new Error(`Derived PCX ${sprite.entryId} has noncanonical reserved header bytes.`);
  for (let at = 70; at < 128; at += 1) if (bytes[at] !== 0) throw new Error(`Derived PCX ${sprite.entryId} has noncanonical reserved tail bytes.`);
  const marker = bytes.length - 769; if (marker < 128 || bytes[marker] !== 0x0c) throw new Error(`Derived PCX ${sprite.entryId} lacks its terminal 256-color palette.`);
  const decodedRows = Buffer.alloc(stride * height); let source = 128;
  for (let y = 0; y < height; y += 1) {
    let remaining = stride, target = y * stride;
    while (remaining) { if (source >= marker) throw new Error(`Derived PCX ${sprite.entryId} row ${y} is truncated.`); const token = bytes[source++]; let count = 1, value = token; if ((token & 0xc0) === 0xc0) { count = token & 0x3f; if (!count || source >= marker) throw new Error(`Derived PCX ${sprite.entryId} has malformed RLE.`); value = bytes[source++]; } if (count > remaining) throw new Error(`Derived PCX ${sprite.entryId} RLE crosses row ${y}.`); decodedRows.fill(value, target, target + count); target += count; remaining -= count; }
  }
  if (source !== marker) throw new Error(`Derived PCX ${sprite.entryId} has trailing compressed bytes.`);
  const canonical = Buffer.concat(Array.from({ length: height }, (_, y) => canonicalRle(decodedRows.subarray(y * stride, (y + 1) * stride)))); if (!canonical.equals(bytes.subarray(128, marker))) throw new Error(`Derived PCX ${sprite.entryId} RLE is not canonical.`);
  const indexes = Buffer.alloc(width * height); for (let y = 0; y < height; y += 1) { decodedRows.copy(indexes, y * width, y * stride, y * stride + width); for (let x = width; x < stride; x += 1) if (decodedRows[y * stride + x] !== 0) throw new Error(`Derived PCX ${sprite.entryId} padding is not index 0.`); }
  const expectedRgb = Buffer.from(palette.colors.flatMap(color => color.slice(0, 3))); if (!bytes.subarray(marker + 1).equals(expectedRgb)) throw new Error(`Derived PCX ${sprite.entryId} palette differs from logical palette ${palette.entryId}.`);
  return { decodedHash: sha(indexes), paletteRgbHash: sha(expectedRgb) };
}
function createSprMakerStagingPlan(input = {}) {
  const specification = assertSffBuildSpecificationV2(input.specification), recipe = assertSprMakerRecipe(input.recipe);
  if (!specification?.specificationHash || recipe.specificationHash !== specification.specificationHash) throw new Error('A recipe bound to the exact sealed specification is required.');
  const recipeBytes = recipe.readBytes(), parsed = parseGeneratedSprMakerRecipe(recipeBytes);
  if (parsed.byteHash !== recipe.stdinByteHash || parsed.outputAlias !== OUTPUT_ALIAS || parsed.rows.length !== specification.logical.sprites.length) throw new Error('SprMaker recipe bytes drifted before staging.');
  parsed.rows.forEach((row, index) => { const sprite = specification.logical.sprites[index], metadata = recipe.rows[index]; if (row.sourceAlias !== metadata?.sourceAlias || row.group !== sprite.group || row.number !== sprite.number || row.axisX !== sprite.axisX || row.axisY !== sprite.axisY || row.paletteDecision !== metadata?.paletteDecision) throw new Error(`SprMaker recipe row ${index} drifted from the reviewed specification.`); });
  const sprmakerBytes = exactBytes(input.sprmakerBytes, 'SprMaker executable'), mtoolsBytes = exactBytes(input.mtoolsBytes, 'mtools notice');
  if (sha(sprmakerBytes) !== SPRMAKER_SHA256 || sha(mtoolsBytes) !== MTOOLS_SHA256) throw new Error('SprMaker distribution artifacts drifted before staging.');
  const nonce = String(input.runNonce || '').toLowerCase(); if (!/^[0-9a-f]{32,128}$/.test(nonce)) throw new Error('A unique cryptographic run nonce is required.');
  const derived = input.derivedPcxByEntryId;
  if (!derived || typeof derived !== 'object' || Array.isArray(derived)) throw new Error('Exact derived PCX entries are required.');
  const expectedIds = new Set(specification.logical.sprites.map(row => row.entryId)); if (Object.keys(derived).length !== expectedIds.size || Object.keys(derived).some(id => !expectedIds.has(id))) throw new Error('Derived PCX entries must contain exactly every sprite entryId.');
  const fileBytes = new Map([['SPRMAKER.EXE', sprmakerBytes], ['MTOOLS.TXT', mtoolsBytes], ['INPUT.TXT', recipeBytes]]), provenance = [], palettes = new Map(specification.logical.palettes.map(row => [row.entryId, row]));
  specification.logical.sprites.forEach((sprite, index) => {
    const record = derived[sprite.entryId] || {}, bytes = exactBytes(record.bytes, `derived PCX ${sprite.entryId}`), byteHash = sha(bytes), alias = recipe.rows[index]?.sourceAlias;
    if (safeAlias(alias) !== alias || record.byteHash !== byteHash || String(record.sourceByteHash || '').toLowerCase() !== sprite.source.byteHash || String(record.decodedHash || '').toLowerCase() !== sprite.pixels.decodedHash || record.derivationProfile !== DERIVATION_PROFILE) throw new Error(`Derived PCX evidence drifted for ${sprite.entryId}.`);
    const inspected = inspectDerivedPcx(bytes, sprite, palettes.get(sprite.paletteEntryId)); if (inspected.decodedHash !== sprite.pixels.decodedHash) throw new Error(`Derived PCX decoded pixels drifted for ${sprite.entryId}.`);
    if (fileBytes.has(alias)) throw new Error(`Derived PCX alias collision: ${alias}.`); fileBytes.set(alias, bytes);
    provenance.push({ entryId: sprite.entryId, sourceByteHash: sprite.source.byteHash, decodedHash: sprite.pixels.decodedHash, derivedPcxByteHash: byteHash, derivationProfile: DERIVATION_PROFILE, relativePath: alias });
  });
  const roles = { 'SPRMAKER.EXE': 'unmodified-tool', 'MTOOLS.TXT': 'required-notice', 'INPUT.TXT': 'fixed-stdin-recipe' };
  const inventory = [...fileBytes.entries()].map(([relativePath, bytes]) => ({ relativePath, role: roles[relativePath] || 'derived-pcx-input', byteHash: sha(bytes), byteLength: bytes.length, requiredType: 'regular-file', requiredLinkCount: 1 })).sort((a, b) => a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0);
  const keys = new Set(); for (const row of inventory) { safeAlias(row.relativePath); const key = row.relativePath.toLowerCase(); if (keys.has(key)) throw new Error('Staging inventory has a case-insensitive DOS alias collision.'); keys.add(key); }
  const nonceHash = sha(Buffer.from(nonce, 'ascii'));
  const metadata = { schema: 'ikemaker.sff-v1-sprmaker-staging-plan', version: 1, runId: `IK${nonceHash.toUpperCase()}`, runNonceHash: nonceHash, specificationHash: specification.specificationHash, logicalHash: specification.logicalHash, recipeHash: recipe.recipeHash, recipeByteHash: recipe.stdinByteHash, outputAlias: OUTPUT_ALIAS, inventory, provenance, containment: { privateEmptyRootRequired: true, mountOnlyPrivateRoot: true, symlinksAllowed: false, reparsePointsAllowed: false, hardlinksAllowed: false, extraFilesAllowed: false }, executionEligible: !parsed.rows.some(row => row.paletteDecision === 'previous'), adoptionAllowed: false };
  metadata.planHash = hashCanonical(metadata); const sealedFiles = new Map([...fileBytes].map(([name, value]) => [name, Buffer.from(value)]));
  return Object.freeze({ ...freeze(metadata), readFile: relativePath => { const alias = safeAlias(relativePath), value = sealedFiles.get(alias); if (!value) throw new Error(`Unplanned stage file ${alias}.`); return Buffer.from(value); } });
}
function assertSprMakerStagingPlan(value, expectedHash = value?.planHash) {
  const copy = { ...value }; delete copy.planHash; delete copy.readFile;
  if (value?.schema !== 'ikemaker.sff-v1-sprmaker-staging-plan' || value.version !== 1 || value.planHash !== expectedHash || hashCanonical(copy) !== value.planHash || value.adoptionAllowed !== false) throw new Error('SprMaker staging plan drifted.');
  return value;
}

module.exports = { DERIVATION_PROFILE, safeAlias, inspectDerivedPcx, createSprMakerStagingPlan, assertSprMakerStagingPlan, validateInventoryDescriptors };
