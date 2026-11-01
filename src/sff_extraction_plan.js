'use strict';

const crypto = require('crypto');
const path = require('path');
const { canonicalize, hashCanonical } = require('./sff_capability_report');
const { assertSnapshot } = require('./sff_extraction_scope_contract');
const { inspectNativeSprite, copyNativeBytes } = require('./sff_native_payload_contract');
const { readIndexedPng8 } = require('./sff_png8_source');
const { inspectPreparedPng, bmpToPng, pcxToPng } = require('./sff_source_preparation');
const { decodePng } = require('./palette_index_organizer_model');

const FORMATS = Object.freeze(['png-indexed8', 'bmp-indexed8', 'pcx-indexed8-256', 'png-rendered-rgba', 'embedded-native-image', 'archive-native-payload']);
const FORMAT_INFO = Object.freeze({
  'png-indexed8': { kind: 'decoded-image', suffix: '.indexed.png', mediaType: 'image/png', indexed: true },
  'bmp-indexed8': { kind: 'decoded-image', suffix: '.indexed.bmp', mediaType: 'image/bmp', indexed: true },
  'pcx-indexed8-256': { kind: 'decoded-image', suffix: '.indexed.pcx', mediaType: 'image/x-pcx', indexed: true },
  'png-rendered-rgba': { kind: 'decoded-image', suffix: '.rendered.png', mediaType: 'image/png' },
  'embedded-native-image': { kind: 'embedded-native-image', native: true },
  'archive-native-payload': { kind: 'archive-native-payload', native: true, suffix: '.payload.bin', mediaType: 'application/octet-stream' }
});
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(freeze); return value; }
function safeName(value, label) { const name = String(value || '').trim(); if (!name || name === '.' || name === '..' || name.length > 180 || /[<>:"/\\|?*\u0000-\u001f]/.test(name) || /[. ]$/.test(name) || RESERVED.test(name)) throw new Error(`${label} is not a safe portable filename.`); return name; }
function pad(value, width) { const sign = value < 0 ? 'n' : ''; return `${sign}${String(Math.abs(value)).padStart(width, '0')}`; }
function inventorySeal(inventory = []) { if (!Array.isArray(inventory)) throw new Error('destinationInventory must be an array.'); const seen = new Set(), rows = inventory.map((item) => ({ relativePath: safeName(item.relativePath, 'inventory relativePath'), type: String(item.type || 'file'), byteHash: String(item.byteHash || '').toLowerCase() })); for (const row of rows) { const key = row.relativePath.toLowerCase(); if (seen.has(key)) throw new Error(`Destination inventory repeats ${row.relativePath}.`); seen.add(key); if (!['file','directory'].includes(row.type)) throw new Error('Inventory type must be file or directory.'); if (!/^[0-9a-f]{64}$/.test(row.byteHash)) throw new Error('Inventory byteHash must be SHA-256.'); } rows.sort((a,b)=>a.relativePath.toLowerCase().localeCompare(b.relativePath.toLowerCase()) || a.relativePath.localeCompare(b.relativePath)); return { rows, hash: hashCanonical(rows) }; }
function baseName(entry, naming = {}, material = {}, selectionOrdinal = 0) {
  const identity = `g${pad(entry.group, 5)}_i${pad(entry.number, 5)}_p${pad(entry.physicalIndex, 5)}`, profile = String(naming.profile || '');
  if (profile === 'group-number') return identity;
  if (profile === 'named') return `${safeName(material.friendlyName, 'friendly sprite name')}_${identity}`;
  if (profile === 'sequential') { const prefix = safeName(naming.prefix, 'sequential prefix'), start = Number(naming.start), padding = Number(naming.padding); if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(padding) || padding < 1 || padding > 12 || selectionOrdinal > Number.MAX_SAFE_INTEGER - start) throw new Error('Sequential start/padding is invalid.'); return `${prefix}${String(start + selectionOrdinal).padStart(padding, '0')}_${identity}`; }
  throw new Error(`Unsupported naming profile ${profile || '(missing)'}.`);
}
function nativeSuffix(inspection) { if (inspection.kind === 'embedded-native-image') return inspection.mediaType === 'image/x-pcx' ? '.native.pcx' : '.native.png'; return '.payload.bin'; }
function normalizedMaterial(value, entry, requirements) {
  const material = value || {}, decodedHash = material.decodedHash == null ? null : String(material.decodedHash).toLowerCase(), renderedRgbaHash = material.renderedRgbaHash == null ? null : String(material.renderedRgbaHash).toLowerCase();
  if (requirements.indexed && !/^[0-9a-f]{64}$/.test(decodedHash || '')) throw new Error(`Physical index ${entry.physicalIndex} requires a reviewed decodedHash.`);
  if (requirements.rendered && !/^[0-9a-f]{64}$/.test(renderedRgbaHash || '')) throw new Error(`Physical index ${entry.physicalIndex} requires a reviewed renderedRgbaHash.`);
  if (decodedHash !== null && !/^[0-9a-f]{64}$/.test(decodedHash)) throw new Error(`Physical index ${entry.physicalIndex} decodedHash must be SHA-256.`);
  if (renderedRgbaHash !== null && !/^[0-9a-f]{64}$/.test(renderedRgbaHash)) throw new Error(`Physical index ${entry.physicalIndex} renderedRgbaHash must be SHA-256.`);
  let paletteColors = null;
  if (material.paletteColors !== undefined) {
    if (!Array.isArray(material.paletteColors) || material.paletteColors.length !== 256) throw new Error(`Physical index ${entry.physicalIndex} requires an exact 256-entry palette.`);
    paletteColors = material.paletteColors.map((color, index) => { if (!Array.isArray(color) || color.length !== 4 || color.some(channel => !Number.isInteger(channel) || channel < 0 || channel > 255)) throw new Error(`Physical index ${entry.physicalIndex} palette color ${index} must be RGBA bytes.`); return [...color]; });
  }
  return { pixelKind: String(material.pixelKind || ''), decodedHash, renderedRgbaHash, paletteColors, friendlyName: material.friendlyName };
}

function assertSelection(selection, snapshot) {
  const copy = { ...selection }; delete copy.selectionHash;
  if (selection?.schema !== 'ikemaker.sff-extraction-selection' || selection.version !== 1 || hashCanonical(copy) !== selection.selectionHash) throw new Error('Extraction selection is missing or drifted.');
  if (selection.archiveByteHash !== snapshot.archiveByteHash || selection.snapshotHash !== snapshot.snapshotHash) throw new Error('Extraction selection is not bound to the supplied snapshot.');
  if (!Array.isArray(selection.physicalEntries) || !selection.physicalEntries.length) throw new Error('Extraction selection has no physical rows.');
  let previous = -1;
  for (const row of selection.physicalEntries || []) {
    const source = snapshot.entries[row.physicalIndex];
    if (!source || hashCanonical(source) !== hashCanonical(row)) throw new Error('Extraction selection contains a stale or forged physical row.');
    if (row.physicalIndex <= previous) throw new Error('Extraction selection physical rows must be unique and in archive order.');
    previous = row.physicalIndex;
  }
}

function createExtractionPlan(input = {}) {
  const snapshot = input.snapshot, selection = input.selection;
  assertSnapshot(snapshot); assertSelection(selection, snapshot);
  if (!input.expectedSnapshotHash || input.expectedSnapshotHash !== snapshot.snapshotHash) throw new Error('Expected extraction snapshot seal is required and must match exactly.');
  if (!input.expectedSelectionHash || input.expectedSelectionHash !== selection.selectionHash) throw new Error('Expected extraction selection seal is required and must match exactly.');
  if (!Array.isArray(input.formats) || !input.formats.length) throw new Error('Select at least one explicit extraction format.');
  const formats = [...new Set(input.formats)]; if (formats.length !== input.formats.length || formats.some((item) => !FORMATS.includes(item))) throw new Error('Extraction formats contain duplicates or unsupported values.');
  const archiveBytes = Buffer.from(input.archiveBytes || []); if (sha(archiveBytes) !== snapshot.archiveByteHash) throw new Error('Extraction plan archive bytes drifted.');
  const inventory = inventorySeal(input.destinationInventory || []); if (!input.destinationInventoryHash || input.destinationInventoryHash !== inventory.hash) throw new Error('Destination inventory seal is required and must match exactly.');
  const inventoryByName = new Map(inventory.rows.map((row) => [row.relativePath.toLowerCase(), row])), decisions = input.collisionDecisions || {}, usedDecisions = new Set(), outputs = [], names = new Set();
  const requirements = { indexed: formats.some((format) => FORMAT_INFO[format].indexed), rendered: formats.includes('png-rendered-rgba') };
  for (const [selectionOrdinal, entry] of selection.physicalEntries.entries()) {
    const material = normalizedMaterial(input.materials?.[entry.physicalIndex], entry, requirements), base = baseName(entry, input.naming, material, selectionOrdinal);
    for (const format of formats) {
      const info = FORMAT_INFO[format]; let inspection = null;
      if (info.indexed && (material.pixelKind !== 'indexed8' || !material.paletteColors)) throw new Error(`${format} requires reviewed indexed8 pixels and an exact 256-entry palette for physical index ${entry.physicalIndex}.`);
      if (['bmp-indexed8','pcx-indexed8-256'].includes(format) && material.paletteColors.some((color,index)=>color[3] !== (index === 0 ? 0 : 255))) throw new Error(`${format} cannot preserve this palette alpha layout; use indexed PNG or a separately reviewed conversion.`);
      if (info.native) { inspection = inspectNativeSprite(snapshot, archiveBytes, entry.physicalIndex, input.nativeOptions); if (format === 'embedded-native-image' && inspection.kind !== 'embedded-native-image') throw new Error(`Physical index ${entry.physicalIndex} has no independently usable embedded native image.`); if (format === 'archive-native-payload' && inspection.kind !== 'archive-native-payload') throw new Error(`Physical index ${entry.physicalIndex} has no owned archive-native payload.`); }
      const suffix = info.native ? nativeSuffix(inspection) : info.suffix; let relativePath = safeName(`${base}${suffix}`, 'planned output path'), key = relativePath.toLowerCase(), decision = null;
      if (names.has(key)) throw new Error(`Internal extraction output collision at ${relativePath}.`);
      const existing = inventoryByName.get(key);
      if (existing) {
        const decisionKey = `${entry.entryId}:${format}`; decision = decisions[decisionKey]; if (!decision || !['rename','skip','replace'].includes(decision.action)) throw new Error(`Collision at ${relativePath} requires explicit rename, skip, or replace.`); usedDecisions.add(decisionKey);
        if (decision.action === 'rename') { relativePath = safeName(decision.relativePath, 'reviewed renamed output'); key = relativePath.toLowerCase(); if (names.has(key) || inventoryByName.has(key)) throw new Error(`Reviewed rename still collides at ${relativePath}.`); }
        if (decision.action === 'replace' && (existing.type !== 'file' || String(decision.expectedByteHash || '').toLowerCase() !== existing.byteHash)) throw new Error(`Replace evidence for ${relativePath} does not match a sealed existing file.`);
      }
      names.add(key);
      const expectedDecodedHash = format === 'png-rendered-rgba' ? material.renderedRgbaHash : material.decodedHash;
      if (!info.native && !expectedDecodedHash) throw new Error(`${format} requires a reviewed ${format === 'png-rendered-rgba' ? 'renderedRgbaHash' : 'decodedHash'} for physical index ${entry.physicalIndex}.`);
      outputs.push({ outputId: `${entry.entryId}:${format}`, source: { entryId: entry.entryId, physicalIndex: entry.physicalIndex, group: entry.group, number: entry.number, width: entry.width, height: entry.height, axisX: entry.axisX, axisY: entry.axisY, palettePhysicalIndex: entry.palettePhysicalIndex, storageKind: entry.storageKind, linkPhysicalIndex: entry.linkPhysicalIndex }, outputKind: info.kind, format, mediaType: inspection?.mediaType || info.mediaType, relativePath, native: inspection, decodedRecipe: info.native ? null : { version: 1, pixelKind: format === 'png-rendered-rgba' ? 'rgba8' : material.pixelKind, decodedHash: expectedDecodedHash, paletteHash: info.indexed && material.paletteColors ? hashCanonical(material.paletteColors) : null }, collision: decision || { action: 'create' } });
    }
  }
  const unusedDecisions = Object.keys(decisions).filter((key) => !usedDecisions.has(key));
  if (unusedDecisions.length) throw new Error(`Collision decisions contain unplanned output keys: ${unusedDecisions.join(', ')}.`);
  const plan = { schema: 'ikemaker.sff-extraction-plan', version: 1, commitPolicy: 'transactional-write-set', source: { archiveByteHash: snapshot.archiveByteHash, archiveByteLength: snapshot.archiveByteLength, sffVersion: snapshot.sffVersion, snapshotHash: snapshot.snapshotHash }, scope: { mode: selection.mode, selectionHash: selection.selectionHash }, formats, naming: canonicalize(input.naming || {}, 'naming'), destinationInventoryHash: inventory.hash, outputs };
  plan.planHash = hashCanonical(plan); return freeze(plan);
}

function validateArtifact(row, bytes) {
  let width = row.source.width, height = row.source.height, decodedHash = null, paletteHash = null;
  if (row.format === 'png-indexed8') { const decoded = readIndexedPng8(bytes); width = decoded.width; height = decoded.height; decodedHash = decoded.decodedHash; paletteHash = hashCanonical(decoded.colors); }
  else if (row.format === 'bmp-indexed8') { if (bytes.length < 54 || bytes.readUInt16LE(28) !== 8) throw new Error('Produced BMP is not indexed 8-bit.'); const decoded = readIndexedPng8(bmpToPng(bytes, row.relativePath)); width = decoded.width; height = decoded.height; decodedHash = decoded.decodedHash; paletteHash = hashCanonical(decoded.colors); }
  else if (row.format === 'pcx-indexed8-256') { if (bytes.length < 897 || bytes[3] !== 8 || bytes[65] !== 1 || bytes[bytes.length - 769] !== 0x0c) throw new Error('Produced PCX is not indexed 256-color PCX.'); const decoded = readIndexedPng8(pcxToPng(bytes, row.relativePath)); width = decoded.width; height = decoded.height; decodedHash = decoded.decodedHash; paletteHash = hashCanonical(decoded.colors); }
  else if (row.format === 'png-rendered-rgba') { const info = inspectPreparedPng(bytes, row.relativePath), decoded = decodePng(bytes); if (info.colorType !== 6 || info.bitDepth !== 8) throw new Error('Rendered PNG must be 8-bit RGBA.'); width = decoded.width; height = decoded.height; decodedHash = sha(decoded.rgba); }
  else if (row.format === 'embedded-native-image') {
    if (row.mediaType === 'image/png') { const info = inspectPreparedPng(bytes, row.relativePath); width = info.width; height = info.height; if (info.indexed && info.bitDepth === 8) { const decoded = readIndexedPng8(bytes); decodedHash = decoded.decodedHash; paletteHash = hashCanonical(decoded.colors); } else { const decoded = decodePng(bytes); decodedHash = sha(decoded.rgba); } }
    else if (row.mediaType === 'image/x-pcx') { const decoded = readIndexedPng8(pcxToPng(bytes, row.relativePath)); width = decoded.width; height = decoded.height; decodedHash = decoded.decodedHash; paletteHash = hashCanonical(decoded.colors); }
    else throw new Error('Embedded native image has an unsupported media type.');
  } else if (row.format === 'archive-native-payload') { if (!bytes.length) throw new Error('Archive-native payload is empty.'); }
  else throw new Error(`Produced artifact does not match planned format ${row.format}.`);
  if (width !== row.source.width || height !== row.source.height) throw new Error(`Produced artifact dimensions ${width}x${height} do not match physical sprite ${row.source.width}x${row.source.height}.`);
  if (row.decodedRecipe) {
    if (decodedHash !== row.decodedRecipe.decodedHash) throw new Error(`Produced artifact decoded pixels differ from the reviewed recipe for ${row.outputId}.`);
    if (row.decodedRecipe.paletteHash && paletteHash !== row.decodedRecipe.paletteHash) throw new Error(`Produced artifact palette differs from the reviewed recipe for ${row.outputId}.`);
  }
  return { decodedHash, paletteHash };
}
function finalizeExtractionReceipt(plan, currentArchiveBytes, producedArtifacts = [], options = {}) {
  if (!options.expectedPlanHash || options.expectedPlanHash !== plan?.planHash) throw new Error('Expected extraction plan seal is required and must match exactly.');
  const copy = { ...plan }; delete copy.planHash; if (hashCanonical(copy) !== plan.planHash) throw new Error('Extraction plan hash drifted.');
  const archiveBytes = Buffer.from(currentArchiveBytes || []); if (sha(archiveBytes) !== plan.source.archiveByteHash) throw new Error('Source archive drifted before extraction finalization.');
  if (!options.currentDestinationInventoryHash || options.currentDestinationInventoryHash !== plan.destinationInventoryHash) throw new Error('Destination inventory must be rechecked and unchanged before extraction finalization.');
  const expected = plan.outputs.filter((row) => row.collision.action !== 'skip'), supplied = new Map();
  for (const item of producedArtifacts) { if (supplied.has(item.outputId)) throw new Error(`Duplicate produced artifact ${item.outputId}.`); supplied.set(item.outputId, item); }
  if (supplied.size !== expected.length || expected.some((row) => !supplied.has(row.outputId))) throw new Error('Produced artifacts do not exactly match every non-skipped planned output.');
  const buffers = new Map(), artifacts = expected.map((row) => {
    const bytes = Buffer.from(supplied.get(row.outputId).bytes || []); const inspected = validateArtifact(row, bytes);
    if (row.native) { const exact = copyNativeBytes(archiveBytes, row.native); if (!exact.equals(bytes)) throw new Error(`Native artifact ${row.outputId} differs from its sealed archive range.`); }
    buffers.set(row.outputId, Buffer.from(bytes)); const byteHash = sha(bytes);
    return { outputId: row.outputId, relativePath: row.relativePath, format: row.format, kind: row.outputKind, mediaType: row.mediaType, byteHash, decodedHash: inspected.decodedHash, source: row.source, paletteBinding: row.source.palettePhysicalIndex, sff4Source: { kind: row.outputKind === 'archive-native-payload' ? 'native-encoded-payload' : 'complete-image', relativePath: row.relativePath, byteHash, decodedHash: inspected.decodedHash, provenance: { archiveByteHash: plan.source.archiveByteHash, physicalIndex: row.source.physicalIndex, resolvedDataOwnerPhysicalIndex: row.native?.resolvedDataOwnerPhysicalIndex ?? row.source.physicalIndex, planHash: plan.planHash } } };
  });
  const metadata = { schema: 'ikemaker.sff-extraction-receipt', version: 1, planHash: plan.planHash, archiveByteHash: plan.source.archiveByteHash, artifacts };
  metadata.receiptHash = hashCanonical(metadata); freeze(metadata);
  return Object.freeze({ ...metadata, readBytes: (outputId) => { const value = buffers.get(outputId); if (!value) throw new Error(`Unknown extraction artifact ${outputId}.`); return Buffer.from(value); } });
}

module.exports = { FORMATS, createExtractionPlan, finalizeExtractionReceipt, inventorySeal };
