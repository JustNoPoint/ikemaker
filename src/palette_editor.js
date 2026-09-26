'use strict';

const { paletteRgba, resolvedPalette, rgbaPng } = require('./sff_reader');

function byte(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(255, Math.round(number))) : fallback;
}

function normalizeColors(colors) {
  if (!Array.isArray(colors) || colors.length !== 256) throw new Error('A palette must contain exactly 256 colors.');
  return colors.map((color, index) => [
    byte(color && color[0]), byte(color && color[1]), byte(color && color[2]),
    byte(color && color[3], index === 0 ? 0 : 255)
  ]);
}

function paletteRole(palette) {
  if (!palette) return 'Missing palette';
  const group = Number(palette.group), number = Number(palette.number);
  if (group === 1 && number === 0) return 'Full-CS master';
  if (group === 1 && number === 1) return 'P1 default palette';
  if (group === 1 && number === 2) return 'P2 default palette';
  const banks = [[1, 'Character'], [11, 'Layer 1'], [21, 'Layer 2'], [31, 'Layer 3'], [41, 'Layer 4'], [51, 'Projectile / FX']];
  const bank = banks.find(([base]) => group >= base && group <= base + 4);
  if (bank) return `${bank[1]}${group === bank[0] ? '' : ` transformation ${group - bank[0]}`} · color ${number}`;
  return 'Auxiliary palette';
}

function comparePaletteColors(current, candidate) {
  const before = normalizeColors(current), after = normalizeColors(candidate), changedIndices = [];
  for (let index = 0; index < 256; index += 1) {
    if (before[index][0] !== after[index][0] || before[index][1] !== after[index][1] || before[index][2] !== after[index][2]) changedIndices.push(index);
  }
  return { exact: changedIndices.length === 0, changedIndices, changedCount: changedIndices.length };
}

function reversePaletteRgb(colors) {
  const source = normalizeColors(colors);
  return source.map((color, index) => {
    const reversed = source[255 - index];
    // Transparency belongs to the SFF index, not to ACT's color-table order.
    return [reversed[0], reversed[1], reversed[2], color[3]];
  });
}

function paletteAco(colors) {
  const source = normalizeColors(colors), records = [];
  const firstHeader = Buffer.alloc(4); firstHeader.writeUInt16BE(1, 0); firstHeader.writeUInt16BE(source.length, 2); records.push(firstHeader);
  for (const color of source) { const record = Buffer.alloc(10); record.writeUInt16BE(0, 0); record.writeUInt16BE(color[0] * 257, 2); record.writeUInt16BE(color[1] * 257, 4); record.writeUInt16BE(color[2] * 257, 6); records.push(record); }
  const secondHeader = Buffer.alloc(4); secondHeader.writeUInt16BE(2, 0); secondHeader.writeUInt16BE(source.length, 2); records.push(secondHeader);
  source.forEach((color, index) => {
    const name = `Index ${String(index).padStart(3, '0')}`, record = Buffer.alloc(10), label = Buffer.alloc(4 + (name.length + 1) * 2);
    record.writeUInt16BE(0, 0); record.writeUInt16BE(color[0] * 257, 2); record.writeUInt16BE(color[1] * 257, 4); record.writeUInt16BE(color[2] * 257, 6); label.writeUInt32BE(name.length + 1, 0);
    for (let at = 0; at < name.length; at += 1) label.writeUInt16BE(name.charCodeAt(at), 4 + at * 2);
    records.push(record, label);
  });
  return Buffer.concat(records);
}

function paletteGpl(colors, name = 'IKEMEN Indexed Palette') {
  const source = normalizeColors(colors), safeName = String(name || 'IKEMEN Indexed Palette').replace(/[\r\n]+/g, ' ').trim();
  const lines = ['GIMP Palette', `Name: ${safeName}`, 'Columns: 16', 'Channels: RGBA', '# Index order is authoritative. Index 0 is the IKEMEN transparency slot.'];
  source.forEach((color, index) => lines.push(`${String(color[0]).padStart(3)} ${String(color[1]).padStart(3)} ${String(color[2]).padStart(3)} ${String(color[3]).padStart(3)} Index ${String(index).padStart(3, '0')}`));
  return `${lines.join('\n')}\n`;
}

