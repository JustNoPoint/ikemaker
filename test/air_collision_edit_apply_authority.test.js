'use strict';

const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const { createAirCollisionInspection, deepFreeze } = require('../src/air_collision_inspection_model');
const { createAirCollisionEditImpact } = require('../src/air_collision_edit_impact_model');
const { createAirCollisionEditPlan } = require('../src/air_collision_edit_plan');
const { TOKEN, MAX_SOURCE_OFFSET, MAX_EXCERPT, MAX_PUBLIC_BYTES, readyPlan, issueAirCollisionEditApplyAuthority, consumeAirCollisionEditApplyAuthority, revokeAirCollisionEditApplyAuthority, sameAirCollisionEditApplyReview } = require('../src/air_collision_edit_apply_authority');

const capability = 'D'.repeat(64), fixedToken = 'a'.repeat(48), source = '[Begin Action 100]\nClsn1Default: 1\nClsn1[0]=1,2,3,4\n100,0,0,0,1\n100,1,0,0,1\nClsn1: 1\nClsn1[0]=5,6,7,8\n100,2,0,0,1\n';
const options = { target: { channel: 'stable', version: '1.0' }, allocationDecision: { enabled: false, status: 'unsupported', capabilityFingerprint: capability }, capabilityFingerprint: capability };
function makePlan(elementIndex, slot, operation) { const inspection = createAirCollisionInspection({ text: source, action: 100, elementIndex, ...options }), intent = { kind: operation.kind, ...(operation.rect ? { rect: operation.rect } : {}) }, impact = createAirCollisionEditImpact({ text: source, inspection, capabilityFingerprint: capability, action: 100, actionOccurrence: 0, elementIndex, groupKey: 'clsn1', slot, intent }); return createAirCollisionEditPlan({ text: source, inspection, impact, capabilityFingerprint: capability, action: 100, actionOccurrence: 0, elementIndex, groupKey: 'clsn1', slot, operation }); }
function binding(plan, changes = {}) { return deepFreeze({ airPath: path.normalize(path.resolve('C:/character/main.air')), documentVersion: 7, sourceFingerprint: plan.sourceFingerprint, planHash: plan.planHash, inspectionHash: plan.inspectionHash, impactHash: plan.impactHash, resultingFingerprint: plan.resultingFingerprint, capabilityFingerprint: plan.capabilityFingerprint, action: plan.selection.action, actionOccurrence: plan.selection.actionOccurrence, elementIndex: plan.selection.elementIndex, groupKey: plan.selection.groupKey, slot: plan.selection.slot, operation: JSON.parse(JSON.stringify(plan.selection.operation)), sessionId: 'air-session-1', editEpoch: 4, ...changes }); }
function request(plan, changes = {}) { return { plan, binding: binding(plan), ...changes }; }
function canonical(value) { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])); return value; }
function semanticHash(value) { return crypto.createHash('sha256').update(JSON.stringify(canonical(value)), 'utf8').digest('hex').toUpperCase(); }
function rehashPlan(plan, mutate) { const draft = JSON.parse(JSON.stringify(plan)); mutate(draft); delete draft.planHash; return deepFreeze({ ...draft, planHash: semanticHash(draft) }); }

const plans = [makePlan(1, 0, { kind: 'edit', rect: [8,9,-8,-9] }), makePlan(1, 1, { kind: 'add', rect: [2,3,4,5] }), makePlan(2, 0, { kind: 'delete' }), makePlan(2, 0, { kind: 'return-to-default' })];
for (const plan of plans) { assert.strictEqual(plan.status, 'ready'); assert.strictEqual(readyPlan(plan), true); const issued = issueAirCollisionEditApplyAuthority(request(plan), () => fixedToken); assert(issued, `${plan.selection.operation.kind} issues authority`); assert(Object.isFrozen(issued.authority) && Object.isFrozen(issued.authority.binding) && Object.isFrozen(issued.public)); assert.strictEqual(issued.authority.binding.operation.kind, plan.selection.operation.kind); assert(Buffer.byteLength(JSON.stringify(issued.public), 'utf8') <= MAX_PUBLIC_BYTES); const publicText = JSON.stringify(issued.public); assert(!publicText.includes(path.basename(binding(plan).airPath)) && !publicText.includes('patch') && !publicText.includes('applyEdit') && !publicText.includes('command') && !publicText.includes('clipboard') && !publicText.includes('filesystem')); }
assert.deepStrictEqual(plans[0].selection.operation.rect, [-8,-9,8,9]);

