'use strict';

const path = require('path');
const { paletteColorSignature } = require('./palette_plan');

function text(value, maximum = 256) { return String(value ?? '').trim().slice(0, maximum); }
function coordinateKey(value) { return `${Number(value.group)},${Number(value.number)}`; }

function filenameMetadata(filename) {
  const basename = path.basename(String(filename || 'Palette'), path.extname(String(filename || ''))), value = text(basename) || 'Palette';
  const patterns = [
    /^\s*(\d+)\s*[,._-]\s*(\d+)(?:\s*[-–—_:]\s*|\s+)?(.*)$/,
    /^\s*(?:pal(?:ette)?\s*)?(\d+)\s*[,._-]\s*(\d+)(?:\s*[-–—_:]\s*|\s+)?(.*)$/i
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(value);
    if (!match) continue;
    const group = Number(match[1]), number = Number(match[2]);
    if (group > 65535 || number > 65535) break;
    return { filename: value, name: text(match[3]) || value, requestedCoordinate: { group, number }, numbered: true };
  }
  return { filename: value, name: value, requestedCoordinate: null, numbered: false };
}

function decoratePalettes(palettes = [], metadata = {}, staged = []) {
  const stagedByCoordinate = new Map(staged.map(item => [coordinateKey(item), item]));
  return palettes.map((palette, order) => {
    const key = coordinateKey(palette), saved = metadata[key] || {}, stagedItem = stagedByCoordinate.get(key), name = text(saved.name || palette.name || stagedItem?.name || '');
    return { ...palette, stableId: `embedded:${Number(palette.physicalIndex ?? palette.index ?? order)}`, coordinate: key, name, comment: name, aliases: Array.isArray(saved.aliases) ? saved.aliases.map(value => text(value)).filter(Boolean) : [], sourceStatus: palette.linked || palette.dataSize === 0 ? 'linked' : 'embedded', staged: Boolean(stagedItem), stagedName: text(stagedItem?.name || '') };
  });
}

function duplicateClusters(entries = []) {
  const groups = new Map();
  for (const entry of entries) {
    if (!Array.isArray(entry.colors) || entry.colors.length !== 256) continue;
    const signature = paletteColorSignature(entry.colors);
    if (!groups.has(signature)) groups.set(signature, []);
    groups.get(signature).push({ stableId: entry.stableId, group: Number(entry.group), number: Number(entry.number), name: text(entry.name), signature });
  }
  return [...groups.values()].filter(group => group.length > 1);
}

function filter(entries = [], options = {}) {
  const query = text(options.query, 512).toLocaleLowerCase('en-US'), group = options.group === '' || options.group == null ? null : Number(options.group), rangeStart = options.rangeStart === '' || options.rangeStart == null ? null : Number(options.rangeStart), rangeEnd = options.rangeEnd === '' || options.rangeEnd == null ? null : Number(options.rangeEnd), duplicates = new Set((options.duplicateClusters || duplicateClusters(entries)).flatMap(cluster => cluster.map(item => item.stableId)));
  return entries.filter(entry => {
    if (group !== null && Number(entry.group) !== group) return false;
    if (rangeStart !== null && Number(entry.number) < rangeStart) return false;
    if (rangeEnd !== null && Number(entry.number) > rangeEnd) return false;
    if (options.linked === true && entry.sourceStatus !== 'linked') return false;
    if (options.unused === true && Number(entry.spriteCount) !== 0) return false;
    if (options.duplicates === true && !duplicates.has(entry.stableId)) return false;
    if (!query) return true;
    const haystack = [entry.group, entry.number, entry.name, entry.comment, ...(entry.aliases || []), entry.sourceStatus, entry.role, `${entry.spriteCount || 0} sprites`].join(' ').toLocaleLowerCase('en-US');
    return haystack.includes(query);
  });
}

function sort(entries = [], method = 'coordinate') {
  const rows = [...entries], compareText = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  const methods = {
    coordinate: (a, b) => Number(a.group) - Number(b.group) || Number(a.number) - Number(b.number) || compareText(a.stableId, b.stableId),
    name: (a, b) => compareText(a.name || a.comment || '', b.name || b.comment || '') || methods.coordinate(a, b),
    usage: (a, b) => Number(b.spriteCount || 0) - Number(a.spriteCount || 0) || methods.coordinate(a, b),
    physical: (a, b) => Number(a.physicalIndex ?? a.index ?? 0) - Number(b.physicalIndex ?? b.index ?? 0)
  };
  return rows.sort(methods[method] || methods.coordinate);
}

module.exports = { filenameMetadata, decoratePalettes, duplicateClusters, filter, sort, coordinateKey };
