'use strict';

const fs = require('fs');
const path = require('path');

function scanAirSpriteReferences(targetSffPath, options = {}) {
  const io = options.fs || fs, maxFiles = Number(options.maxFiles || 64), maxFileBytes = Number(options.maxFileBytes || 8 * 1024 * 1024), maxAggregateBytes = Number(options.maxAggregateBytes || 32 * 1024 * 1024);
  const folder = path.dirname(path.resolve(targetSffPath)), root = (io.realpathSync.native ? io.realpathSync.native(folder) : io.realpathSync(folder)), references = {}, files = [], skipped = [];
  let aggregateBytes = 0;
  const names = io.readdirSync(root).filter(name => /\.air$/i.test(name)).sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }));
  for (const name of names) {
    if (files.length >= maxFiles) { skipped.push({ file: name, reason: 'file-count-limit' }); continue; }
    const filename = path.join(root, name), stat = io.lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink()) { skipped.push({ file: name, reason: 'not-regular-file' }); continue; }
    const canonical = io.realpathSync.native ? io.realpathSync.native(filename) : io.realpathSync(filename);
    if (path.dirname(canonical).toLowerCase() !== root.toLowerCase()) { skipped.push({ file: name, reason: 'outside-character-folder' }); continue; }
    if (stat.size > maxFileBytes || aggregateBytes + stat.size > maxAggregateBytes) { skipped.push({ file: name, reason: 'byte-limit' }); continue; }
    const text = io.readFileSync(canonical, 'utf8'); aggregateBytes += Buffer.byteLength(text); files.push(name);
    let action = '';
    for (const [index, raw] of text.split(/\r?\n/).entries()) {
      const line = raw.replace(/;.*/, ''), heading = line.match(/^\s*\[\s*Begin\s+Action\s+(-?\d+)\s*\]/i); if (heading) { action = heading[1]; continue; }
      const frame = line.match(/^\s*(-?\d+)\s*,\s*(-?\d+)\s*,/); if (!frame) continue;
      const key = `${Number(frame[1])},${Number(frame[2])}`, label = `${name}:${index + 1}${action ? ` · Action ${action}` : ''}`;
      (references[key] ||= []).push(label);
    }
  }
  return Object.freeze({ status: 'folder-only-incomplete', references: Object.freeze(Object.fromEntries(Object.entries(references).map(([key, values]) => [key, Object.freeze(values)]))), files: Object.freeze(files), skipped: Object.freeze(skipped), aggregateBytes, scopeNote: 'Folder-only heuristic; confirm references against the character DEF assigned AIR files.' });
}

module.exports = { scanAirSpriteReferences };
