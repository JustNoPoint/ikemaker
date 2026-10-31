'use strict';

const crypto = require('crypto');
const { createRuntimeCollisionTransformPreview, MAX_BOXES } = require('./air_runtime_collision_transform_model');

const GROUP_KEYS = Object.freeze(['clsn1', 'clsn2']);
const PIVOT_PRESETS = Object.freeze(['axis', 'center', 'top-left', 'top-right', 'bottom-right', 'bottom-left', 'custom']);
const EPSILON = 1e-12;

function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex').toUpperCase(); }
function clean(value) { if (Object.is(value, -0) || Math.abs(value) < EPSILON) return 0; const rounded = Math.round(value); return Math.abs(value - rounded) < EPSILON ? rounded : value; }
function finite(value, label) { const number = Number(value); if (!Number.isFinite(number)) throw new Error(`AIR collision transform adapter: ${label} must be finite.`); return clean(number); }
function pair(value, label) { if (!Array.isArray(value) || value.length !== 2) throw new Error(`AIR collision transform adapter: ${label} must contain X and Y.`); return value.map((item, index) => finite(item, `${label} ${index ? 'Y' : 'X'}`)); }
function unavailable(reason, input = {}) { const semantic = { schema: 'ikemaker.air-collision-transform-adapter', version: 1, status: 'unavailable', reason, sourceFingerprint: String(input.inspection?.sourceFingerprint || ''), capabilityFingerprint: String(input.inspection?.capabilityFingerprint || ''), preview: null }; return freeze({ ...semantic, adapterHash: hash(semantic) }); }
function frozenInspection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.isFrozen(value)) return false;
  if (!value.target || typeof value.target !== 'object' || Array.isArray(value.target) || !Object.isFrozen(value.target)) return false;
  if (value.target.value !== null && value.target.value !== undefined && (typeof value.target.value !== 'object' || Array.isArray(value.target.value) || !Object.isFrozen(value.target.value))) return false;
  if (!value.target.allocation || typeof value.target.allocation !== 'object' || Array.isArray(value.target.allocation) || !Object.isFrozen(value.target.allocation)) return false;
  if (!value.selection || typeof value.selection !== 'object' || Array.isArray(value.selection) || !Object.isFrozen(value.selection)) return false;
  if (!value.groups || typeof value.groups !== 'object' || Array.isArray(value.groups) || !Object.isFrozen(value.groups)) return false;
  for (const key of GROUP_KEYS) {
    const group = value.groups[key]; if (!group || typeof group !== 'object' || Array.isArray(group) || !Object.isFrozen(group)) return false;
    if (!group.projection || typeof group.projection !== 'object' || Array.isArray(group.projection) || !Object.isFrozen(group.projection)) return false;
    if (!Array.isArray(group.projection.candidates) || !Object.isFrozen(group.projection.candidates)) return false;
    if (group.provenance !== null && group.provenance !== undefined && (typeof group.provenance !== 'object' || Array.isArray(group.provenance) || !Object.isFrozen(group.provenance))) return false;
    for (const candidate of group.projection.candidates) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || !Object.isFrozen(candidate) || !Array.isArray(candidate.slots) || !Object.isFrozen(candidate.slots)) return false;
      for (const slot of candidate.slots) if (!slot || typeof slot !== 'object' || Array.isArray(slot) || !Object.isFrozen(slot) || !Array.isArray(slot.normalizedRect) || !Object.isFrozen(slot.normalizedRect)) return false;
    }
  }
  return true;
}
function exactCandidate(group) { return (group?.projection?.candidates || []).find(candidate => candidate.profile === 'indexed-label' && candidate.authoritative === true) || null; }
function scaledRect(rect, collisionScale) { const scale = collisionScale || [1, 1], values = [rect[0] * scale[0], rect[1] * scale[1], rect[2] * scale[0], rect[3] * scale[1]]; return [Math.min(values[0], values[2]), Math.min(values[1], values[3]), Math.max(values[0], values[2]), Math.max(values[1], values[3])].map(clean); }
function pivotFor(preset, custom, rect) {
  if (!PIVOT_PRESETS.includes(preset)) throw new Error(`AIR collision transform adapter: pivot preset must be ${PIVOT_PRESETS.join(', ')}.`);
  if (preset === 'custom') return pair(custom, 'custom pivot');
  if (preset === 'axis') return [0, 0];
  const [x1, y1, x2, y2] = rect;
  if (preset === 'center') return [clean((x1 + x2) / 2), clean((y1 + y2) / 2)];
  if (preset === 'top-left') return [x1, y1];
  if (preset === 'top-right') return [x2, y1];
  if (preset === 'bottom-right') return [x2, y2];
  return [x1, y2];
}
function canvasPointToCollisionSpace(point, viewport) {
  const [x, y] = pair(point, 'canvas point'), origin = pair(viewport?.origin, 'canvas origin'), zoom = finite(viewport?.zoom, 'canvas zoom');
  if (zoom <= 0) throw new Error('AIR collision transform adapter: canvas zoom must be greater than zero.');
  return freeze([clean((x - origin[0]) / zoom), clean((y - origin[1]) / zoom)]);
}