const editPlan = plans[0], issued = issueAirCollisionEditApplyAuthority(request(editPlan), () => fixedToken);
assert.strictEqual(issued.public.token, fixedToken); assert.strictEqual(issued.public.label, 'Apply reviewed AIR edit'); assert.match(issued.public.target, /Action 100.*element 2.*Clsn1\[0\].*edit/);
const record = { collisionEditApplyAuthority: issued.authority };
assert.strictEqual(consumeAirCollisionEditApplyAuthority(record, 'bad'), null); assert.strictEqual(record.collisionEditApplyAuthority, null, 'host clears authority before hostile token validation');
for (const hostileToken of [Object.create(null), { [Symbol.toPrimitive]() { throw new Error('must not coerce token'); } }]) { record.collisionEditApplyAuthority = issued.authority; assert.doesNotThrow(() => assert.strictEqual(consumeAirCollisionEditApplyAuthority(record, hostileToken), null)); assert.strictEqual(record.collisionEditApplyAuthority, null, 'host clears authority before inspecting a nonprimitive token'); }
record.collisionEditApplyAuthority = issued.authority; assert.strictEqual(consumeAirCollisionEditApplyAuthority(record, fixedToken), issued.authority); assert.strictEqual(consumeAirCollisionEditApplyAuthority(record, fixedToken), null, 'authority consumes once');
record.collisionEditApplyAuthority = issued.authority; revokeAirCollisionEditApplyAuthority(record); assert.strictEqual(record.collisionEditApplyAuthority, null); revokeAirCollisionEditApplyAuthority(record);

const replacement = issueAirCollisionEditApplyAuthority(request(editPlan, { activeToken: fixedToken }), () => 'b'.repeat(48)); assert(replacement); record.collisionEditApplyAuthority = replacement.authority; assert.strictEqual(consumeAirCollisionEditApplyAuthority(record, fixedToken), null, 'replacing authority invalidates the prior token');
assert.throws(() => issueAirCollisionEditApplyAuthority(request(editPlan), () => 'A'.repeat(48)), /lowercase 48-hex/); assert.throws(() => issueAirCollisionEditApplyAuthority(request(editPlan, { activeToken: fixedToken }), () => fixedToken), /reuse/);
const randomOne = issueAirCollisionEditApplyAuthority(request(editPlan)), randomTwo = issueAirCollisionEditApplyAuthority(request(editPlan)); assert(TOKEN.test(randomOne.public.token) && TOKEN.test(randomTwo.public.token) && randomOne.public.token !== randomTwo.public.token);
const publicOne = { ...issueAirCollisionEditApplyAuthority(request(editPlan), () => '1'.repeat(48)).public, token: '' }, publicTwo = { ...issueAirCollisionEditApplyAuthority(request(editPlan), () => '2'.repeat(48)).public, token: '' }; assert.deepStrictEqual(publicOne, publicTwo, 'bounded public review is deterministic apart from token');

assert.strictEqual(sameAirCollisionEditApplyReview(issued.authority, editPlan, binding(editPlan)), true);
const driftCases = [
  { airPath: path.normalize(path.resolve('C:/character/other.air')) }, { documentVersion: 8 }, { sourceFingerprint: 'E'.repeat(64) }, { capabilityFingerprint: 'E'.repeat(64) }, { sessionId: 'other' }, { editEpoch: 5 }, { action: 101 }, { actionOccurrence: 1 }, { elementIndex: 2 }, { groupKey: 'clsn2' }, { slot: 1 }, { operation: { kind: 'edit', rect: [-7,-9,8,9] } }, { planHash: 'E'.repeat(64) }, { inspectionHash: 'E'.repeat(64) }, { impactHash: 'E'.repeat(64) }, { resultingFingerprint: 'E'.repeat(64) }
];
for (const changes of driftCases) assert.strictEqual(sameAirCollisionEditApplyReview(issued.authority, editPlan, binding(editPlan, changes)), false, `drift fails: ${Object.keys(changes)[0]}`);
assert.strictEqual(sameAirCollisionEditApplyReview(issued.authority, plans[1], binding(plans[1])), false, 'another ready plan cannot match the authority');

