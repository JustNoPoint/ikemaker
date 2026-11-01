'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { deepFreeze } = require('../src/air_collision_inspection_model');
const { createAirCollisionAssistanceProposals } = require('../src/air_collision_assistance_model');
const { createAirCollisionAssistanceAcceptancePlan } = require('../src/air_collision_assistance_acceptance_plan');
const {
  SCHEMA, TOKEN, MAX_SOURCE_BYTES, MAX_PATCH_BYTES, MAX_TARGETS, MAX_BOXES_PER_GROUP, MAX_ACCEPTED_BOXES, MAX_CHANGED_GROUPS,
  MAX_REBUILD_WORK_BYTES, MAX_EXCERPT_BYTES, MAX_PUBLIC_BYTES, semanticHash, readyPlan, bindingMatchesPlan, publicReview,
  issueAirCollisionAssistanceApplyAuthority, consumeAirCollisionAssistanceApplyAuthority, revokeAirCollisionAssistanceApplyAuthority,
  sameAirCollisionAssistanceApplyReview
} = require('../src/air_collision_assistance_apply_authority');

const sha = value => crypto.createHash('sha256').update(value, 'utf8').digest('hex').toUpperCase();
const capability = 'C'.repeat(64), fixedToken = 'a'.repeat(48), airPath = path.normalize(path.resolve('C:/characters/Hero/main.air'));
const source = '[Begin Action 100]\nClsn1: 1\nClsn1[99]=-10,-20,10,20 ; reference\n100,0,0,0,1\nClsn1: 2\nClsn1[7]=-1,-2,1,2 ; change\nClsn1[8]=20,21,22,23 ; retain\n100,1,0,0,1';
const stable = { target: { channel: 'stable', version: '1.0' }, allocationDecision: { enabled: false, status: 'unsupported', capabilityFingerprint: capability } };
function request(text = source, changes = {}) { return { text, sourceFingerprint: sha(text), capabilityFingerprint: capability, ...stable, action: 100, actionOccurrence: 0, referenceElementIndex: 0, targetElementIndices: [1], groups: { clsn1: { enabled: true, cap: 64 }, clsn2: { enabled: false, cap: 0 } }, locks: { frames: [], boxes: [] }, ...changes }; }
function acceptance(projection, rect = [-8, -9, 8, 9]) { return { proposalHash: projection.proposalHash, targets: projection.targets.map(target => ({ elementIndex: target.elementIndex, clsn1: { mode: 'selected-boxes', boxes: target.groups.clsn1.proposals.map(item => ({ slot: item.target.slot, rect: rect.slice() })) }, clsn2: { mode: 'none', boxes: [] } })) }; }
function build(req = request()) { const projection = createAirCollisionAssistanceProposals(req), plan = createAirCollisionAssistanceAcceptancePlan({ request: req, projection, acceptance: acceptance(projection) }); return { req, projection, plan }; }
function binding(plan, changes = {}, sourceText = source) { return deepFreeze({ airPath, documentVersion: 7, sourceWasOpen: true, sourceWasDirty: true, sourceFingerprint: plan.sourceFingerprint, sourceLength: sourceText.length, resultingFingerprint: plan.resultingFingerprint, planHash: plan.planHash, patchHash: semanticHash(plan.patch), proposalHash: plan.proposalHash, acceptanceHash: plan.acceptanceHash, capabilityFingerprint: plan.capabilityFingerprint, action: plan.selection.action, actionOccurrence: plan.selection.actionOccurrence, referenceElementIndex: plan.selection.referenceElementIndex, targetElementIndices: plan.selection.targetElementIndices.slice(), allocationProfile: plan.selection.allocationProfile, sessionId: 'air-assistance-session:1', assistanceEpoch: 12, assistanceReviewEpoch: 13, ...changes }); }
function rehash(plan, mutate) { const copy = JSON.parse(JSON.stringify(plan)); delete copy.planHash; mutate(copy); return deepFreeze({ ...copy, planHash: semanticHash(copy) }); }
function requestAuthority(plan, changes = {}, sourceText = source) { return { plan, binding: binding(plan, {}, sourceText), sourceText, ...changes }; }