function createAirCollisionTransformPreview(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('AIR collision transform adapter: input must be an object.');
  const inspection = input.inspection;
  if (inspection?.schema !== 'ikemaker.air-collision-inspection' || inspection.version !== 1 || !/^[A-F0-9]{64}$/.test(String(inspection.inspectionHash || '')) || !frozenInspection(inspection)) return unavailable('A current deeply frozen canonical C8 collision inspection is required.', input);
  const capability = input.capability || {}, fingerprint = String(capability.capabilityFingerprint || capability.fingerprint || '');
  if (capability.allowIndexed !== true || !/^[A-F0-9]{64}$/.test(fingerprint) || !/^[A-F0-9]{64}$/.test(String(inspection.capabilityFingerprint || '')) || fingerprint !== inspection.capabilityFingerprint) return unavailable('Transform preview requires an exact target with verified indexed collision controls.', input);
  if (inspection.target?.allocation?.id !== 'indexed-label' || inspection.target?.allocation?.authoritative !== true) return unavailable('Transform preview requires one authoritative indexed-label AIR projection; Stable and unresolved targets remain inspect-only.', input);
  const groupKey = String(input.groupKey || '').toLowerCase(), index = Number(input.index);
  if (!GROUP_KEYS.includes(groupKey) || !Number.isSafeInteger(index) || index < 0) return unavailable('Choose one exact Clsn1 or Clsn2 parsed slot.', input);
  const boxes = [], candidates = {};
  for (const key of GROUP_KEYS) {
    const candidate = exactCandidate(inspection.groups?.[key]);
    if (!candidate) continue;
    candidates[key] = candidate;
    for (const slot of candidate.slots) {
      if (!Number.isSafeInteger(slot.slot) || slot.slot < 0 || !Array.isArray(slot.normalizedRect) || slot.normalizedRect.length !== 4) return unavailable(`The ${key} indexed projection is malformed.`, input);
      boxes.push({ group: key === 'clsn1' ? 'Clsn1' : 'Clsn2', index: slot.slot, rect: slot.normalizedRect });
    }
  }
  if (boxes.length > MAX_BOXES) return unavailable(`Transform preview exceeds the bounded ${MAX_BOXES}-box limit.`, input);
  const selectedCandidate = candidates[groupKey], selectedSlot = selectedCandidate?.slots?.find(slot => slot.slot === index);
  if (!selectedSlot) return unavailable(`The selected ${groupKey === 'clsn1' ? 'Clsn1' : 'Clsn2'} slot is not allocated in the authoritative projection.`, input);
  const collisionScale = input.collisionScale === undefined || input.collisionScale === null ? null : pair(input.collisionScale, 'character collision scale'), preset = String(input.pivotPreset || 'axis'), selectedRect = scaledRect(selectedSlot.normalizedRect, collisionScale), pivot = pivotFor(preset, input.customPivot || [0, 0], selectedRect), scale = pair(input.scale || [1, 1], 'TransformClsn scale'), angle = finite(input.angle ?? 0, 'TransformClsn angle');
  const preview = createRuntimeCollisionTransformPreview({ boxes, ...(collisionScale ? { collisionScale } : {}), selection: { group: groupKey === 'clsn1' ? 'Clsn1' : 'Clsn2', index }, transform: { target: { scope: 'selected' }, scale, angle, pivot } });
  const semantic = {
    schema: 'ikemaker.air-collision-transform-adapter', version: 1, status: 'ready', sourceFingerprint: inspection.sourceFingerprint, capabilityFingerprint: inspection.capabilityFingerprint,
    inspectionHash: inspection.inspectionHash, selection: { groupKey, group: groupKey === 'clsn1' ? 'Clsn1' : 'Clsn2', index, allocated: true, filled: selectedSlot.filled === true },
    controls: { scale, angle, pivotPreset: preset, pivot }, pivotPresets: { axis: [0, 0], center: pivotFor('center', null, selectedRect), topLeft: pivotFor('top-left', null, selectedRect), topRight: pivotFor('top-right', null, selectedRect), bottomRight: pivotFor('bottom-right', null, selectedRect), bottomLeft: pivotFor('bottom-left', null, selectedRect) },
    authority: { label: 'Known-input plan preview — not live runtime', exactCharacterScaleInput: Boolean(collisionScale), coordinateSpace: collisionScale ? 'character-local' : 'air-local-assumption' },
    limitations: ['AIR sprite offsets, flip, element scale/angle, interpolation, facing, world position, localcoord conversion, redirects, hitpause ordering, and other runtime controllers are not applied.'], preview
  };
  return freeze({ ...semantic, adapterHash: hash(semantic) });
}

module.exports = { GROUP_KEYS, PIVOT_PRESETS, frozenInspection, canvasPointToCollisionSpace, createAirCollisionTransformPreview };
