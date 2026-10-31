'use strict';

const crypto = require('crypto');
const { types: utilTypes } = require('util');
const { createAirCollisionAssistanceProposals, GROUPS } = require('./air_collision_assistance_model');
const { createAirCollisionInspection, deepFreeze } = require('./air_collision_inspection_model');
const { createAirCollisionEditImpact } = require('./air_collision_edit_impact_model');
const { createAirCollisionEditPlan } = require('./air_collision_edit_plan');

const SCHEMA = 'ikemaker.air-collision-assistance-acceptance-plan';
const MAX_SOURCE_BYTES = 16 * 1024 * 1024;
const MAX_TARGETS = 128;
const MAX_PROPOSALS_PER_GROUP = 64;
const MAX_ACCEPTED_BOXES = 16384;
const MAX_CHANGED_GROUPS = 256;
const MAX_PATCH_BYTES = 1024 * 1024;
const MAX_REBUILD_WORK_BYTES = 256 * 1024 * 1024;
const MAX_REVIEW_HUNK_BYTES = 8192;
const MAX_PUBLIC_REVIEW_BYTES = 128 * 1024;
const HASH = /^[A-F0-9]{64}$/;
const MODES = new Set(['none', 'selected-boxes', 'whole-group']);
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);

function sha(value) { return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').toUpperCase(); }
function canonical(value) { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])); return value; }
function semanticHash(value) { return sha(JSON.stringify(canonical(value))); }
function exactKeys(value, keys) { return value && Object.keys(value).sort().join(',') === keys.slice().sort().join(','); }
function plain(value, stack = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || utilTypes.isProxy(value) || stack.has(value)) return false;
  stack.add(value);
  const keys = Object.keys(value), own = Reflect.ownKeys(value), prototype = Object.getPrototypeOf(value);
  const descriptor = key => { const item = Object.getOwnPropertyDescriptor(value, key); return Boolean(item && Object.prototype.hasOwnProperty.call(item, 'value') && plain(item.value, stack)); };
  const valid = Array.isArray(value)
    ? own.length === keys.length + 1 && own.includes('length') && keys.length === value.length && keys.every((key, index) => Number(key) === index && descriptor(key))
    : (prototype === Object.prototype || prototype === null) && own.length === keys.length && keys.every(key => !FORBIDDEN.has(key) && descriptor(key));
  stack.delete(value);
  return valid;
}
function frozen(value, seen = new WeakSet()) { if (!value || typeof value !== 'object') return true; if (seen.has(value)) return true; if (!Object.isFrozen(value)) return false; seen.add(value); return Object.values(value).every(item => frozen(item, seen)); }
function effects() { return { filesystem: false, editor: false, clipboard: false, command: false, route: false, network: false, mutationAuthority: false, simulation: false }; }
function normalizedRect(value) { if (!Array.isArray(value) || value.length !== 4 || !value.every(Number.isSafeInteger)) return null; const [x1, y1, x2, y2] = value.map(Number); return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)]; }
function equal(a, b) { return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b)); }
function sameRect(a, b) { return Array.isArray(a) && Array.isArray(b) && a.length === 4 && a.every((value, index) => value === b[index]); }
function workEstimate(sourceBytes, units) {
  if (!Number.isSafeInteger(sourceBytes) || sourceBytes < 0 || !Number.isSafeInteger(units) || units < 0 || (sourceBytes && units > Math.floor(Number.MAX_SAFE_INTEGER / sourceBytes))) return { exceeded: true, bytes: null };
  const bytes = sourceBytes * units;
  return { exceeded: bytes > MAX_REBUILD_WORK_BYTES, bytes };
}
function finish(body) { const semantic = { schema: SCHEMA, version: 1, ...body, effects: effects() }; return deepFreeze({ ...semantic, planHash: semanticHash(semantic) }); }
function baseEvidence(input = {}) {
  const request = input && typeof input === 'object' && !utilTypes.isProxy(input) ? input.request : null;
  const projection = input && typeof input === 'object' && !utilTypes.isProxy(input) ? input.projection : null;
  return {
    sourceFingerprint: String(request?.sourceFingerprint || ''), capabilityFingerprint: String(request?.capabilityFingerprint || ''),
    proposalHash: String(projection?.proposalHash || ''), acceptanceHash: '', resultingFingerprint: '', selection: null
  };
}
function failed(reason, status = 'unavailable', evidence = {}, conflicts = []) {
  return finish({
    status, ready: false, reason: String(reason), sourceFingerprint: String(evidence.sourceFingerprint || ''),
    capabilityFingerprint: String(evidence.capabilityFingerprint || ''), proposalHash: String(evidence.proposalHash || ''),
    acceptanceHash: String(evidence.acceptanceHash || ''), resultingFingerprint: String(evidence.resultingFingerprint || ''),
    selection: evidence.selection || null, counts: { targets: 0, acceptedBoxes: 0, changedBoxes: 0, retainedBoxes: 0, changedGroups: 0, materializedGroups: 0, defaultWrites: 0, omittedByCap: 0, estimatedRebuildBytes: 0 },
    targets: [], ownershipDecisions: [], patch: null, reviewHunks: [], reviewOmitted: 0,
    conflicts: conflicts.length ? conflicts : [{ kind: status, message: String(reason) }], limitations: [String(reason)]
  });
}
function inspectionInput(request, text, elementIndex) {
  return { text, action: request.action, actionOccurrence: request.actionOccurrence, elementIndex, target: request.target, allocationDecision: request.allocationDecision, capabilityFingerprint: request.capabilityFingerprint, savedRuntimePlans: [], recoveryRuntimePlans: [] };
}
function inspectionFor(request, text, elementIndex) { return createAirCollisionInspection(inspectionInput(request, text, elementIndex)); }
function inspectImpact(request, text, elementIndex, groupKey, slot = 0) {
  const inspection = inspectionFor(request, text, elementIndex);
  const impact = createAirCollisionEditImpact({ text, inspection, capabilityFingerprint: request.capabilityFingerprint, action: request.action, actionOccurrence: request.actionOccurrence, elementIndex, groupKey, slot, intent: { kind: 'inspect' } });
  return { inspection, impact };
}
function editStep(request, text, elementIndex, groupKey, slot, operation) {
  const inspection = inspectionFor(request, text, elementIndex);
  const impact = createAirCollisionEditImpact({ text, inspection, capabilityFingerprint: request.capabilityFingerprint, action: request.action, actionOccurrence: request.actionOccurrence, elementIndex, groupKey, slot, intent: operation });
  if (impact.status === 'unavailable') return { error: impact.reason || 'Exact edit impact is unavailable.' };
  const plan = createAirCollisionEditPlan({ text, inspection, impact, capabilityFingerprint: request.capabilityFingerprint, action: request.action, actionOccurrence: request.actionOccurrence, elementIndex, groupKey, slot, operation });
  if (plan.status !== 'ready' || !plan.patch) return { error: plan.reason || 'Exact collision edit plan is not ready.' };
  if (text.slice(plan.patch.start, plan.patch.end) !== plan.patch.before) return { error: 'Internal C12B1 patch no longer matches its rebuilt source.' };
  const result = text.slice(0, plan.patch.start) + plan.patch.replacement + text.slice(plan.patch.end);
  if (sha(result) !== plan.resultingFingerprint) return { error: 'Internal C12B1 result hash failed reconstruction.' };
  return { text: result, plan };
}
function normalizeAcceptance(value, projection) {
  if (!exactKeys(value, ['proposalHash', 'targets']) || !HASH.test(String(value.proposalHash || '')) || !Array.isArray(value.targets)) return { error: 'Acceptance must contain exactly proposalHash and targets.' };
  if (value.proposalHash !== projection.proposalHash) return { error: 'Acceptance is bound to a stale or different proposal projection.' };
  if (value.targets.length !== projection.targets.length || value.targets.length > MAX_TARGETS) return { error: `Acceptance must cover every projected target exactly once (maximum ${MAX_TARGETS}).` };
  const normalized = { proposalHash: value.proposalHash, targets: [] }; let acceptedBoxes = 0, previousElement = -1;
  for (let index = 0; index < value.targets.length; index += 1) {
    const target = value.targets[index], projected = projection.targets[index];
    if (!exactKeys(target, ['clsn1', 'clsn2', 'elementIndex']) || !Number.isSafeInteger(target.elementIndex) || target.elementIndex <= previousElement || target.elementIndex !== projected.elementIndex) return { error: 'Acceptance targets must be exact, sorted, duplicate-free projected element identities.' };
    previousElement = target.elementIndex; const normalizedTarget = { elementIndex: target.elementIndex };
    for (const groupKey of GROUPS) {
      const group = target[groupKey], projectedGroup = projected.groups[groupKey];
      if (!exactKeys(group, ['boxes', 'mode']) || !MODES.has(group.mode) || !Array.isArray(group.boxes)) return { error: `${groupKey} acceptance must contain exactly one valid mode and box list.` };
      if (projectedGroup.proposals.length > MAX_PROPOSALS_PER_GROUP) return { error: `${groupKey} proposals exceed the ${MAX_PROPOSALS_PER_GROUP} acceptance cap.` };
      if (!projectedGroup.enabled && (group.mode !== 'none' || group.boxes.length)) return { error: `Disabled ${groupKey} requires none with an empty box list.` };
      if (group.mode === 'none' && group.boxes.length) return { error: `${groupKey} none mode cannot include boxes.` };
      if (projected.frameLocked && group.mode !== 'none') return { conflict: `Locked frame ${target.elementIndex + 1} cannot be accepted.` };
      if (group.mode !== 'none' && (projectedGroup.status !== 'ready' || projectedGroup.conflicts.length)) return { conflict: `${groupKey} cannot be accepted from partial, locked, unavailable, or conflicted proposal evidence.` };
      const proposals = new Map(projectedGroup.proposals.map(item => [item.target.slot, item])), boxes = []; let previousSlot = -1;
      for (const box of group.boxes) {
        if (!exactKeys(box, ['rect', 'slot']) || !Number.isSafeInteger(box.slot) || box.slot < 0 || box.slot <= previousSlot) return { error: `${groupKey} boxes must be exact, sorted, and duplicate-free by slot.` };
        const rect = normalizedRect(box.rect), proposal = proposals.get(box.slot);
        if (!rect) return { error: `${groupKey}[${box.slot}] needs four safe-integer coordinates.` };
        if (!proposal || proposal.locked) return { conflict: `${groupKey}[${box.slot}] must map to one currently shown unlocked proposal.` };
        previousSlot = box.slot; boxes.push({ slot: box.slot, rect }); acceptedBoxes += 1;
        if (acceptedBoxes > MAX_ACCEPTED_BOXES) return { error: `Accepted boxes exceed the ${MAX_ACCEPTED_BOXES} transaction cap.` };
      }
      const unlocked = projectedGroup.proposals.filter(item => !item.locked).map(item => item.target.slot);
      if (group.mode === 'whole-group' && !equal(boxes.map(item => item.slot), unlocked)) return { conflict: `${groupKey} whole-group acceptance must enumerate every currently shown unlocked proposal.` };
      if (group.mode === 'selected-boxes' && !boxes.length) return { error: `${groupKey} selected-boxes mode requires at least one box.` };
      normalizedTarget[groupKey] = { mode: group.mode, boxes };
    }
    normalized.targets.push(normalizedTarget);
  }
  return { value: normalized, acceptedBoxes };
}
function mergeFinal(records, boxes) {
  const final = records.map(item => ({ slot: item.slot, filled: item.filled === true, rect: item.normalizedRect ? item.normalizedRect.slice() : null }));
  for (const box of boxes) {
    const existing = final.find(item => item.slot === box.slot);
    if (existing) { existing.filled = true; existing.rect = box.rect.slice(); continue; }
    if (box.slot !== final.length) return { error: `Append slot ${box.slot} skips the next legal slot ${final.length}.` };
    final.push({ slot: box.slot, filled: true, rect: box.rect.slice() });
  }
  return { value: final };
}
function commonPatch(before, after) {
  let start = 0; while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
  let beforeEnd = before.length, afterEnd = after.length; while (beforeEnd > start && afterEnd > start && before[beforeEnd - 1] === after[afterEnd - 1]) { beforeEnd -= 1; afterEnd -= 1; }
  return { start, end: beforeEnd, before: before.slice(start, beforeEnd), replacement: after.slice(start, afterEnd) };
}
function reviewHunk(change) {
  const metadata = { elementIndex: change.elementIndex, groupKey: change.groupKey, slot: change.slot, operation: change.operation, ownership: change.ownership };
  const budget = Math.max(0, MAX_REVIEW_HUNK_BYTES - Buffer.byteLength(JSON.stringify(metadata), 'utf8') - 256), beforeBudget = Math.floor(budget / 2), replacementBudget = budget - beforeBudget;
  const take = (value, maximum) => { if (Buffer.byteLength(value, 'utf8') <= maximum) return { text: value, omitted: 0 }; let text = value.slice(0, maximum); while (Buffer.byteLength(text, 'utf8') > maximum) text = text.slice(0, -1); return { text, omitted: value.length - text.length }; };
  const before = take(change.patch.before, beforeBudget), replacement = take(change.patch.replacement, replacementBudget);
  const hunk = { ...metadata, before: before.text, replacement: replacement.text, beforeOmitted: before.omitted, replacementOmitted: replacement.omitted };
  while (Buffer.byteLength(JSON.stringify(hunk), 'utf8') > MAX_REVIEW_HUNK_BYTES && (hunk.before.length || hunk.replacement.length)) {
    if (hunk.replacement.length >= hunk.before.length && hunk.replacement.length) { hunk.replacement = hunk.replacement.slice(0, -1); hunk.replacementOmitted += 1; }
    else { hunk.before = hunk.before.slice(0, -1); hunk.beforeOmitted += 1; }
  }
  return hunk;
}

