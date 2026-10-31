'use strict';

const assert = require('assert');
const crypto = require('crypto');
const { createAirCollisionAssistanceProposals } = require('../src/air_collision_assistance_model');
const {
  MAX_SOURCE_BYTES, MAX_TARGETS, MAX_PATCH_BYTES, MAX_REBUILD_WORK_BYTES, MAX_REVIEW_HUNK_BYTES, MAX_PUBLIC_REVIEW_BYTES,
  createAirCollisionAssistanceAcceptancePlan
} = require('../src/air_collision_assistance_acceptance_plan');

const sha = value => crypto.createHash('sha256').update(value, 'utf8').digest('hex').toUpperCase();
const capability = 'C'.repeat(64);
const stable = { target: { channel: 'stable', version: '1.0' }, allocationDecision: { enabled: false, status: 'unsupported', capabilityFingerprint: capability } };
const nightly = { target: { channel: 'nightly', buildId: 'verified' }, allocationDecision: { capability: { id: 'collision.air-index-allocation' }, enabled: true, status: 'supported', capabilityFingerprint: capability } };
function request(text, changes = {}) {
  return { text, sourceFingerprint: sha(text), capabilityFingerprint: capability, ...stable, action: 100, actionOccurrence: 0, referenceElementIndex: 0, targetElementIndices: [1], groups: { clsn1: { enabled: true, cap: 64 }, clsn2: { enabled: false, cap: 0 } }, locks: { frames: [], boxes: [] }, ...changes };
}
function acceptance(projection, mode = 'whole-group', overrides = {}) {
  return {
    proposalHash: projection.proposalHash,
    targets: projection.targets.map(target => ({
      elementIndex: target.elementIndex,
      clsn1: groupAcceptance(target, 'clsn1', mode, overrides),
      clsn2: groupAcceptance(target, 'clsn2', mode, overrides)
    }))
  };
}
function groupAcceptance(target, key, mode, overrides) {
  const group = target.groups[key];
  if (!group.enabled) return { mode: 'none', boxes: [] };
  const boxes = group.proposals.filter(item => !item.locked).map(item => ({ slot: item.target.slot, rect: (overrides[`${target.elementIndex}|${key}|${item.target.slot}`] || item.rect).slice() }));
  return { mode, boxes: mode === 'none' ? [] : boxes };
}
function build(req, accept) { const projection = createAirCollisionAssistanceProposals(req); return { projection, plan: createAirCollisionAssistanceAcceptancePlan({ request: req, projection, acceptance: accept || acceptance(projection) }) }; }
function apply(text, plan) { assert(plan.patch); assert.strictEqual(text.slice(plan.patch.start, plan.patch.end), plan.patch.before); return text.slice(0, plan.patch.start) + plan.patch.replacement + text.slice(plan.patch.end); }
function diffPatch(before, after) { let start = 0; while (start < before.length && start < after.length && before[start] === after[start]) start += 1; let beforeEnd = before.length, afterEnd = after.length; while (beforeEnd > start && afterEnd > start && before[beforeEnd - 1] === after[afterEnd - 1]) { beforeEnd -= 1; afterEnd -= 1; } return { before: before.slice(start, beforeEnd), replacement: after.slice(start, afterEnd) }; }

