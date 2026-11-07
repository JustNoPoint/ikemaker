'use strict';

const crypto = require('crypto');

const SFF_BUILD_SPECIFICATION_VERSION = 1;

function requireText(value, label) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function requireInteger(value, label, minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    const range = minimum > Number.MIN_SAFE_INTEGER && maximum < Number.MAX_SAFE_INTEGER
      ? ` from ${minimum} through ${maximum}`
      : minimum > Number.MIN_SAFE_INTEGER ? ` of at least ${minimum}` : maximum < Number.MAX_SAFE_INTEGER ? ` no greater than ${maximum}` : '';
    throw new Error(`${label} must be an integer${range}.`);
  }
  return number;
}

function optionalText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function portablePath(value, label) {
  const result = requireText(value, label).replace(/\\/g, '/');
  if (/^(?:[A-Za-z]:\/|\/|\\\\)/.test(result) || result.split('/').includes('..')) {
    throw new Error(`${label} must be a portable path inside the execution snapshot.`);
  }
  return result.replace(/^\.\//, '');
}

function normalizeJson(value, label) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${label} must contain only finite JSON values.`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => normalizeJson(item, `${label}[${index}]`));
  if (typeof value !== 'object') throw new Error(`${label} must contain only JSON values.`);
  return Object.keys(value).sort().reduce((result, key) => {
    const normalized = normalizeJson(value[key], `${label}.${key}`);
    if (normalized !== undefined) result[key] = normalized;
    return result;
  }, {});
}

function normalizeSource(source, label) {
  if (!source || typeof source !== 'object') throw new Error(`${label}.source is required.`);
  return {
    relativePath: portablePath(source.relativePath, `${label}.source.relativePath`),
    byteHash: requireText(source.byteHash, `${label}.source.byteHash`).toLowerCase(),
    decodedHash: optionalText(source.decodedHash)?.toLowerCase() || null,
    width: requireInteger(source.width, `${label}.source.width`, 1, 0xffff),
    height: requireInteger(source.height, `${label}.source.height`, 1, 0xffff),
    provenance: normalizeJson(source.provenance, `${label}.source.provenance`)
  };
}

function normalizeDuplicatePolicy(value, label) {
  const policy = requireText(value || 'preserve-separate', label).toLowerCase();
  if (['preserve-separate', 'keep-independent', 'preserve', 'separate'].includes(policy)) return 'preserve-separate';
  if (['share-identical', 'share', 'link'].includes(policy)) return 'share-identical';
  throw new Error(`${label} has an unsupported duplicate policy.`);
}

function normalizeSprite(sprite, index) {
  const label = `sprites[${index}]`;
  return {
    entryId: requireText(sprite?.entryId, `${label}.entryId`),
    group: requireInteger(sprite?.group, `${label}.group`, 0, 0xffff),
    number: requireInteger(sprite?.number, `${label}.number`, 0, 0xffff),
    axisX: requireInteger(sprite?.axisX ?? 0, `${label}.axisX`, -0x8000, 0x7fff),
    axisY: requireInteger(sprite?.axisY ?? 0, `${label}.axisY`, -0x8000, 0x7fff),
    colorDepth: requireInteger(sprite?.colorDepth, `${label}.colorDepth`, 1),
    format: requireText(sprite?.format, `${label}.format`),
    compression: requireText(sprite?.compression, `${label}.compression`),
    paletteId: optionalText(sprite?.paletteId),
    linkTargetEntryId: optionalText(sprite?.linkTargetEntryId),
    duplicatePolicy: normalizeDuplicatePolicy(sprite?.duplicatePolicy, `${label}.duplicatePolicy`),
    crop: {
      mode: requireText(sprite?.crop?.mode || 'none', `${label}.crop.mode`),
      axisDeltaX: requireInteger(sprite?.crop?.axisDeltaX ?? 0, `${label}.crop.axisDeltaX`),
      axisDeltaY: requireInteger(sprite?.crop?.axisDeltaY ?? 0, `${label}.crop.axisDeltaY`)
    },
    source: normalizeSource(sprite?.source, label)
  };
}

function normalizePalette(palette, index) {
  const label = `palettes[${index}]`;
  const tableOrder = requireText(palette?.tableOrder || 'sff', `${label}.tableOrder`).toLowerCase();
  if (tableOrder !== 'sff') throw new Error(`${label}.tableOrder must be sff because specification colors are normalized archive-index colors.`);
  if (!Array.isArray(palette?.colors) || palette.colors.length !== 256) throw new Error(`${label}.colors must contain exactly 256 RGBA entries.`);
  const colors = palette.colors.map((color, colorIndex) => {
    if (!Array.isArray(color) || color.length !== 4) throw new Error(`${label}.colors[${colorIndex}] must be RGBA.`);
    return color.map((channel, channelIndex) => {
      const value = requireInteger(channel, `${label}.colors[${colorIndex}][${channelIndex}]`, 0);
      if (value > 255) throw new Error(`${label}.colors[${colorIndex}][${channelIndex}] must not exceed 255.`);
      return value;
    });
  });
  return {
    entryId: requireText(palette?.entryId, `${label}.entryId`),
    group: requireInteger(palette?.group, `${label}.group`, 0, 0xffff),
    number: requireInteger(palette?.number, `${label}.number`, 0, 0xffff),
    tableOrder,
    linkTargetEntryId: optionalText(palette?.linkTargetEntryId),
    duplicatePolicy: normalizeDuplicatePolicy(palette?.duplicatePolicy, `${label}.duplicatePolicy`),
    colors,
    source: normalizeSource(palette?.source, label)
  };
}

function assertUniqueEntryIds(entries, label) {
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.entryId)) throw new Error(`${label} contains duplicate entryId ${entry.entryId}.`);
    seen.add(entry.entryId);
  }
}

function assertLinks(entries, label) {
  const positions = new Map(entries.map((entry, index) => [entry.entryId, index]));
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry.linkTargetEntryId) continue;
    const target = positions.get(entry.linkTargetEntryId);
    if (target === undefined) throw new Error(`${label} ${entry.entryId} links to missing entry ${entry.linkTargetEntryId}.`);
    if (target >= index) throw new Error(`${label} ${entry.entryId} must link backward to an earlier physical entry.`);
    if (entry.duplicatePolicy !== 'share-identical') throw new Error(`${label} ${entry.entryId} cannot link while its duplicate policy preserves independent data.`);
  }
}

function assertProfile(specification) {
  if (specification.target.sffVersion !== '2.1') throw new Error(`Unsupported SFF specification version ${specification.target.sffVersion}; the reviewed profile is 2.1.`);
  const formats = new Set(['png8', 'png24', 'png32']);
  const cropModes = new Set(['none', 'autocrop', 'before-axis', 'after-axis']);
  for (const sprite of specification.sprites) {
    const format = sprite.format.toLowerCase(), compression = sprite.compression.toLowerCase();
    if (!formats.has(format) || compression !== format) throw new Error(`Sprite ${sprite.entryId} uses unsupported format/compression ${sprite.format}/${sprite.compression}.`);
    if (!cropModes.has(sprite.crop.mode)) throw new Error(`Sprite ${sprite.entryId} uses unsupported crop mode ${sprite.crop.mode}.`);
    if (!['preserve-separate', 'share-identical'].includes(sprite.duplicatePolicy)) throw new Error(`Sprite ${sprite.entryId} has an unsupported duplicate policy.`);
  }
  for (const palette of specification.palettes) if (!['preserve-separate', 'share-identical'].includes(palette.duplicatePolicy)) throw new Error(`Palette ${palette.entryId} has an unsupported duplicate policy.`);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = canonicalize(value[key]);
    return result;
  }, {});
}

function specificationHash(specification) {
  const copy = { ...specification };
  delete copy.specificationHash;
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(copy))).digest('hex');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

function createSffBuildSpecification(input = {}) {
  require('./sff_png8_optimization').normalizePng8Optimization(input.options?.shared?.png8Optimization);
  const sprites = (input.sprites || []).map(normalizeSprite);
  const palettes = (input.palettes || []).map(normalizePalette);
  assertUniqueEntryIds(sprites, 'sprites');
  assertUniqueEntryIds(palettes, 'palettes');
  assertLinks(sprites, 'Sprite');
  assertLinks(palettes, 'Palette');

  const decisions = (input.decisions || []).map((decision, index) => ({
    decisionId: requireText(decision?.decisionId, `decisions[${index}].decisionId`),
    kind: requireText(decision?.kind, `decisions[${index}].kind`),
    choice: requireText(decision?.choice, `decisions[${index}].choice`)
  }));
  assertUniqueEntryIds(decisions.map((decision) => ({ entryId: decision.decisionId })), 'decisions');

  const specification = {
    schema: 'ikemaker.sff-build-specification',
    version: SFF_BUILD_SPECIFICATION_VERSION,
    planId: requireText(input.planId, 'planId'),
    sourceRoot: portablePath(input.sourceRoot, 'sourceRoot'),
    target: {
      archiveIdentity: portablePath(input.target?.archiveIdentity, 'target.archiveIdentity'),
      archiveFingerprint: optionalText(input.target?.archiveFingerprint),
      sffVersion: requireText(input.target?.sffVersion || '2.1', 'target.sffVersion')
    },
    sprites,
    palettes,
    requirements: [...new Set((input.requirements || []).map((item) => requireText(item, 'requirement')))],
    decisions,
    options: {
      shared: normalizeJson(input.options?.shared || {}, 'options.shared'),
      backends: normalizeJson(input.options?.backends || {}, 'options.backends')
    }
  };
  assertProfile(specification);
  specification.specificationHash = specificationHash(specification);
  return deepFreeze(specification);
}

module.exports = {
  SFF_BUILD_SPECIFICATION_VERSION,
  canonicalize,
  createSffBuildSpecification,
  specificationHash
};
