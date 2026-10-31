'use strict';

const SCHEMA = 'ikemaker.sff-transfer-resolution-plan';
const VERSION = 1;
const EFFECTS = Object.freeze({ filesystem: false, persistence: false, sourceMutation: false, destinationMutation: false, autosave: false });

function plain(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(`${label} must be a plain object.`); return value; }
function safeInteger(value, label) { if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative safe integer.`); return value; }
function deepFreeze(value, seen = new Set()) { if (!value || typeof value !== 'object' || seen.has(value)) return value; seen.add(value); for (const item of Object.values(value)) deepFreeze(item, seen); return Object.freeze(value); }
function parseIdentity(value) { const match = /^(-?\d+),(-?\d+)$/.exec(String(value || '')); return match ? { group: Number(match[1]), number: Number(match[2]) } : null; }
function key(group, number) { return `${group},${number}`; }
function nextFree(group, used, start = 0) { let number = Math.max(0, Number(start) || 0); while (used.has(key(group, number))) number++; return number; }
function decisionMap(value) {
  if (value === undefined || value === null) return new Map();
  if (!Array.isArray(value) || value.length > 512) throw new TypeError('Transfer item decisions must be a bounded array.');
  const result = new Map(); for (const item of value) { plain(item, 'Transfer item decision'); if (typeof item.id !== 'string' || !item.id || result.has(item.id)) throw new Error('Transfer item decisions require unique exact item identities.'); result.set(item.id, item); } return result;
}
function resolvePlacement(analysis, requested, destinationArchive) {
  if (!analysis.placementRequired) return analysis.placement;
  if (!requested) return null;
  plain(requested, 'Transfer placement decision');
  if (requested.kind === 'append-end') return { kind: 'append-end', insertionPhysicalIndex: destinationArchive.sprites.length };
  if (requested.kind !== 'between-sprites') throw new Error('Transfer placement must be append-end or an exact between-sprites boundary.');
  const physicalIndex = safeInteger(requested.targetPhysicalIndex, 'Transfer placement physical index'), row = destinationArchive.sprites[physicalIndex], position = safeInteger(requested.position, 'Transfer placement position');
  if (!row || requested.targetIdentity !== key(row.group, row.number) || ![physicalIndex, physicalIndex + 1].includes(position)) throw new Error('The chosen Transfer placement boundary is stale or mismatched.');
  return { kind: 'between-sprites', targetPhysicalIndex: physicalIndex, targetIdentity: requested.targetIdentity, position, placement: position === physicalIndex ? 'before' : 'after', insertionPhysicalIndex: position };
}
function planSffTransferResolution({ analysis, decisions = {}, destinationArchive }) {
  if (analysis?.schema !== 'ikemaker.sff-transfer-conflict-analysis' || analysis?.version !== 1) throw new Error('A current SFF Transfer conflict analysis is required.');
  if (!Array.isArray(destinationArchive?.sprites) || !Array.isArray(destinationArchive?.palettes)) throw new TypeError('The exact Destination SFF archive is required.');
  plain(decisions, 'Transfer decisions'); const byId = decisionMap(decisions.items), placement = resolvePlacement(analysis, decisions.placement, destinationArchive), used = new Set(destinationArchive.sprites.map(sprite => key(sprite.group, sprite.number))), destinationPalettes = new Set(destinationArchive.palettes.map(palette => palette.index)), items = [], unresolved = [];
  for (const conflict of analysis.items) {
    const choice = byId.get(conflict.id) || {}, identityChoice = choice.identity || null;
    let identityAction = conflict.collision.decisionRequired ? identityChoice?.action : (identityChoice?.action || 'preserve-identity'), destinationIdentity = conflict.identity, destinationPhysicalIndex = null;
    if (!identityAction) unresolved.push({ id: conflict.id, gate: 'identity', choices: conflict.collision.choices });
    else if (identityAction === 'skip') { items.push({ id: conflict.id, sourcePhysicalIndex: conflict.physicalIndex, action: 'skip', reason: 'identity-decision' }); continue; }
    else if (identityAction === 'add-next-free') { const parsed = parseIdentity(conflict.identity), group = Number.isSafeInteger(identityChoice.group) ? identityChoice.group : parsed.group, number = nextFree(group, used, Number(identityChoice.startIndex || 0)); destinationIdentity = key(group, number); used.add(destinationIdentity); }
    else if (identityAction === 'replace-existing') { const candidates = conflict.collision.destinationPhysicalIndices; if (!candidates.length) throw new Error(`${conflict.id} has no Destination sprite to replace.`); destinationPhysicalIndex = candidates.length === 1 ? candidates[0] : identityChoice.destinationPhysicalIndex; if (!candidates.includes(destinationPhysicalIndex)) throw new Error(`${conflict.id} requires an exact Destination physical occurrence for replacement.`); }
    else if (identityAction === 'manual-identity') { const group = safeInteger(identityChoice.group, `${conflict.id} manual group`), number = safeInteger(identityChoice.number, `${conflict.id} manual index`); destinationIdentity = key(group, number); if (used.has(destinationIdentity)) throw new Error(`${conflict.id} manual identity ${destinationIdentity} is already occupied.`); used.add(destinationIdentity); }
    else if (identityAction === 'preserve-identity') { if (conflict.collision.decisionRequired) throw new Error(`${conflict.id} cannot preserve an occupied identity without an explicit conflict action.`); used.add(destinationIdentity); }
    else if (identityAction) throw new Error(`${conflict.id} uses an unsupported identity decision.`);

    let linkAction = choice.link?.action || (conflict.link.status === 'direct' ? 'direct-copy' : conflict.link.status === 'target-selected' ? 'preserve-link' : null);
    if (!linkAction) unresolved.push({ id: conflict.id, gate: 'link', choices: conflict.link.choices }); else if (!['direct-copy', 'preserve-link', 'flatten-copy', 'skip'].includes(linkAction)) throw new Error(`${conflict.id} uses an unsupported linked-sprite decision.`);
    if (linkAction === 'skip') { items.push({ id: conflict.id, sourcePhysicalIndex: conflict.physicalIndex, action: 'skip', reason: 'link-decision' }); continue; }

    let paletteAction = choice.palette?.action || (conflict.palette.status === 'truecolor' ? 'not-applicable' : conflict.palette.status === 'compatible' ? 'reuse-compatible' : null), destinationPaletteIndex = null;
    if (!paletteAction) unresolved.push({ id: conflict.id, gate: 'palette', choices: conflict.palette.choices });
    else if (paletteAction === 'reuse-compatible') { const compatible = conflict.palette.compatibleDestinations; if (!compatible.length) throw new Error(`${conflict.id} has no compatible Destination palette.`); destinationPaletteIndex = choice.palette?.destinationPaletteIndex ?? compatible[0].physicalIndex; if (!compatible.some(item => item.physicalIndex === destinationPaletteIndex)) throw new Error(`${conflict.id} selected a palette that is not content-compatible.`); }
    else if (paletteAction === 'map-existing-palette') { destinationPaletteIndex = safeInteger(choice.palette?.destinationPaletteIndex, `${conflict.id} Destination palette index`); if (!destinationPalettes.has(destinationPaletteIndex)) throw new Error(`${conflict.id} selected a missing Destination palette.`); }
    else if (paletteAction === 'import-source-palette') { const group = safeInteger(choice.palette?.destinationPaletteGroup, `${conflict.id} imported palette group`), number = safeInteger(choice.palette?.destinationPaletteIndex, `${conflict.id} imported palette index`); destinationPaletteIndex = { group, number }; if ([...destinationArchive.palettes].some(palette => palette.group === group && palette.number === number)) throw new Error(`${conflict.id} imported palette identity ${group},${number} is already occupied.`); }
    else if (!['not-applicable', 'convert-truecolor', 'skip'].includes(paletteAction)) throw new Error(`${conflict.id} uses an unsupported palette decision.`);
    if (paletteAction === 'skip') { items.push({ id: conflict.id, sourcePhysicalIndex: conflict.physicalIndex, action: 'skip', reason: 'palette-decision' }); continue; }
    const axisAction = choice.axis?.action || 'source-axis'; if (!['source-axis', 'preserve-destination'].includes(axisAction) || (axisAction === 'preserve-destination' && identityAction !== 'replace-existing')) throw new Error(`${conflict.id} uses an unsupported axis decision.`);
    items.push({ id: conflict.id, sourcePhysicalIndex: conflict.physicalIndex, action: 'copy', destinationIdentity, destinationPhysicalIndex, identityAction, axisAction, linkAction, linkTargetPhysicalIndex: conflict.link.targetPhysicalIndex, paletteAction, sourcePaletteIndex: conflict.palette.sourcePaletteIndex, destinationPaletteIndex });
  }
  if (!placement) unresolved.unshift({ id: null, gate: 'placement', choices: ['append-end', 'between-sprites'] });
  for (const id of byId.keys()) if (!analysis.items.some(item => item.id === id)) throw new Error(`Transfer decisions contain stale item ${id}.`);
  return deepFreeze({ schema: SCHEMA, version: VERSION, requestIdentity: analysis.requestIdentity, referenceIdentity: analysis.referenceIdentity, placement, items, unresolved, readyForApply: unresolved.length === 0, requiresExplicitApplyApproval: true, effects: EFFECTS });
}

module.exports = { SCHEMA, VERSION, EFFECTS, nextFree, planSffTransferResolution };