const localSource = `[Begin Action 100]
Clsn1: 1
Clsn1[99]=-10,-20,10,20 ; reference odd label
100,0,0,0,1
Clsn1: 2 ; target local
Clsn1[7]=-1,-2,1,2 ; change
; preserve between
Clsn1[8]=20,21,22,23 ; retain
100,1,0,0,1`;
const localRequest = request(localSource);
const localProjection = createAirCollisionAssistanceProposals(localRequest);
const localAcceptance = acceptance(localProjection, 'selected-boxes', { '1|clsn1|0': [8, 9, -8, -9] });
const localPlan = createAirCollisionAssistanceAcceptancePlan({ request: localRequest, projection: localProjection, acceptance: localAcceptance });
assert.strictEqual(localPlan.status, 'ready', localPlan.reason);
assert.deepStrictEqual(localPlan.targets[0].groups.clsn1.slots[0].rect, [-8, -9, 8, 9], 'reviewed reversed coordinates normalize deterministically');
const localResult = apply(localSource, localPlan);
assert(localResult.includes('Clsn1[7]=-8, -9, 8, 9 ; change'));
assert(localResult.includes('Clsn1[8]=20,21,22,23 ; retain') && localResult.includes('; preserve between'), 'selected acceptance preserves unaccepted boxes and trivia');
assert.strictEqual(localPlan.counts.changedBoxes, 1); assert.strictEqual(localPlan.counts.acceptedBoxes, 1);
assert.strictEqual(localPlan.counts.retainedBoxes, 1, 'unaccepted existing boxes are counted as retained');
assert(localPlan.counts.estimatedRebuildBytes > 0 && localPlan.counts.estimatedRebuildBytes <= MAX_REBUILD_WORK_BYTES);
assert.strictEqual(localPlan.resultingFingerprint, sha(localResult)); assert.strictEqual(localPlan.sourceFingerprint, sha(localSource));
assert(localPlan.reviewHunks.every(item => Buffer.byteLength(JSON.stringify(item), 'utf8') <= MAX_REVIEW_HUNK_BYTES));
assert(Buffer.byteLength(JSON.stringify(localPlan.reviewHunks), 'utf8') <= MAX_PUBLIC_REVIEW_BYTES);
assert(Object.isFrozen(localPlan) && Object.isFrozen(localPlan.targets[0].groups.clsn1.slots[0].rect));
assert.deepStrictEqual(localPlan.effects, { filesystem: false, editor: false, clipboard: false, command: false, route: false, network: false, mutationAuthority: false, simulation: false });
assert.strictEqual(createAirCollisionAssistanceAcceptancePlan({ request: localRequest, projection: localProjection, acceptance: localAcceptance }).planHash, localPlan.planHash, 'same immutable evidence produces the same plan');

const noop = build(localRequest);
assert.strictEqual(noop.plan.status, 'ready', 'whole-group reference acceptance changes a differing target while preserving extra target slots');
assert(apply(localSource, noop.plan).includes('Clsn1[8]=20,21,22,23 ; retain'));
const exactNoopAcceptance = acceptance(localProjection, 'selected-boxes', { '1|clsn1|0': [-1, -2, 1, 2] });
const exactNoop = createAirCollisionAssistanceAcceptancePlan({ request: localRequest, projection: localProjection, acceptance: exactNoopAcceptance });
assert.strictEqual(exactNoop.status, 'noop'); assert.strictEqual(exactNoop.patch, null); assert.strictEqual(exactNoop.ready, false);

const emptySource = '[Begin Action 100]\r\nClsn1: 1\r\nClsn1[0]=1,2,3,4\r\n100,0,0,0,1\r\n100,1,0,0,1';
const emptyBuilt = build(request(emptySource));
assert.strictEqual(emptyBuilt.plan.status, 'ready', emptyBuilt.plan.reason);
const emptyResult = apply(emptySource, emptyBuilt.plan);
assert(emptyResult.includes('Clsn1: 1\r\nClsn1[0] = 1, 2, 3, 4\r\n100,1'));
assert(!/(^|[^\r])\n/.test(emptyResult) && !emptyResult.endsWith('\r\n'), 'CRLF and no-final-EOL survive new-group insertion');

const inheritedSource = `[Begin Action 100]
Clsn1Default: 2 ; shared
Clsn1[0]=1,2,3,4
Clsn1[1]=5,6,7,8
100,0,0,0,1
100,1,0,0,1`;
const inheritedReq = request(inheritedSource);
const inheritedProjection = createAirCollisionAssistanceProposals(inheritedReq);
const inheritedAccept = acceptance(inheritedProjection, 'selected-boxes', { '1|clsn1|0': [-4, -3, 4, 3] });
const inheritedPlan = createAirCollisionAssistanceAcceptancePlan({ request: inheritedReq, projection: inheritedProjection, acceptance: inheritedAccept });
assert.strictEqual(inheritedPlan.status, 'ready', inheritedPlan.reason);
const inheritedResult = apply(inheritedSource, inheritedPlan);
assert(inheritedResult.includes('Clsn1Default: 2 ; shared\nClsn1[0]=1,2,3,4'));
assert(inheritedResult.includes('Clsn1: 2\nClsn1[0] = -4, -3, 4, 3\nClsn1[1] = 5, 6, 7, 8\n100,1'), 'inherited acceptance materializes every effective slot locally');
assert.strictEqual(inheritedPlan.counts.materializedGroups, 1);