const planMismatchCases = driftCases.filter(changes => !['airPath', 'documentVersion', 'sessionId', 'editEpoch'].includes(Object.keys(changes)[0]));
for (const changes of planMismatchCases) assert.strictEqual(issueAirCollisionEditApplyAuthority({ plan: editPlan, binding: binding(editPlan, changes) }, () => fixedToken), null, `issue rejects plan-to-binding mismatch: ${Object.keys(changes)[0]}`);
for (const invalid of [{ airPath: 'relative.air' }, { airPath: `${path.parse(path.resolve('.')).root}bad\0.air` }, { documentVersion: -1 }, { sessionId: 'bad session' }, { editEpoch: -1 }]) assert.strictEqual(issueAirCollisionEditApplyAuthority({ plan: editPlan, binding: binding(editPlan, invalid) }, () => fixedToken), null);

const mutablePlan = JSON.parse(JSON.stringify(editPlan)); assert.strictEqual(readyPlan(mutablePlan), false); assert.strictEqual(issueAirCollisionEditApplyAuthority({ plan: mutablePlan, binding: binding(editPlan) }, () => fixedToken), null);
const staleSemantic = deepFreeze({ ...editPlan, impact: 'tampered' }); assert.strictEqual(readyPlan(staleSemantic), false);
const badEffects = JSON.parse(JSON.stringify(editPlan)); badEffects.effects.editor = true; const frozenBadEffects = deepFreeze(badEffects); assert.strictEqual(readyPlan(frozenBadEffects), false);
const badPatch = JSON.parse(JSON.stringify(editPlan)); badPatch.patch.end += 1; const frozenBadPatch = deepFreeze(badPatch); assert.strictEqual(readyPlan(frozenBadPatch), false);
const badContext = JSON.parse(JSON.stringify(editPlan)); badContext.context.before += 'x'.repeat(9000); const frozenBadContext = deepFreeze(badContext); assert.strictEqual(readyPlan(frozenBadContext), false);

const hostilePlans = [
  ['wrong schema', plan => { plan.schema = 'hostile.air-plan'; }],
  ['non-ready status', plan => { plan.status = 'conflict'; }],
  ['ready flag false', plan => { plan.ready = false; }],
  ['missing selection key', plan => { delete plan.selection.profile; }],
  ['extra selection key', plan => { plan.selection.hostile = true; }],
  ['wrong selection profile', plan => { plan.selection.profile = 'guessed-labels'; }],
  ['mismatched group label', plan => { plan.selection.group = 'Clsn2'; }],
  ['nonpositive frame line', plan => { plan.selection.frameLine = 0; }],
  ['untrusted ownership label', plan => { plan.ownership.kind = '<script>owner</script>'; }],
  ['malformed resulting fingerprint', plan => { plan.resultingFingerprint = 'a'.repeat(64); }]
];
for (const [label, mutate] of hostilePlans) { const hostile = rehashPlan(editPlan, mutate); assert.strictEqual(readyPlan(hostile), false, `${label} is rejected despite a matching canonical plan hash`); assert.strictEqual(issueAirCollisionEditApplyAuthority({ plan: hostile, binding: binding(hostile) }, () => fixedToken), null, `${label} cannot reach the public review`); }
const lowercasePlanHash = deepFreeze({ ...editPlan, planHash: editPlan.planHash.toLowerCase() }); assert.strictEqual(readyPlan(lowercasePlanHash), false, 'lowercase canonical plan hash is rejected');
const shortPlanHash = deepFreeze({ ...editPlan, planHash: 'A'.repeat(62) }); assert.strictEqual(readyPlan(shortPlanHash), false, 'short canonical plan hash is rejected');

