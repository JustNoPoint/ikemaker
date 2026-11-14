'use strict';

const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { creationPlan } = require('./authoring_creation_plan');
const { decodePng } = require('./palette_index_organizer_model');
const { readIndexedPng, encodeIndexedPng, chunks } = require('./palette_indexed_png');
const { rgbaPng } = require('./sff_reader');
const { createSffBuildSpecification } = require('./sff_build_specification');
const { createSffV21Bytes } = require('./sff_v21_writer');
const { assertSffV21Mixed } = require('./sff_v21_mixed_strict_validator');
const { transactionalWriteSet } = require('./mutation_safety');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

// Paths never come back from the webview. Only these host-retained snapshots
// can become a layer; IDs and a permutation describe the reviewed arrangement.
function captureLayers(filenames, io = fs) {
  if (!Array.isArray(filenames) || !filenames.length || filenames.length > 64) throw Error('Choose 1–64 PNG layers.');
  let total = 0, totalPixels = 0; const seen = new Set();
  return filenames.map((filename, index) => {
    const absolute = path.resolve(filename), real = io.realpathSync(absolute), identity = real.toLowerCase();
    if (seen.has(identity)) throw Error('The same PNG was selected twice.'); seen.add(identity);
    const stat = io.statSync(real); if (!stat.isFile() || stat.size > 64 * 1024 * 1024) throw Error('Each PNG must be a regular file of at most 64 MiB.');
    const bytes = io.readFileSync(real); total += bytes.length; if (total > 192 * 1024 * 1024) throw Error('Selected PNGs exceed the 192 MiB input limit.');
    const decoded = decodePng(bytes, { maximumPixels: 16000000, maximumDimension: 8192 });
    totalPixels += decoded.width * decoded.height; if (totalPixels > 32000000) throw Error('Selected layers exceed the 32 million decoded-pixel review limit.');
    if (decoded.colorType !== 3 && decoded.bitDepth !== 8) throw Error(`${path.basename(absolute)}: use 8-bit RGB, RGBA, grayscale or indexed PNG (no interlace).`);
    // The shared RGB decoder does not interpret color-key tRNS. Refuse rather
    // than silently losing transparency; indexed and RGBA alpha are exact.
    if ([0, 2].includes(decoded.colorType) && chunks(bytes).some(row => row.type === 'tRNS')) throw Error(`${path.basename(absolute)}: convert color-key transparency to RGBA first.`);
    const indexed = decoded.colorType === 3 ? readIndexedPng(bytes) : null;
    // Classic transparent-zero palettes retain exact indices and colors. Other
    // indexed alpha layouts use exact RGBA, avoiding the engine's reserved zero.
    const keepIndexed = indexed && indexed.colors[0][3] === 0 && indexed.colors.slice(1).every(color => color[3] === 255);
    const format = keepIndexed ? 'png8' : decoded.colorType === 2 ? 'png24' : 'png32';
    const payload = keepIndexed ? encodeIndexedPng(indexed, indexed.indices, indexed.colors) : [0, 3, 4].includes(decoded.colorType) ? rgbaPng(decoded.width, decoded.height, decoded.rgba) : bytes;
    const opaque = decoded.rgba.every((value, at) => at % 4 !== 3 || value === 255);
    return Object.freeze({ id: `layer-${index}`, filename: absolute, real, bytes, payload, opaque, sha256: sha(bytes), width: decoded.width, height: decoded.height, format, decodedHash: sha(keepIndexed ? indexed.indices : format === 'png24' ? Buffer.from(decoded.rgba.filter((_, i) => i % 4 !== 3)) : decoded.rgba), colors: keepIndexed ? indexed.colors : null });
  });
}

function coverageFor(ordered, localCoord) {
  const [width, height] = localCoord;
  const candidates = ordered.filter(row => row.layerno === 0 && row.opaque && row.width >= width && row.height >= height).sort((a, b) => b.width - a.width);
  const backdrop = candidates[0];
  return { reliable: Boolean(backdrop), backdropId: backdrop?.id || null, left: 0, right: backdrop ? backdrop.width - width : 0, high: 0, low: 0, missing: backdrop ? '' : 'No fully opaque behind-fighters image covers this canvas. Camera travel is locked; transparent or undersized art may expose the Stage background. Review coverage and Camera settings after creation.' };
}

function arrangement(snapshots, rows) {
  if (!Array.isArray(rows) || rows.length !== snapshots.length) throw Error('The layer list changed. Reopen the PNG review.');
  const byId = new Map(snapshots.map(row => [row.id, row])), seen = new Set();
  return rows.map(row => {
    if (!row || Object.keys(row).sort().join(',') !== 'id,layerno' || !byId.has(row.id) || seen.has(row.id) || ![0, 1].includes(row.layerno)) throw Error('Invalid layer order or fighter placement.');
    seen.add(row.id); return { ...byId.get(row.id), layerno: row.layerno };
  });
}

