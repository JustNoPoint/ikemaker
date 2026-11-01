'use strict';

const crypto = require('crypto');
const path = require('path');
const { types: utilTypes } = require('util');
const { deepFreeze } = require('./air_collision_inspection_model');
const { parseAir } = require('./air_preview_model');

const SCHEMA = 'ikemaker.air-collision-assistance-apply-authority';
const PLAN_SCHEMA = 'ikemaker.air-collision-assistance-acceptance-plan';
const TOKEN = /^[a-f0-9]{48}$/;
const HASH = /^[A-F0-9]{64}$/;
const MAX_SOURCE_BYTES = 16 * 1024 * 1024;
const MAX_PATCH_BYTES = 1024 * 1024;
const MAX_TARGETS = 128;
const MAX_BOXES_PER_GROUP = 64;
const MAX_ACCEPTED_BOXES = 16384;
const MAX_CHANGED_GROUPS = 256;
const MAX_REBUILD_WORK_BYTES = 256 * 1024 * 1024;
const MAX_REVIEW_HUNK_BYTES = 8192;
const MAX_PUBLIC_REVIEW_BYTES = 128 * 1024;
const MAX_EXCERPT_BYTES = 8192;
const MAX_PUBLIC_BYTES = 32768;
const MAX_PATH_BYTES = 32768;
const MAX_SESSION_LENGTH = 192;
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
const EFFECT_KEYS = ['clipboard', 'command', 'editor', 'filesystem', 'mutationAuthority', 'network', 'route', 'simulation'];
const COUNT_KEYS = ['acceptedBoxes', 'changedBoxes', 'changedGroups', 'defaultWrites', 'estimatedRebuildBytes', 'materializedGroups', 'omittedByCap', 'retainedBoxes', 'targets'];
const BINDING_KEYS = ['acceptanceHash', 'action', 'actionOccurrence', 'airPath', 'allocationProfile', 'assistanceEpoch', 'assistanceReviewEpoch', 'capabilityFingerprint', 'documentVersion', 'patchHash', 'planHash', 'proposalHash', 'referenceElementIndex', 'resultingFingerprint', 'sessionId', 'sourceFingerprint', 'sourceLength', 'sourceWasDirty', 'sourceWasOpen', 'targetElementIndices'];
const PLAN_KEYS = ['acceptanceHash', 'capabilityFingerprint', 'conflicts', 'counts', 'effects', 'limitations', 'ownershipDecisions', 'patch', 'planHash', 'proposalHash', 'ready', 'reason', 'resultingFingerprint', 'reviewHunks', 'reviewOmitted', 'schema', 'selection', 'sourceFingerprint', 'status', 'targets', 'version'];
const PROVENANCE_KEYS = ['action', 'actionOccurrence', 'elementIndex', 'groupKey', 'inspectionHash', 'kind', 'slot', 'sourceLine'];

function sha(value) { return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').toUpperCase(); }
function canonical(value) { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])); return value; }
function semanticHash(value) { return sha(JSON.stringify(canonical(value))); }
function exactKeys(value, keys) { return Boolean(value) && Object.keys(value).sort().join(',') === keys.slice().sort().join(','); }
function plain(value, stack = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || utilTypes.isProxy(value) || stack.has(value)) return false;
  stack.add(value); const keys = Object.keys(value), own = Reflect.ownKeys(value), prototype = Object.getPrototypeOf(value);
  const descriptor = key => { const item = Object.getOwnPropertyDescriptor(value, key); return Boolean(item && Object.prototype.hasOwnProperty.call(item, 'value') && plain(item.value, stack)); };
  const valid = Array.isArray(value)
    ? own.length === keys.length + 1 && own.includes('length') && keys.length === value.length && keys.every((key, index) => Number(key) === index && descriptor(key))
    : (prototype === Object.prototype || prototype === null) && own.length === keys.length && keys.every(key => !FORBIDDEN.has(key) && descriptor(key));
  stack.delete(value); return valid;
}
function frozen(value, seen = new WeakSet()) { if (!value || typeof value !== 'object') return true; if (seen.has(value)) return true; if (!Object.isFrozen(value)) return false; seen.add(value); return Object.values(value).every(item => frozen(item, seen)); }
function exactHash(value) { return typeof value === 'string' && HASH.test(value); }
function safeInteger(value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) { return Number.isSafeInteger(value) && value >= minimum && value <= maximum; }
function validRect(value) { return Array.isArray(value) && value.length === 4 && value.every(Number.isSafeInteger) && value[0] <= value[2] && value[1] <= value[3]; }
function validPath(value) { return typeof value === 'string' && value.length > 0 && Buffer.byteLength(value, 'utf8') <= MAX_PATH_BYTES && !value.includes('\0') && path.isAbsolute(value) && path.normalize(value) === value; }
function validSession(value) { return typeof value === 'string' && value.length > 0 && value.length <= MAX_SESSION_LENGTH && /^[A-Za-z0-9._:-]+$/.test(value); }
function orderedSafeIntegers(value, maximum = Number.MAX_SAFE_INTEGER) { return Array.isArray(value) && value.every((item, index) => safeInteger(item, 0, maximum) && (index === 0 || item > value[index - 1])); }

