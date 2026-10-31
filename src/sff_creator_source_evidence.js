'use strict';

const crypto = require('crypto');
const { types } = require('util');
const { assertAdapterRequest } = require('./sff_backend_adapter_contract');
const { hashCanonical } = require('./sff_capability_report');
const { readIndexedPng8 } = require('./sff_png8_source');
const { decodePng } = require('./palette_index_organizer_model');
const { inspectPreparedPng } = require('./sff_source_preparation');

const SHA256 = /^[0-9a-f]{64}$/i;
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function fail(message) { throw new Error(`Creator source evidence: ${message}`); }
function checkedHash(value, label) { const result = String(value || '').toLowerCase(); if (!SHA256.test(result)) fail(`${label} must be a SHA-256 hash.`); return result; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(deepFreeze); return value; }
function inertJsonSnapshot(value, label = 'value', ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') { if (!Number.isFinite(value)) fail(`${label} must contain only finite numbers.`); return value; }
  if (types.isProxy(value)) fail(`${label} must contain only non-proxy JSON data.`);
  if (!value || typeof value !== 'object' || Buffer.isBuffer(value)) fail(`${label} must contain only non-proxy JSON data.`);
  if (ancestors.has(value)) fail(`${label} must not be circular.`);
  const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
  if ((!array && prototype !== Object.prototype && prototype !== null) || (array && prototype !== Array.prototype)) fail(`${label} must contain only plain JSON objects and arrays.`);
  const descriptors = Object.getOwnPropertyDescriptors(value), symbols = Object.getOwnPropertySymbols(value), keys = Reflect.ownKeys(descriptors).filter(key => typeof key === 'string' && !(array && key === 'length'));
  if (symbols.length) fail(`${label} must not contain symbol properties.`);
  if (array && (keys.some(key => !/^(?:0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) || keys.length !== value.length)) fail(`${label} arrays must be dense and contain no extra properties.`);
  for (const key of keys) if (!descriptors[key].enumerable || !Object.prototype.hasOwnProperty.call(descriptors[key], 'value')) fail(`${label}.${key} must be an enumerable data property, not an accessor.`);
  ancestors.add(value);
  const result = array ? Array.from({ length: value.length }, (_, index) => inertJsonSnapshot(descriptors[String(index)].value, `${label}[${index}]`, ancestors)) : Object.fromEntries(keys.map(key => [key, inertJsonSnapshot(descriptors[key].value, `${label}.${key}`, ancestors)]));
  ancestors.delete(value);
  return result;
}
function closedInput(rawInput) {
  if (types.isProxy(rawInput)) fail('input must not be a Proxy.');
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput) || Buffer.isBuffer(rawInput) || Object.getPrototypeOf(rawInput) !== Object.prototype) fail('input must be a plain object.');
  const ownKeys = Reflect.ownKeys(rawInput);
  if (ownKeys.some(key => typeof key === 'symbol') || ownKeys.length !== 2 || !ownKeys.includes('request') || !ownKeys.includes('sourceBytesByEntryId')) fail('input must contain exactly request and sourceBytesByEntryId as enumerable own data properties.');
  const request = Object.getOwnPropertyDescriptor(rawInput, 'request'), sources = Object.getOwnPropertyDescriptor(rawInput, 'sourceBytesByEntryId');
  if (!request || !sources || !request.enumerable || !sources.enumerable || !Object.prototype.hasOwnProperty.call(request, 'value') || !Object.prototype.hasOwnProperty.call(sources, 'value')) fail('input request and sourceBytesByEntryId must be enumerable own data properties.');
  return { request: request.value, sourceBytesByEntryId: sources.value };
}
function copySourceVault(request, supplied) {
  if (types.isProxy(supplied)) fail('sourceBytesByEntryId must be a plain non-proxy own-property object.');
  if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied) || Buffer.isBuffer(supplied) || ![Object.prototype, null].includes(Object.getPrototypeOf(supplied))) fail('sourceBytesByEntryId must be a plain own-property object.');
  if (Object.getOwnPropertySymbols(supplied).length) fail('sourceBytesByEntryId must not contain symbol properties.');
  const descriptors = Object.getOwnPropertyDescriptors(supplied), ownKeys = Object.keys(descriptors), rows = request.sourceSnapshotSeal.sources, expected = new Set(rows.map(row => row.entryId));
  if (ownKeys.length !== expected.size || ownKeys.some(key => !expected.has(key))) fail('sourceBytesByEntryId must contain exactly every sealed entryId and no extras.');
  const vault = Object.create(null), pathHashes = new Map(), receiptRows = [], sprites = new Map(request.specification.logical.sprites.map(entry => [entry.entryId, entry])), palettes = new Map(request.specification.logical.palettes.map(entry => [entry.entryId, entry]));
  for (const row of rows) {
    const descriptor = descriptors[row.entryId];
    if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) fail(`sourceBytesByEntryId.${row.entryId} must be an enumerable inert data property.`);
    let bytes = descriptor.value;
    if (types.isProxy(bytes)) fail(`sourceBytesByEntryId.${row.entryId} must not be a proxy.`);
    if (bytes instanceof Uint8Array && !Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
    if (!Buffer.isBuffer(bytes)) fail(`sourceBytesByEntryId.${row.entryId} must be a Buffer or Uint8Array.`);
    const copy = Buffer.from(bytes), byteHash = sha(copy);
    if (byteHash !== checkedHash(row.byteHash, `source seal ${row.entryId} byteHash`)) fail(`Source bytes drifted for ${row.entryId}.`);
    const previous = pathHashes.get(row.relativePath); if (previous && previous !== byteHash) fail(`Sealed source path ${row.relativePath} is ambiguous across different bytes.`); pathHashes.set(row.relativePath, byteHash);
    const sprite = sprites.get(row.entryId), palette = palettes.get(row.entryId); let semanticUse, verification;
    if (sprite) {
      const kind = sprite.pixels?.kind, indexed = kind === 'indexed8';
      if (row.kind !== 'complete-image' || !indexed && (request.targetId !== 'sff-v2.1' || !['rgb24', 'rgba32'].includes(kind))) fail(`Creator built-in sprite ${row.entryId} must be a complete supported image.`);
      let decoded;
      if (indexed) decoded = readIndexedPng8(copy);
      else {
        const info = inspectPreparedPng(copy, `Source sprite ${row.entryId}`);
        if (info.bitDepth !== 8 || info.colorType !== (kind === 'rgb24' ? 2 : 6)) fail(`Source sprite ${row.entryId} PNG type does not match ${kind}.`);
        decoded = decodePng(copy, { maximumPixels: 100000000, maximumDimension: 65535 });
        let pixels = decoded.rgba;
        if (kind === 'rgb24') { pixels = Buffer.alloc(decoded.width * decoded.height * 3); for (let i = 0, j = 0; i < decoded.rgba.length; i += 4) { pixels[j++] = decoded.rgba[i]; pixels[j++] = decoded.rgba[i + 1]; pixels[j++] = decoded.rgba[i + 2]; } }
        decoded.decodedHash = sha(pixels);
      }
      if (decoded.width !== sprite.width || decoded.height !== sprite.height) fail(`Source sprite dimensions drifted for ${row.entryId}.`);
      const expectedDecoded = checkedHash(sprite.pixels.decodedHash, `sprite ${row.entryId} decodedHash`);
      if (decoded.decodedHash !== expectedDecoded || String(sprite.source.decodedHash || '').toLowerCase() !== expectedDecoded || String(row.decodedHash || '').toLowerCase() !== expectedDecoded) fail(`Source sprite decoded-index hash drifted for ${row.entryId}.`);
      semanticUse = indexed ? 'candidate-indexed-sprite' : 'candidate-truecolor-sprite'; verification = indexed ? 'byte-hash-and-indexed-pixels-verified' : 'byte-hash-and-truecolor-pixels-verified';
    } else if (palette) {
      if (request.targetId === 'sff-v1') {
        const decoded = readIndexedPng8(copy);
        if (row.decodedHash != null && decoded.decodedHash !== checkedHash(row.decodedHash, `palette ${row.entryId} decodedHash`)) fail(`Source palette decoded-index hash drifted for ${row.entryId}.`);
        if (JSON.stringify(decoded.colors) !== JSON.stringify(palette.colors)) fail(`Source palette colors drifted for ${row.entryId}.`);
        semanticUse = 'candidate-indexed-palette'; verification = 'byte-hash-and-palette-colors-verified';
      } else { semanticUse = 'provenance-only'; verification = 'byte-hash-verified-not-decoded-for-candidate'; }
    } else fail(`Sealed source ${row.entryId} has no logical sprite or palette.`);
    vault[row.entryId] = copy;
    receiptRows.push({ entryId: row.entryId, relativePath: row.relativePath, byteHash, byteLength: copy.length, declaredDecodedHash: row.decodedHash || null, kind: row.kind, semanticUse, verification });
  }
  return { vault, receiptRows };
}

function validateCreatorSourceEvidence(rawInput) {
  const input = closedInput(rawInput);
  if (types.isProxy(input.request)) fail('request must not be a Proxy.');
  const request = deepFreeze(inertJsonSnapshot(input.request, 'request'));
  assertAdapterRequest(request, request.requestHash);
  const validated = copySourceVault(request, input.sourceBytesByEntryId);
  const receipt = deepFreeze({ schema: 'ikemaker.sff-creator-source-validation-receipt', version: 1, targetId: request.targetId, sourceSnapshotHash: request.sourceSnapshotHash, sources: validated.receiptRows, status: 'passed' });
  const metadata = deepFreeze({ schema: 'ikemaker.sff-creator-source-evidence', version: 1, receipt, receiptHash: hashCanonical(receipt), sourceBytesValidated: true, candidateCreated: false, writesCommitted: false, processesStarted: false, approvalsGranted: false, backendExecution: false, adoptionAllowed: false });
  return Object.freeze({ ...metadata, copySourceBytesByEntryId: () => { const copy = Object.create(null); for (const [entryId, bytes] of Object.entries(validated.vault)) copy[entryId] = Buffer.from(bytes); return copy; } });
}

module.exports = { validateCreatorSourceEvidence };
