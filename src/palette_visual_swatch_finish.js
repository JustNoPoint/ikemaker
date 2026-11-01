'use strict';

function positive(value, label, allowZero = false) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < (allowZero ? 0 : 1)) throw new Error(`${label} must be ${allowZero ? 'zero or greater' : 'a positive integer'}.`);
  return number;
}

function darkestColor(colors, usedIndexes = []) {
  const allowed = new Set((usedIndexes || []).map(Number));
  const candidates = (colors || []).map((rgba, index) => ({ index, rgba: (rgba || []).map(Number) })).filter(item => (!allowed.size || allowed.has(item.index)) && item.rgba.length === 4 && item.rgba[3] > 0 && item.rgba.every(value => Number.isInteger(value) && value >= 0 && value <= 255));
  if (!candidates.length) throw new Error('A visible retained template color is required for automatic row-label text.');
  candidates.sort((a,b) => {
    const luminance = item => 0.2126 * item.rgba[0] + 0.7152 * item.rgba[1] + 0.0722 * item.rgba[2];
    return luminance(a) - luminance(b) || a.index - b.index;
  });
  return candidates[0];
}

function cornerPlacement(input = {}) {
  const canvas = { width: positive(input.canvas?.width, 'Canvas width'), height: positive(input.canvas?.height, 'Canvas height') };
  const block = { width: positive(input.block?.width, 'Swatch block width'), height: positive(input.block?.height, 'Swatch block height') };
  const margin = positive(input.margin ?? 8, 'Swatch margin', true), corner = String(input.corner || 'bottom-right');
  if (!['top-left','top-right','bottom-left','bottom-right','exact'].includes(corner)) throw new Error('Choose a swatch corner or exact placement.');
  if (corner === 'exact') {
    const x = positive(input.x, 'Exact swatch X', true), y = positive(input.y, 'Exact swatch Y', true);
    return { corner, x, y, canvas: { width: Math.max(canvas.width, x + block.width + margin), height: Math.max(canvas.height, y + block.height + margin) } };
  }
  const right = corner.endsWith('right'), bottom = corner.startsWith('bottom');
  const width = Math.max(canvas.width, block.width + margin * 2), height = Math.max(canvas.height, block.height + margin * 2);
  return { corner, x: right ? width - margin - block.width : margin, y: bottom ? height - margin - block.height : margin, canvas: { width, height } };
}

function finishReview(input = {}) {
  const missing = [...new Set((input.missingIndexes || []).map(Number))].sort((a,b)=>a-b);
  if (missing.length) throw new Error(`Assign or intentionally unlist every retained color before export. Missing indexes: ${missing.join(', ')}.`);
  const label = darkestColor(input.colors, input.usedIndexes), placement = cornerPlacement(input);
  return { output: 'flat-indexed-png', paletteEntryCount: 256, labelColorIndex: label.index, labelRgba: label.rgba, placement };
}

module.exports = { darkestColor, cornerPlacement, finishReview };