function validSelection(selection) {
  return exactKeys(selection, ['action', 'actionOccurrence', 'allocationProfile', 'referenceElementIndex', 'targetElementIndices'])
    && Number.isSafeInteger(selection.action) && safeInteger(selection.actionOccurrence) && safeInteger(selection.referenceElementIndex)
    && ['stable-source-order', 'indexed-label'].includes(selection.allocationProfile)
    && orderedSafeIntegers(selection.targetElementIndices) && selection.targetElementIndices.length <= MAX_TARGETS;
}
function validCounts(counts, selection) {
  if (!exactKeys(counts, COUNT_KEYS) || !COUNT_KEYS.every(key => safeInteger(counts[key]))) return false;
  return counts.targets === selection.targetElementIndices.length && counts.targets <= MAX_TARGETS && counts.acceptedBoxes <= MAX_ACCEPTED_BOXES
    && counts.changedBoxes > 0 && counts.changedBoxes <= counts.acceptedBoxes && counts.changedGroups > 0 && counts.changedGroups <= MAX_CHANGED_GROUPS
    && counts.materializedGroups <= counts.changedGroups && counts.defaultWrites <= counts.changedGroups && counts.omittedByCap <= MAX_ACCEPTED_BOXES
    && counts.estimatedRebuildBytes <= MAX_REBUILD_WORK_BYTES;
}
function validTargets(targets, selection, statistics) {
  if (!Array.isArray(targets) || targets.length !== selection.targetElementIndices.length || targets.length > MAX_TARGETS) return false;
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index]; if (!exactKeys(target, ['elementIndex', 'groups']) || target.elementIndex !== selection.targetElementIndices[index] || !exactKeys(target.groups, ['clsn1', 'clsn2'])) return false;
    for (const groupKey of ['clsn1', 'clsn2']) {
      const group = target.groups[groupKey]; if (!exactKeys(group, ['decision', 'mode', 'omittedByCap', 'ownership', 'slots']) || !['none', 'selected-boxes', 'whole-group'].includes(group.mode) || !safeInteger(group.omittedByCap, 0, MAX_BOXES_PER_GROUP) || !Array.isArray(group.slots) || group.slots.length > MAX_BOXES_PER_GROUP) return false;
      if (!(group.ownership === null || ['default-owner', 'inherited-default', 'frame-specific', 'new-frame-block'].includes(group.ownership))) return false;
      if (!['retained', 'accepted-no-change', 'default-deduplicated', 'materialized-local', 'default-written-once', 'changed-local'].includes(group.decision)) return false;
      if (group.mode === 'none' && (group.ownership !== null || group.decision !== 'retained' || group.slots.length)) return false;
      if (group.mode !== 'none' && group.ownership === null) return false;
      let previousSlot = -1, changedSlots = 0;
      for (const slot of group.slots) {
        if (!exactKeys(slot, ['adjusted', 'changed', 'provenance', 'proposalRect', 'rect', 'slot']) || !safeInteger(slot.slot) || slot.slot <= previousSlot || !validRect(slot.rect) || !validRect(slot.proposalRect) || typeof slot.adjusted !== 'boolean' || typeof slot.changed !== 'boolean') return false;
        if (!slot.provenance || !plain(slot.provenance) || !frozen(slot.provenance) || !exactKeys(slot.provenance, PROVENANCE_KEYS) || slot.provenance.kind !== 'reference-frame' || !exactHash(slot.provenance.inspectionHash) || slot.provenance.groupKey !== groupKey || slot.provenance.slot !== slot.slot || !Number.isSafeInteger(slot.provenance.action) || !safeInteger(slot.provenance.actionOccurrence) || !safeInteger(slot.provenance.elementIndex) || !(slot.provenance.sourceLine === null || safeInteger(slot.provenance.sourceLine))) return false;
        if (slot.provenance.action !== selection.action || slot.provenance.actionOccurrence !== selection.actionOccurrence || slot.provenance.elementIndex !== selection.referenceElementIndex || slot.adjusted !== (JSON.stringify(slot.rect) !== JSON.stringify(slot.proposalRect))) return false;
        if (slot.changed) changedSlots += 1;
        previousSlot = slot.slot;
      }
      if (group.decision === 'accepted-no-change' && changedSlots !== 0) return false;
      if (['default-deduplicated', 'materialized-local', 'default-written-once', 'changed-local'].includes(group.decision) && changedSlots === 0) return false;
      if (group.decision === 'materialized-local' && group.ownership !== 'inherited-default') return false;
      if (group.decision === 'default-written-once' && group.ownership !== 'default-owner') return false;
      if (group.decision === 'changed-local' && !['frame-specific', 'new-frame-block'].includes(group.ownership)) return false;
      if (group.mode !== 'none' && group.decision === 'retained') return false;
      statistics.acceptedBoxes += group.slots.length;
      statistics.omittedByCap += group.omittedByCap;
      if (group.decision !== 'default-deduplicated') {
        const changed = group.slots.filter(item => item.changed);
        for (let changedIndex = 0; changedIndex < changed.length; changedIndex += 1) {
          const ownership = group.decision === 'materialized-local' && changedIndex > 0 ? 'frame-specific' : group.ownership;
          statistics.writes.set(`${target.elementIndex}|${groupKey}|${changed[changedIndex].slot}`, ownership);
        }
      }
      if (['materialized-local', 'default-written-once', 'changed-local'].includes(group.decision)) statistics.changedGroups += 1;
      if (group.decision === 'materialized-local') statistics.materializedGroups += 1;
      if (group.decision === 'default-written-once') statistics.defaultWrites += 1;
    }
  }
  return true;
}
function validOwnership(decisions) {
  if (!Array.isArray(decisions) || decisions.length > MAX_CHANGED_GROUPS) return false;
  for (const item of decisions) {
    if (item.kind === 'default-write-once') {
      if (!exactKeys(item, ['groupKey', 'kind', 'ownerElementIndex', 'ownerLine', 'tiedElementIndices']) || !['clsn1', 'clsn2'].includes(item.groupKey) || !safeInteger(item.ownerElementIndex) || !safeInteger(item.ownerLine) || !orderedSafeIntegers(item.tiedElementIndices) || !item.tiedElementIndices.includes(item.ownerElementIndex) || item.tiedElementIndices.length > MAX_TARGETS) return false;
    } else if (item.kind === 'materialize-inherited-locally') {
      if (!exactKeys(item, ['elementIndex', 'groupKey', 'kind', 'sharedOwnerLine']) || !['clsn1', 'clsn2'].includes(item.groupKey) || !safeInteger(item.elementIndex) || !safeInteger(item.sharedOwnerLine)) return false;
    } else return false;
  }
  return true;
}
function validOwnershipLinks(targets, decisions) {
  const groups = new Map();
  for (const target of targets) for (const groupKey of ['clsn1', 'clsn2']) groups.set(`${target.elementIndex}|${groupKey}`, target.groups[groupKey]);
  const linked = new Set();
  for (const item of decisions) {
    if (item.kind === 'materialize-inherited-locally') {
      const key = `${item.elementIndex}|${item.groupKey}`, group = groups.get(key);
      if (!group || group.ownership !== 'inherited-default' || group.decision !== 'materialized-local' || linked.has(key)) return false;
      linked.add(key); continue;
    }
    const ownerKey = `${item.ownerElementIndex}|${item.groupKey}`, owner = groups.get(ownerKey);
    if (!owner || owner.ownership !== 'default-owner' || owner.decision !== 'default-written-once' || linked.has(ownerKey)) return false;
    linked.add(ownerKey);
    for (const elementIndex of item.tiedElementIndices) {
      const key = `${elementIndex}|${item.groupKey}`, group = groups.get(key);
      if (!group || group.mode !== 'whole-group') return false;
      if (elementIndex === item.ownerElementIndex) continue;
      if (linked.has(key) || group.decision !== 'default-deduplicated') return false;
      linked.add(key);
    }
  }
  for (const [key, group] of groups) {
    const requiresLink = ['materialized-local', 'default-written-once', 'default-deduplicated'].includes(group.decision);
    if (requiresLink !== linked.has(key)) return false;
  }
  return true;
}
function validReview(reviewHunks, reviewOmitted, counts, writes) {
  if (!Array.isArray(reviewHunks) || reviewHunks.length !== counts.changedBoxes || Buffer.byteLength(JSON.stringify(reviewHunks), 'utf8') > MAX_PUBLIC_REVIEW_BYTES || !safeInteger(reviewOmitted)) return false;
  let omitted = 0; const seen = new Set();
  for (const item of reviewHunks) {
    if (!exactKeys(item, ['before', 'beforeOmitted', 'elementIndex', 'groupKey', 'operation', 'ownership', 'replacement', 'replacementOmitted', 'slot']) || !safeInteger(item.elementIndex) || !['clsn1', 'clsn2'].includes(item.groupKey) || !safeInteger(item.slot) || !['add', 'edit'].includes(item.operation) || !['default-owner', 'inherited-default', 'frame-specific', 'new-frame-block'].includes(item.ownership) || typeof item.before !== 'string' || typeof item.replacement !== 'string' || !safeInteger(item.beforeOmitted) || !safeInteger(item.replacementOmitted) || Buffer.byteLength(JSON.stringify(item), 'utf8') > MAX_REVIEW_HUNK_BYTES) return false;
    const key = `${item.elementIndex}|${item.groupKey}|${item.slot}`;
    if (seen.has(key) || !writes.has(key) || writes.get(key) !== item.ownership) return false;
    seen.add(key); omitted += item.beforeOmitted + item.replacementOmitted;
  }
  return omitted === reviewOmitted && seen.size === writes.size;
}
function validPatch(patch, sourceFingerprint) {
  if (!exactKeys(patch, ['before', 'end', 'replacement', 'start']) || !safeInteger(patch.start, 0, MAX_SOURCE_BYTES) || !safeInteger(patch.end, patch.start, MAX_SOURCE_BYTES) || typeof patch.before !== 'string' || patch.before.length !== patch.end - patch.start || typeof patch.replacement !== 'string' || patch.replacement.length === 0) return false;
  if (Buffer.byteLength(patch.before, 'utf8') > MAX_PATCH_BYTES || Buffer.byteLength(patch.replacement, 'utf8') > MAX_PATCH_BYTES) return false;
  if (patch.start === patch.end) return patch.before === '';
  return patch.before.length > 0 && sha(patch.before) !== sourceFingerprint;
}
function readyPlan(plan) {
  try {
    if (!plan || !plain(plan) || !frozen(plan) || !exactKeys(plan, PLAN_KEYS) || plan.schema !== PLAN_SCHEMA || plan.version !== 1 || plan.status !== 'ready' || plan.ready !== true || plan.reason !== '' || !exactHash(plan.planHash)) return false;
    const { planHash, ...semantic } = plan; if (semanticHash(semantic) !== planHash) return false;
    for (const key of ['sourceFingerprint', 'capabilityFingerprint', 'proposalHash', 'acceptanceHash', 'resultingFingerprint']) if (!exactHash(plan[key])) return false;
    const statistics = { acceptedBoxes: 0, changedGroups: 0, materializedGroups: 0, defaultWrites: 0, omittedByCap: 0, writes: new Map() };
    if (!validSelection(plan.selection) || !validCounts(plan.counts, plan.selection) || !validTargets(plan.targets, plan.selection, statistics) || !validOwnership(plan.ownershipDecisions) || !validOwnershipLinks(plan.targets, plan.ownershipDecisions) || !validReview(plan.reviewHunks, plan.reviewOmitted, plan.counts, statistics.writes) || !validPatch(plan.patch, plan.sourceFingerprint)) return false;
    if (statistics.acceptedBoxes !== plan.counts.acceptedBoxes || statistics.writes.size !== plan.counts.changedBoxes || statistics.changedGroups !== plan.counts.changedGroups || statistics.materializedGroups !== plan.counts.materializedGroups || statistics.defaultWrites !== plan.counts.defaultWrites || statistics.omittedByCap !== plan.counts.omittedByCap) return false;
    if (plan.patch.before === plan.patch.replacement || plan.resultingFingerprint === plan.sourceFingerprint) return false;
    const ownershipKinds = plan.ownershipDecisions.reduce((counts, item) => { counts[item.kind] += 1; return counts; }, { 'default-write-once': 0, 'materialize-inherited-locally': 0 });
    if (ownershipKinds['default-write-once'] !== plan.counts.defaultWrites || ownershipKinds['materialize-inherited-locally'] !== plan.counts.materializedGroups) return false;
    if (!Array.isArray(plan.conflicts) || plan.conflicts.length !== 0 || !Array.isArray(plan.limitations) || plan.limitations.length > 16 || !plan.limitations.every(item => typeof item === 'string' && Buffer.byteLength(item, 'utf8') <= 2048)) return false;
    if (!exactKeys(plan.effects, EFFECT_KEYS) || EFFECT_KEYS.some(key => plan.effects[key] !== false)) return false;
    return true;
  } catch (_) { return false; }
}
function bindingMatchesPlan(binding, plan) {
  if (!binding || !plain(binding) || !frozen(binding) || !exactKeys(binding, BINDING_KEYS) || !validPath(binding.airPath) || typeof binding.sourceWasOpen !== 'boolean' || typeof binding.sourceWasDirty !== 'boolean') return false;
  if (binding.sourceWasOpen) { if (!safeInteger(binding.documentVersion)) return false; } else if (binding.documentVersion !== null || binding.sourceWasDirty !== false) return false;
  if (!validSession(binding.sessionId) || !safeInteger(binding.assistanceEpoch) || !safeInteger(binding.assistanceReviewEpoch) || !safeInteger(binding.sourceLength, 0, MAX_SOURCE_BYTES) || plan.patch.end > binding.sourceLength || (plan.patch.start === 0 && plan.patch.end === binding.sourceLength)) return false;
  const selection = plan.selection;
  return binding.sourceFingerprint === plan.sourceFingerprint && binding.resultingFingerprint === plan.resultingFingerprint && binding.planHash === plan.planHash && binding.patchHash === semanticHash(plan.patch)
    && binding.proposalHash === plan.proposalHash && binding.acceptanceHash === plan.acceptanceHash && binding.capabilityFingerprint === plan.capabilityFingerprint
    && binding.action === selection.action && binding.actionOccurrence === selection.actionOccurrence && binding.referenceElementIndex === selection.referenceElementIndex
    && binding.allocationProfile === selection.allocationProfile && JSON.stringify(binding.targetElementIndices) === JSON.stringify(selection.targetElementIndices)
    && exactHash(binding.sourceFingerprint) && exactHash(binding.resultingFingerprint) && exactHash(binding.planHash) && exactHash(binding.patchHash) && exactHash(binding.proposalHash) && exactHash(binding.acceptanceHash) && exactHash(binding.capabilityFingerprint);
}
function sourceOwnershipMatches(plan, sourceText) {
  const actions = parseAir(sourceText).filter(action => action.number === plan.selection.action), action = actions[plan.selection.actionOccurrence];
  if (!action) return false;
  for (const item of plan.ownershipDecisions) {
    const lineKey = `${item.groupKey}Line`, ownershipKey = `${item.groupKey}Ownership`;
    if (item.kind === 'materialize-inherited-locally') {
      const frame = action.frames[item.elementIndex];
      if (!frame || frame[lineKey] !== item.sharedOwnerLine || frame[ownershipKey] !== 'inherited-default') return false;
      continue;
    }
    const owner = action.frames[item.ownerElementIndex];
    if (!owner || owner[lineKey] !== item.ownerLine || owner[ownershipKey] !== 'default-declared-for-this-element') return false;
    const exactCohort = action.frames.map((frame, elementIndex) => ({ frame, elementIndex }))
      .filter(({ frame }) => frame[lineKey] === item.ownerLine && ['default-declared-for-this-element', 'inherited-default'].includes(frame[ownershipKey]))
      .map(({ elementIndex }) => elementIndex);
    if (JSON.stringify(exactCohort) !== JSON.stringify(item.tiedElementIndices)) return false;
    for (const elementIndex of item.tiedElementIndices) {
      const frame = action.frames[elementIndex];
      if (!frame || frame[lineKey] !== item.ownerLine || !['default-declared-for-this-element', 'inherited-default'].includes(frame[ownershipKey])) return false;
    }
  }
  return true;
}
function sourceEvidenceMatches(plan, binding, sourceText) {
  if (typeof sourceText !== 'string' || sourceText.length > MAX_SOURCE_BYTES || Buffer.byteLength(sourceText, 'utf8') > MAX_SOURCE_BYTES || binding.sourceLength !== sourceText.length || sha(sourceText) !== plan.sourceFingerprint) return false;
  const patch = plan.patch;
  if (patch.end > sourceText.length || (patch.start === 0 && patch.end === sourceText.length) || sourceText.slice(patch.start, patch.end) !== patch.before) return false;
  const result = sourceText.slice(0, patch.start) + patch.replacement + sourceText.slice(patch.end);
  if (sha(result) !== plan.resultingFingerprint) return false;
  return sourceOwnershipMatches(plan, sourceText);
}
function excerpt(value, maximum = MAX_EXCERPT_BYTES) { const source = String(value || ''), total = Buffer.byteLength(source, 'utf8'); let text = '', bytes = 0; for (const character of source) { const size = Buffer.byteLength(character, 'utf8'); if (bytes + size > maximum) break; text += character; bytes += size; } return { text, omittedBytes: total - bytes }; }
function publicReview(token, plan) {
  const review = deepFreeze({ token, label: 'Apply reviewed collision assistance', action: plan.selection.action, targetCount: plan.counts.targets, changeCount: plan.counts.changedBoxes, before: excerpt(plan.patch.before), replacement: excerpt(plan.patch.replacement) });
  return Buffer.byteLength(JSON.stringify(review), 'utf8') <= MAX_PUBLIC_BYTES ? review : null;
}
function issueAirCollisionAssistanceApplyAuthority(input = {}, tokenFactory = () => crypto.randomBytes(24).toString('hex')) {
  try {
    if (!plain(input) || !exactKeys(input, input.activeToken === undefined ? ['binding', 'plan', 'sourceText'] : ['activeToken', 'binding', 'plan', 'sourceText']) || !readyPlan(input.plan) || !bindingMatchesPlan(input.binding, input.plan) || !sourceEvidenceMatches(input.plan, input.binding, input.sourceText)) return null;
    if (input.activeToken !== undefined && (typeof input.activeToken !== 'string' || !TOKEN.test(input.activeToken))) return null;
    const token = tokenFactory(); if (typeof token !== 'string' || !TOKEN.test(token)) throw new Error('AIR collision Assistance Apply authority requires one unique lowercase 48-hex token.');
    if (input.activeToken === token) throw new Error('AIR collision Assistance Apply authority cannot reuse the active token.');
    const publicProjection = publicReview(token, input.plan); if (!publicProjection) return null;
    return { authority: deepFreeze({ schema: SCHEMA, version: 1, token, binding: input.binding, plan: input.plan }), public: publicProjection };
  } catch (error) { if (/requires one unique|cannot reuse/.test(error.message)) throw error; return null; }
}
function consumeAirCollisionAssistanceApplyAuthority(record, token) { const authority = record?.assistanceApplyAuthority || null; if (record) record.assistanceApplyAuthority = null; if (typeof token !== 'string' || !TOKEN.test(token) || !authority || authority.schema !== SCHEMA || authority.version !== 1 || authority.token !== token) return null; return authority; }
function revokeAirCollisionAssistanceApplyAuthority(record) { if (record) record.assistanceApplyAuthority = null; }
function sameAirCollisionAssistanceApplyReview(authority, rebuiltPlan, currentBinding, currentSourceText) { try { return Boolean(authority && authority.schema === SCHEMA && authority.version === 1 && readyPlan(rebuiltPlan) && bindingMatchesPlan(currentBinding, rebuiltPlan) && sourceEvidenceMatches(rebuiltPlan, currentBinding, currentSourceText) && semanticHash(authority.plan) === semanticHash(rebuiltPlan) && semanticHash(authority.binding) === semanticHash(currentBinding)); } catch (_) { return false; } }

module.exports = {
  SCHEMA, PLAN_SCHEMA, TOKEN, MAX_SOURCE_BYTES, MAX_PATCH_BYTES, MAX_TARGETS, MAX_BOXES_PER_GROUP, MAX_ACCEPTED_BOXES, MAX_CHANGED_GROUPS,
  MAX_REBUILD_WORK_BYTES, MAX_REVIEW_HUNK_BYTES, MAX_PUBLIC_REVIEW_BYTES, MAX_EXCERPT_BYTES, MAX_PUBLIC_BYTES, MAX_PATH_BYTES,
  semanticHash, readyPlan, bindingMatchesPlan, publicReview, issueAirCollisionAssistanceApplyAuthority, consumeAirCollisionAssistanceApplyAuthority,
  revokeAirCollisionAssistanceApplyAuthority, sameAirCollisionAssistanceApplyReview
};