const defaultSource = `[Begin Action 100]
Clsn1Default: 1
Clsn1[0]=1,2,3,4
100,0,0,0,1
100,1,0,0,1
Clsn1: 1
Clsn1[0]=10,20,30,40
100,2,0,0,1`;
const defaultReq = request(defaultSource, { referenceElementIndex: 2, targetElementIndices: [0, 1] });
const defaultProjection = createAirCollisionAssistanceProposals(defaultReq);
const defaultAccept = acceptance(defaultProjection);
const defaultPlan = createAirCollisionAssistanceAcceptancePlan({ request: defaultReq, projection: defaultProjection, acceptance: defaultAccept });
assert.strictEqual(defaultPlan.status, 'ready', defaultPlan.reason);
const defaultResult = apply(defaultSource, defaultPlan);
assert.strictEqual((defaultResult.match(/10, 20, 30, 40/g) || []).length, 1, 'complete declared-Default cohort writes its owner once');
assert.strictEqual(defaultPlan.counts.defaultWrites, 1); assert(defaultPlan.targets.some(target => target.groups.clsn1.decision === 'default-deduplicated'));
const incompleteDefaultAccept = acceptance(defaultProjection); incompleteDefaultAccept.targets[1].clsn1 = { mode: 'none', boxes: [] };
const incompleteDefault = createAirCollisionAssistanceAcceptancePlan({ request: defaultReq, projection: defaultProjection, acceptance: incompleteDefaultAccept });
assert.strictEqual(incompleteDefault.status, 'conflict'); assert(incompleteDefault.conflicts.some(item => item.kind === 'default-cohort-incomplete'));
const selectedDefaultAccept = acceptance(defaultProjection); selectedDefaultAccept.targets[0].clsn1.mode = 'selected-boxes';
const selectedDefault = createAirCollisionAssistanceAcceptancePlan({ request: defaultReq, projection: defaultProjection, acceptance: selectedDefaultAccept });
assert.strictEqual(selectedDefault.status, 'conflict', 'selected-box mode cannot change a shared declared Default');
const mixedDefaultAccept = acceptance(defaultProjection); mixedDefaultAccept.targets[1].clsn1.boxes[0].rect = [11, 21, 31, 41];
const mixedDefault = createAirCollisionAssistanceAcceptancePlan({ request: defaultReq, projection: defaultProjection, acceptance: mixedDefaultAccept });
assert.strictEqual(mixedDefault.status, 'conflict'); assert(mixedDefault.conflicts.some(item => item.kind === 'default-cohort-mixed'));
const lockedDefaultReq = request(defaultSource, { referenceElementIndex: 2, targetElementIndices: [0, 1], locks: { frames: [], boxes: [{ elementIndex: 1, groupKey: 'clsn1', slot: 0 }] } });
const lockedDefaultProjection = createAirCollisionAssistanceProposals(lockedDefaultReq), lockedDefaultAccept = acceptance(lockedDefaultProjection);
lockedDefaultAccept.targets[1].clsn1 = { mode: 'whole-group', boxes: [] };
assert.strictEqual(createAirCollisionAssistanceAcceptancePlan({ request: lockedDefaultReq, projection: lockedDefaultProjection, acceptance: lockedDefaultAccept }).status, 'conflict', 'any tied Default box lock rejects shared-owner acceptance');

const unfilled = '[Begin Action 100]\nClsn1: 2\nClsn1[0]=1,2,3,4\nClsn1[1]=5,6,7,8\n100,0,0,0,1\nClsn1: 2\nClsn1[0]=9,10,11,12\n100,1,0,0,1\n';
const unfilledReq = request(unfilled, { referenceElementIndex: 0 });
const unfilledProjection = createAirCollisionAssistanceProposals(unfilledReq);
const unfilledAccept = acceptance(unfilledProjection, 'selected-boxes');
const fillProposal = unfilledProjection.targets[0].groups.clsn1.proposals.find(item => item.target.slot === 1);
assert(fillProposal, 'reference allocated-unfilled slot is proposed');
const filled = createAirCollisionAssistanceAcceptancePlan({ request: unfilledReq, projection: unfilledProjection, acceptance: unfilledAccept });
assert.strictEqual(filled.status, 'ready', filled.reason); assert(apply(unfilled, filled).includes('Clsn1[1] = 5, 6, 7, 8'));