function buildPlan(targetFile, snapshots, rows, options = {}) {
  const target = path.resolve(targetFile), stem = path.basename(target, path.extname(target));
  if (path.extname(target).toLowerCase() !== '.def' || !stem || /[;"\r\n\[\]]/.test(stem)) throw Error('Choose a Stage DEF filename without quotes, semicolons, brackets or newlines.');
  const ordered = arrangement(snapshots, rows), localCoord = options.localCoord || [ordered[0].width, ordered[0].height];
  const base = creationPlan('stage', target, { localCoord, author: options.author });
  const sprites = [], palettes = [], sources = new Map();
  ordered.forEach((row, index) => {
    const relativePath = `input/${index}.png`, source = { relativePath, byteHash: sha(row.payload), decodedHash: row.decodedHash, width: row.width, height: row.height, provenance: { kind: 'stage-png-layer', originalName: path.basename(row.filename) } };
    sources.set(relativePath, row.payload);
    const paletteId = row.colors ? `palette-${index}` : null;
    if (paletteId) palettes.push({ entryId: paletteId, group: 1, number: index + 1, tableOrder: 'sff', duplicatePolicy: 'preserve-separate', colors: row.colors, source });
    sprites.push({ entryId: row.id, group: 0, number: index, axisX: Math.round(localCoord[0] / 2), axisY: 0, colorDepth: row.format === 'png8' ? 8 : row.format === 'png24' ? 24 : 32, format: row.format, compression: row.format, paletteId, duplicatePolicy: 'preserve-separate', crop: { mode: 'none', axisDeltaX: 0, axisDeltaY: 0 }, source });
  });
  const specification = createSffBuildSpecification({ planId: 'stage-png-layers', sourceRoot: 'input', target: { archiveIdentity: `${stem}.sff`, sffVersion: '2.1' }, sprites, palettes, requirements: ['sff-v2.1', 'preserve-authored-physical-order', 'immutable-source-snapshots', 'candidate-before-adoption', ...(palettes.length ? ['sprite-png8', 'embedded-palettes'] : []), ...(ordered.some(row => row.format !== 'png8') ? ['sprite-truecolor'] : [])], decisions: [], options: { shared: {}, backends: {} } });
  const sff = createSffV21Bytes(specification, { sources }); assertSffV21Mixed(sff, specification);
  const backgrounds = ordered.map((row, index) => `; PNG layer ${index + 1}: ${path.basename(row.filename).replace(/[\r\n]/g, ' ')}\n[BG PNG ${index + 1}]\ntype = normal\nspriteno = 0,${index}\nstart = 0,0\ndelta = 1,1\nlayerno = ${row.layerno}\nmask = 1\n`).join('\n');
  const coverage = coverageFor(ordered, localCoord);
  const def = (coverage.missing ? `; PNG coverage warning: ${coverage.missing}\n` : '') + base.files[0].content.replace(/\[BG Starter\][\s\S]*$/, backgrounds).replace(/^boundleft\s*=.*$/m, `boundleft = ${coverage.left}`).replace(/^boundright\s*=.*$/m, `boundright = ${coverage.right}`).replace(/^boundhigh\s*=.*$/m, `boundhigh = ${coverage.high}`).replace(/^boundlow\s*=.*$/m, `boundlow = ${coverage.low}`).replace(/^debugbg\s*=.*$/m, `debugbg = ${coverage.reliable ? 0 : 1}`);
  const receiptFile = path.join(path.dirname(target), `${stem}.png-layers.json`);
  const receipt = { version: 1, kind: 'ordered-png-stage', localCoord: [...localCoord], target: path.basename(target), sff: `${stem}.sff`, coverage, layers: ordered.map((row, index) => ({ order: index, input: row.filename, sha256: row.sha256, sprite: [0, index], layerno: row.layerno, width: row.width, height: row.height, format: row.format, opaque: row.opaque })), outputs: { defSha256: sha(def), sffSha256: sha(sff) } };
  return { ...base, summary: `PNG Stage · ${ordered.length} layers · ${localCoord.join(' × ')}`, files: [{ filename: target, content: def, role: 'Stage definition' }, { filename: base.files[1].filename, content: sff, role: 'Stage sprites' }, { filename: receiptFile, content: JSON.stringify(receipt, null, 2) + '\n', role: 'PNG provenance receipt' }], receipt, snapshots };
}

function writePlan(plan, io = fs, options = {}) {
  for (const row of plan.snapshots) {
    if (io.realpathSync(row.filename) !== row.real || sha(io.readFileSync(row.real)) !== row.sha256) throw Error(`PNG changed since review: ${row.filename}. Nothing was written.`);
  }
  const token = crypto.randomBytes(16).toString('hex');
  try { return transactionalWriteSet(io, plan.files.map(row => [row.filename, row.content]), { ...options, token, allowExisting: false, label: 'create-png-stage', journalRoot: path.dirname(plan.target) }); }
  catch (error) {
    // A disk write can throw after creating its staging file, before the shared
    // transaction receives that prepared row. Clean only our unique staging
    // names; shared rollback/recovery remains responsible for installed output.
    for (const row of plan.files) {
      const temporary = path.join(path.dirname(row.filename), `.${path.basename(row.filename)}.${token}.tmp`);
      try { if (io.existsSync(temporary)) io.unlinkSync(temporary); }
      catch (cleanup) { error.message += `\nCreation staging file needs cleanup: ${temporary} (${cleanup.message})`; }
    }
    throw error;
  }
}
module.exports = { captureLayers, arrangement, coverageFor, buildPlan, writePlan, sha };