const { plan } = build();
assert.strictEqual(plan.status, 'ready', plan.reason); assert.strictEqual(readyPlan(plan), true, 'an exact C18A ready plan is independently accepted');
const issued = issueAirCollisionAssistanceApplyAuthority(requestAuthority(plan), () => fixedToken);
assert(issued?.authority && issued?.public); assert.strictEqual(issued.authority.schema, SCHEMA); assert.strictEqual(issued.authority.version, 1); assert.strictEqual(issued.authority.token, fixedToken); assert(TOKEN.test(issued.authority.token));
assert(Object.isFrozen(issued.authority) && Object.isFrozen(issued.authority.binding) && Object.isFrozen(issued.authority.plan));
assert.deepStrictEqual(Object.keys(issued.public).sort(), ['action','before','changeCount','label','replacement','targetCount','token'].sort()); assert(!JSON.stringify(issued.public).includes(airPath) && !('plan' in issued.public) && !('patch' in issued.public)); assert(Buffer.byteLength(JSON.stringify(issued.public), 'utf8') <= MAX_PUBLIC_BYTES);
assert.deepStrictEqual(issued.authority.binding, binding(plan)); assert.strictEqual(bindingMatchesPlan(binding(plan), plan), true);

for (const changes of [{ sourceWasDirty: false }, { documentVersion: 0 }]) assert(issueAirCollisionAssistanceApplyAuthority(requestAuthority(plan, { binding: binding(plan, changes) }), () => fixedToken), `valid open-document binding accepts ${Object.keys(changes)[0]}`);
assert(issueAirCollisionAssistanceApplyAuthority(requestAuthority(plan, { binding: binding(plan, { sourceWasOpen: false, sourceWasDirty: false, documentVersion: null }) }), () => fixedToken), 'a genuinely closed source uses null version and false dirty state');
for (const changes of [{ sourceWasOpen: false, sourceWasDirty: true, documentVersion: null }, { sourceWasOpen: false, sourceWasDirty: false, documentVersion: 0 }, { sourceWasOpen: true, documentVersion: null }, { documentVersion: -1 }]) assert.strictEqual(issueAirCollisionAssistanceApplyAuthority(requestAuthority(plan, { binding: binding(plan, changes) }), () => fixedToken), null, `invalid document shape fails: ${JSON.stringify(changes)}`);

const record = { assistanceApplyAuthority: issued.authority };
assert.strictEqual(consumeAirCollisionAssistanceApplyAuthority(record, 'bad'), null); assert.strictEqual(record.assistanceApplyAuthority, null, 'invalid token consumes before validation');
record.assistanceApplyAuthority = issued.authority; assert.strictEqual(consumeAirCollisionAssistanceApplyAuthority(record, fixedToken), issued.authority); assert.strictEqual(consumeAirCollisionAssistanceApplyAuthority(record, fixedToken), null, 'replay fails');
record.assistanceApplyAuthority = issued.authority; assert.strictEqual(consumeAirCollisionAssistanceApplyAuthority(record, Symbol('hostile')), null); assert.strictEqual(record.assistanceApplyAuthority, null, 'nonprimitive token also consumes first');
record.assistanceApplyAuthority = issued.authority; revokeAirCollisionAssistanceApplyAuthority(record); assert.strictEqual(record.assistanceApplyAuthority, null);
assert.throws(() => issueAirCollisionAssistanceApplyAuthority(requestAuthority(plan), () => 'A'.repeat(48)), /lowercase 48-hex/); assert.throws(() => issueAirCollisionAssistanceApplyAuthority(requestAuthority(plan), () => 12), /lowercase 48-hex/); assert.throws(() => issueAirCollisionAssistanceApplyAuthority(requestAuthority(plan, { activeToken: fixedToken }), () => fixedToken), /cannot reuse/);
const randomOne = issueAirCollisionAssistanceApplyAuthority(requestAuthority(plan)).authority.token, randomTwo = issueAirCollisionAssistanceApplyAuthority(requestAuthority(plan, { activeToken: randomOne })).authority.token; assert.notStrictEqual(randomOne, randomTwo, 'fresh authorities use distinct random tokens');
const publicOne = { ...issued.public, token: '' }, publicTwo = { ...issueAirCollisionAssistanceApplyAuthority(requestAuthority(plan), () => 'b'.repeat(48)).public, token: '' }; assert.deepStrictEqual(publicOne, publicTwo, 'public projection is deterministic apart from token');

