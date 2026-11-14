'use strict';

const { encodeIndexedPng } = require('./palette_indexed_png');
const { rgbaPng } = require('./sff_reader');

const MAX_VERTICES = 256;

function approvedPolygon(rect, canvas) {
  if (rect.polygon === undefined) return undefined;
  const points = rect.polygon;
  if (!Array.isArray(points) || points.length < 3 || points.length > MAX_VERTICES ||
      points.some(point => !point || !Number.isSafeInteger(point.x) || !Number.isSafeInteger(point.y) ||
        point.x < rect.x || point.x > rect.x + rect.width || point.y < rect.y || point.y > rect.y + rect.height ||
        point.x < 0 || point.y < 0 || point.x > canvas.width || point.y > canvas.height)) {
    throw new Error('An approved sheet polygon has invalid or out-of-bounds vertices.');
  }
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  if (!area) throw new Error('An approved sheet polygon has zero area.');
  return points.map(({ x, y }) => ({ x, y }));
}

function cropPolygon(image, cell) {
  const { width, height, x, y, polygon } = cell;
  if (!polygon) return null;
  const inside = Buffer.alloc(width * height), used = image.indices ? new Set() : null;
  let covered = 0;
  for (let row = 0; row < height; row++) {
    const py = y + row + 0.5, crossings = [];
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if ((a.y > py) !== (b.y > py)) crossings.push(a.x + (b.x - a.x) * (py - a.y) / (b.y - a.y));
    }
    crossings.sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const start = Math.max(0, Math.ceil(crossings[i] - x - 0.5));
      const end = Math.min(width, Math.ceil(crossings[i + 1] - x - 0.5));
      for (let col = start; col < end; col++) {
        const at = row * width + col;
        inside[at] = 1;
        covered++;
        if (used) used.add(image.indices[(y + row) * image.width + x + col]);
      }
    }
  }
  const outside = covered < width * height;
  if (image.indices) {
    const pixels = Buffer.alloc(width * height);
    for (let row = 0; row < height; row++) image.indices.copy(pixels, row * width, (y + row) * image.width + x, (y + row) * image.width + x + width);
    if (!outside) return encodeIndexedPng(cell, pixels, image.colors);
    // An unused index may carry the transparent outside without changing any
    // inside index, including an opaque index 0 or duplicate palette colors.
    let clear = -1;
    for (let index = 0; index < 256; index++) if (!used.has(index) && image.colors[index][3] === 0) { clear = index; break; }
    if (clear < 0) for (let index = 0; index < 256; index++) if (!used.has(index)) { clear = index; break; }
    if (clear >= 0) {
      const colors = image.colors.map(color => color.slice());
      colors[clear][3] = 0;
      for (let at = 0; at < pixels.length; at++) if (!inside[at]) pixels[at] = clear;
      return encodeIndexedPng(cell, pixels, colors);
    }
    const rgba = Buffer.alloc(width * height * 4);
    for (let at = 0; at < pixels.length; at++) if (inside[at]) rgba.set(image.colors[pixels[at]], at * 4);
    return rgbaPng(width, height, rgba);
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    const at = row * width + col;
    if (inside[at]) image.rgba.copy(rgba, at * 4, ((y + row) * image.width + x + col) * 4, ((y + row) * image.width + x + col + 1) * 4);
  }
  return rgbaPng(width, height, rgba);
}

module.exports = { approvedPolygon, cropPolygon, MAX_VERTICES };
