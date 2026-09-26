'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { paletteRgba, paletteAct } = require('./sff_reader');
const { transactionalWriteSet } = require('./mutation_safety');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex').toUpperCase();
}

function normalizedColors(colors) {
  if (!Array.isArray(colors) || colors.length !== 256) throw new Error('A master palette must contain exactly 256 colors.');
  return colors.map((color, index) => [0, 1, 2, 3].map((channel) => {
    const value = Number(color && color[channel]);
    if (Number.isFinite(value)) return Math.max(0, Math.min(255, Math.round(value)));
    return channel === 3 && index !== 0 ? 255 : 0;
  }));
}

function paletteFingerprint(colors) {
  return sha256(Buffer.from(normalizedColors(colors).flat()));
}

function indexedSpriteInventory(archive) {
  return archive.sprites.filter((sprite) => sprite.colorDepth === 8).map((sprite) => {
    let imageFingerprint;
    if (sprite.dataSize === 0) imageFingerprint = `LINK:${sprite.link}`;
    else imageFingerprint = sha256(archive.buffer.subarray(sprite.dataOffset, sprite.dataOffset + sprite.dataSize));
    return {
      key: `${sprite.group},${sprite.number}`,
      group: sprite.group,
      number: sprite.number,
      width: sprite.width,
      height: sprite.height,
      format: sprite.format,
      colorDepth: sprite.colorDepth,
      paletteIndex: sprite.paletteIndex,
      linkedImage: sprite.dataSize === 0 ? sprite.link : null,
      imageFingerprint
    };
  });
}

function createMasterSnapshot(archive, paletteIndex, archiveLabel = archive.filename || '') {
  const palette = archive.palettes[paletteIndex];
  if (!palette) throw new Error(`Palette ${paletteIndex} does not exist.`);
  const colors = normalizedColors(paletteRgba(archive, paletteIndex));
  return {
    version: 1,
    kind: 'IKEMEN SFF master index snapshot',
    immutable: true,
    createdAt: new Date().toISOString(),
    sourceArchive: archiveLabel,
    sourceSffVersion: archive.header.version.join('.'),
    palette: {
      index: palette.index,
      group: palette.group,
      number: palette.number,
      declaredColors: palette.colors,
      linkedTo: palette.dataSize === 0 ? palette.link : null,
      fingerprint: paletteFingerprint(colors),
      colors
    },
    indexedSprites: indexedSpriteInventory(archive)
  };
}

function findSnapshotPalette(archive, snapshot) {
  const wanted = snapshot && snapshot.palette;
  if (!wanted) return null;
  return archive.palettes.find((palette) => palette.group === wanted.group && palette.number === wanted.number) || archive.palettes[wanted.index] || null;
}

function compareMasterSnapshot(archive, snapshot) {
  if (!snapshot || snapshot.kind !== 'IKEMEN SFF master index snapshot' || !snapshot.palette) throw new Error('The master palette snapshot is invalid.');
  const palette = findSnapshotPalette(archive, snapshot);
  const paletteMissing = !palette;
  const colors = palette ? paletteRgba(archive, palette.index) : null;
  const paletteChanged = Boolean(colors) && paletteFingerprint(colors) !== snapshot.palette.fingerprint;
  const original = new Map((snapshot.indexedSprites || []).map((sprite) => [sprite.key, sprite]));
  const current = new Map(indexedSpriteInventory(archive).map((sprite) => [sprite.key, sprite]));
  const missingSprites = [], changedIndexData = [], changedPaletteAssignments = [], addedSprites = [];
  for (const [key, before] of original) {
    const after = current.get(key);
    if (!after) { missingSprites.push(key); continue; }
    if (after.imageFingerprint !== before.imageFingerprint || after.format !== before.format || after.colorDepth !== before.colorDepth || after.width !== before.width || after.height !== before.height) changedIndexData.push(key);
    if (after.paletteIndex !== before.paletteIndex) changedPaletteAssignments.push(key);
  }
  for (const key of current.keys()) if (!original.has(key)) addedSprites.push(key);
  return {
    exact: !paletteMissing && !paletteChanged && !missingSprites.length && !changedIndexData.length && !changedPaletteAssignments.length,
    paletteMissing,
    paletteChanged,
    missingSprites,
    changedIndexData,
    changedPaletteAssignments,
    addedSprites,
    currentPaletteIndex: palette ? palette.index : null
  };
}

function safePart(value) { return String(value || '').replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '') || 'archive'; }

function masterLocation(sffPath, workspaceRoot) {
  const root = workspaceRoot || path.dirname(sffPath);
  let relative = path.relative(root, sffPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) relative = path.basename(sffPath);
  const parts = relative.split(/[\\/]+/).map(safePart);
  parts[parts.length - 1] = safePart(path.basename(parts[parts.length - 1], path.extname(parts[parts.length - 1])));
  const folder = path.join(root, '.ikemen-tools', 'palette-masters', ...parts);
  return { folder, json: path.join(folder, 'master-palette.json'), act: path.join(folder, 'master-palette.act') };
}

function writeMasterSnapshot(location, snapshot) {
  if (fs.existsSync(location.json)) return { created: false, location };
  transactionalWriteSet(fs, [
    [location.json, `${JSON.stringify(snapshot, null, 2)}\n`],
    [location.act, paletteAct(snapshot.palette.colors)]
  ], { label: 'create-master-palette', allowExisting: false });
  return { created: true, location };
}

function readMasterSnapshot(location) {
  if (!fs.existsSync(location.json)) return null;
  return JSON.parse(fs.readFileSync(location.json, 'utf8').replace(/^\uFEFF/, ''));
}

module.exports = {
  paletteFingerprint,
  indexedSpriteInventory,
  createMasterSnapshot,
  compareMasterSnapshot,
  masterLocation,
  writeMasterSnapshot,
  readMasterSnapshot
};
