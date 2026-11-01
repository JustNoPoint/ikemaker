'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function integer(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number)) throw new Error(`PSD ${label} is not a whole number: ${value}`);
  return number;
}

function parseIdentifyOutput(text) {
  const records = String(text || '').split(/\r?\n/).filter(Boolean).map((line, ordinal) => {
    const fields = line.split('\t');
    if (fields.length < 5) throw new Error(`Unexpected ImageMagick PSD layer record ${ordinal + 1}.`);
    const visibleValue = fields.length >= 7 ? fields[6].trim().toLowerCase() : '';
    const opacityValue = fields.length >= 8 ? Number(fields[7]) : NaN;
    return {
      index: integer(fields[0], 'page index'), width: integer(fields[1], 'width'), height: integer(fields[2], 'height'),
      x: integer(fields[3], 'X offset'), y: integer(fields[4], 'Y offset'), name: (fields[5] || '').trim() || `Layer ${fields[0]}`,
      visible: visibleValue ? !['0', 'false', 'no', 'off'].includes(visibleValue) : true,
      opacity: Number.isFinite(opacityValue) ? Math.max(0, Math.min(1, opacityValue > 1 ? opacityValue / 255 : opacityValue)) : 1,
      compose: fields.length >= 9 ? fields.slice(8).join('\t').trim().toLowerCase() : ''
    };
  });
  if (!records.length || records[0].index !== 0) throw new Error('The PSD did not expose a flattened composite page 0.');
  const indexes = new Set();
  for (const record of records) {
    if (record.index < 0 || record.width < 1 || record.height < 1) throw new Error(`PSD page ${record.index} has invalid dimensions.`);
    if (indexes.has(record.index)) throw new Error(`PSD page index ${record.index} occurs more than once.`);
    indexes.add(record.index);
  }
  return records;
}

function safeLabel(value, fallback) {
  return String(value || fallback).trim().replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '') || fallback;
}

function isLayerOneCandidate(record, base) {
  const name = String(record?.name || '').trim();
  if (/^(?:beard|beard[\s_.-]*layer|cosmetic[\s_.-]*(?:layer[\s_.-]*)?1)$/i.test(name)) return true;
  const layer = /^layer[\s_.-]*(\d+)$/i.exec(name), baseLayer = /^layer[\s_.-]*(\d+)$/i.exec(String(base?.name || '').trim());
  return Boolean(layer && baseLayer && Number(layer[1]) === Number(baseLayer[1]) + 1);
}

function planPsdExports(records, mode = 'composite') {
  if (!Array.isArray(records) || !records.length) throw new Error('PSD inspection records are required.');
  const canvas = records.find(record => record.index === 0), layers = records.filter(record => record.index !== 0);
  const timeline = layers.filter(record => /^(?:frame|timeline)[\s_.-]*\d+/i.test(record.name));
  const authored = layers.filter(record => !timeline.includes(record));
  const overlayPattern = /(?:beard|overlay|fx|effect|accessory|weapon|aura|glow)/i;
  const base = authored.find(record => !overlayPattern.test(record.name)) || authored[0] || canvas;
  const overlays = authored.filter(record => record !== base && overlayPattern.test(record.name));
  const result = [];
  const add = (label, pages, role, sourceOrdinal) => result.push({ label, filename: `${String(result.length).padStart(5, '0')}_${safeLabel(label, `frame_${result.length}`)}.png`, pages, role, sourceOrdinal });
  if (mode === 'composite') add('Composite', [canvas], 'composite', 0);
  else if (mode === 'base') add(base.name, [base], 'base', base.index);
  else if (mode === 'layers') for (const layer of authored) add(layer.name, [layer], layer === base ? 'base' : 'layer', layer.index);
  else if (mode === 'base-and-layer1') {
    if (authored.length < 2) throw new Error('This PSD does not expose both a base page and a separate Layer 1 page.');
    add(authored[0].name, [authored[0]], 'base', authored[0].index);
    add(authored[1].name, [authored[1]], 'layer-1', authored[1].index);
  }
  else if (mode === 'base-and-optional-layer1') {
    add(authored[0]?.name || canvas.name, [authored[0] || canvas], 'base', (authored[0] || canvas).index);
    const layerOne = authored.slice(1).filter(record => isLayerOneCandidate(record, authored[0] || canvas));
    if (layerOne.length > 1) throw new Error(`This PSD exposes ${layerOne.length} pages labelled as Layer 1 artwork; choose the intended page explicitly.`);
    if (layerOne.length === 1) add(layerOne[0].name, [layerOne[0]], 'layer-1', layerOne[0].index);
  }
  else if (mode === 'base-with-overlays') {
    add(base.name, [base], 'base', base.index);
    for (const overlay of overlays) add(`${base.name} + ${overlay.name}`, [base, overlay], 'composited-variant', overlay.index);
  } else if (mode === 'timeline') {
    if (!timeline.length) throw new Error('No explicitly named timeline/frame pages were exposed by this PSD. Use Photoshop timeline export or another PSD mode.');
    for (const frame of timeline.sort((left, right) => left.index - right.index)) add(frame.name, [frame], 'timeline-frame', frame.index);
  } else throw new Error(`Unknown PSD intake mode ${mode}.`);
  return { canvas: { width: canvas.width, height: canvas.height }, base, overlays, timeline, exports: result };
}

