'use strict';

const fs = require('fs');
const path = require('path');

function paletteLibraryFiles(root, limit = 2000) {
  if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) return [];
  const files = [], pending = [path.resolve(root)];
  while (pending.length && files.length < limit) {
    const folder = pending.shift();
    for (const entry of fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) pending.push(full);
      else if (entry.isFile() && /\.(?:act|png)$/i.test(entry.name)) files.push(full);
      if (files.length >= limit) break;
    }
  }
  return files;
}

function safeLibraryPalette(root, filename) {
  if (!root || !filename) throw new Error('Choose a project palette library and palette file first.');
  const base = path.resolve(root), target = path.resolve(filename), relative = path.relative(base, target);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !/\.(?:act|png)$/i.test(target)) throw new Error('The selected palette is outside the configured palette library.');
  return target;
}

function safePaletteSource(root, filename, manuallySelected = []) {
  if (!filename) throw new Error('Choose an ACT or indexed PNG palette first.');
  const target = path.resolve(filename);
  const selected = new Map([...manuallySelected].map((item) => [path.resolve(item).toLowerCase(), path.resolve(item)]));
  if (selected.has(target.toLowerCase())) {
    const exact = selected.get(target.toLowerCase());
    if (!/\.(?:act|png)$/i.test(exact)) throw new Error('The selected source is not an ACT or PNG palette.');
    if (!fs.existsSync(exact) || !fs.statSync(exact).isFile()) throw new Error('The manually selected palette is no longer available.');
    return exact;
  }
  return safeLibraryPalette(root, target);
}

function paletteSourceLabel(root, filename, manuallySelected = []) {
  const target = path.resolve(filename), manual = new Set([...manuallySelected].map((item) => path.resolve(item).toLowerCase()));
  if (manual.has(target.toLowerCase())) return `${path.basename(target)} — ${path.dirname(target)}`;
  return root ? path.relative(path.resolve(root), target).replace(/\\/g, '/') : path.basename(target);
}

function pngPaletteRgba(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8 || buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Palette PNG has an invalid signature.');
  let offset = 8, rgb = null, alpha = null;
  while (offset + 12 <= buffer.length) {
    const size = buffer.readUInt32BE(offset), end = offset + 12 + size;
    if (end > buffer.length) throw new Error('Palette PNG contains a truncated chunk.');
    const type = buffer.toString('ascii', offset + 4, offset + 8), data = buffer.subarray(offset + 8, offset + 8 + size);
    if (type === 'PLTE') rgb = data;
    else if (type === 'tRNS') alpha = data;
    offset = end;
    if (type === 'IEND') break;
  }
  if (!rgb || rgb.length < 3 || rgb.length % 3) throw new Error('Palette PNG is not indexed or has no valid PLTE color table.');
  const colors = [];
  for (let index = 0; index < 256; index += 1) colors.push(index * 3 + 2 < rgb.length ? [rgb[index * 3], rgb[index * 3 + 1], rgb[index * 3 + 2], alpha && index < alpha.length ? alpha[index] : 255] : [0, 0, 0, index === 0 ? 0 : 255]);
  return colors;
}

const actLibraryFiles = paletteLibraryFiles;
const safeLibraryAct = safeLibraryPalette;
module.exports = { paletteLibraryFiles, safeLibraryPalette, safePaletteSource, paletteSourceLabel, pngPaletteRgba, actLibraryFiles, safeLibraryAct };