assert.strictEqual(sameAirCollisionAssistanceApplyReview(issued.authority, plan, binding(plan), source), true);
const contextDrifts = [
  { airPath: path.normalize(path.resolve('C:/characters/Hero/other.air')) }, { documentVersion: 8 }, { sourceWasOpen: false, sourceWasDirty: false, documentVersion: null }, { sourceWasDirty: false },
  { sessionId: 'other' }, { assistanceEpoch: 99 }, { assistanceReviewEpoch: 99 }
];
for (const drift of contextDrifts) {
  assert.strictEqual(sameAirCollisionAssistanceApplyReview(issued.authority, plan, binding(plan, drift), source), false, `review context drift fails: ${Object.keys(drift)[0]}`);
  assert(issueAirCollisionAssistanceApplyAuthority(requestAuthority(plan, { binding: binding(plan, drift) }), () => fixedToken), `a new exact authority can bind valid context: ${Object.keys(drift)[0]}`);
}
const planBindingDrifts = [
  { sourceFingerprint: 'D'.repeat(64) }, { resultingFingerprint: 'D'.repeat(64) }, { planHash: 'D'.repeat(64) }, { patchHash: 'D'.repeat(64) }, { proposalHash: 'D'.repeat(64) }, { acceptanceHash: 'D'.repeat(64) }, { capabilityFingerprint: 'D'.repeat(64) },
  { action: 101 }, { actionOccurrence: 1 }, { referenceElementIndex: 1 }, { targetElementIndices: [0] }, { allocationProfile: 'indexed-label' }
];
for (const drift of planBindingDrifts) { assert.strictEqual(sameAirCollisionAssistanceApplyReview(issued.authority, plan, binding(plan, drift), source), false, `review drift fails: ${Object.keys(drift)[0]}`); assert.strictEqual(issueAirCollisionAssistanceApplyAuthority(requestAuthority(plan, { binding: binding(plan, drift) }), () => fixedToken), null, `issuance drift fails: ${Object.keys(drift)[0]}`); }
for (const drift of [{ airPath: 'relative.air' }, { airPath: `${path.parse(airPath).root}bad\0.air` }, { sessionId: '' }, { sessionId: 'bad session' }, { assistanceEpoch: -1 }, { assistanceReviewEpoch: Number.MAX_SAFE_INTEGER + 1 }, { sourceLength: source.length - 1 }]) assert.strictEqual(issueAirCollisionAssistanceApplyAuthority(requestAuthority(plan, { binding: binding(plan, drift) }), () => fixedToken), null);

