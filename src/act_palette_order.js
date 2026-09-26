'use strict';

const { actRgba, paletteAct } = require('./sff_reader');
const { reversePaletteRgb } = require('./palette_editor');

const INDEX_ORDER = 'index';
const REVERSED_ORDER = 'reversed';

function normalizeOrder(value) {
  return value === REVERSED_ORDER ? REVERSED_ORDER : INDEX_ORDER;
}

function colorsForOrder(colors, order) {
  const source = colors.map((color) => color.slice());
  return normalizeOrder(order) === REVERSED_ORDER ? reversePaletteRgb(source) : source;
}

function readAct(buffer, order = INDEX_ORDER) {
  return colorsForOrder(actRgba(buffer), order);
}

function writeAct(colors, order = INDEX_ORDER) {
  return paletteAct(colorsForOrder(colors, order));
}

function orderLabel(order) {
  return normalizeOrder(order) === REVERSED_ORDER
    ? 'Reversed Photoshop method (255 → 0)'
    : 'ACT file order (0 → 255)';
}

module.exports = { INDEX_ORDER, REVERSED_ORDER, normalizeOrder, colorsForOrder, readAct, writeAct, orderLabel };
