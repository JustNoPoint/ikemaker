'use strict';

const crypto = require('crypto');
const { paletteRgba } = require('./sff_reader');

const SCHEMA = 'ikemaker.sff-transfer-conflict-analysis';
const VERSION = 1;
const EFFECTS = Object.freeze({ filesystem: false, persistence: false, sourceMutation: false, destinationMutation: false, autosave: false });

function sha(value) { return crypto.createHash('sha256').update(value).digest('hex').toUpperCase(); }
function deepFreeze(value, seen = new Set()) { if (!value || typeof value !== 'object' || seen.has(value)) return value; seen.add(value); for (const item of Object.values(value)) deepFreeze(item, seen); return Object.freeze(value); }
function identity(sprite) { return `${Number(sprite.group)},${Number(sprite.number ?? sprite.index)}`; }
function paletteFingerprint(archive, index) {
  try { const colors = paletteRgba(archive, Number(index)); return Array.isArray(colors) ? sha(Buffer.from(colors.flatMap(color => color.map(value => Number(value) & 255)))) : null; }
  catch (_) { return null; }
}
function destinationPaletteMatches(destination) {
  const matches = new Map();
  for (const palette of destination.palettes || []) { const fingerprint = paletteFingerprint(destination, palette.index); if (!fingerprint) continue; if (!matches.has(fingerprint)) matches.set(fingerprint, []); matches.get(fingerprint).push(Object.freeze({ physicalIndex: palette.index, identity: `${palette.group},${palette.number}`, fingerprint })); }
  return matches;
}
function linkProjection(source, sprite, selected) {
  if (Number(sprite.dataSize) !== 0) return { status: 'direct', sourcePhysicalIndex: sprite.index, targetPhysicalIndex: null, targetIdentity: null, decisionRequired: false, choices: [] };
  const target = source.sprites?.[Number(sprite.link)];
  if (!target) return { status: 'broken', sourcePhysicalIndex: sprite.index, targetPhysicalIndex: Number(sprite.link), targetIdentity: null, decisionRequired: true, choices: ['skip'] };
  const included = selected.has(target.index);
  return { status: included ? 'target-selected' : 'target-not-selected', sourcePhysicalIndex: sprite.index, targetPhysicalIndex: target.index, targetIdentity: identity(target), decisionRequired: !included, choices: included ? ['preserve-link', 'flatten-copy'] : ['flatten-copy', 'skip'] };
}
function paletteProjection(source, destinationMatches, sprite) {
  if (![5, 8].includes(Number(sprite.colorDepth)) && Number(sprite.format) !== 10) return { status: 'truecolor', sourcePaletteIndex: null, sourcePaletteIdentity: null, sourcePaletteFingerprint: null, compatibleDestinations: [], decisionRequired: false, choices: [] };
  const palette = source.palettes?.[Number(sprite.paletteIndex)], fingerprint = paletteFingerprint(source, sprite.paletteIndex), compatible = fingerprint ? destinationMatches.get(fingerprint) || [] : [];
  if (!palette || !fingerprint) return { status: 'missing-or-invalid', sourcePaletteIndex: Number(sprite.paletteIndex), sourcePaletteIdentity: palette ? `${palette.group},${palette.number}` : null, sourcePaletteFingerprint: fingerprint, compatibleDestinations: [], decisionRequired: true, choices: ['convert-truecolor', 'skip'] };
  return { status: compatible.length ? 'compatible' : 'unmatched', sourcePaletteIndex: palette.index, sourcePaletteIdentity: `${palette.group},${palette.number}`, sourcePaletteFingerprint: fingerprint, compatibleDestinations: compatible, decisionRequired: !compatible.length, choices: compatible.length ? ['reuse-compatible', 'import-source-palette', 'convert-truecolor'] : ['map-existing-palette', 'import-source-palette', 'convert-truecolor', 'skip'] };
}
function analyzeSffTransferConflicts({ seed, sourceArchive, destinationArchive }) {
  if (seed?.schema !== 'ikemaker.sff-transfer-assembly-seed' || seed?.version !== 1) throw new Error('A validated SFF Transfer Assembly seed is required.');
  if (!Array.isArray(sourceArchive?.sprites) || !Array.isArray(destinationArchive?.sprites)) throw new TypeError('Both exact SFF archives are required.');
  const selected = new Set(seed.sourceSelection.physicalIndices), destinationMatches = destinationPaletteMatches(destinationArchive), destinationIdentities = new Map();
  for (const sprite of destinationArchive.sprites) { const key = identity(sprite); if (!destinationIdentities.has(key)) destinationIdentities.set(key, []); destinationIdentities.get(key).push(sprite.index); }
  const items = seed.sourceSelection.items.map(reference => {
    const sprite = sourceArchive.sprites[reference.physicalIndex]; if (!sprite || identity(sprite) !== reference.identity) throw new Error('The validated Transfer selection is no longer present in the Source archive.');
    const occupied = destinationIdentities.get(reference.identity) || [], collision = { status: occupied.length ? 'occupied' : 'clear', destinationPhysicalIndices: occupied, decisionRequired: occupied.length > 0, choices: occupied.length ? ['add-next-free', 'replace-existing', 'skip', 'manual-identity'] : ['preserve-identity', 'manual-identity'] };
    const link = linkProjection(sourceArchive, sprite, selected), palette = paletteProjection(sourceArchive, destinationMatches, sprite);
    return { id: reference.id, physicalIndex: reference.physicalIndex, identity: reference.identity, collision, link, palette, unresolved: [...(collision.decisionRequired ? ['identity'] : []), ...(link.decisionRequired ? ['link'] : []), ...(palette.decisionRequired ? ['palette'] : [])] };
  });
  const unresolved = { placement: seed.placementRequired, identity: items.filter(item => item.collision.decisionRequired).length, links: items.filter(item => item.link.decisionRequired).length, palettes: items.filter(item => item.palette.decisionRequired).length };
  return deepFreeze({ schema: SCHEMA, version: VERSION, requestIdentity: seed.authority.requestIdentity, referenceIdentity: seed.reference.identity, placement: seed.destinationBoundary, placementRequired: seed.placementRequired, items, unresolved, readyForApply: !unresolved.placement && !unresolved.identity && !unresolved.links && !unresolved.palettes, effects: EFFECTS });
}

module.exports = { SCHEMA, VERSION, EFFECTS, identity, paletteFingerprint, analyzeSffTransferConflicts };
