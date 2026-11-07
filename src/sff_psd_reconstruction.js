'use strict';

const path = require('path');
const fs = require('fs');
const { spritePng } = require('./sff_reader');
const { readIndexedPng8 } = require('./sff_png8_source');

function stem(value) {
  return path.basename(String(value || '').trim(), path.extname(String(value || '').trim())).toLowerCase();
}

function integerField(row, names, label) {
  const key = names.find(name => Object.prototype.hasOwnProperty.call(row || {}, name) && String(row[name]).trim() !== '');
  if (!key) throw new Error(`PSD reconstruction manifest row has no ${label}.`);
  const value = Number(row[key]);
  if (!Number.isSafeInteger(value)) throw new Error(`PSD reconstruction manifest ${label} is not a whole number: ${row[key]}`);
  return value;
}

function optionalAxis(row, names) {
  const key=names.find(name=>Object.prototype.hasOwnProperty.call(row||{},name)&&row[name]!==null&&row[name]!==undefined&&String(row[name]).trim()!=='');
  if(!key||!['string','number'].includes(typeof row[key]))return null;
  const value=Number(row[key]);return Number.isSafeInteger(value)?value:null;
}

function createManifestIndex(rows = []) {
  const result = new Map();
  for (const [ordinal, row] of rows.entries()) {
    const source = ['OriginalRelativePath', 'CurrentFilename', 'Filename', 'Source', 'File'].map(name => row?.[name]).find(value => String(value || '').trim());
    if (!source) throw new Error(`PSD reconstruction manifest row ${ordinal + 2} has no source filename.`);
    const key = stem(source), mapping = {
      ordinal, source: String(source),
      group: integerField(row, ['ComputedGroup', 'SFFGroup', 'Group', 'BaseGroup'], 'group'),
      number: integerField(row, ['ImageIndex', 'SFFIndex', 'Index', 'SourceImageIndex'], 'index'),
      axisX: optionalAxis(row, ['AxisX', 'X']),
      axisY: optionalAxis(row, ['AxisY', 'Y'])
    };
    if (mapping.group < 0 || mapping.group > 65535) throw new Error(`PSD reconstruction manifest ${mapping.source} uses a group outside 0–65535.`);
    if (mapping.number < 0 || mapping.number > 65535) throw new Error(`PSD reconstruction manifest ${mapping.source} uses an index outside 0–65535.`);
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(mapping);
  }
  return result;
}

function createArchiveIndex(archive) {
  if (!archive || !Array.isArray(archive.sprites)) throw new Error('PSD reconstruction requires a parsed target SFF.');
  const byIdentity = new Map(), byDecodedImage = new Map();
  for (const sprite of archive.sprites) {
    const identity = `${sprite.group},${sprite.number}`;
    if (!byIdentity.has(identity)) byIdentity.set(identity, []);
    byIdentity.get(identity).push(sprite);
    if (Number(sprite.group) >= 10000) continue;
    try {
      const decoded = readIndexedPng8(spritePng(archive, sprite, null, true));
      const key = `${decoded.width}x${decoded.height}:${decoded.decodedHash}`;
      if (!byDecodedImage.has(key)) byDecodedImage.set(key, []);
      byDecodedImage.get(key).push(sprite);
    } catch (_) { /* Non-PNG8 entries cannot prove an exact decoded-index match. */ }
  }
  return { byIdentity, byDecodedImage };
}

function resolvePsdBaseMapping(psdFilename, indexedPng, manifestIndex, archiveIndex) {
  const key = stem(psdFilename), manifestMatches = manifestIndex?.get(key) || [];
  if (manifestMatches.length > 1) return { status: 'blocked', reason: `Manifest contains ${manifestMatches.length} mappings for ${path.basename(psdFilename)}.` };
  if (manifestMatches.length === 1) {
    const mapping = manifestMatches[0], identity = `${mapping.group},${mapping.number}`, active = archiveIndex.byIdentity.get(identity) || [];
    if (active.length > 1) return { status: 'blocked', reason: `Current SFF contains ${active.length} physical sprites at ${identity}.` };
    const authority = active[0];
    const axisX = authority ? Number(authority.axisX) : mapping.axisX, axisY = authority ? Number(authority.axisY) : mapping.axisY;
    if (!Number.isSafeInteger(axisX) || !Number.isSafeInteger(axisY)) return { status: 'blocked', reason: `${path.basename(psdFilename)} has no exact axis in the current SFF or manifest.` };
    return { status: 'resolved', basis: authority ? 'manifest-identity-current-sff-axis' : 'manifest', group: mapping.group, number: mapping.number, axisX, axisY, replacesActive: Boolean(authority) };
  }
  const decoded = readIndexedPng8(indexedPng), imageKey = `${decoded.width}x${decoded.height}:${decoded.decodedHash}`, matches = archiveIndex.byDecodedImage.get(imageKey) || [];
  if (matches.length !== 1) return { status: 'blocked', reason: matches.length ? `${path.basename(psdFilename)} exactly matches ${matches.length} current base sprites; placement is ambiguous.` : `${path.basename(psdFilename)} has no manifest row and no exact current-SFF decoded-index match.` };
  const sprite = matches[0];
  return { status: 'resolved', basis: 'current-sff-exact-decoded-index-match', group: Number(sprite.group), number: Number(sprite.number), axisX: Number(sprite.axisX), axisY: Number(sprite.axisY), replacesActive: true };
}

function layerOneMapping(base) {
  if (!base || base.status !== 'resolved') throw new Error('Layer 1 mapping requires a resolved base mapping.');
  const group = Number(base.group) + 10000;
  if (Number(base.group) < 0 || Number(base.group) >= 10000 || group > 65535) throw new Error(`Base group ${base.group} is outside the 0–9999 base bank and cannot produce a Layer 1 identity.`);
  return { group, number: Number(base.number), axisX: Number(base.axisX), axisY: Number(base.axisY), basis: 'layer-1-base-plus-10000' };
}

function scanPsdFolder(root, options = {}) {
  const selectedRoot = path.resolve(root), maximumFiles = Number.isSafeInteger(options.maximumFiles) ? options.maximumFiles : 5000;
  if (!fs.existsSync(selectedRoot) || !fs.statSync(selectedRoot).isDirectory()) throw new Error('Choose a folder containing Photoshop PSD sources.');
  const realRoot = fs.realpathSync(selectedRoot), files = [], collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  for (const entry of fs.readdirSync(selectedRoot, { withFileTypes: true }).sort((left, right) => collator.compare(left.name, right.name))) {
    const filename = path.join(selectedRoot, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) throw new Error(`PSD reconstruction expects one reviewed flat source folder; nested folder ${entry.name} was not scanned.`);
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.psd') continue;
    const relative = path.relative(realRoot, fs.realpathSync(filename));
    if (path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) throw new Error(`PSD source resolves outside the selected folder: ${entry.name}.`);
    files.push(filename);
    if (files.length > maximumFiles) throw new Error(`PSD folder contains more than ${maximumFiles} files.`);
  }
  if (!files.length) throw new Error('The selected folder contains no PSD files.');
  return files;
}

module.exports = { createArchiveIndex, createManifestIndex, layerOneMapping, resolvePsdBaseMapping, scanPsdFolder, stem };