const invalidPlans = [
  ['noop', value => { value.status = 'noop'; value.ready = false; value.patch = null; value.reason = 'noop'; }],
  ['conflict', value => { value.status = 'conflict'; value.ready = false; value.reason = 'conflict'; value.conflicts = [{ kind: 'conflict', message: 'x' }]; value.patch = null; }],
  ['unavailable', value => { value.status = 'unavailable'; value.ready = false; value.reason = 'unavailable'; value.patch = null; }],
  ['source hash', value => { value.sourceFingerprint = 'invalid'; }], ['capability hash', value => { value.capabilityFingerprint = 'invalid'; }], ['proposal hash', value => { value.proposalHash = 'invalid'; }], ['acceptance hash', value => { value.acceptanceHash = 'invalid'; }], ['result hash', value => { value.resultingFingerprint = 'invalid'; }],
  ['selection order', value => { value.selection.targetElementIndices = [2, 1]; value.counts.targets = 2; value.targets = [value.targets[0], { ...value.targets[0], elementIndex: 1 }]; }], ['allocation profile', value => { value.selection.allocationProfile = 'guessed'; }],
  ['target cap', value => { value.counts.targets = MAX_TARGETS + 1; }], ['accepted cap', value => { value.counts.acceptedBoxes = MAX_ACCEPTED_BOXES + 1; }], ['changed cap', value => { value.counts.changedGroups = MAX_CHANGED_GROUPS + 1; }], ['work cap', value => { value.counts.estimatedRebuildBytes = MAX_REBUILD_WORK_BYTES + 1; }],
  ['accepted count evidence', value => { value.counts.acceptedBoxes += 1; }], ['omission count evidence', value => { value.counts.omittedByCap += 1; }], ['changed group evidence', value => { value.counts.changedGroups = 2; }],
  ['slot cap', value => { value.targets[0].groups.clsn1.slots = Array.from({ length: MAX_BOXES_PER_GROUP + 1 }, (_, slot) => ({ ...value.targets[0].groups.clsn1.slots[0], slot, provenance: { ...value.targets[0].groups.clsn1.slots[0].provenance, slot } })); }],
  ['provenance extra', value => { value.targets[0].groups.clsn1.slots[0].provenance.extra = true; }], ['provenance target', value => { value.targets[0].groups.clsn1.slots[0].provenance.elementIndex = 1; }], ['adjusted evidence', value => { value.targets[0].groups.clsn1.slots[0].adjusted = false; }], ['ownership kind', value => { value.ownershipDecisions = [{ kind: 'invented' }]; }], ['review operation', value => { value.reviewHunks[0].operation = 'delete'; }], ['review identity', value => { value.reviewHunks[0].slot = 1; }],
  ['effect', value => { value.effects.editor = true; }], ['conflict', value => { value.conflicts = [{ kind: 'x', message: 'x' }]; }], ['extra leaf', value => { value.hostile = true; }],
  ['deletion', value => { value.patch.replacement = ''; }], ['whole document', value => { value.patch = { start: 0, end: source.length, before: source, replacement: 'replacement' }; }], ['offset', value => { value.patch.start = MAX_SOURCE_BYTES + 1; value.patch.end = MAX_SOURCE_BYTES + 1; value.patch.before = ''; }]
];
for (const [label, mutate] of invalidPlans) { const invalid = rehash(plan, mutate); assert.strictEqual(readyPlan(invalid), false, `${label} rejected after a matching planHash`); assert.strictEqual(issueAirCollisionAssistanceApplyAuthority(requestAuthority(invalid, { binding: binding(invalid) }), () => fixedToken), null); }
const disguisedWholeDocument = rehash(plan, value => { value.sourceFingerprint = 'D'.repeat(64); value.patch = { start: 0, end: source.length, before: source, replacement: 'hostile replacement' }; });
assert.strictEqual(readyPlan(disguisedWholeDocument), true, 'a plan alone cannot prove the hostile fingerprint source length');
assert.strictEqual(issueAirCollisionAssistanceApplyAuthority(requestAuthority(disguisedWholeDocument, { binding: binding(disguisedWholeDocument) }), () => fixedToken), null, 'exact source evidence rejects a disguised whole-document replacement');
assert.strictEqual(issueAirCollisionAssistanceApplyAuthority(requestAuthority(plan, { sourceText: `${source}\n` }), () => fixedToken), null, 'source snapshot drift fails closed');

