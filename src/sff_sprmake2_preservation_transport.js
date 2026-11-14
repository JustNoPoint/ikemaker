'use strict';

// SprMake2 interprets additional transparent PNG palette entries as RGBA input,
// and ACT cannot carry their alpha. Only UNUSED, binary-alpha entries may travel
// through this adapter. The reviewed sources/specification are never rewritten.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readIndexedPng8 } = require('./sff_png8_source');
const { encodeIndexed } = require('./sff_palette_remap');
const { specificationHash } = require('./sff_build_specification');
const { assertSffV21Mixed } = require('./sff_v21_mixed_strict_validator');
const { parseSffBuffer, resolvedPalette } = require('./sff_reader');
const contracts = new WeakMap();
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw Error(`SprMake2 preservation transport refused: ${message}`); };
function sourcePath(root, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.replace(/\\/g, '/').split('/').includes('..')) fail('source path escapes the private run.');
  const filename = path.resolve(root, relative);
  if (!filename.startsWith(path.resolve(root) + path.sep)) fail('source path escapes the private run.');
  return filename;
}
function unusedTransparent(colors, used, label) {
  if (!Array.isArray(colors) || colors.length !== 256 || colors.some(row => !Array.isArray(row) || row.length !== 4 || row.some(v => !Number.isInteger(v) || v < 0 || v > 255))) fail(`${label} has no exact 256-color table.`);
  const indexes = [];
  colors.forEach((color, index) => {
    if (color[3] !== 0 && color[3] !== 255) fail(`${label} has partial alpha; this adapter cannot normalize it.`);
    if (index && color[3] === 0) { if (used.has(index)) fail(`${label} uses transparent nonzero index ${index}; choose the native writer to preserve it.`); indexes.push(index); }
  });
  return indexes;
}

function preparePreservationTransport(specification, root, definition) {
  if (!specification) return { definition, contract: null };
  const spec = JSON.parse(JSON.stringify(specification)), specHash = specificationHash(spec);
  const palettes = new Map(), usage = new Map(), replacements = new Map(), sources = [];
  spec.palettes.forEach((p, index) => { palettes.set(p.entryId, index); palettes.set(`${p.group},${p.number}`, index); usage.set(index, new Set()); });
  for (const sprite of spec.sprites) {
    if (sprite.format !== 'png8') continue; // Never normalize truecolor pixels.
    const filename = sourcePath(root, sprite.source.relativePath), bytes = fs.readFileSync(filename);
    if (sha(bytes) !== sprite.source.byteHash) fail(`source ${sprite.entryId} changed.`);
    const decoded = readIndexedPng8(bytes), used = new Set(decoded.indices);
    if (decoded.decodedHash !== sprite.source.decodedHash || decoded.width !== sprite.source.width || decoded.height !== sprite.source.height) fail(`source ${sprite.entryId} pixels changed.`);
    const palette = palettes.get(sprite.paletteId);
    if (palette === undefined) fail(`source ${sprite.entryId} assigns an unknown palette.`);
    used.forEach(index => usage.get(palette).add(index));
    const indexes = unusedTransparent(decoded.colors, used, `source ${sprite.entryId}`);
    sources.push({ filename, byteHash: sprite.source.byteHash });
    if (!indexes.length) continue;
    const colors = decoded.colors.map(color => [...color]); indexes.forEach(index => { colors[index][3] = 255; });
    const transport = encodeIndexed(decoded.width, decoded.height, decoded.indices, colors);
    // SprMake2 caches repeated filenames even with detectduplicates=0. Keep
    // independent reviewed rows as independent compiler inputs.
    const transportName = `transport-${sha(Buffer.from(sprite.entryId))}-${sha(bytes)}.png`, transportPath = path.join(root, 'input', transportName);
    for (const directory of [root, path.dirname(transportPath)]) {
      if (!fs.lstatSync(directory).isDirectory()) fail('transport requires direct private directories.');
    }
    const existing = fs.lstatSync(transportPath, { throwIfNoEntry: false });
    if (existing) {
      if (!existing.isFile() || existing.nlink !== 1 || !fs.readFileSync(transportPath).equals(transport)) fail('transport filename collision.');
    }
    else fs.writeFileSync(transportPath, transport, { flag: 'wx', mode: 0o600 });
    const key = `${sprite.group},${sprite.number}`;
    if (replacements.has(key)) fail(`ambiguous sprite identity ${key}.`);
    replacements.set(key, { filename: transportName, sourceName: path.basename(filename) });
  }
  const patches = [];
  spec.palettes.forEach((palette, index) => {
    const indexes = unusedTransparent(palette.colors, usage.get(index), `palette ${palette.entryId}`);
    if (indexes.length) patches.push({ index, indexes });
  });
  if (!patches.length && !replacements.size) return { definition, contract: null };
  let section = '', count = 0;
  const rewritten = definition.replace(/[^\r\n]+/g, line => {
    const heading = line.match(/^\s*\[([^\]]+)\]/); if (heading) { section = heading[1].toLowerCase(); return line; }
    if (section !== 'sprite' || /^\s*;/.test(line)) return line;
    const row = line.match(/^(\s*(\d+)\s*,\s*(\d+)\s*,\s*)([^,]+)(,.*)$/);
    if (!row) return line;
    const replacement = replacements.get(`${Number(row[2])},${Number(row[3])}`); if (!replacement) return line;
    if (row[4].trim() !== replacement.sourceName) fail('definition does not reference the reviewed source.');
    count++; return row[1] + replacement.filename + row[5];
  });
  if (count !== replacements.size) fail('definition does not contain each exact transport source once.');
  const contract = Object.freeze({ specificationHash: specHash, transportedSprites: replacements.size, restoredPalettes: patches.length });
  contracts.set(contract, { root: path.resolve(root), spec, specHash, sources, patches });
  return { definition: rewritten, contract };
}