function createAirCollisionAssistanceAcceptancePlan(input = {}) {
  let evidence = baseEvidence();
  try {
    if (!plain(input) || !exactKeys(input, ['acceptance', 'projection', 'request'])) return failed('Acceptance-plan input must be one exact canonical plain object.', 'unavailable', evidence);
    evidence = baseEvidence(input);
    const { request, projection } = input;
    if (!frozen(projection)) return failed('The C13 proposal projection must be deeply frozen.', 'unavailable', evidence);
    if (typeof request.text !== 'string' || Buffer.byteLength(request.text, 'utf8') > MAX_SOURCE_BYTES) return failed(`AIR source must not exceed ${MAX_SOURCE_BYTES} bytes.`, 'unavailable', evidence);
    const sourceBytes = Buffer.byteLength(request.text, 'utf8'), rawTargets = request.targetElementIndices;
    if (!Array.isArray(rawTargets) || !rawTargets.every(value => Number.isSafeInteger(value) && value >= 0)) return failed('The exact C13 request has invalid target element identities.', 'unavailable', evidence);
    const targetCount = new Set(rawTargets).size;
    if (targetCount > MAX_TARGETS) return failed(`Projected targets exceed the ${MAX_TARGETS} acceptance cap.`, 'conflict', evidence);
    const proposalWork = workEstimate(sourceBytes, 1 + targetCount);
    if (proposalWork.exceeded) return failed(`Conservative C13 proposal-regeneration work exceeds ${MAX_REBUILD_WORK_BYTES} bytes. Narrow the source or target selection.`, 'conflict', evidence, [{ kind: 'rebuild-work-cap', phase: 'proposal-regeneration', estimatedBytes: proposalWork.bytes, maximumBytes: MAX_REBUILD_WORK_BYTES, message: 'Selective acceptance was rejected before C13 proposal regeneration.' }]);
    const rebuilt = createAirCollisionAssistanceProposals(request);
    evidence = { sourceFingerprint: rebuilt.sourceFingerprint, capabilityFingerprint: rebuilt.capabilityFingerprint, proposalHash: rebuilt.proposalHash, acceptanceHash: '', resultingFingerprint: '', selection: rebuilt.selection };
    if (!HASH.test(String(projection.proposalHash || '')) || !equal(rebuilt, projection)) return failed('The frozen C13 proposal projection is stale, mixed, or noncanonical.', 'unavailable', evidence);
    if (rebuilt.sourceFingerprint !== request.sourceFingerprint || rebuilt.capabilityFingerprint !== request.capabilityFingerprint || rebuilt.allocationProfile !== projection.allocationProfile) return failed('Source, capability, or allocation evidence does not reproduce exactly.', 'unavailable', evidence);
    if (rebuilt.targets.length > MAX_TARGETS) return failed(`Projected targets exceed the ${MAX_TARGETS} acceptance cap.`, 'conflict', evidence);
    const normalized = normalizeAcceptance(input.acceptance, rebuilt);
    if (normalized.error || normalized.conflict) return failed(normalized.error || normalized.conflict, normalized.conflict ? 'conflict' : 'unavailable', evidence);
    const acceptance = normalized.value, acceptanceHash = semanticHash(acceptance);
    evidence = { ...evidence, acceptanceHash };
    const activeGroups = acceptance.targets.reduce((sum, target) => sum + GROUPS.filter(groupKey => target[groupKey].mode !== 'none').length, 0);
    const estimatedRebuildUnits = 1 + targetCount + activeGroups * 4 + normalized.acceptedBoxes * 6;
    const totalWork = workEstimate(sourceBytes, estimatedRebuildUnits), estimatedRebuildBytes = totalWork.bytes;
    if (totalWork.exceeded) return failed(`Conservative full-source rebuild work exceeds ${MAX_REBUILD_WORK_BYTES} bytes. Narrow the target, group, or accepted-box selection.`, 'conflict', evidence, [{ kind: 'rebuild-work-cap', phase: 'acceptance-planning', estimatedBytes: totalWork.bytes, maximumBytes: MAX_REBUILD_WORK_BYTES, message: 'Selective acceptance was rejected before per-box inspection or edit planning.' }]);
    const targetByElement = new Map(rebuilt.targets.map(item => [item.elementIndex, item]));
    const acceptanceByElement = new Map(acceptance.targets.map(item => [item.elementIndex, item]));
    const baseline = request.text, preparations = [], conflicts = [], ownershipDecisions = [], targetResults = [];
    let omittedByCap = 0, changedGroups = 0;
    for (const targetAcceptance of acceptance.targets) {
      const projectedTarget = targetByElement.get(targetAcceptance.elementIndex), targetResult = { elementIndex: targetAcceptance.elementIndex, groups: {} };
      for (const groupKey of GROUPS) {
        const accepted = targetAcceptance[groupKey], projectedGroup = projectedTarget.groups[groupKey]; omittedByCap += projectedGroup.omittedByCap || 0;
        if (accepted.mode === 'none') { targetResult.groups[groupKey] = { mode: 'none', ownership: null, decision: 'retained', omittedByCap: projectedGroup.omittedByCap || 0, slots: [] }; continue; }
        const inspected = inspectImpact(request, baseline, targetAcceptance.elementIndex, groupKey, accepted.boxes[0]?.slot || 0), impact = inspected.impact;
        if (impact.status === 'unavailable') { conflicts.push({ kind: 'ownership-unavailable', elementIndex: targetAcceptance.elementIndex, groupKey, message: impact.reason }); targetResult.groups[groupKey] = { mode: accepted.mode, ownership: null, decision: 'conflict', omittedByCap: projectedGroup.omittedByCap || 0, slots: [] }; continue; }
        const merged = mergeFinal(impact.effectiveBefore, accepted.boxes);
        if (merged.error) { conflicts.push({ kind: 'append-gap', elementIndex: targetAcceptance.elementIndex, groupKey, message: merged.error }); targetResult.groups[groupKey] = { mode: accepted.mode, ownership: impact.status, decision: 'conflict', omittedByCap: projectedGroup.omittedByCap || 0, slots: [] }; continue; }
        const slots = accepted.boxes.map(box => {
          const proposal = projectedGroup.proposals.find(item => item.target.slot === box.slot), before = impact.effectiveBefore.find(item => item.slot === box.slot);
          return { slot: box.slot, rect: box.rect.slice(), proposalRect: proposal.rect.slice(), adjusted: !sameRect(box.rect, proposal.rect), changed: !before?.filled || !sameRect(before.normalizedRect, box.rect), provenance: proposal.provenance };
        });
        const changed = slots.some(item => item.changed); if (changed) changedGroups += 1;
        preparations.push({ elementIndex: targetAcceptance.elementIndex, groupKey, mode: accepted.mode, boxes: accepted.boxes, final: merged.value, impact, changed, slots, projectedTarget });
        targetResult.groups[groupKey] = { mode: accepted.mode, ownership: impact.status, decision: changed ? 'pending' : 'accepted-no-change', omittedByCap: projectedGroup.omittedByCap || 0, slots };
      }
      targetResults.push(targetResult);
    }
    if (changedGroups > MAX_CHANGED_GROUPS) conflicts.push({ kind: 'changed-group-cap', message: `Changed target/groups exceed the ${MAX_CHANGED_GROUPS} transaction cap.` });
    const skipped = new Set(), defaultFamilies = new Map();
    for (const item of preparations.filter(value => value.changed && value.impact.status === 'default-owner')) {
      const affected = item.impact.ownership?.affected;
      if (!affected || affected.omitted || affected.ownerCount !== 1) { conflicts.push({ kind: 'default-cohort-incomplete', elementIndex: item.elementIndex, groupKey: item.groupKey, message: 'Declared Default acceptance requires one complete, unomitted tied-frame cohort.' }); continue; }
      const familyKey = `${item.groupKey}|${item.impact.ownership.ownerLine}`;
      if (defaultFamilies.has(familyKey)) { conflicts.push({ kind: 'overlapping-default-owner', elementIndex: item.elementIndex, groupKey: item.groupKey, message: 'The same declared Default owner was selected through overlapping owner families.' }); continue; }
      const cohort = [], canonicalFinal = JSON.stringify(item.final);
      for (const frame of affected.frames) {
        const memberAcceptance = acceptanceByElement.get(frame.elementIndex), memberProjection = targetByElement.get(frame.elementIndex), memberGroup = memberAcceptance?.[item.groupKey], memberProjectedGroup = memberProjection?.groups?.[item.groupKey];
        const hasExplicitBoxLock = request.locks.boxes.some(lock => lock.elementIndex === frame.elementIndex && lock.groupKey === item.groupKey);
        if (!memberAcceptance || !memberProjection || memberGroup?.mode !== 'whole-group' || memberProjection.frameLocked || hasExplicitBoxLock || memberProjectedGroup.proposals.some(proposal => proposal.locked) || memberProjectedGroup.conflicts.length) { conflicts.push({ kind: 'default-cohort-incomplete', elementIndex: item.elementIndex, groupKey: item.groupKey, message: 'Every tied Default owner/inheritor must be explicitly unlocked, conflict-free, and accepted as one whole group.' }); cohort.length = 0; break; }
        const memberImpact = inspectImpact(request, baseline, frame.elementIndex, item.groupKey, memberGroup.boxes[0]?.slot || 0).impact, memberMerged = mergeFinal(memberImpact.effectiveBefore, memberGroup.boxes);
        if (memberImpact.status === 'unavailable' || memberMerged.error || JSON.stringify(memberMerged.value) !== canonicalFinal) { conflicts.push({ kind: 'default-cohort-mixed', elementIndex: item.elementIndex, groupKey: item.groupKey, message: 'Every tied Default frame must produce the same canonical final geometry.' }); cohort.length = 0; break; }
        cohort.push(frame.elementIndex);
      }
      if (!cohort.length) continue;
      defaultFamilies.set(familyKey, { owner: item.elementIndex, groupKey: item.groupKey, cohort });
      for (const elementIndex of cohort) if (elementIndex !== item.elementIndex) skipped.add(`${elementIndex}|${item.groupKey}`);
      ownershipDecisions.push({ kind: 'default-write-once', groupKey: item.groupKey, ownerLine: item.impact.ownership.ownerLine, ownerElementIndex: item.elementIndex, tiedElementIndices: cohort.slice() });
    }
    if (conflicts.length) return failed('Selective collision acceptance conflicts with current ownership or allocation.', 'conflict', evidence, conflicts);
    const retainedBoxes = preparations.reduce((sum, item) => {
      const acceptedBySlot = new Map(item.boxes.map(box => [box.slot, box]));
      return sum + item.impact.effectiveBefore.filter(record => record.filled && (!acceptedBySlot.has(record.slot) || sameRect(record.normalizedRect, acceptedBySlot.get(record.slot).rect))).length;
    }, 0);
    let working = baseline, changedBoxes = 0, materializedGroups = 0, defaultWrites = 0; const changes = [];
    for (const item of preparations) {
      const resultGroup = targetResults.find(target => target.elementIndex === item.elementIndex).groups[item.groupKey];
      if (!item.changed) { resultGroup.decision = 'accepted-no-change'; continue; }
      if (skipped.has(`${item.elementIndex}|${item.groupKey}`)) { resultGroup.decision = 'default-deduplicated'; continue; }
      const wasInherited = item.impact.status === 'inherited-default', wasDefault = item.impact.status === 'default-owner'; let groupChanged = false;
      for (const box of item.boxes) {
        const current = inspectImpact(request, working, item.elementIndex, item.groupKey, box.slot).impact;
        if (current.status === 'unavailable') return failed(current.reason || 'Current internal collision evidence became unavailable.', 'conflict', evidence);
        const existing = current.effectiveBefore.find(record => record.slot === box.slot);
        if (existing?.filled && sameRect(existing.normalizedRect, box.rect)) continue;
        if (!existing && box.slot !== current.effectiveBefore.length) return failed(`Append slot ${box.slot} is no longer allocation-closed.`, 'conflict', evidence);
        const operation = { kind: existing ? 'edit' : 'add', rect: box.rect.slice() }, step = editStep(request, working, item.elementIndex, item.groupKey, box.slot, operation);
        if (step.error) return failed(step.error, 'conflict', evidence);
        changes.push({ elementIndex: item.elementIndex, groupKey: item.groupKey, slot: box.slot, operation: operation.kind, ownership: current.status, patch: step.plan.patch });
        working = step.text; changedBoxes += 1; groupChanged = true;
      }
      if (groupChanged && wasInherited) { materializedGroups += 1; ownershipDecisions.push({ kind: 'materialize-inherited-locally', elementIndex: item.elementIndex, groupKey: item.groupKey, sharedOwnerLine: item.impact.ownership.ownerLine }); }
      if (groupChanged && wasDefault) defaultWrites += 1;
      resultGroup.decision = groupChanged ? (wasInherited ? 'materialized-local' : wasDefault ? 'default-written-once' : 'changed-local') : 'accepted-no-change';
    }
    const resultingFingerprint = sha(working), counts = { targets: acceptance.targets.length, acceptedBoxes: normalized.acceptedBoxes, changedBoxes, retainedBoxes, changedGroups: new Set(changes.map(item => `${item.elementIndex}|${item.groupKey}`)).size, materializedGroups, defaultWrites, omittedByCap, estimatedRebuildBytes };
    const selection = { action: rebuilt.selection.action, actionOccurrence: rebuilt.selection.actionOccurrence, referenceElementIndex: rebuilt.selection.referenceElementIndex, targetElementIndices: rebuilt.selection.targetElementIndices.slice(), allocationProfile: rebuilt.allocationProfile };
    if (working === baseline) return finish({ status: 'noop', ready: false, reason: 'Accepted proposals already match the exact current AIR geometry.', sourceFingerprint: rebuilt.sourceFingerprint, capabilityFingerprint: rebuilt.capabilityFingerprint, proposalHash: rebuilt.proposalHash, acceptanceHash, resultingFingerprint, selection, counts, targets: targetResults, ownershipDecisions, patch: null, reviewHunks: [], reviewOmitted: 0, conflicts: [], limitations: ['No mutation authority may be issued for a noop acceptance plan.', 'Merge-only acceptance never deletes unaccepted collision boxes.'] });
    const patch = commonPatch(baseline, working);
    if (Buffer.byteLength(patch.before, 'utf8') > MAX_PATCH_BYTES || Buffer.byteLength(patch.replacement, 'utf8') > MAX_PATCH_BYTES) return failed(`The exact contiguous baseline or replacement span exceeds ${MAX_PATCH_BYTES} bytes.`, 'conflict', { ...evidence, resultingFingerprint });
    if (baseline.slice(patch.start, patch.end) !== patch.before || baseline.slice(0, patch.start) + patch.replacement + baseline.slice(patch.end) !== working) return failed('The exact baseline-relative patch failed reconstruction.', 'unavailable', { ...evidence, resultingFingerprint });
    const reviewHunks = changes.map(reviewHunk), reviewBytes = Buffer.byteLength(JSON.stringify(reviewHunks), 'utf8');
    if (reviewBytes > MAX_PUBLIC_REVIEW_BYTES) return failed(`Public review evidence exceeds ${MAX_PUBLIC_REVIEW_BYTES} bytes.`, 'conflict', { ...evidence, resultingFingerprint });
    const reviewOmitted = reviewHunks.reduce((sum, item) => sum + item.beforeOmitted + item.replacementOmitted, 0);
    return finish({ status: 'ready', ready: true, reason: '', sourceFingerprint: rebuilt.sourceFingerprint, capabilityFingerprint: rebuilt.capabilityFingerprint, proposalHash: rebuilt.proposalHash, acceptanceHash, resultingFingerprint, selection, counts, targets: targetResults, ownershipDecisions, patch, reviewHunks, reviewOmitted, conflicts: [], limitations: ['One exact contiguous patch is relative only to the immutable baseline source.', 'Merge-only acceptance retains all unaccepted boxes and never infers deletion or Return-to-default.', omittedByCap ? `${omittedByCap} proposal(s) omitted by independent C13 group caps were not accepted or treated as deletion.` : 'No proposal was omitted by the independent C13 group caps.', 'This pure plan performs no editor, filesystem, command, route, clipboard, network, or runtime mutation.'] });
  } catch (error) {
    return failed(`Selective collision acceptance planning failed closed: ${error.message}`, 'unavailable', evidence);
  }
}

module.exports = {
  SCHEMA, MAX_SOURCE_BYTES, MAX_TARGETS, MAX_PROPOSALS_PER_GROUP, MAX_ACCEPTED_BOXES, MAX_CHANGED_GROUPS,
  MAX_PATCH_BYTES, MAX_REBUILD_WORK_BYTES, MAX_REVIEW_HUNK_BYTES, MAX_PUBLIC_REVIEW_BYTES, createAirCollisionAssistanceAcceptancePlan
};
