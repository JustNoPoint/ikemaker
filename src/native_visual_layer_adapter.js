'use strict';

const MAX_ROWS = 512;
const MAX_IDENTITY_LENGTH = 2048;
const MAX_BINDING_LENGTH = 4096;
const MAX_METADATA_LENGTH = 8192;
const MAX_ABSOLUTE_COORDINATE = 1000000;
const MAX_NATIVE_LAYER = 1000000;

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, keys) {
  return plainObject(value) && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
}

function boundedText(value, label, maximum) {
  if (typeof value !== 'string' || !value.length || value !== value.trim() || value.length > maximum || value.includes('\0')) {
    throw new Error(`${label} is missing or unbounded.`);
  }
  return value;
}

function boundedNumber(value, label, maximum = MAX_ABSOLUTE_COORDINATE) {
  if (!Number.isFinite(value) || Math.abs(value) > maximum) throw new Error(`${label} is invalid or unbounded.`);
  return value;
}

function frozenMetadata(value) {
  if (value === undefined) return Object.freeze({});
  if (!plainObject(value)) throw new Error('Native layer metadata must be a plain object.');
  let encoded;
  try { encoded = JSON.stringify(value); } catch { throw new Error('Native layer metadata must be bounded JSON data.'); }
  if (encoded.length > MAX_METADATA_LENGTH) throw new Error('Native layer metadata is unbounded.');
  const clone = JSON.parse(encoded);
  const freeze = item => {
    if (!item || typeof item !== 'object') return item;
    for (const child of Object.values(item)) freeze(child);
    return Object.freeze(item);
  };
  return freeze(clone);
}

function normalizeNativeLayer(value) {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || Math.abs(value) > MAX_NATIVE_LAYER) throw new Error('Native layer number is invalid or unbounded.');
  return value;
}

function capabilities(nativeLayerAssignable) {
  return Object.freeze({
    position: 'authored-absolute',
    visibility: 'preview-only',
    lock: 'editor-local',
    opacity: 'unsupported',
    reorder: 'unsupported',
    nativeLayer: nativeLayerAssignable ? 'authored-explicit' : 'unsupported'
  });
}

function normalizeRow(raw, encounterOrder, allowNativeLayerAssignment) {
  if (!plainObject(raw)) throw new Error(`Native visual layer ${encounterOrder + 1} is invalid.`);
  const identity = boundedText(raw.identity, `Native visual layer ${encounterOrder + 1} identity`, MAX_IDENTITY_LENGTH);
  const x = boundedNumber(raw.x, `Layer ${identity} absolute X`);
  const y = boundedNumber(raw.y, `Layer ${identity} absolute Y`);
  const nativeLayer = normalizeNativeLayer(raw.nativeLayer);
  const nativeLayerAssignable = allowNativeLayerAssignment && raw.nativeLayerAssignable === true;
  return Object.freeze({
    identity,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 1024) : `Layer ${encounterOrder + 1}`,
    x,
    y,
    positionSpace: 'absolute',
    previewVisible: raw.previewVisible !== false,
    editorLocked: raw.editorLocked === true,
    encounterOrder,
    nativeLayer,
    nativeMetadata: frozenMetadata(raw.nativeMetadata),
    capabilities: capabilities(nativeLayerAssignable)
  });
}

