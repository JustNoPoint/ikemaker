'use strict';

const crypto = require('crypto');
const { frozenInspection } = require('./air_collision_transform_preview_adapter');
const { literalAttribute } = require('./collision_contact_reference_authority');

const MAX_INPUT_BYTES = 32 * 1024;
const MAX_OUTPUT_BYTES = 64 * 1024;
const GROUPS = Object.freeze(['Clsn1', 'Clsn2']);
const CONTACT_GROUPS = Object.freeze(['Clsn1', 'Clsn2', 'Size']);
const CONTACT_KINDS = Object.freeze(['HitDef', 'ModifyHitDef', 'Projectile', 'ModifyProjectile', 'ReversalDef', 'ModifyReversalDef']);
const ALLOWED_STATUS = new Set(['supported', 'changed', 'fallback', 'deprecated']);

function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex').toUpperCase(); }
function fail(message) { throw new Error(`AIR collision property draft: ${message}`); }
function boundedText(value, label, options = {}) { const text = String(value ?? '').trim(), maximum = options.maximum || 128; if (!text && options.required !== false) fail(`${label} is required.`); if (text.length > maximum) fail(`${label} exceeds ${maximum} characters.`); if (/[{};#\r\n]/.test(text)) fail(`${label} cannot contain braces, comment tokens, semicolons, or new lines.`); return text; }
function boundedAttribute(value, label) { const text = boundedText(value, label); if (!literalAttribute(text)) fail(`${label} must use a conventional literal attribute list for this reviewed preview.`); return text; }
function boundedInteger(value, label, minimum, maximum) { const number = Number(value); if (!Number.isSafeInteger(number) || number < minimum || number > maximum) fail(`${label} must be a whole number from ${minimum} through ${maximum}.`); return number; }
function booleanFlag(value, label) { if (value === true || value === 1 || value === '1') return true; if (value === false || value === 0 || value === '0') return false; fail(`${label} must be true, false, 1, or 0.`); }
function literal(value, allowed, label) { const text = String(value || ''); if (!allowed.includes(text)) fail(`${label} must be one of: ${allowed.join(', ')}.`); return text; }
function exactDecision(decision, capabilityId, fingerprint) { const item = decision && typeof decision === 'object' ? decision : {}, id = String(item.capability?.id || item.capabilityId || ''), bound = String(item.capabilityFingerprint || ''); return id === capabilityId && /^[A-F0-9]{64}$/.test(bound) && bound === fingerprint ? { known: item.enabled === true && ALLOWED_STATUS.has(String(item.status || '').toLowerCase()) || item.enabled === false && ['unsupported', 'removed'].includes(String(item.status || '').toLowerCase()), enabled: item.enabled === true && ALLOWED_STATUS.has(String(item.status || '').toLowerCase()), status: String(item.status || 'unknown') } : { known: false, enabled: false, status: 'unknown' }; }
function canonical(value) { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])); return value; }
function sameValue(left, right) { return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right)); }
function exactSelection(input, fingerprint) {
  const inspection = input.inspection;
  if (!inspection || inspection.schema !== 'ikemaker.air-collision-inspection' || inspection.version !== 1 || !frozenInspection(inspection) || !/^[A-F0-9]{64}$/.test(String(inspection.inspectionHash || '')) || !/^[A-F0-9]{64}$/.test(String(inspection.sourceFingerprint || '')) || !/^[A-F0-9]{64}$/.test(String(inspection.capabilityFingerprint || ''))) return { available: false, reason: 'The current deeply frozen canonical C8 inspection is unavailable.' };
  if (!/^[A-F0-9]{64}$/.test(fingerprint) || inspection.capabilityFingerprint !== fingerprint) return { available: false, reason: 'The collision inspection and exact capability fingerprint do not match.' };
  const group = literal(input.group, GROUPS, 'Selected collision group'), key = group.toLowerCase(), index = boundedInteger(input.index, 'Selected collision index', 0, 65535), projection = inspection.groups?.[key]?.projection, candidate = projection?.candidates?.find(item => item.authoritative === true);
  if (!inspection.available || !candidate || !['verified', 'parsed'].includes(String(projection.status || '')) || !projection.profile || projection.profile === 'target-unresolved') return { available: false, reason: 'The selected collision projection is not authoritative for the exact target.', group, index };
  if (!Array.isArray(candidate.slots) || candidate.slots.length > 65536) return { available: false, reason: 'The authoritative collision slot inventory exceeds the bounded draft limit.', group, index };
  const slot = candidate.slots?.find(item => Number(item.slot) === index && item.filled === true);
  if (!slot) return { available: false, reason: `The authoritative ${group} projection has no filled slot ${index}.`, group, index };
  return { available: true, reason: '', group, index, allocation: projection.profile, sourceLine: slot.sourceLine, authoredLabel: slot.authoredLabel, provenance: { ...(inspection.groups[key].provenance || {}) }, inspectionHash: inspection.inspectionHash };
}
function targetProfile(input, fingerprint) {
  const target = input.inspection?.target?.value, supplied = input.target, targetExact = target && typeof target === 'object' && (!supplied || sameValue(supplied, target)), channel = String(target?.channel || '').toLowerCase(), version = String(target?.version || '').toLowerCase(), stable = targetExact && channel === 'stable' && /^1\.0(?:\.0)?$/.test(version);
  const indexed = exactDecision(input.indexedDecision, 'collision.indexed-controls', fingerprint), dummy = exactDecision(input.dummyDecision, 'collision.dummy-group', fingerprint);
  const known = targetExact && (stable || indexed.known);
  const indexedEnabled = targetExact && !stable && indexed.enabled, dummyEnabled = targetExact && !stable && dummy.enabled;
  return { known, stable, indexed: indexedEnabled, dummy: dummyEnabled, status: !known ? 'unresolved' : stable ? 'stable-1.0' : indexedEnabled ? 'nightly-indexed' : 'known-base' };
}
function preview(code, notes = []) { return { available: Boolean(code), label: 'Unbound draft — no owning StateDef/source selected', code, notes }; }
function eligibilityDraft(kind, draft, selection, profile) {
  const controller = literal(kind, ['HitBy', 'NotHitBy'], 'Eligibility recipe'), available = selection.available && profile.indexed && selection.allocation === 'indexed-label';
  if (!available) return { family: 'eligibility', kind: controller, available: false, reason: selection.available ? 'Per-index eligibility requires exact indexed-controls and indexed-label allocation authority.' : selection.reason, fields: {}, preview: preview('') };
  const attr = boundedAttribute(draft.attr || (controller === 'HitBy' ? 'SCA, AA, AP, AT' : 'SCA, AA, AP'), 'Hit attributes'), time = boundedInteger(draft.time ?? 1, 'Duration', -2147483648, 2147483647), fields = [`attr: ${attr}`, `time: ${time}`, `clsn.group: ${selection.group}`, `clsn.index: ${selection.index}`];
  const advanced = {};
  if (draft.playerno !== undefined && String(draft.playerno).trim()) { advanced.playerno = boundedText(draft.playerno, 'PlayerNo expression'); fields.push(`playerno: ${advanced.playerno}`); }
  if (draft.playerid !== undefined && String(draft.playerid).trim()) { advanced.playerid = boundedText(draft.playerid, 'PlayerID expression'); fields.push(`playerid: ${advanced.playerid}`); }
  if (draft.slot !== undefined && String(draft.slot) !== '') { advanced.slot = boundedInteger(draft.slot, 'Eligibility slot', 0, 7); fields.push(`slot: ${advanced.slot}`); }
  if (draft.stack !== undefined) { advanced.stack = booleanFlag(draft.stack, 'Stack'); fields.push(`stack: ${advanced.stack ? 1 : 0}`); }
  return { family: 'eligibility', kind: controller, available: true, reason: '', groupWide: false, selectedIndexUsed: true, fields: { attr, time, ...advanced, group: selection.group, index: selection.index }, preview: preview(`${controller[0].toLowerCase()}${controller.slice(1)}{${fields.join('; ')}}`, ['ReversalDef uses the owner’s whole Clsn1 group and bypasses this per-index filter.']) };
}
function contactDraft(kind, draft, selection, profile) {
  const controller = literal(kind, CONTACT_KINDS, 'Contact recipe');
  if (!selection.available || !profile.known) return { family: 'contact', kind: controller, available: false, reason: selection.available ? 'The exact engine target is unresolved.' : selection.reason, fields: {}, preview: preview('') };
  const allowed = [...CONTACT_GROUPS, ...(profile.indexed ? ['All'] : []), ...(profile.dummy ? ['Dummy'] : [])], check = literal(draft.p2clsncheck || (controller.includes('Reversal') ? 'Clsn1' : 'Clsn2'), allowed, 'p2clsncheck'), requireValue = literal(draft.p2clsnrequire || 'None', ['None', ...allowed], 'p2clsnrequire');
  const modify = controller.startsWith('Modify'), reversal = controller.includes('Reversal'), fields = [];
  let attr = '';
  if (!modify) { attr = boundedAttribute(reversal ? (draft.reversalAttr || 'SCA, AA, AP') : (draft.attr || (controller === 'Projectile' ? 'S, AP' : 'S, NA')), reversal ? 'Reversal attributes' : 'Contact attributes'); fields.push(`${reversal ? 'reversal.attr' : 'attr'}: ${attr}`); }
  fields.push(`p2clsncheck: ${check}`); if (requireValue !== 'None') fields.push(`p2clsnrequire: ${requireValue}`);
  const rendered = controller[0].toLowerCase() + controller.slice(1);
  return { family: 'contact', kind: controller, available: true, reason: '', groupWide: true, selectedIndexUsed: false, fields: { ...(attr ? { [reversal ? 'reversalAttr' : 'attr']: attr } : {}), p2clsncheck: check, p2clsnrequire: requireValue }, preview: preview(`${rendered}{${fields.join('; ')}}`, [controller.includes('Reversal') ? 'ReversalDef uses the owner’s whole Clsn1 group; the selected index is not an owner-box selector.' : 'Contact fields select opposing collision families; they do not assign the selected owner box.']) };
}
function queryDraft(kind, draft, selection, profile) {
  const query = literal(kind, ['ClsnOverlap', 'ProjClsnOverlap'], 'Collision query');
  if (!selection.available || !profile.known) return { family: 'queries', kind: query, available: false, reason: selection.available ? 'The exact engine target is unresolved.' : selection.reason, fields: {}, preview: preview('') };
  const target = literal(draft.target || 'Clsn2', CONTACT_GROUPS, 'Target collision group'), player = boundedText(draft.player || 'p2, ID', 'Target player expression', { maximum: 192 });
  if (query === 'ClsnOverlap') {
    const requestedOwner = String(draft.ownerGroup || selection.group);
    if (requestedOwner === 'Dummy' && !profile.dummy) return { family: 'queries', kind: query, available: false, reason: 'Dummy owner requires the exact same-fingerprint supporting Nightly capability; it is unavailable for this target.', groupWide: true, selectedIndexUsed: false, fields: { owner: requestedOwner, target, player }, preview: preview('') };
    const owner = literal(requestedOwner, [...CONTACT_GROUPS, ...(profile.dummy ? ['Dummy'] : [])], 'ClsnOverlap owner group');
    return { family: 'queries', kind: query, available: true, reason: '', groupWide: true, selectedIndexUsed: false, fields: { owner, target, player }, preview: preview(`clsnOverlap(${owner}, ${player}, ${target})`, ['The owner is a whole runtime collision family; the selected AIR index is browsing context only and is not an argument in ClsnOverlap.', owner === 'Dummy' ? 'Dummy is a capability-gated runtime logic group, not authored AIR geometry.' : 'This draft does not assign ownership to the selected AIR box.', 'This draft does not predict a live overlap result.']) };
  }
  const projectileListIndex = boundedInteger(draft.projectileListIndex ?? 0, 'Projectile list index', 0, 65535);
  return { family: 'queries', kind: query, available: true, reason: '', groupWide: true, selectedIndexUsed: false, fields: { projectileListIndex, target, player }, preview: preview(`projClsnOverlap(${projectileListIndex}, ${player}, ${target})`, ['Projectile list index is independent of the selected AIR collision index.', 'This draft does not predict a live overlap result.']) };
}
function createAirCollisionPropertyDraft(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('input must be an object.');
  let draftText; try { draftText = JSON.stringify(input.draft || {}); } catch { fail('draft fields must be serializable.'); }
  if (Buffer.byteLength(draftText, 'utf8') > MAX_INPUT_BYTES) fail(`draft fields exceed ${MAX_INPUT_BYTES} bytes.`);
  const fingerprint = String(input.capabilityFingerprint || ''), selection = exactSelection(input, fingerprint), profile = targetProfile(input, fingerprint), draft = input.draft && typeof input.draft === 'object' && !Array.isArray(input.draft) ? input.draft : {}, family = literal(draft.family || 'eligibility', ['eligibility', 'contact', 'queries'], 'Recipe family');
  const recipe = family === 'eligibility' ? eligibilityDraft(draft.kind || 'HitBy', draft, selection, profile) : family === 'contact' ? contactDraft(draft.kind || 'HitDef', draft, selection, profile) : queryDraft(draft.kind || 'ClsnOverlap', draft, selection, profile);
  const semantic = { schema: 'ikemaker.air-collision-property-draft', version: 1, status: recipe.available ? 'ready' : 'unresolved', selection, target: profile, familyAvailability: { eligibility: selection.available && profile.indexed && selection.allocation === 'indexed-label', contact: selection.available && profile.known, queries: selection.available && profile.known }, recipe };
  const output = { ...semantic, draftHash: digest(semantic) };
  if (Buffer.byteLength(JSON.stringify(output), 'utf8') > MAX_OUTPUT_BYTES) fail(`projection exceeds ${MAX_OUTPUT_BYTES} bytes.`);
  return deepFreeze(output);
}

module.exports = { CONTACT_GROUPS, CONTACT_KINDS, GROUPS, MAX_INPUT_BYTES, MAX_OUTPUT_BYTES, createAirCollisionPropertyDraft, deepFreeze };
