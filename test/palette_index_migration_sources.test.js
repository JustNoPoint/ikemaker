'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { encodeIndexedPng } = require('../src/palette_indexed_png');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-migration-sources-')), sff = path.join(root, 'fixture.sff');
fs.writeFileSync(sff, Buffer.from('mock exact SFF v2 evidence'));
const colors = Array.from({ length: 256 }, (_, index) => [index, index, index, index === 0 ? 0 : 255]);
const spriteBytes = encodeIndexedPng({ width: 2, height: 1 }, Buffer.from([0, 1]), colors);
let archive;
const mockReader = {
  readSff() { return archive; },
  paletteRgba(_archive, index) { return colors.map(color => color.slice()); },
  spritePng() { return spriteBytes; },
  resolvedPalette(value, index) { const palette = value.palettes[index]; return palette?.dataSize === 0 ? value.palettes[palette.link] : palette; }
};
const originalLoad = Module._load;
Module._load = function (request, parent, main) { if (request === './sff_reader' && /palette_index_migration_sources\.js$/.test(parent?.filename || '')) return mockReader; return originalLoad.call(this, request, parent, main); };
try {
  delete require.cache[require.resolve('../src/palette_index_migration_sources')];
  const sources = require('../src/palette_index_migration_sources');
  archive = { header: { version: [2, 0, 1, 0] }, palettes: [{ index: 0, group: 1, number: 1, link: 0, dataSize: 1024 }, { index: 1, group: 1, number: 2, link: 1, dataSize: 1024 }], sprites: [{ index: 0, group: 0, number: 0, dataSize: 99, link: 0, paletteIndex: 0, colorDepth: 8, width: 2, height: 1 }, { index: 1, group: 0, number: 1, dataSize: 0, link: 0, paletteIndex: 1, colorDepth: 8, width: 2, height: 1 }] };
  assert.throws(() => sources.sffCluster(sff, { physicalIndex: 0, group: 1, number: 1 }), /shared with a different effective palette/);
  archive.sprites[1].paletteIndex = 0;
  const authority = sources.sffCluster(sff, { physicalIndex: 0, group: 1, number: 1 });
  assert.strictEqual(authority.kind, 'embedded-sff-palette-cluster');
  assert.deepStrictEqual(authority.sprites.map(sprite => sprite.physicalIndex), [0, 1]);
  assert.strictEqual(authority.sff.paletteLinkTopology.length, 2);
  assert.strictEqual(sources.revalidate(authority).authorityHash, authority.authorityHash);
  archive.sprites[1].colorDepth = 32;
  assert.throws(() => sources.revalidate(authority), /truecolor|evidence changed/);
  const linked = path.join(root, 'linked.sff');
  try { fs.symlinkSync(sff, linked, 'file'); assert.throws(() => sources.exactFile(linked), /non-symlink|traverse a link/); }
  catch (error) { if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error; }
} finally { Module._load = originalLoad; delete require.cache[require.resolve('../src/palette_index_migration_sources')]; fs.rmSync(root, { recursive: true, force: true }); }
console.log('Palette index migration SFF v2 link-cluster, topology, drift, and truecolor tests passed');