function palettePackReadme(baseName) {
  return [
    `${baseName} artist palette pack`,
    '',
    'Files:',
    `- ${baseName}.act — exact 256-entry RGB color table for IKEMEN, Photoshop, and compatible tools.`,
    `- ${baseName}_Photoshop.aco — named Photoshop Swatches entries (Index 000 through Index 255).`,
    `- ${baseName}_Aseprite.gpl — ordered RGBA Aseprite palette with index names and transparency preserved.`,
    `- ${baseName}_Swatch.png — visual 16 × 16 reference grid in row-major index order.`,
    '',
    'Index contract:',
    '- Do not sort, deduplicate, or optimize the colors.',
    '- Index 0 is the IKEMEN transparency slot.',
    '- ACT and ACO store RGB only. The Aseprite GPL preserves alpha.',
    '- Keep working sprites in Indexed Color Mode when index identity matters.',
    ''
  ].join('\n');
}

function paletteSwatchPng(colors, cellSize = 16) {
  const source = normalizeColors(colors), cell = Math.max(1, Math.min(64, Math.trunc(Number(cellSize)) || 16)), size = 16 * cell, rgba = Buffer.alloc(size * size * 4);
  for (let index = 0; index < 256; index += 1) {
    const color = source[index], cellX = (index % 16) * cell, cellY = Math.floor(index / 16) * cell;
    for (let y = 0; y < cell; y += 1) for (let x = 0; x < cell; x += 1) { const at = ((cellY + y) * size + cellX + x) * 4; rgba[at] = color[0]; rgba[at + 1] = color[1]; rgba[at + 2] = color[2]; rgba[at + 3] = 255; }
  }
  return rgbaPng(size, size, rgba);
}

function paletteReplacementPlan(archive, paletteIndex, candidate) {
  const index = Number(paletteIndex), palette = archive && archive.palettes && archive.palettes[index];
  if (!palette) throw new Error(`Palette ${paletteIndex} does not exist.`);
  if (palette.dataSize === 0) throw new Error(`Palette ${palette.group},${palette.number} is linked to palette index ${palette.link}. Replace its stored source palette instead.`);
  if (palette.colors !== 256 || palette.dataSize < 1024) throw new Error(`Palette ${palette.group},${palette.number} is not a writable 256-color SFF palette.`);
  const colors = normalizeColors(candidate), comparison = comparePaletteColors(paletteRgba(archive, index), colors);
  const offset = archive.header.literalDataOffset + palette.dataOffset;
  if (offset < 0 || offset + 1024 > archive.buffer.length) throw new Error('Palette data is outside the SFF file.');
  return { paletteIndex: index, palette, colors, offset, ...comparison };
}

function bufferWithPaletteReplacement(archive, paletteIndex, candidate) {
  const plan = paletteReplacementPlan(archive, paletteIndex, candidate), output = Buffer.from(archive.buffer);
  for (let index = 0; index < 256; index += 1) {
    const at = plan.offset + index * 4;
    output[at] = plan.colors[index][0];
    output[at + 1] = plan.colors[index][1];
    output[at + 2] = plan.colors[index][2];
    // ACT does not carry alpha. Preserve the SFF's existing transparency data.
  }
  return { buffer: output, plan };
}

function bufferWithPaletteAssignments(archive, spriteIndices, paletteIndex) {
  if (archive && archive.header && archive.header.legacy) throw new Error('SFF v1 stores palettes inside PCX sprites and has no writable palette-assignment field. Rebuild as SFF v2.1 to assign palettes safely.');
  const targetPalette = Number(paletteIndex);
  if (!archive || !archive.palettes || !archive.palettes[targetPalette]) throw new Error(`Palette ${paletteIndex} does not exist.`);
  const indices = [...new Set((spriteIndices || []).map(Number))], sprites = [];
  for (const index of indices) {
    const sprite = archive.sprites[index];
    if (!sprite) throw new Error(`Sprite archive index ${index} does not exist.`);
    if (sprite.colorDepth !== 8) throw new Error(`Sprite ${sprite.group},${sprite.number} is not indexed and cannot receive an SFF palette assignment.`);
    sprites.push(sprite);
  }
  const output = Buffer.from(archive.buffer), changed = sprites.filter((sprite) => sprite.paletteIndex !== targetPalette);
  for (const sprite of changed) output.writeUInt16LE(targetPalette, archive.header.firstSpriteHeaderOffset + sprite.index * 28 + 24);
  return { buffer: output, paletteIndex: targetPalette, changedIndices: changed.map((sprite) => sprite.index), changedCount: changed.length };
}