const asciiReplacement = 'x'.repeat(MAX_EXCERPT + 808);
const asciiExcerptPlan = rehashPlan(editPlan, plan => { plan.patch.replacement = asciiReplacement; plan.context.replacement = asciiReplacement.slice(0, MAX_EXCERPT); plan.context.replacementOmitted = 808; plan.resultingFingerprint = '1'.repeat(64); });
assert.strictEqual(readyPlan(asciiExcerptPlan), true);
const asciiReview = issueAirCollisionEditApplyAuthority(request(asciiExcerptPlan), () => fixedToken).public.replacement;
assert.strictEqual(Buffer.byteLength(asciiReview.text, 'utf8'), MAX_EXCERPT); assert.strictEqual(asciiReview.omittedBytes, 808, 'ASCII omission is measured in bytes');

const multibyteReplacement = 'é'.repeat(5000), multibytePrefix = 'é'.repeat(MAX_EXCERPT / 2);
const multibyteExcerptPlan = rehashPlan(editPlan, plan => { plan.patch.replacement = multibyteReplacement; plan.context.replacement = multibytePrefix; plan.context.replacementOmitted = Buffer.byteLength(multibyteReplacement, 'utf8') - Buffer.byteLength(multibytePrefix, 'utf8'); plan.resultingFingerprint = '2'.repeat(64); });
assert.strictEqual(readyPlan(multibyteExcerptPlan), true);
const multibyteReview = issueAirCollisionEditApplyAuthority(request(multibyteExcerptPlan), () => fixedToken).public.replacement;
assert.strictEqual(Buffer.byteLength(multibyteReview.text, 'utf8'), MAX_EXCERPT); assert.strictEqual(multibyteReview.text, multibytePrefix, 'UTF-8 excerpt stops on a complete code point'); assert.strictEqual(multibyteReview.omittedBytes, 1808, 'multibyte omission is measured in bytes');
const oversizedMultibyteContext = rehashPlan(editPlan, plan => { plan.patch.replacement = 'é'.repeat(4097); plan.context.replacement = plan.patch.replacement; plan.context.replacementOmitted = 0; plan.resultingFingerprint = '3'.repeat(64); });
assert.strictEqual(readyPlan(oversizedMultibyteContext), false, 'context cap is enforced in UTF-8 bytes, not UTF-16 code units');

for (const offset of [MAX_SOURCE_OFFSET + 1, Number.MAX_SAFE_INTEGER]) { const hugeOffset = rehashPlan(editPlan, plan => { plan.patch.start = offset; plan.patch.end = offset; plan.patch.before = ''; }); assert.strictEqual(readyPlan(hugeOffset), false, `patch offset ${offset} is outside the planner source ceiling`); }

let getterRuns = 0; const accessor = {}; Object.defineProperty(accessor, 'plan', { enumerable: true, get() { getterRuns += 1; return editPlan; } }); assert.strictEqual(issueAirCollisionEditApplyAuthority(accessor, () => fixedToken), null); assert.strictEqual(getterRuns, 0);
let proxyRuns = 0; const proxy = new Proxy({}, { ownKeys() { proxyRuns += 1; throw new Error('trap'); }, get() { proxyRuns += 1; throw new Error('trap'); } }); assert.strictEqual(issueAirCollisionEditApplyAuthority(proxy, () => fixedToken), null); assert.strictEqual(proxyRuns, 0);
const cyclic = {}; cyclic.self = cyclic; assert.strictEqual(issueAirCollisionEditApplyAuthority(cyclic, () => fixedToken), null);
const mutableBinding = JSON.parse(JSON.stringify(binding(editPlan))); assert.strictEqual(issueAirCollisionEditApplyAuthority({ plan: editPlan, binding: mutableBinding }, () => fixedToken), null);
const caller = request(editPlan), callerBefore = JSON.stringify(caller); issueAirCollisionEditApplyAuthority(caller, () => fixedToken); assert.strictEqual(JSON.stringify(caller), callerBefore, 'authority issuance never mutates caller evidence');

console.log('AIR collision edit Apply authority is bounded, exact, one-use, replay-safe, and non-mutating');
