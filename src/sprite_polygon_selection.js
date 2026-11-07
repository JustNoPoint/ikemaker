'use strict';

function polygonSelection(width, height, vertices) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 16777216) throw new Error('Sprite dimensions are outside the polygon selection limit.');
  if (!Array.isArray(vertices) || vertices.length < 3 || vertices.length > 512 || vertices.some(point => !point || !Number.isInteger(point.x) || !Number.isInteger(point.y) || point.x < 0 || point.y < 0 || point.x >= width || point.y >= height)) throw new Error('Place at least three and at most 512 polygon vertices inside the sprite.');
  const polygon = vertices.filter((point, index) => index === 0 || point.x !== vertices[index - 1].x || point.y !== vertices[index - 1].y);
  if (polygon.length > 1 && polygon[0].x === polygon.at(-1).x && polygon[0].y === polygon.at(-1).y) polygon.pop();
  if (new Set(polygon.map(point => `${point.x},${point.y}`)).size < 3) throw new Error('The polygon needs three distinct vertices.');
  const xs = polygon.map(point => point.x), ys = polygon.map(point => point.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const mask = new Uint8Array(width * height);
  let selected = 0;
  const mark = (x, y) => { const at = y * width + x; if (!mask[at]) { mask[at] = 1; selected++; } };
  for (let y = minY; y <= maxY; y++) {
    const crossings = [];
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[j], b = polygon[i];
      if ((a.y > y) !== (b.y > y)) crossings.push((b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x);
    }
    crossings.sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const left = Math.max(minX, Math.ceil(crossings[i]));
      const right = Math.min(maxX, Math.ceil(crossings[i + 1]) - 1);
      for (let x = left; x <= right; x++) mark(x, y);
    }
  }
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i], dx = b.x - a.x, dy = b.y - a.y, steps = gcd(Math.abs(dx), Math.abs(dy));
    if (!steps) { mark(a.x, a.y); continue; }
    for (let step = 0; step <= steps; step++) mark(a.x + dx * step / steps, a.y + dy * step / steps);
  }
  if (!selected) throw new Error('The polygon does not enclose any sprite pixels.');
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, mask, selected };
}

module.exports = { polygonSelection };