const appendGapAccept = acceptance(emptyBuilt.projection, 'selected-boxes');
appendGapAccept.targets[0].clsn1.boxes[0].slot = 2;
assert.strictEqual(createAirCollisionAssistanceAcceptancePlan({ request: request(emptySource), projection: emptyBuilt.projection, acceptance: appendGapAccept }).status, 'conflict');

const indexedSource = '[Begin Action 100]\nClsn1: 2\nClsn1[0]=1,2,3,4\nClsn1[1]=5,6,7,8\n100,0,0,0,1\nClsn1: 2\nClsn1[0]=9,10,11,12\nClsn1[1]=13,14,15,16\n100,1,0,0,1\n';
const indexedReq = request(indexedSource, { ...nightly });
const indexedProjection = createAirCollisionAssistanceProposals(indexedReq), indexedAccept = acceptance(indexedProjection, 'selected-boxes', { '1|clsn1|1': [-5, -6, 5, 6] });
const indexedPlan = createAirCollisionAssistanceAcceptancePlan({ request: indexedReq, projection: indexedProjection, acceptance: indexedAccept });
assert.strictEqual(indexedPlan.status, 'ready', indexedPlan.reason); assert(apply(indexedSource, indexedPlan).includes('Clsn1[1]=-5, -6, 5, 6'));

const independentSource = `[Begin Action 100]
Clsn1: 1
Clsn1[0]=1,2,3,4
Clsn2: 1
Clsn2[0]=5,6,7,8
100,0,0,0,1
Clsn1: 1
Clsn1[0]=11,12,13,14
Clsn2: 1
Clsn2[0]=15,16,17,18
100,1,0,0,1`;
const independentReq = request(independentSource, { groups: { clsn1: { enabled: true, cap: 1 }, clsn2: { enabled: true, cap: 1 } } });
const independentProjection = createAirCollisionAssistanceProposals(independentReq), independentAccept = acceptance(independentProjection);
independentAccept.targets[0].clsn1 = { mode: 'none', boxes: [] };
const independentPlan = createAirCollisionAssistanceAcceptancePlan({ request: independentReq, projection: independentProjection, acceptance: independentAccept });
assert.strictEqual(independentPlan.status, 'ready', independentPlan.reason); const independentResult = apply(independentSource, independentPlan);
assert(independentResult.includes('Clsn1[0]=11,12,13,14') && independentResult.includes('Clsn2[0]=5, 6, 7, 8'), 'Clsn1 and Clsn2 acceptance remain independent');

const cappedSource = '[Begin Action 100]\nClsn1: 2\nClsn1[0]=1,2,3,4\nClsn1[1]=5,6,7,8\n100,0,0,0,1\nClsn1: 1\nClsn1[0]=9,10,11,12\n100,1,0,0,1\n';
const cappedReq = request(cappedSource, { groups: { clsn1: { enabled: true, cap: 1 }, clsn2: { enabled: false, cap: 0 } } }), cappedProjection = createAirCollisionAssistanceProposals(cappedReq), cappedPlan = createAirCollisionAssistanceAcceptancePlan({ request: cappedReq, projection: cappedProjection, acceptance: acceptance(cappedProjection) });
assert.strictEqual(cappedPlan.status, 'ready'); assert.strictEqual(cappedPlan.counts.omittedByCap, 1); assert(cappedPlan.limitations.some(item => /omitted.*cap/i.test(item)));