function paletteById(archive, group, number) {
  return archive.palettes.find((palette) => palette.group === group && palette.number === number) || null;
}

function paletteScopedSprites(sprites, sourcePaletteIndex) {
  const paletteIndex = Number(sourcePaletteIndex);
  if (!Number.isInteger(paletteIndex) || paletteIndex < 0) throw new Error('A valid source palette index is required.');
  const source = Array.isArray(sprites) ? sprites : [];
  const indexed = source.filter((sprite) => sprite && sprite.colorDepth === 8);
  const matching = indexed.filter((sprite) => sprite.paletteIndex === paletteIndex);
  return {
    matching,
    skippedOtherPalettes: indexed.length - matching.length,
    skippedNonIndexed: source.length - indexed.length
  };
}

function auditPaletteSetup(archive, profile = 'none') {
  const issues = [], ids = new Set(), indexed = archive.sprites.filter((sprite) => sprite.colorDepth === 8);
  const add = (severity, code, message) => issues.push({ severity, code, message });
  for (const palette of archive.palettes) {
    const id = `${palette.group},${palette.number}`;
    if (ids.has(id)) add('error', 'DUPLICATE_PALETTE_ID', `Palette ID ${id} is declared more than once.`);
    ids.add(id);
    try { resolvedPalette(archive, palette.index); } catch (error) { add('error', 'INVALID_PALETTE_LINK', `${id}: ${error.message}`); }
  }
  for (const sprite of indexed) if (!archive.palettes[sprite.paletteIndex]) add('error', 'MISSING_SPRITE_PALETTE', `Sprite ${sprite.group},${sprite.number} uses missing palette index ${sprite.paletteIndex}.`);

  if (profile === 'jnp') {
    const master = paletteById(archive, 1, 0), fallback = paletteById(archive, 1, 1), sf6 = paletteById(archive, 1, 2);
    if (!master) add('error', 'MISSING_FULL_CS', 'JNP profile expects the protected full-CS palette at 1,0.');
    if (!fallback) add('error', 'MISSING_DEFAULT_PALETTE', 'JNP profile expects the default player palette at 1,1.');
    if (!sf6) add('info', 'NO_SECOND_PLAYER_PALETTE', 'No 1,2 player palette is currently embedded.');
    const templates = archive.sprites.filter((sprite) => sprite.group === 59000 && sprite.number === 0);
    if (templates.length !== 1) add('error', 'MASTER_TEMPLATE_COUNT', `Expected one protected master-template sprite at 59000,0; found ${templates.length}.`);
    else {
      const template = templates[0];
      if (template.axisX !== 0 || template.axisY !== 0) add('warning', 'MASTER_TEMPLATE_AXIS', `Protected template 59000,0 should use axis 0,0; found ${template.axisX},${template.axisY}.`);
      if (template.colorDepth !== 8) add('error', 'MASTER_TEMPLATE_DEPTH', 'Protected template 59000,0 must remain indexed (8-bit).');
      if (master && template.paletteIndex !== master.index) add('error', 'MASTER_TEMPLATE_PALETTE', `Protected template 59000,0 should use 1,0 (palette index ${master.index}); it uses palette index ${template.paletteIndex}.`);
    }
    if (fallback) {
      const mismatched = indexed.filter((sprite) => sprite.group !== 59000 && sprite.paletteIndex !== fallback.index);
      if (mismatched.length) add('warning', 'GAMEPLAY_PALETTE_ASSIGNMENT', `${mismatched.length} indexed non-template sprite(s) do not use default palette 1,1.`);
    }
  }
  return {
    exact: !issues.some((issue) => issue.severity === 'error' || issue.severity === 'warning'),
    issues,
    paletteCount: archive.palettes.length,
    indexedSpriteCount: indexed.length,
    roles: archive.palettes.map((palette) => ({ index: palette.index, group: palette.group, number: palette.number, role: paletteRole(palette) }))
  };
}

module.exports = {
  normalizeColors,
  paletteRole,
  comparePaletteColors,
  reversePaletteRgb,
  paletteAco,
  paletteGpl,
  palettePackReadme,
  paletteSwatchPng,
  paletteReplacementPlan,
  bufferWithPaletteReplacement,
  bufferWithPaletteAssignments,
  paletteScopedSprites,
  auditPaletteSetup
};
