'use strict';

const path = require('path');
const { transactionalWriteSet } = require('./mutation_safety');

function padded(value) { return String(value).padStart(5, '0'); }

function planSpritePngExports(archive, indices) {
  const sprites = Array.isArray(archive?.sprites) ? archive.sprites : [];
  const counts = new Map();
  for (const sprite of sprites) {
    const identity = `${sprite.group},${sprite.number}`;
    counts.set(identity, (counts.get(identity) || 0) + 1);
  }
  const seen = new Set(), plan = [];
  for (const value of indices || []) {
    const index = Number(value), sprite = sprites[index];
    if (!Number.isSafeInteger(index) || !sprite) throw new Error(`Sprite export references missing physical index ${value}.`);
    if (seen.has(index)) continue;
    seen.add(index);
    const identity = `${sprite.group},${sprite.number}`, base = `g${padded(sprite.group)}_i${padded(sprite.number)}`;
    const filename = `${base}${counts.get(identity) > 1 ? `_p${padded(index)}` : ''}.png`;
    plan.push(Object.freeze({ index, sprite, identity, filename, repeatedIdentity: counts.get(identity) > 1 }));
  }
  if (!plan.length) throw new Error('Select at least one sprite to export.');
  return Object.freeze(plan);
}

function executeSpritePngExport(fsApi, archive, indices, destination, options = {}) {
  if (typeof options.renderSprite !== 'function') throw new Error('SFF PNG export requires a sprite renderer.');
  const plan = planSpritePngExports(archive, indices), writes = plan.map(item => [path.join(destination, item.filename), options.renderSprite(archive, item.sprite)]);
  transactionalWriteSet(fsApi, writes, { label: options.label || 'export-sff-png', allowExisting: false, backup: false, journal: false });
  return Object.freeze({ plan, files: Object.freeze(writes.map(([filename]) => filename)) });
}

module.exports = { planSpritePngExports, executeSpritePngExport };