const lockedReq = request(inheritedSource, { locks: { frames: [1], boxes: [] } }), lockedProjection = createAirCollisionAssistanceProposals(lockedReq), lockedAccept = acceptance(lockedProjection);
lockedAccept.targets[0].clsn1 = { mode: 'whole-group', boxes: [] };
assert.strictEqual(createAirCollisionAssistanceAcceptancePlan({ request: lockedReq, projection: lockedProjection, acceptance: lockedAccept }).status, 'conflict');
const boxLockedReq = request(localSource, { locks: { frames: [], boxes: [{ elementIndex: 1, groupKey: 'clsn1', slot: 0 }] } }), boxLockedProjection = createAirCollisionAssistanceProposals(boxLockedReq), boxLockedAccept = acceptance(boxLockedProjection, 'selected-boxes');
boxLockedAccept.targets[0].clsn1.boxes = [{ slot: 0, rect: [-1, -2, 1, 2] }];
assert.strictEqual(createAirCollisionAssistanceAcceptancePlan({ request: boxLockedReq, projection: boxLockedProjection, acceptance: boxLockedAccept }).status, 'conflict', 'locked proposals cannot be selected');
const missingLockReq = request(localSource, { locks: { frames: [], boxes: [{ elementIndex: 1, groupKey: 'clsn1', slot: 9 }] } }), missingLockProjection = createAirCollisionAssistanceProposals(missingLockReq), missingLockAccept = acceptance(missingLockProjection, 'selected-boxes');
const missingLockPlan = createAirCollisionAssistanceAcceptancePlan({ request: missingLockReq, projection: missingLockProjection, acceptance: missingLockAccept });
assert.strictEqual(missingLockPlan.status, 'conflict'); assert.match(missingLockPlan.reason, /conflict/i, 'partial C13 missing-lock evidence cannot become a ready C18 plan');
const incompleteWhole = acceptance(localProjection); incompleteWhole.targets[0].clsn1.boxes = [];
assert.strictEqual(createAirCollisionAssistanceAcceptancePlan({ request: localRequest, projection: localProjection, acceptance: incompleteWhole }).status, 'conflict', 'whole-group mode enumerates every shown unlocked proposal');
const disabledSelected = acceptance(localProjection); disabledSelected.targets[0].clsn2 = { mode: 'selected-boxes', boxes: [{ slot: 0, rect: [0, 0, 1, 1] }] };
assert.strictEqual(createAirCollisionAssistanceAcceptancePlan({ request: localRequest, projection: localProjection, acceptance: disabledSelected }).status, 'unavailable');

const staleProjection = createAirCollisionAssistanceProposals(localRequest);
const staleRequest = { ...localRequest, text: `${localSource}\n; drift`, sourceFingerprint: sha(`${localSource}\n; drift`) };
assert.strictEqual(createAirCollisionAssistanceAcceptancePlan({ request: staleRequest, projection: staleProjection, acceptance: acceptance(staleProjection) }).status, 'unavailable');
const staleAcceptance = acceptance(localProjection); staleAcceptance.proposalHash = 'A'.repeat(64);
assert.strictEqual(createAirCollisionAssistanceAcceptancePlan({ request: localRequest, projection: localProjection, acceptance: staleAcceptance }).status, 'unavailable');
const mutableProjection = JSON.parse(JSON.stringify(localProjection));
assert.strictEqual(createAirCollisionAssistanceAcceptancePlan({ request: localRequest, projection: mutableProjection, acceptance: localAcceptance }).status, 'unavailable');
assert.strictEqual(createAirCollisionAssistanceAcceptancePlan({ request: localRequest, projection: localProjection, acceptance: localAcceptance, extra: true }).status, 'unavailable');
const unsortedAcceptance = acceptance(defaultProjection); unsortedAcceptance.targets.reverse();
assert.strictEqual(createAirCollisionAssistanceAcceptancePlan({ request: defaultReq, projection: defaultProjection, acceptance: unsortedAcceptance }).status, 'unavailable');
const changedAcceptance = acceptance(localProjection, 'selected-boxes', { '1|clsn1|0': [-7, -9, 7, 9] });
const changedAcceptancePlan = createAirCollisionAssistanceAcceptancePlan({ request: localRequest, projection: localProjection, acceptance: changedAcceptance });
assert.notStrictEqual(changedAcceptancePlan.acceptanceHash, localPlan.acceptanceHash, 'reviewed rectangle changes acceptance identity');

for (const readOnlyFixture of [
  { text: '[Begin Action 10]\nClsn1:1\nClsn1[0]=1,2,3,4\n10,0,0,0,1\n[Begin Action 20]\nCopy Action 10\n', action: 20 },
  { text: '[Begin Action 20]\n; empty\n[Begin Action 21]\nClsn1:1\nClsn1[0]=1,2,3,4\n21,0,0,0,1\n', action: 20 },
  { text: '[Begin Action 20]\nClsn1:1\nClsn1[0]=1,2,3,4\n20,0,0,0,1\n[Begin Action 20]\n20,1,0,0,1\n', action: 20 }
]) {
  const readOnlyReq = request(readOnlyFixture.text, { action: readOnlyFixture.action, referenceElementIndex: 0, targetElementIndices: [0] });
  const readOnlyProjection = createAirCollisionAssistanceProposals(readOnlyReq), readOnlyPlan = createAirCollisionAssistanceAcceptancePlan({ request: readOnlyReq, projection: readOnlyProjection, acceptance: acceptance(readOnlyProjection) });
  assert.notStrictEqual(readOnlyPlan.status, 'ready', 'Copy Action, fallthrough, and duplicate Action evidence never receive an acceptance patch');
}

