'use strict';

const crypto = require('crypto');

const MAX_COORDINATE = 65535;
const MAX_RANGE = 4096;

function whole(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > MAX_COORDINATE) throw new Error(`${label} must be a whole value from 0 through ${MAX_COORDINATE}.`);
  return number;
}

function compactPaletteSlots(input = {}) {
  const group = whole(input.group, 'Palette group'), start = whole(input.start, 'Range start'), end = whole(input.end, 'Range end');
  if (end < start) throw new Error('The palette-number range is reversed.');
  if (end - start + 1 > MAX_RANGE) throw new Error(`Review at most ${MAX_RANGE} palette numbers at once.`);
  const reserved = new Set((input.reservedNumbers || []).map(value => whole(value, 'Preserved gap')));
  for (const number of reserved) if (number < start || number > end) throw new Error(`Preserved gap ${number} is outside the reviewed range.`);

  const palettes = (input.palettes || []).map((item, physicalIndex) => ({
    physicalIndex: Number.isInteger(Number(item.physicalIndex)) ? Number(item.physicalIndex) : Number.isInteger(Number(item.index)) ? Number(item.index) : physicalIndex,
    group: whole(item.group, 'Palette group'), number: whole(item.number, 'Palette number'),
    linked: Boolean(item.linked || item.dataSize === 0), link: item.link == null ? null : Number(item.link)
  }));
  const coordinateOwners = new Map();
  for (const palette of palettes) {
    const key = `${palette.group},${palette.number}`;
    if (coordinateOwners.has(key)) throw new Error(`Palette coordinate ${key} is ambiguous across physical entries.`);
    coordinateOwners.set(key, palette.physicalIndex);
  }

  const selected = palettes.filter(item => item.group === group && item.number >= start && item.number <= end).sort((a, b) => a.number - b.number || a.physicalIndex - b.physicalIndex);
  const occupied = new Set(selected.map(item => item.number));
  const preservedOccupied = new Set([...reserved].filter(number => occupied.has(number)));
  const available = [];
  for (let number = start; number <= end; number += 1) if (!reserved.has(number)) available.push(number);
  const assigned = new Set(preservedOccupied), rows = []; let priorTarget = start - 1;
  for (const palette of selected) {
    if (reserved.has(palette.number)) {
      rows.push({ ...palette, from: { group, number: palette.number }, to: { group, number: palette.number }, status: 'reserved', changed: false });
      priorTarget = palette.number;
      continue;
    }
    const barrier = [...reserved].filter(number => number < palette.number).reduce((highest, number) => Math.max(highest, number), start - 1), lowerBound = Math.max(start, priorTarget + 1, barrier + 1);
    const target = available.find(number => number >= lowerBound && number <= palette.number && !assigned.has(number));
    if (target == null) throw new Error(`Palette ${group},${palette.number} cannot move downward without crossing a preserved slot.`);
    assigned.add(target);
    priorTarget = target;
    rows.push({ ...palette, from: { group, number: palette.number }, to: { group, number: target }, status: target === palette.number ? 'unchanged' : 'move', changed: target !== palette.number });
  }
  rows.sort((a, b) => a.from.number - b.from.number || a.physicalIndex - b.physicalIndex);
  const proposals = rows.filter(item => item.changed).map(item => ({ kind: 'renumber', physicalIndex: item.physicalIndex, to: item.to }));
  const body = { group, start, end, reservedNumbers: [...reserved].sort((a, b) => a - b), paletteCount: palettes.length, reviewedCount: rows.length, changeCount: proposals.length, rows, proposals };
  return { ...body, reviewHash: crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex') };
}

module.exports = { MAX_COORDINATE, MAX_RANGE, compactPaletteSlots };
