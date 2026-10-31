'use strict';
const crypto = require('crypto');

function normalizedPoint(value, label) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') throw new Error(`${label} must be between 0 and 1.`);
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) throw new Error(`${label} must be between 0 and 1.`);
  return number;
}

function pixelFromNormalized(width, height, u, v) {
  const w = Math.trunc(Number(width)), h = Math.trunc(Number(height));
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) throw new Error('Indexed sprite dimensions are invalid.');
  const x = Math.min(w - 1, Math.floor(normalizedPoint(u, 'Horizontal preview position') * w));
  const y = Math.min(h - 1, Math.floor(normalizedPoint(v, 'Vertical preview position') * h));
  return { x, y };
}

function pickExactIndex(indexPlane, u, v) {
  const width = Math.trunc(Number(indexPlane?.width)), height = Math.trunc(Number(indexPlane?.height));
  const indices = indexPlane?.indices;
  if (!Buffer.isBuffer(indices) || indices.length !== width * height) throw new Error('The exact indexed sprite plane is unavailable or inconsistent.');
  const point = pixelFromNormalized(width, height, u, v), index = indices[point.y * width + point.x];
  return { ...point, index, transparentConvention: index === 0 };
}

function previewToken(input = {}) {
  const plane=input.indexPlane||{},sprite=input.sprite||{},resourceHash=String(input.resourceHash||'');
  if(!/^[0-9a-f]{64}$/i.test(resourceHash)||!Buffer.isBuffer(plane.indices)||plane.indices.length!==Number(plane.width)*Number(plane.height))throw new Error('Exact preview token evidence is incomplete.');
  const planeHash=crypto.createHash('sha256').update(plane.indices).digest('hex'),body={resourceHash:resourceHash.toLowerCase(),physicalIndex:Number(sprite.physicalIndex),group:Number(sprite.group),number:Number(sprite.number),width:Number(plane.width),height:Number(plane.height),sourcePhysicalIndex:Number(plane.sourcePhysicalIndex),planeHash};
  if(Object.values(body).some(value=>typeof value==='number'&&!Number.isInteger(value)))throw new Error('Exact preview token identity is invalid.');
  return crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

module.exports = { pixelFromNormalized, pickExactIndex, previewToken };