const caller = { request: localRequest, projection: localProjection, acceptance: localAcceptance }, callerBefore = JSON.stringify(caller); createAirCollisionAssistanceAcceptancePlan(caller); assert.strictEqual(JSON.stringify(caller), callerBefore, 'planner never mutates caller evidence');
let getterRuns = 0; const accessor = {}; Object.defineProperty(accessor, 'request', { enumerable: true, get() { getterRuns += 1; return localRequest; } }); assert.strictEqual(createAirCollisionAssistanceAcceptancePlan(accessor).status, 'unavailable'); assert.strictEqual(getterRuns, 0);
let proxyRuns = 0; const proxy = new Proxy({}, { ownKeys() { proxyRuns += 1; throw new Error('trap'); } }); assert.strictEqual(createAirCollisionAssistanceAcceptancePlan(proxy).status, 'unavailable'); assert.strictEqual(proxyRuns, 0);
const cyclic = {}; cyclic.self = cyclic; assert.strictEqual(createAirCollisionAssistanceAcceptancePlan(cyclic).status, 'unavailable');
assert.strictEqual(createAirCollisionAssistanceAcceptancePlan({ request: { text: 'x'.repeat(MAX_SOURCE_BYTES + 1) }, projection: Object.freeze({}), acceptance: {} }).status, 'unavailable');
const tooManyTargets = { ...localProjection, targets: Array.from({ length: MAX_TARGETS + 1 }, () => localProjection.targets[0]) }; Object.freeze(tooManyTargets.targets); Object.freeze(tooManyTargets);
assert.strictEqual(createAirCollisionAssistanceAcceptancePlan({ request: localRequest, projection: tooManyTargets, acceptance: { proposalHash: localProjection.proposalHash, targets: [] } }).status, 'unavailable');
let manyFrames = '[Begin Action 100]\nClsn1:1\nClsn1[0]=1,2,3,4\n'; for (let index = 0; index <= MAX_TARGETS; index += 1) manyFrames += `100,${index},0,0,1\n`;
const manyReq = request(manyFrames, { targetElementIndices: Array.from({ length: MAX_TARGETS + 1 }, (_, index) => index) }), manyProjection = createAirCollisionAssistanceProposals(manyReq);
assert.strictEqual(createAirCollisionAssistanceAcceptancePlan({ request: manyReq, projection: manyProjection, acceptance: acceptance(manyProjection) }).status, 'conflict', 'the browser target cap fails closed without a partial plan');
let overProposalSource = '[Begin Action 100]\nClsn1: 65\n'; for (let index = 0; index < 65; index += 1) overProposalSource += `Clsn1[${index}]=${index},0,${index + 1},1\n`; overProposalSource += '100,0,0,0,1\n';
const overProposalReq = request(overProposalSource, { targetElementIndices: [0], locks: { frames: [0], boxes: [] } }), overProposalProjection = createAirCollisionAssistanceProposals(overProposalReq);
assert.notStrictEqual(createAirCollisionAssistanceAcceptancePlan({ request: overProposalReq, projection: overProposalProjection, acceptance: acceptance(overProposalProjection) }).status, 'ready', 'a group above the 64-proposal cap never yields a partial ready plan');
let workBoundSource = '[Begin Action 100]\nClsn1:64\n'; for (let index = 0; index < 64; index += 1) workBoundSource += `Clsn1[${index}]=${index},0,${index + 1},1\n`; workBoundSource += `100,0,0,0,1\n;${'w'.repeat(2 * 1024 * 1024)}\n`;
const workBoundReq = request(workBoundSource, { targetElementIndices: [0] }), workBoundProjection = createAirCollisionAssistanceProposals(workBoundReq), workBoundPlan = createAirCollisionAssistanceAcceptancePlan({ request: workBoundReq, projection: workBoundProjection, acceptance: acceptance(workBoundProjection) });
assert.strictEqual(workBoundPlan.status, 'conflict'); assert(workBoundPlan.conflicts.some(item => item.kind === 'rebuild-work-cap' && item.estimatedBytes > MAX_REBUILD_WORK_BYTES), 'rebuild-work cap rejects expensive valid evidence before per-box rebuilding');
const preflightSource = `;${'p'.repeat(MAX_SOURCE_BYTES - 2)}\n`, preflightReq = request(preflightSource, { targetElementIndices: Array.from({ length: MAX_TARGETS }, (_, index) => index), groups: { clsn1: { enabled: false, cap: 0 }, clsn2: { enabled: false, cap: 0 } } });
const preflightPlan = createAirCollisionAssistanceAcceptancePlan({ request: preflightReq, projection: Object.freeze({}), acceptance: {} });
assert.strictEqual(preflightPlan.status, 'conflict'); assert(preflightPlan.conflicts.some(item => item.kind === 'rebuild-work-cap' && item.phase === 'proposal-regeneration'), 'large-source many-target all-none work is rejected before C13 proposal regeneration or projection validation');

