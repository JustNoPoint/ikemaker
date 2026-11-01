'use strict';

const crypto = require('crypto');

const SCHEMA = 'ikemaker.palette-scratch';
const VERSION = 1;
const COLOR_COUNT = 256;
const DEFAULT_NAME = 'Untitled palette';
const MAX_NAME_LENGTH = 120;
const UUIDISH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOCUMENT_KEYS = Object.freeze(['schema', 'version', 'draftId', 'name', 'colors', 'lockedIndexes', 'semanticHash']);
const PAYLOAD_KEYS = Object.freeze(['schema', 'version', 'draftId', 'name', 'colors', 'lockedIndexes']);

function fail(message) {
  throw new Error(`Invalid IKEMaker scratch palette: ${message}`);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, expected, label) {
  if (!isPlainObject(value)) fail(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(`${label} has missing or unsupported fields.`);
  }
}

function normalizeDraftId(value) {
  if (typeof value !== 'string' || !UUIDISH.test(value)) fail('draftId must be a UUID-style identifier.');
  return value.toLowerCase();
}

function normalizeName(value) {
  if (typeof value !== 'string') fail('name must be text.');
  const name = value.trim();
  if (!name) fail('name cannot be empty.');
  if (name.length > MAX_NAME_LENGTH) fail(`name cannot exceed ${MAX_NAME_LENGTH} characters.`);
  if (/\p{Cc}/u.test(name)) fail('name cannot contain control characters.');
  return name;
}

function normalizeColor(value, index) {
  if (!Array.isArray(value) || value.length !== 4) fail(`color ${index} must contain exactly four RGBA channels.`);
  return Array.from(value, (channel, channelIndex) => {
    if (!Number.isInteger(channel) || channel < 0 || channel > 255) {
      fail(`color ${index} channel ${channelIndex} must be an integer from 0 through 255.`);
    }
    return channel;
  });
}

function normalizeColors(value) {
  if (!Array.isArray(value) || value.length !== COLOR_COUNT) fail(`colors must contain exactly ${COLOR_COUNT} RGBA entries.`);
  const colors = Array.from(value, normalizeColor);
  if (colors[0].some((channel) => channel !== 0)) fail('index 0 must remain transparent RGBA 0,0,0,0.');
  return colors;
}

function normalizeLockedIndexes(value) {
  if (!Array.isArray(value) || value.length !== 1 || value[0] !== 0) fail('lockedIndexes must contain only index 0.');
  return [0];
}

function payloadFrom(value, strictKeys = true) {
  if (strictKeys) exactKeys(value, PAYLOAD_KEYS, 'document payload');
  if (value.schema !== SCHEMA) fail(`schema must be ${SCHEMA}.`);
  if (value.version !== VERSION) fail(`version must be ${VERSION}.`);
  return {
    schema: SCHEMA,
    version: VERSION,
    draftId: normalizeDraftId(value.draftId),
    name: normalizeName(value.name),
    colors: normalizeColors(value.colors),
    lockedIndexes: normalizeLockedIndexes(value.lockedIndexes)
  };
}

function canonicalPayload(payload) {
  return JSON.stringify({
    schema: payload.schema,
    version: payload.version,
    draftId: payload.draftId,
    name: payload.name,
    colors: payload.colors,
    lockedIndexes: payload.lockedIndexes
  });
}

function semanticHash(value) {
  const payload = payloadFrom(value, false);
  return crypto.createHash('sha256').update(canonicalPayload(payload), 'utf8').digest('hex');
}

function sealScratchPaletteDocument(value) {
  const keys = Object.keys(value || {}).filter((key) => key !== 'semanticHash');
  if (keys.length !== PAYLOAD_KEYS.length || keys.sort().some((key, index) => key !== [...PAYLOAD_KEYS].sort()[index])) {
    fail('document payload has missing or unsupported fields.');
  }
  const payload = payloadFrom(value, false);
  return { ...payload, semanticHash: semanticHash(payload) };
}

function normalizeScratchPaletteDocument(value) {
  exactKeys(value, DOCUMENT_KEYS, 'document');
  const payload = payloadFrom(value, false);
  if (typeof value.semanticHash !== 'string' || !/^[0-9a-f]{64}$/.test(value.semanticHash)) fail('semanticHash must be a lowercase SHA-256 digest.');
  const expected = semanticHash(payload);
  if (!crypto.timingSafeEqual(Buffer.from(value.semanticHash, 'hex'), Buffer.from(expected, 'hex'))) fail('semanticHash does not match the document contents.');
  return { ...payload, semanticHash: expected };
}

function defaultColors() {
  return Array.from({ length: COLOR_COUNT }, (_, index) => index === 0 ? [0, 0, 0, 0] : [0, 0, 0, 255]);
}

function createScratchPaletteDocument(options = {}) {
  if (!isPlainObject(options)) fail('creation options must be an object.');
  const supported = new Set(['draftId', 'name', 'colors']);
  if (Object.keys(options).some((key) => !supported.has(key))) fail('creation options contain unsupported fields.');
  return sealScratchPaletteDocument({
    schema: SCHEMA,
    version: VERSION,
    draftId: options.draftId || crypto.randomUUID(),
    name: options.name == null ? DEFAULT_NAME : options.name,
    colors: options.colors == null ? defaultColors() : options.colors,
    lockedIndexes: [0]
  });
}

function parseScratchPaletteDocument(text) {
  if (typeof text !== 'string') fail('serialized input must be text.');
  let value;
  try { value = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch (_) { fail('serialized input is not valid JSON.'); }
  return normalizeScratchPaletteDocument(value);
}

function serializeScratchPaletteDocument(value) {
  const normalized = normalizeScratchPaletteDocument(value);
  return `${JSON.stringify(normalized, null, 2)}\n`;
}

function isScratchPaletteDirty(current, baseline) {
  const currentDocument = normalizeScratchPaletteDocument(current);
  const baselineDocument = normalizeScratchPaletteDocument(baseline);
  return currentDocument.semanticHash !== baselineDocument.semanticHash;
}

function actAlphaLossEligibility(value) {
  const document = normalizeScratchPaletteDocument(value);
  const lossyIndexes = [];
  for (let index = 1; index < document.colors.length; index += 1) {
    if (document.colors[index][3] !== 255) lossyIndexes.push(index);
  }
  return {
    eligible: lossyIndexes.length === 0,
    requiresAlphaLoss: lossyIndexes.length > 0,
    lossyIndexes,
    reason: lossyIndexes.length ? 'ACT cannot preserve alpha outside transparent index 0.' : ''
  };
}

module.exports = {
  SCHEMA,
  VERSION,
  COLOR_COUNT,
  DEFAULT_NAME,
  defaultColors,
  semanticHash,
  createScratchPaletteDocument,
  sealScratchPaletteDocument,
  normalizeScratchPaletteDocument,
  parseScratchPaletteDocument,
  serializeScratchPaletteDocument,
  isScratchPaletteDirty,
  actAlphaLossEligibility
};