const inheritedSource = `[Begin Action 100]\nClsn1Default: 2\nClsn1[0]=1,2,3,4\nClsn1[1]=5,6,7,8\n100,0,0,0,1\n100,1,0,0,1`;
const inheritedReq = request(inheritedSource), inheritedProjection = createAirCollisionAssistanceProposals(inheritedReq);
const inheritedPlan = createAirCollisionAssistanceAcceptancePlan({ request: inheritedReq, projection: inheritedProjection, acceptance: acceptance(inheritedProjection, [-4, -3, 4, 3]) });
assert.strictEqual(inheritedPlan.status, 'ready', inheritedPlan.reason); assert.strictEqual(inheritedPlan.counts.materializedGroups, 1);
assert.strictEqual(readyPlan(inheritedPlan), true, 'inherited-local plan passes independent structure validation');
assert.strictEqual(bindingMatchesPlan(binding(inheritedPlan, {}, inheritedSource), inheritedPlan), true, 'inherited-local binding matches plan');
assert(issueAirCollisionAssistanceApplyAuthority(requestAuthority(inheritedPlan, {}, inheritedSource), () => fixedToken), 'exact inherited-local ownership gains authority');
for (const mutate of [
  value => { value.ownershipDecisions[0].elementIndex = 0; },
  value => { value.ownershipDecisions[0].groupKey = 'clsn2'; }
]) { const drift = rehash(inheritedPlan, mutate); assert.strictEqual(readyPlan(drift), false, 'materialization identity drift is rejected'); }
const inheritedLineDrift = rehash(inheritedPlan, value => { value.ownershipDecisions[0].sharedOwnerLine += 1; });
assert.strictEqual(readyPlan(inheritedLineDrift), true); assert.strictEqual(issueAirCollisionAssistanceApplyAuthority(requestAuthority(inheritedLineDrift, {}, inheritedSource), () => fixedToken), null, 'shared-owner line must name the exact source declaration');

const defaultSource = `[Begin Action 100]\nClsn1Default: 1\nClsn1[0]=1,2,3,4\n100,0,0,0,1\n100,1,0,0,1\nClsn1: 1\nClsn1[0]=10,20,30,40\n100,2,0,0,1`;
const defaultReq = request(defaultSource, { referenceElementIndex: 2, targetElementIndices: [0, 1] }), defaultProjection = createAirCollisionAssistanceProposals(defaultReq);
const defaultAcceptance = acceptance(defaultProjection, [-8, -9, 8, 9]); for (const target of defaultAcceptance.targets) target.clsn1.mode = 'whole-group';
const defaultPlan = createAirCollisionAssistanceAcceptancePlan({ request: defaultReq, projection: defaultProjection, acceptance: defaultAcceptance });
assert.strictEqual(defaultPlan.status, 'ready', defaultPlan.reason); assert.strictEqual(defaultPlan.counts.defaultWrites, 1);
assert(issueAirCollisionAssistanceApplyAuthority(requestAuthority(defaultPlan, {}, defaultSource), () => fixedToken), 'exact shared-default cohort gains authority');
for (const mutate of [
  value => { value.ownershipDecisions[0].ownerElementIndex = 1; },
  value => { value.ownershipDecisions[0].groupKey = 'clsn2'; },
  value => { value.ownershipDecisions[0].tiedElementIndices = [0]; }
]) { const drift = rehash(defaultPlan, mutate); assert.strictEqual(readyPlan(drift), false, 'default owner/group/cohort drift is rejected'); }
const omittedInheritor = rehash(defaultPlan, value => {
  const removed = value.targets.find(target => target.elementIndex === 1);
  value.selection.targetElementIndices = [0]; value.targets = value.targets.filter(target => target.elementIndex === 0); value.counts.targets = 1;
  value.counts.acceptedBoxes -= removed.groups.clsn1.slots.length + removed.groups.clsn2.slots.length;
  value.ownershipDecisions[0].tiedElementIndices = [0];
});
assert.strictEqual(readyPlan(omittedInheritor), true, 'shape-only evidence cannot enumerate an omitted real inheritor');
assert.strictEqual(issueAirCollisionAssistanceApplyAuthority(requestAuthority(omittedInheritor, {}, defaultSource), () => fixedToken), null, 'exact AIR ownership rejects an omitted shared-default inheritor');
const defaultLineDrift = rehash(defaultPlan, value => { value.ownershipDecisions[0].ownerLine += 1; });
assert.strictEqual(readyPlan(defaultLineDrift), true); assert.strictEqual(issueAirCollisionAssistanceApplyAuthority(requestAuthority(defaultLineDrift, {}, defaultSource), () => fixedToken), null, 'default-owner line must name the exact source declaration');
const staleHash = deepFreeze({ ...plan, counts: deepFreeze({ ...plan.counts, retainedBoxes: plan.counts.retainedBoxes + 1 }) }); assert.strictEqual(readyPlan(staleHash), false, 'semantic drift with stale planHash is rejected');
const mutable = JSON.parse(JSON.stringify(plan)); assert.strictEqual(readyPlan(mutable), false); const shallow = Object.freeze({ ...plan, selection: { ...plan.selection } }); assert.strictEqual(readyPlan(shallow), false);
let getterRuns = 0; const accessor = {}; Object.defineProperty(accessor, 'plan', { enumerable: true, get() { getterRuns += 1; return plan; } }); assert.strictEqual(issueAirCollisionAssistanceApplyAuthority(accessor, () => fixedToken), null); assert.strictEqual(getterRuns, 0);
let proxyRuns = 0; const proxy = new Proxy({}, { ownKeys() { proxyRuns += 1; throw new Error('trap'); }, get() { proxyRuns += 1; throw new Error('trap'); } }); assert.strictEqual(issueAirCollisionAssistanceApplyAuthority(proxy, () => fixedToken), null); assert.strictEqual(proxyRuns, 0);
const cyclic = {}; cyclic.self = cyclic; assert.strictEqual(issueAirCollisionAssistanceApplyAuthority(cyclic, () => fixedToken), null);
const mutableBinding = JSON.parse(JSON.stringify(binding(plan))); assert.strictEqual(issueAirCollisionAssistanceApplyAuthority({ plan, binding: mutableBinding, sourceText: source }, () => fixedToken), null);