function inspectPsd(filename, executable = 'magick') {
  const absolute = path.resolve(filename);
  if (!fs.existsSync(absolute)) throw new Error(`PSD source is missing: ${absolute}`);
  const result = spawnSync(executable, ['identify', '-format', '%p\t%w\t%h\t%X\t%Y\t%[label]\t%[psd:layer.visible]\t%[psd:layer.opacity]\t%[compose]\n', absolute], { windowsHide: true, encoding: 'utf8' });
  if (result.error || result.status !== 0) throw result.error || new Error(result.stderr || `ImageMagick identify exited with ${result.status}.`);
  return { filename: absolute, records: parseIdentifyOutput(result.stdout), executable };
}

function geometry(record) { return `${record.x >= 0 ? '+' : ''}${record.x}${record.y >= 0 ? '+' : ''}${record.y}`; }

function exportPsdPlan(inspection, plan, outputDirectory) {
  if (!inspection?.filename || !Array.isArray(plan?.exports) || !plan.exports.length) throw new Error('A reviewed PSD export plan is required.');
  fs.mkdirSync(outputDirectory, { recursive: true });
  const outputs = [];
  for (const item of plan.exports) {
    const output = path.join(outputDirectory, item.filename), args = ['-size', `${plan.canvas.width}x${plan.canvas.height}`, 'canvas:none'];
    for (const page of item.pages) args.push(`${inspection.filename}[${page.index}]`, '-geometry', geometry(page), '-composite');
    args.push(output);
    const result = spawnSync(inspection.executable || 'magick', args, { windowsHide: true, encoding: 'utf8' });
    if (result.error || result.status !== 0 || !fs.existsSync(output)) throw result.error || new Error(result.stderr || `ImageMagick PSD export exited with ${result.status}.`);
    outputs.push({ filename: output, label: item.label, role: item.role, sourceOrdinal: item.sourceOrdinal, pages: item.pages.map(page => ({ index: page.index, name: page.name })) });
  }
  return outputs;
}

function collectTimelineSequence(directory) {
  const absolute = path.resolve(directory);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) throw new Error(`Photoshop timeline export folder is missing: ${absolute}`);
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const frames = fs.readdirSync(absolute, { withFileTypes: true })
    .filter(entry => entry.isFile() && path.extname(entry.name).toLowerCase() === '.png')
    .sort((left, right) => collator.compare(left.name, right.name))
    .map((entry, ordinal) => ({ filename: path.join(absolute, entry.name), name: entry.name, ordinal }));
  if (!frames.length) throw new Error('No PNG timeline frames were found. In Photoshop Render Video, choose Photoshop Image Sequence, PNG, All Frames, and this exact folder.');
  return frames;
}

module.exports = { parseIdentifyOutput, planPsdExports, inspectPsd, exportPsdPlan, collectTimelineSequence, safeLabel, isLayerOneCandidate };
