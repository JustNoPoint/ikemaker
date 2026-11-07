'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const { extractGifSequence } = require('./sff_gif_intake');
const { inspectPsd, exportPsdPlan } = require('./sff_psd_intake');
const { decodePng } = require('./palette_index_organizer_model');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const MAX_BYTES = 64 * 1024 * 1024, MAX_FRAMES = 4096, MAX_PIXELS = 268435456;

function stableSource(filename) {
  const absolute = path.resolve(filename), fd = fs.openSync(absolute, 'r');
  try {
    const before = fs.fstatSync(fd);
    if (!before.isFile() || before.size > MAX_BYTES) throw Error('Choose a regular image no larger than 64 MiB.');
    const bytes = fs.readFileSync(fd), after = fs.fstatSync(fd);
    if (bytes.length !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino || before.dev !== after.dev) throw Error('The selected image changed during admission. Choose it again.');
    return { filename: absolute, bytes, hash: sha(bytes), physical: `${before.dev}:${before.ino}`, realpath: fs.realpathSync.native(absolute) };
  } finally { fs.closeSync(fd); }
}
function assertOriginal(seal) {
  const fresh = stableSource(seal.filename);
  if (fresh.hash !== seal.hash || fresh.physical !== seal.physical || fresh.realpath !== seal.realpath) throw Error(`${path.basename(seal.filename)} changed after selection. Choose the source again.`);
}
function dimensions(width, height, count) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > 8192 || height > 8192 || count > MAX_FRAMES || width * height * count > MAX_PIXELS) throw Error('The image sequence exceeds guided intake dimensions, frame count or decoded-pixel limits.');
}
// Count GIF image descriptors without decoding compressed pixels. This bounds
// extraction before an external decoder allocates a full frame sequence.
function gifBounds(bytes) {
  if (bytes.length < 13 || !/^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6))) throw Error('The source is not a valid GIF.');
  const width = bytes.readUInt16LE(6), height = bytes.readUInt16LE(8); let at = 13, count = 0, gifLoopCount = null;
  const need = size => { if (at + size > bytes.length) throw Error('The GIF block is truncated.'); };
  const blocks = () => { while (true) { need(1); const size = bytes[at++]; if (!size) return; need(size); at += size; } };
  if (bytes[10] & 128) at += 3 * (2 ** ((bytes[10] & 7) + 1));
  while (true) {
    need(1); const marker = bytes[at++];
    if (marker === 0x3b) break;
    if (marker === 0x21) { need(1); const label = bytes[at++]; if (label === 0xff && bytes[at] === 11 && at + 17 <= bytes.length && ['NETSCAPE2.0', 'ANIMEXTS1.0'].includes(bytes.toString('ascii', at + 1, at + 12)) && bytes[at + 12] === 3 && bytes[at + 13] === 1) gifLoopCount = bytes.readUInt16LE(at + 14); blocks(); continue; }
    if (marker !== 0x2c) throw Error('The GIF contains an unsupported block.');
    need(9); const x = bytes.readUInt16LE(at), y = bytes.readUInt16LE(at + 2), localWidth = bytes.readUInt16LE(at + 4), localHeight = bytes.readUInt16LE(at + 6), packed = bytes[at + 8];
    dimensions(localWidth, localHeight, 1);
    if (x + localWidth > width || y + localHeight > height) throw Error('A GIF image rectangle exceeds its logical canvas.');
    at += 9;
    if (packed & 128) at += 3 * (2 ** ((packed & 7) + 1));
    need(1); at++; blocks(); dimensions(width, height, ++count);
  }
  if (!count) throw Error('The GIF contains no image frames.');
  dimensions(width, height, count); return { width, height, count, gifLoopCount };
}
async function prepareGuidedSource(filename, api, options = {}) {
  const seal = stableSource(filename), extension = path.extname(seal.filename).toLowerCase();
  if (!['.png', '.gif', '.psd'].includes(extension)) throw Error('Choose PNG, GIF or PSD sprite sources.');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-guided-sff-')), snapshot = path.join(directory, 'source' + extension);
  const original = { ...seal }; delete original.bytes;
  let rows = [], retained = false;
  try {
    fs.writeFileSync(snapshot, seal.bytes, { flag: 'wx' });
    const originalName = path.basename(seal.filename);
    if (extension === '.png') rows = [{ filename: snapshot, label: originalName, role: 'image' }];
    if (extension === '.gif') {
      const bounds = gifBounds(seal.bytes), sequence = (options.extractGif || extractGifSequence)(snapshot, path.join(directory, 'frames'), options.ffmpeg || 'ffmpeg');
      if (sequence.frameCount !== bounds.count) throw Error('The decoded GIF sequence disagrees with its image descriptor count.');
      const reliableTiming = sequence.delaysMs.length === bounds.count && sequence.delaysMs.every(delay => Number.isFinite(delay) && delay > 0);
      rows = sequence.frames.map((frame, ordinal) => ({ ...frame, label: `${originalName} · frame ${ordinal + 1}`, role: 'gif-frame', expectedWidth: bounds.width, expectedHeight: bounds.height, delayMs: reliableTiming ? sequence.delaysMs[ordinal] : null, timingAvailable: reliableTiming, gifLoopCount: bounds.gifLoopCount, sourceFrameCount: bounds.count }));
    }
    if (extension === '.psd') {
      if (seal.bytes.length < 26 || seal.bytes.toString('ascii', 0, 4) !== '8BPS') throw Error('The source is not a valid PSD.');
      dimensions(seal.bytes.readUInt32BE(18), seal.bytes.readUInt32BE(14), 1);
      const inspection = (options.inspectPsd || inspectPsd)(snapshot, options.imageMagick || 'magick');
      const canvas = inspection.records[0], layers = inspection.records.filter(item => item.index !== 0);
      const mode = options.psdMode ? { mode: options.psdMode === 'raw-layers' ? 'layers' : options.psdMode } : await api.window.showQuickPick([
        { label: 'Flattened composite', description: 'One sprite from the authored composite; layers are combined.', mode: 'composite' },
        ...(layers.length ? [{ label: 'Select separate layers…', description: 'Keep chosen body/cosmetic pages isolated on the original canvas.', mode: 'layers' }] : [])
      ], { title: `${originalName}: composite or separate artwork?` });
      if (!mode) return null;
      let selected = [canvas];
      if (mode.mode === 'layers' && !options.psdMode) {
        const picked = await api.window.showQuickPick(layers.map(layer => ({ label: layer.name, description: `page ${layer.index}; ${layer.width}×${layer.height} at ${layer.x},${layer.y}${layer.visible ? '' : '; hidden in PSD'}`, layer })), { title: `Select exact layers from ${originalName}`, canPickMany: true, placeHolder: 'Choose the body and any separate cosmetic artwork explicitly.' });
        if (!picked?.length) return null;
        const indexes = new Set(picked.map(item => item.layer.index)); selected = layers.filter(layer => indexes.has(layer.index));
      }
      if (mode.mode === 'layers' && options.psdMode) selected = layers;
      dimensions(canvas.width, canvas.height, selected.length);
      const plan = { canvas, rawLayerSnapshots: ['layers', 'raw-layers'].includes(options.psdMode), exports: selected.map((page, ordinal) => ({ label: page.name, filename: `page_${String(ordinal).padStart(5, '0')}.png`, pages: [page], role: mode.mode === 'composite' ? 'composite' : 'separate-layer', sourceOrdinal: page.index })) };
      rows = (options.exportPsd || exportPsdPlan)(inspection, plan, path.join(directory, 'pages')).map((row, index) => ({ ...row, label: `${originalName} · ${row.label}${options.psdMode === 'raw-layers' ? ' · isolated raw' : ''}`, expectedWidth: canvas.width, expectedHeight: canvas.height, sourceFrameCount: selected.length, layerMetadata: selected[index], layerRole: mode.mode === 'composite' ? null : selected[index].index === layers[0]?.index ? 'body' : 'cosmetic', layerPolicy: options.psdMode === 'raw-layers' ? 'raw-ignore-visibility-opacity-blend' : 'normal-visible-layers' }));
    }
    for (const row of rows) if (row.expectedWidth !== undefined) {
      const file = stableSource(row.filename), decoded = decodePng(file.bytes);
      if (decoded.width !== row.expectedWidth || decoded.height !== row.expectedHeight) throw Error('An extracted image does not match its declared full source canvas. Nothing was admitted.');
    }
    assertOriginal(original);
    rows = rows.map((row, ordinal) => ({ ...row, ordinal, provenance: { kind: 'guided-image-intake', sourceFile: original.filename, sourceByteHash: original.hash, originalPhysical: original.physical, originalRealpath: original.realpath, sourceOrdinal: ordinal, role: row.role, pages: row.pages || null, layerMetadata: row.layerMetadata || null, layerRole: row.layerRole || null, layerPolicy: row.layerPolicy || null, delayMs: row.delayMs ?? null, timingAvailable: row.timingAvailable ?? null, gifLoopCount: row.gifLoopCount ?? null, sourceFrameCount: row.sourceFrameCount || 1 }, assertOriginal: () => assertOriginal(original) }));
    retained = true; return { rows, directory, assertOriginal: () => assertOriginal(original), dispose() { fs.rmSync(directory, { recursive: true, force: true }); } };
  } finally { if (!retained) fs.rmSync(directory, { recursive: true, force: true }); }
}
function assertGuidedProvenance(provenance, verifiedOriginals) {
  if (provenance?.kind !== 'guided-image-intake') return;
  const seal = { filename: provenance.sourceFile, hash: provenance.sourceByteHash, physical: provenance.originalPhysical, realpath: provenance.originalRealpath };
  const key = JSON.stringify(seal);
  if (verifiedOriginals?.has(key)) return;
  assertOriginal(seal);
  verifiedOriginals?.add(key);
}
module.exports = { stableSource, assertOriginal, assertGuidedProvenance, gifBounds, prepareGuidedSource };