function finalizePreservationCandidate(filename, contract, specification) {
  if (!contract) return null;
  const state = contracts.get(contract);
  if (!state || specificationHash(specification) !== state.specHash || path.dirname(path.resolve(filename)) !== state.root) fail('candidate/specification is not bound to this private transport.');
  state.sources.forEach(source => { if (sha(fs.readFileSync(source.filename)) !== source.byteHash) fail('logical source changed during execution.'); });
  const identity = fs.lstatSync(filename);
  if (!identity.isFile() || identity.isSymbolicLink() || identity.nlink !== 1) fail('candidate must be an exclusively owned regular file, not a link.');
  const before = fs.readFileSync(filename), toolSpec = JSON.parse(JSON.stringify(state.spec));
  state.patches.forEach(patch => patch.indexes.forEach(index => { toolSpec.palettes[patch.index].colors[index][3] = 255; }));
  // Independent validator proves exact table layout, palette identity/RGB,
  // all index planes, axes, assignments and explicit sprite/palette links BEFORE
  // any candidate byte is changed. No repair of those fields is permitted.
  assertSffV21Mixed(before, toolSpec, { compatibilityProfile: 'sprmake2-v2.1' });
  const archive = parseSffBuffer(before), finalized = Buffer.from(before), writes = new Map();
  for (const patch of state.patches) {
    const palette = resolvedPalette(archive, patch.index);
    if (!palette || palette.colors !== 256 || palette.dataSize !== 1024) fail('palette storage cannot be restored exactly.');
    patch.indexes.forEach(index => {
      const offset = archive.header.literalDataOffset + palette.dataOffset + index * 4 + 3;
      if (offset < archive.header.literalDataOffset || offset >= finalized.length || before[offset] !== 255) fail('palette alpha layout is not the proven tool output.');
      if (writes.has(offset) && writes.get(offset) !== 0) fail('linked palette restoration conflicts.');
      writes.set(offset, 0); finalized[offset] = 0;
    });
  }
  // Original strict authority is unchanged. Refuse without modifying the file
  // if even one reviewed color/index/link differs after bounded finalization.
  assertSffV21Mixed(finalized, state.spec, { compatibilityProfile: 'sprmake2-v2.1' });
  const descriptor = fs.openSync(filename, 'r+');
  try {
    const current = fs.fstatSync(descriptor), named = fs.lstatSync(filename);
    if (!current.isFile() || current.nlink !== 1 || named.isSymbolicLink() || current.dev !== identity.dev || current.ino !== identity.ino || named.dev !== identity.dev || named.ino !== identity.ino || !fs.readFileSync(descriptor).equals(before)) fail('candidate changed during finalization.');
    // Write only the still-owned inode, never follow a replacement path/link.
    fs.writeSync(descriptor, finalized, 0, finalized.length, 0);
    fs.fsyncSync(descriptor);
  } finally { fs.closeSync(descriptor); }
  return Object.freeze({ specificationHash: state.specHash, beforeHash: sha(before), finalizedHash: sha(finalized), transportedSprites: contract.transportedSprites, restoredPalettes: state.patches.length, restoredAlphaBytes: writes.size });
}

module.exports = { preparePreservationTransport, finalizePreservationCandidate };