function createNativeVisualLayerAdapter(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length > MAX_ROWS) throw new Error(`Native visual layers must contain at most ${MAX_ROWS} rows.`);
  if (!plainObject(options)) throw new Error('Native visual layer adapter options are invalid.');
  const binding = boundedText(options.binding, 'Native visual layer binding', MAX_BINDING_LENGTH);
  const normalized = rows.map((row, index) => normalizeRow(row, index, options.allowNativeLayerAssignment === true));
  const byIdentity = new Map();
  for (const row of normalized) {
    if (byIdentity.has(row.identity)) throw new Error(`Native visual layer identity ${row.identity} is repeated.`);
    byIdentity.set(row.identity, row);
  }

  function currentIntent(intent, keys) {
    if (!exactKeys(intent, keys)) throw new Error('Native visual layer intent contains unsupported fields.');
    if (intent.binding !== binding) throw new Error('The native visual layer binding is stale.');
  }

  function selected(identity) {
    const id = boundedText(identity, 'Native visual layer intent identity', MAX_IDENTITY_LENGTH);
    const row = byIdentity.get(id);
    if (!row) throw new Error(`Native visual layer identity ${id} is stale.`);
    if (row.editorLocked) throw new Error(`Native visual layer ${id} is editor-locked.`);
    return row;
  }

  function planPositions(intent) {
    currentIntent(intent, ['type', 'binding', 'positions']);
    if (intent.type !== 'set-absolute-positions') throw new Error('Only absolute position delegation is supported.');
    if (!Array.isArray(intent.positions) || !intent.positions.length || intent.positions.length > MAX_ROWS) throw new Error('The absolute position intent is empty or unbounded.');
    const seen = new Set();
    const positions = intent.positions.map(item => {
      if (!exactKeys(item, ['identity', 'x', 'y'])) throw new Error('An absolute position intent contains unsupported fields.');
      const row = selected(item.identity);
      if (seen.has(row.identity)) throw new Error(`Native visual layer identity ${row.identity} is repeated in the intent.`);
      seen.add(row.identity);
      return Object.freeze({
        identity: row.identity,
        x: boundedNumber(item.x, `Layer ${row.identity} absolute X`),
        y: boundedNumber(item.y, `Layer ${row.identity} absolute Y`)
      });
    });
    return Object.freeze({ type: 'delegate-absolute-positions', binding, positionSpace: 'absolute', positions: Object.freeze(positions) });
  }

  function planNativeLayers(intent) {
    currentIntent(intent, ['type', 'binding', 'assignments']);
    if (intent.type !== 'set-native-layer-numbers') throw new Error('Only explicit native layer-number assignment is supported.');
    if (!Array.isArray(intent.assignments) || !intent.assignments.length || intent.assignments.length > MAX_ROWS) throw new Error('The native layer-number intent is empty or unbounded.');
    const seen = new Set();
    const assignments = intent.assignments.map(item => {
      if (!exactKeys(item, ['identity', 'nativeLayer'])) throw new Error('A native layer-number intent contains unsupported fields.');
      const row = selected(item.identity);
      if (row.capabilities.nativeLayer !== 'authored-explicit') throw new Error(`Native layer-number assignment is unsupported for ${row.identity}.`);
      if (seen.has(row.identity)) throw new Error(`Native visual layer identity ${row.identity} is repeated in the intent.`);
      seen.add(row.identity);
      return Object.freeze({ identity: row.identity, nativeLayer: normalizeNativeLayer(item.nativeLayer) });
    });
    if (assignments.some(item => item.nativeLayer === null)) throw new Error('A native layer number must be an explicit bounded integer.');
    return Object.freeze({ type: 'delegate-native-layer-numbers', binding, assignments: Object.freeze(assignments) });
  }

  function plan(intent) {
    if (!plainObject(intent)) throw new Error('Native visual layer intent is invalid.');
    if (intent.type === 'set-absolute-positions') return planPositions(intent);
    if (intent.type === 'set-native-layer-numbers') return planNativeLayers(intent);
    throw new Error('The requested native visual layer operation is unsupported.');
  }

  return Object.freeze({
    binding,
    rows: Object.freeze(normalized),
    snapshot: () => Object.freeze({ binding, rows: Object.freeze([...normalized]) }),
    plan
  });
}

module.exports = {
  MAX_ROWS,
  MAX_IDENTITY_LENGTH,
  MAX_BINDING_LENGTH,
  MAX_ABSOLUTE_COORDINATE,
  MAX_NATIVE_LAYER,
  createNativeVisualLayerAdapter
};