const wideGap = `;${'x'.repeat(MAX_PATCH_BYTES + 128)}\n`;
const wideSource = `[Begin Action 100]\nClsn1:1\nClsn1[0]=1,2,3,4\n100,0,0,0,1\n${wideGap}Clsn1:1\nClsn1[0]=5,6,7,8\n100,1,0,0,1\n`;
const wideReq = request(wideSource, { targetElementIndices: [0, 1] }), wideProjection = createAirCollisionAssistanceProposals(wideReq), wideAccept = acceptance(wideProjection, 'selected-boxes', { '0|clsn1|0': [-1, -2, 3, 4], '1|clsn1|0': [-5, -6, 7, 8] });
assert.strictEqual(createAirCollisionAssistanceAcceptancePlan({ request: wideReq, projection: wideProjection, acceptance: wideAccept }).status, 'conflict', 'a contiguous baseline patch spanning more than 1 MiB fails closed');
const longRect = '-9007199254740991,-9007199254740991,9007199254740991,9007199254740991', shortRect = '0, 0, 1, 1';
const oneSided = count => `[Begin Action 100]\nClsn1:1\nClsn1[0]=${longRect}\n100,0,0,0,1\n;${'q'.repeat(count)}\nClsn1:1\nClsn1[0]=${longRect}\n100,1,0,0,1\n`;
const seedSource = oneSided(0), seedFinal = seedSource.replaceAll(longRect, shortRect), seedDiff = diffPatch(seedSource, seedFinal), oneSidedFill = MAX_PATCH_BYTES + 32 - Buffer.byteLength(seedDiff.before, 'utf8');
const oneSidedSource = oneSided(oneSidedFill), oneSidedFinal = oneSidedSource.replaceAll(longRect, shortRect), oneSidedDiff = diffPatch(oneSidedSource, oneSidedFinal);
assert(Buffer.byteLength(oneSidedDiff.before, 'utf8') > MAX_PATCH_BYTES && Buffer.byteLength(oneSidedDiff.replacement, 'utf8') <= MAX_PATCH_BYTES, 'fixture isolates the baseline-side 1 MiB boundary');
const oneSidedReq = request(oneSidedSource, { targetElementIndices: [0, 1] }), oneSidedProjection = createAirCollisionAssistanceProposals(oneSidedReq), oneSidedAccept = acceptance(oneSidedProjection, 'selected-boxes', { '0|clsn1|0': [0, 0, 1, 1], '1|clsn1|0': [0, 0, 1, 1] });
assert.strictEqual(createAirCollisionAssistanceAcceptancePlan({ request: oneSidedReq, projection: oneSidedProjection, acceptance: oneSidedAccept }).status, 'conflict', 'an over-cap baseline span is rejected even when the replacement alone is under cap');

for (const result of [localPlan, exactNoop, emptyBuilt.plan, inheritedPlan, defaultPlan, indexedPlan]) {
  const serialized = JSON.stringify(result);
  for (const forbidden of ['routeToken', 'workspaceEdit', 'applyEdit', 'saveDocument']) assert(!serialized.includes(forbidden));
}

console.log('AIR selective collision acceptance is deterministic, merge-only, ownership-safe, bounded, and mutation-free');
