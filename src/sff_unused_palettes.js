'use strict';
const {
  parseSffBuffer,
  paletteRgba
} = require('./sff_reader');
const {
  indexed
} = require('./palette_sprite_associations');
const {
  hash
} = require('./mutation_safety');

function resolvedSprite(archive, sprite) {
  const seen = new Set();
  while (sprite && !sprite.dataSize) {
    if (seen.has(sprite.index)) throw Error('Circular sprite link.');
    seen.add(sprite.index);
    sprite = archive.sprites[sprite.link];
  }
  if (!sprite) throw Error('Missing sprite link.');
  return sprite;
}

function deletionReferences(files) {
  const coordinates = new Set(),
    dynamicGroups = new Set();
  let unresolved = false;
  const pair = value => {
    const match = /^\s*(\d+)\s*,\s*(\d+)\s*$/.exec(value);
    if (match) coordinates.add(Number(match[1]) + ',' + Number(match[2]));
    else {
      const group = /^\s*(\d+)\s*,/.exec(value);
      if (group) dynamicGroups.add(Number(group[1]));
      else unresolved = true;
    }
  };
  for (const file of files) {
    const zss = /\.(zss|lua)$/i.test(file.filename) || /\bremappal\s*[{:]/i.test(file.text);
    const text = file.text.replace(zss ? /#[^\r\n]*/g : /;[^\r\n]*/g, '');
    for (const match of text.matchAll(/\bpal\.defaults?\s*=\s*([^\r\n]+)/gi))
      for (const value of match[1].split(',')) {
        if (/^\s*\d+\s*$/.test(value)) coordinates.add('1,' + Number(value));
        else unresolved = true;
      }
    for (const match of text.matchAll(/\bremappal\s*[:=]\s*([^\r\n;}]+)/gi)) pair(match[1]);
    const blocks = zss ? [...text.matchAll(/\bremappal\s*\{([^}]*)(?:}|$)/gi)].map(match => match[1]) : text.split(/(?=^\s*\[)/m).filter(block => /\btype\s*=\s*remappal\b/i.test(block));
    for (const block of blocks) {
      const refs = [...block.matchAll(/\b(source|dest(?:ination)?)\s*[:=]\s*([^\r\n;}]+)/gi)];
      if (!refs.some(ref => ref[1].toLowerCase() === 'source')) coordinates.add('1,1');
      if (!refs.some(ref => ref[1].toLowerCase().startsWith('dest'))) unresolved = true;
      for (const ref of refs) pair(ref[2]);
    }
    for (const occurrence of text.matchAll(/\bremappal\b/gi)) {
      const rest = text.slice(occurrence.index + occurrence[0].length),
        prefix = text.slice(0, occurrence.index);
      if (/^\s*[:=]/.test(rest)) {
        if (!/^\s*[:=]\s*[^\s\r\n;}]/.test(rest)) unresolved = true;
        continue;
      }
      if (zss && /^\s*\{/.test(rest) || !zss && /\btype\s*=\s*$/i.test(prefix)) continue;
      unresolved = true;
    }
  }
  return {
    coordinates,
    dynamicGroups,
    unresolved
  };
}

