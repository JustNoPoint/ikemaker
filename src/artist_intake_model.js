'use strict';

const path = require('path');

const CATEGORIES = Object.freeze([
  'Required', 'Movement', 'Get Hit', 'Guard', 'Intro / Win', 'Normal',
  'Special', 'Hyper', 'Throw Part', 'Effect', 'Portrait', 'Unclassified'
]);
const CATEGORY_GROUPS = Object.freeze({ Required: 0, Movement: 100, 'Get Hit': 5000, Guard: 120, 'Intro / Win': 180, Normal: 200, Special: 1000, Hyper: 3000, 'Throw Part': 6000, Effect: 10000, Portrait: 9000, Unclassified: 0 });

function safeName(value, fallback = 'artist-intake') {
  const cleaned = String(value || '').trim().replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '');
  return cleaned || fallback;
}

function imageDimensions(buffer, extension = '') {
  if (!Buffer.isBuffer(buffer)) throw new Error('Image data is required.');
  if (buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), format: 'png' };
  }
  if (buffer.length >= 10 && /^GIF8[79]a$/.test(buffer.toString('ascii', 0, 6))) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8), format: 'gif' };
  }
  throw new Error(`Unsupported image dimensions${extension ? ` for ${extension}` : ''}. Use PNG or GIF.`);
}

function sheetCells(dimensions, options = {}) {
  const width = Number(dimensions.width), height = Number(dimensions.height);
  const cellWidth = Number(options.cellWidth), cellHeight = Number(options.cellHeight);
  const offsetX = Number(options.offsetX || 0), offsetY = Number(options.offsetY || 0);
  const spacingX = Number(options.spacingX || 0), spacingY = Number(options.spacingY || 0);
  if (![width, height, cellWidth, cellHeight].every((value) => Number.isInteger(value) && value > 0)) throw new Error('Sheet and cell sizes must be positive whole numbers.');
  if (![offsetX, offsetY, spacingX, spacingY].every((value) => Number.isInteger(value) && value >= 0)) throw new Error('Sheet offsets and spacing must be zero or positive whole numbers.');
  const columns = Number(options.columns || Math.floor((width - offsetX + spacingX) / (cellWidth + spacingX)));
  const rows = Number(options.rows || Math.floor((height - offsetY + spacingY) / (cellHeight + spacingY)));
  if (columns < 1 || rows < 1) throw new Error('The cell settings do not fit this sheet.');
  const result = [];
  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
    const x = offsetX + column * (cellWidth + spacingX), y = offsetY + row * (cellHeight + spacingY);
    if (x + cellWidth > width || y + cellHeight > height) continue;
    result.push({ ordinal: result.length, row, column, x, y, width: cellWidth, height: cellHeight });
  }
  return options.order === 'column' ? [...result].sort((a, b) => a.column - b.column || a.row - b.row).map((cell, ordinal) => ({ ...cell, ordinal })) : result;
}

function provisionalName(category, sequence = 0, label = '') {
  const custom = String(label || '').trim();
  if (custom) return custom;
  const prefix = CATEGORIES.includes(category) ? category : 'Unclassified';
  return `${prefix} ${String(Number(sequence) || 0).padStart(2, '0')}`;
}
function suggestedAssignment(category, sequence = 0) {
  const safeCategory = CATEGORIES.includes(category) ? category : 'Unclassified', slot = Math.max(0, Number(sequence) || 0);
  const base = CATEGORY_GROUPS[safeCategory] ?? 0;
  return { category: safeCategory, sequence: slot, name: provisionalName(safeCategory, slot), group: ['Special', 'Hyper'].includes(safeCategory) ? base + slot * 10 : base + slot, startIndex: 0 };
}

function manifestRows(frames, assignment = {}) {
  const group = Number(assignment.group);
  const startIndex = Number(assignment.startIndex || 0);
  if (!Number.isInteger(group)) throw new Error('A provisional SFF group is required.');
  const name = provisionalName(assignment.category, assignment.sequence, assignment.name);
  return frames.map((frame, offset) => ({
    OriginalRelativePath: frame.relativePath || path.basename(frame.filename || `frame_${offset}.png`),
    Source: frame.filename || frame.relativePath || '',
    ArtistSource: assignment.artistSource || '',
    ArtistFrame: Number.isInteger(frame.artistFrame) ? frame.artistFrame : offset,
    SourceLabel: frame.sourceLabel || '',
    SuggestedName: name,
    SystemName: assignment.systemName || '',
    Category: assignment.category || 'Unclassified',
    BaseGroup: group,
    ComputedGroup: group,
    ImageIndex: startIndex + offset,
    AxisX: Number(assignment.axisX || 0),
    AxisY: Number(assignment.axisY || 0),
    ReviewStatus: 'REVIEW',
    ReviewReason: 'Artist intake assignment; verify identity, axis, palette, and AIR timing before promotion.'
  }));
}

function recipe(value = {}) {
  return {
    version: 1,
    artist: String(value.artist || '').trim(),
    sourceType: ['gif', 'sheet', 'folder'].includes(value.sourceType) ? value.sourceType : 'folder',
    sheet: {
      cellWidth: Number(value.sheet?.cellWidth || 0), cellHeight: Number(value.sheet?.cellHeight || 0),
      offsetX: Number(value.sheet?.offsetX || 0), offsetY: Number(value.sheet?.offsetY || 0),
      spacingX: Number(value.sheet?.spacingX || 0), spacingY: Number(value.sheet?.spacingY || 0),
      order: value.sheet?.order === 'column' ? 'column' : 'row'
    },
    defaults: { category: value.defaults?.category || 'Unclassified', axisX: Number(value.defaults?.axisX || 0), axisY: Number(value.defaults?.axisY || 0) }
  };
}

module.exports = { CATEGORIES, CATEGORY_GROUPS, safeName, imageDimensions, sheetCells, provisionalName, suggestedAssignment, manifestRows, recipe };
