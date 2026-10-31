'use strict';

const crypto = require('crypto');
const path = require('path');
const { paletteRgba, spriteIndexPlane, spritePng } = require('./sff_reader');
const { decodePng } = require('./palette_index_organizer_model');
const { readIndexedPng } = require('./palette_indexed_png');
const { validatedOwner } = require('./palette_sff_template_intake');

function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function stableRecord(sprite) {
  return {
    physicalIndex: Number(sprite.index),
    group: Number(sprite.group),
    number: Number(sprite.number),
    axisX: Number(sprite.axisX || 0),
    axisY: Number(sprite.axisY || 0),
    width: Number(sprite.width || 0),
    height: Number(sprite.height || 0),
    colorDepth: Number(sprite.colorDepth || 0),
    palettePhysicalIndex: Number(sprite.paletteIndex || 0)
  };
}

function indexedIdentity(archive, sprite) {
  const ownership = validatedOwner(archive, sprite.paletteIndex);
  const plane = spriteIndexPlane(archive, sprite), colors = paletteRgba(archive, sprite.paletteIndex);
  if (!colors) throw new Error(`Sprite ${sprite.index} has no resolvable palette.`);
  const evidence = Buffer.concat([
    Buffer.from(`${ownership.familyId}:${plane.width}x${plane.height}\0`, 'utf8'),
    plane.indices,
    Buffer.from(colors.flat())
  ]);
  return { kind: 'indexed', ...ownership, identityHash: sha(evidence), decodedHash: sha(plane.indices), paletteHash: sha(Buffer.from(colors.flat())) };
}

function truecolorIdentity(archive, sprite) {
  const png = spritePng(archive, sprite), decoded = decodePng(png, { maximumPixels: 64_000_000, maximumDimension: 65535 });
  return { kind: 'truecolor', identityHash: sha(Buffer.concat([Buffer.from(`${decoded.width}x${decoded.height}\0`, 'utf8'), decoded.rgba])), decodedHash: sha(decoded.rgba), paletteHash: null };
}

function dedupeSffSprites(archive, sprites = archive?.sprites || [], source = {}) {
  const canonicalByHash = new Map(), canonical = [], replacements = [];
  for (const sprite of [...sprites].sort((a, b) => Number(a.index) - Number(b.index))) {
    const indexed = [5, 8].includes(Number(sprite.colorDepth)), evidence = indexed ? indexedIdentity(archive, sprite) : truecolorIdentity(archive, sprite);
    let owner = canonicalByHash.get(evidence.identityHash);
    if (!owner) {
      owner = { canonicalId: `cs-${String(canonical.length).padStart(6, '0')}`, sprite, evidence, source: stableRecord(sprite), originals: [] };
      canonicalByHash.set(evidence.identityHash, owner); canonical.push(owner);
    }
    const original = { ...stableRecord(sprite), ...(indexed ? validatedOwner(archive, sprite.paletteIndex) : {}), decodedHash: evidence.decodedHash, paletteHash: evidence.paletteHash }; owner.originals.push(original);
    replacements.push({ original, canonicalId: owner.canonicalId, canonicalPhysicalIndex: owner.source.physicalIndex, duplicate: owner.source.physicalIndex !== original.physicalIndex });
  }
  const sourceMap = {
    schema: 'ikemaker.cs-sff-source-map', version: 1,
    source: source.filename ? { filename: path.resolve(source.filename), byteHash: String(source.byteHash || '') } : null,
    policy: 'exact-index-safe',
    summary: { originalSpriteCount: replacements.length, canonicalSpriteCount: canonical.length, removedDuplicateCount: replacements.length - canonical.length },
    canonicalSprites: canonical.map(item => ({ canonicalId: item.canonicalId, identityHash: item.evidence.identityHash, kind: item.evidence.kind, canonical: item.source, originals: item.originals })),
    replacements
  };
  return { canonical, sourceMap };
}

function dedupeIndexedFiles(files) {
  const canonicalByHash = new Map(), canonical = [];
  for (const file of files) {
    const decoded = readIndexedPng(file.bytes), identityHash = sha(Buffer.concat([Buffer.from(`${decoded.width}x${decoded.height}\0`, 'utf8'), decoded.indices, Buffer.from(decoded.colors.flat())]));
    if (canonicalByHash.has(identityHash)) continue;
    const row = { canonicalId: `cs-${String(canonical.length).padStart(6, '0')}`, filename: path.resolve(file.filename), identityHash, decoded };
    canonicalByHash.set(identityHash, row); canonical.push(row);
  }
  return { canonical, sourceMap: null, summary: { originalSpriteCount: files.length, canonicalSpriteCount: canonical.length, removedDuplicateCount: files.length - canonical.length } };
}

module.exports = { dedupeSffSprites, dedupeIndexedFiles };