const largeReplacement = 'é'.repeat(5000), excerptPlan = rehash(plan, value => { value.patch.replacement = largeReplacement; value.resultingFingerprint = 'E'.repeat(64); }); assert.strictEqual(readyPlan(excerptPlan), true); const multibyte = publicReview(fixedToken, excerptPlan).replacement; assert.strictEqual(Buffer.byteLength(multibyte.text, 'utf8'), MAX_EXCERPT_BYTES); assert.strictEqual(multibyte.omittedBytes, Buffer.byteLength(largeReplacement, 'utf8') - MAX_EXCERPT_BYTES); assert(!multibyte.text.endsWith('\uFFFD'));
const atPatchCap = rehash(plan, value => { value.patch.replacement = 'x'.repeat(MAX_PATCH_BYTES); value.resultingFingerprint = 'F'.repeat(64); }); assert.strictEqual(readyPlan(atPatchCap), true); const overPatchCap = rehash(plan, value => { value.patch.replacement = 'x'.repeat(MAX_PATCH_BYTES + 1); value.resultingFingerprint = 'F'.repeat(64); }); assert.strictEqual(readyPlan(overPatchCap), false);

const sourceText = fs.readFileSync(path.join(__dirname, '../src/air_collision_assistance_apply_authority.js'), 'utf8');
for (const forbidden of ['require(\'vscode\')', 'WorkspaceEdit', 'applyEdit', 'writeFile', 'save()', 'executeCommand', 'showWarningMessage']) assert(!sourceText.includes(forbidden), `authority module contains no mutation dependency: ${forbidden}`);
assert(!sourceText.includes('air_collision_apply_authority') && !sourceText.includes('air_collision_edit_apply_authority'), 'the multi-target authority does not broaden either existing authority module');
assert(MAX_PATCH_BYTES < MAX_SOURCE_BYTES && MAX_TARGETS === 128 && MAX_BOXES_PER_GROUP === 64); assert(MAX_PUBLIC_BYTES >= 2 * MAX_EXCERPT_BYTES);

console.log('AIR collision Assistance Apply authority is exact, frozen, bounded, one-use, replay-safe, and non-mutating');
