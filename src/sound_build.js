'use strict';

const fs = require('fs');
const path = require('path');

function meaningfulLines(text) { return String(text || '').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith(';') && !line.startsWith('#')); }
function parse(text) {
  const lines = meaningfulLines(text); if (!lines.length) throw new Error('SndMaker manifest is empty.');
  if ((lines.length - 1) % 3 !== 0) throw new Error('SndMaker manifest must contain output path followed by source/group/index triples.');
  const entries = [];
  for (let at = 1; at < lines.length; at += 3) { const group = Number(lines[at + 1]), index = Number(lines[at + 2]); if (!Number.isInteger(group) || !Number.isInteger(index) || group < 0 || index < 0) throw new Error(`Invalid group/index near manifest line ${at + 2}.`); entries.push({ source: lines[at], group, index }); }
  return { output: lines[0], entries };
}
function stringify(manifest) { const lines = [String(manifest.output || '')]; for (const entry of manifest.entries || []) lines.push(String(entry.source), String(entry.group), String(entry.index)); return `${lines.join('\r\n')}\r\n`; }
function validate(manifest, filename) {
  const errors = [], warnings = [], root = path.dirname(filename), seen = new Set();
  if (!manifest.output) errors.push('Output SND path is missing.');
  for (const entry of manifest.entries || []) { const id = `${entry.group},${entry.index}`; if (seen.has(id)) errors.push(`Duplicate build identity ${id}.`); else seen.add(id); const source = path.resolve(root, entry.source); if (!fs.existsSync(source)) errors.push(`${id} source is missing: ${source}`); else if (!/\.wav$/i.test(source)) warnings.push(`${id} source is not named as a WAV file.`); }
  return { errors, warnings };
}
function setEntry(manifest, group, index, source) { const at = manifest.entries.findIndex((entry) => entry.group === group && entry.index === index), next = { source, group, index }; if (at >= 0) manifest.entries[at] = next; else manifest.entries.push(next); manifest.entries.sort((a, b) => a.group - b.group || a.index - b.index); return manifest; }
function removeEntry(manifest, group, index) { const before = manifest.entries.length; manifest.entries = manifest.entries.filter((entry) => entry.group !== group || entry.index !== index); return before !== manifest.entries.length; }
function reorder(manifest, mode = 'number', nameFor = () => '') {
  const entries = manifest.entries || [];
  if (mode === 'source') return manifest;
  entries.sort((a, b) => mode === 'name'
    ? String(nameFor(a) || '').localeCompare(String(nameFor(b) || ''), undefined, { numeric: true, sensitivity: 'base' }) || a.group - b.group || a.index - b.index
    : a.group - b.group || a.index - b.index);
  return manifest;
}
function remapEntries(manifest, mappings) {
  const bySource = new Map((mappings || []).map((item) => [`${item.fromGroup},${item.fromIndex}`, item]));
  const next = (manifest.entries || []).map((entry) => {
    const mapping = bySource.get(`${entry.group},${entry.index}`);
    return mapping ? { ...entry, group: Number(mapping.toGroup), index: Number(mapping.toIndex) } : { ...entry };
  });
  const seen = new Set();
  for (const entry of next) { const identity = `${entry.group},${entry.index}`; if (seen.has(identity)) throw new Error(`Remap would create duplicate sound identity ${identity}.`); seen.add(identity); }
  manifest.entries = next;
  return reorder(manifest, 'number');
}
function read(filename) { return parse(fs.readFileSync(filename, 'utf8')); }

module.exports = { meaningfulLines, parse, stringify, validate, setEntry, removeEntry, reorder, remapEntries, read };