function review(archive, files = []) {
  if (archive.header.legacy) throw Error('Unused palette removal requires SFF v2.');
  const protectedIndexes = new Set(),
    reasons = new Map();
  const protect = (index, reason) => {
    if (!archive.palettes[index]) throw Error('An indexed sprite or linked palette references a missing palette.');
    protectedIndexes.add(index);
    reasons.set(index, reason)
  };
  for (const sprite of archive.sprites) {
    resolvedSprite(archive, sprite);
    if (indexed(archive, sprite)) protect(sprite.paletteIndex, 'indexed sprite');
  }
  // Keep every authored linked identity and its complete owner chain, even without sprite users.
  for (const palette of archive.palettes)
    if (!palette.dataSize) {
      let item = palette,
        seen = new Set();
      while (item) {
        if (seen.has(item.index)) throw Error('Circular palette link.');
        seen.add(item.index);
        protect(item.index, 'linked palette');
        if (item.dataSize) break;
        item = archive.palettes[item.link];
        if (!item) throw Error('Missing linked palette owner.');
      }
    }
  const audit = deletionReferences(files);
  if (files.summary?.incomplete || audit.unresolved) throw Error('Palette reference audit is incomplete or contains dynamic references. Resolve those references before deleting palettes.');
  const coordinates = audit.coordinates;
  for (const palette of archive.palettes)
    if (files.length && palette.group === 1 || audit.dynamicGroups.has(palette.group) || coordinates.has(`${palette.group},${palette.number}`)) protect(palette.index, 'external character reference');
  const candidates = archive.palettes.filter(item => !protectedIndexes.has(item.index)).map(item => ({
    physicalIndex: item.index,
    group: item.group,
    number: item.number
  }));
  const references = files.map(file => ({
    filename: file.filename,
    hash: hash(Buffer.from(file.text))
  })).sort((a, b) => a.filename.localeCompare(b.filename));
  const body = {
    sourceHash: hash(archive.buffer),
    candidates,
    references
  };
  return {
    ...body,
    reviewHash: hash(Buffer.from(JSON.stringify(body))),
    protected: [...reasons].map(([physicalIndex, reason]) => ({
      physicalIndex,
      reason
    }))
  };
}

function build(archive, plan) {
  if (plan.sourceHash !== hash(archive.buffer)) throw Error('The SFF changed after review.');
  const remove = new Set(plan.candidates.map(item => item.physicalIndex)),
    kept = archive.palettes.filter(item => !remove.has(item.index)),
    mapping = new Map(kept.map((item, index) => [item.index, index])),
    buffer = Buffer.from(archive.buffer),
    start = archive.header.firstPaletteHeaderOffset;
  // Copy from the original buffer: overlapping compaction cannot corrupt later rows.
  kept.forEach((item, index) => {
    archive.buffer.copy(buffer, start + index * 16, start + item.index * 16, start + (item.index + 1) * 16);
    if (!item.dataSize) {
      if (!mapping.has(item.link)) throw Error('A retained palette links to a removed palette.');
      buffer.writeUInt16LE(mapping.get(item.link), start + index * 16 + 6);
    }
  });
  buffer.fill(0, start + kept.length * 16, start + archive.palettes.length * 16);
  buffer.writeUInt32LE(kept.length, 48);
  for (const sprite of archive.sprites) {
    const index = mapping.get(sprite.paletteIndex);
    if (indexed(archive, sprite) && index === undefined) throw Error('Cannot remove an indexed sprite palette.');
    buffer.writeUInt16LE(index === undefined ? 0 : index, sprite.headerOffset + 24);
  }
  const reopened = parseSffBuffer(buffer, archive.filename);
  verify(archive, reopened, kept);
  return {
    buffer,
    reopened,
    removed: plan.candidates
  };
}

function verify(before, after, kept) {
  if (before.sprites.length !== after.sprites.length || after.palettes.length !== kept.length) throw Error('Reopened archive entry count differs.');
  kept.forEach((item, index) => {
    const actual = after.palettes[index];
    if (item.group !== actual.group || item.number !== actual.number || JSON.stringify(paletteRgba(before, item.index)) !== JSON.stringify(paletteRgba(after, index))) throw Error('Retained palette changed during removal.');
  });
  before.sprites.forEach((item, index) => {
    const actual = after.sprites[index],
      {
        paletteIndex: a,
        ...left
      } = item,
      {
        paletteIndex: b,
        ...right
      } = actual;
    if (JSON.stringify(left) !== JSON.stringify(right)) throw Error('Sprite metadata changed during palette removal.');
    const owner = resolvedSprite(before, item),
      next = resolvedSprite(after, actual);
    if (!before.buffer.subarray(owner.dataOffset, owner.dataOffset + owner.dataSize).equals(after.buffer.subarray(next.dataOffset, next.dataOffset + next.dataSize))) throw Error('Sprite payload changed.');
    if (indexed(before, item) && JSON.stringify(paletteRgba(before, a)) !== JSON.stringify(paletteRgba(after, b))) throw Error('Indexed sprite colors changed.');
  });
  return true;
}
module.exports = {
  deletionReferences,
  review,
  build,
  verify
};
