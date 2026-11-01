'use strict';

const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const vm = require('vm');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {};
  if (request === './air_viewer' && /air_docking_workspace\.js$/.test(parent?.filename || '')) return { parseAir: () => [], inferCharacterFiles: () => ({}), collisionRuntimeOptions: () => ({}), collisionRuntimeDraftEntries: () => [] };
  return originalLoad.call(this, request, parent, isMain);
};
const { buildModel, html, exactCollisionQueryConditionRequest, collisionQueryStateCandidates, buildCollisionQueryConditionReview, queueCollisionQueryConditionReview, invalidateCollisionQueryConditionReview } = require('../src/air_docking_workspace');
Module._load = originalLoad;

const sha = value => crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').toUpperCase();
const airPath = path.resolve('/char/main.air'), statePath = path.resolve('/char/main.zss'), cnsPath = path.resolve('/char/legacy.cns'), defPath = path.resolve('/char/char.def'), fingerprint = 'A'.repeat(64);
const airText = '[Begin Action 200]\nClsn1: 1\nClsn1[0] = -4,-5,6,7\nClsn2: 1\nClsn2[0] = -8,-9,12,13\n0,0,0,0,1\n';
const stateText = '[StateDef 200]\nif time > 0 { changeAnim{value: 200} }\nelse if ctrl { changeState{value: 0} }\n[Function Helper()]\nif life > 0 { return 1 }\n[StateDef -2]\nignoreHitPause if roundState = 2 { changeState{value: 0} }\n[StateDef map(dynamic)]\n';
const cnsText = '[StateDef 900]\n[State 900]\ntype = ChangeState\nvalue = 0\n';
const airDocument = { fileName: airPath, isClosed: false, isDirty: true, version: 9, getText: () => airText };
const workspace = { textDocuments: [airDocument], openTextDocument: async () => airDocument };
const runtimeOptions = () => ({ target: { channel: 'nightly', buildId: 'verified' }, targetBuildId: 'verified', capabilityFingerprint: fingerprint, allowIndexed: true, dummyReferenceDecision: true, allocationDecision: { capabilityId: 'collision.air-index-allocation', enabled: true, status: 'supported', capabilityFingerprint: fingerprint } });
const source = Object.freeze({ filename: statePath, text: stateText, sourceHash: sha(stateText), syntax: 'zss', available: true, open: true, dirty: true, version: 4 });
const cns = Object.freeze({ filename: cnsPath, text: cnsText, sourceHash: sha(cnsText), syntax: 'cns', available: true, open: false, dirty: false, version: null });
const evidence = Object.freeze({ sources: Object.freeze([source, cns]), inventoryHash: sha('inventory'), capabilityFingerprint: fingerprint, capability: Object.freeze({ target: 'nightly', decision: 'supported', fingerprint, indexed: true, dummy: true }), defAuthority: Object.freeze({ path: defPath, hash: sha('def'), version: null, dirty: false, open: false }) });
const services = { workspace, collisionRuntimeOptions: runtimeOptions, readRuntimePlan: () => ({ entries: [] }), collisionRuntimeDraftEntries: () => [], collisionQueryConditionEvidence: async () => evidence };
const record = () => ({ panel: { active: true }, airSourceAvailable: true, data: { airPath, ownerDef: defPath }, referenceContext: { defPath, generation: 4 }, collisionGeneration: 0, collisionEpoch: 0, propertyEpoch: 0, queryConditionEpoch: 0, queryConditionQueue: Promise.resolve(), collisionAuthorities: new Map(), consumedCollisionRoutes: new Set() });
const draft = Object.freeze({ family: 'queries', kind: 'ClsnOverlap', ownerGroup: 'Dummy', target: 'Clsn2', player: 'p2, ID', projectileListIndex: 0 });
const request = (phase, extra = {}) => Object.freeze({ type: 'reviewCollisionQueryCondition', request: 1, phase, action: 200, elementIndex: 0, groupKey: 'clsn1', index: 0, draft, ...extra });
function clientFunction(source, name) { const start = source.indexOf(`function ${name}(`), open = source.indexOf('{', start); assert(start >= 0 && open >= 0, `${name} is present in the generated client`); let depth = 0; for (let index = open; index < source.length; index += 1) { if (source[index] === '{') depth += 1; else if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1); } throw new Error(`unterminated ${name}`); }

(async () => {
  assert(exactCollisionQueryConditionRequest(request('states')));
  for (const bad of [
    { ...request('states'), extra: true },
    { ...request('states'), phase: 'plan' },
    { ...request('states'), draft: { ...draft, player: 'x\ny' } },
    { ...request('states'), index: -1 }
  ]) assert.strictEqual(exactCollisionQueryConditionRequest(bad), null);
  let traps = 0; const proxy = new Proxy({}, { ownKeys() { traps += 1; return []; }, get() { traps += 1; }, getPrototypeOf() { traps += 1; return Object.prototype; } }); assert.strictEqual(exactCollisionQueryConditionRequest(proxy), null); assert.strictEqual(traps, 0);

  const inventory = collisionQueryStateCandidates(evidence);
  assert.strictEqual(inventory.public.length, 2, 'static positive and negative ZSS StateDefs are selectable');
  assert.strictEqual(inventory.stats.cnsSourcesExcluded, 1); assert.strictEqual(inventory.stats.dynamicStatesExcluded, 1);
  assert(inventory.public.every(item => !Object.prototype.hasOwnProperty.call(item, 'sourcePath') && !Object.prototype.hasOwnProperty.call(item, 'snapshot')));
  const tooManyStateText = Array.from({ length: 257 }, (_, index) => `[StateDef ${index}]`).join('\n'), tooManyStates = collisionQueryStateCandidates({ ...evidence, sources: [Object.freeze({ ...source, text: tooManyStateText, sourceHash: sha(tooManyStateText) })] });
  assert(tooManyStates.error); assert.deepStrictEqual(tooManyStates.public, []); assert.deepStrictEqual(tooManyStates.all, [], 'a source cap failure publishes no partial StateDef inventory');
  const tooManySourcesEvidence = { ...evidence, sources: Array.from({ length: 129 }, (_, index) => Object.freeze({ ...source, filename: path.resolve(`/char/source-${index}.zss`) })) }, tooManySources = collisionQueryStateCandidates(tooManySourcesEvidence);
  assert(tooManySources.error); assert.strictEqual(tooManySources.stats.assignedSources, 129); assert.deepStrictEqual(tooManySources.public, [], 'the exported inventory enforces the signed 128-source cap');
  let evidenceTraps = 0; const hostileEvidence = new Proxy({}, { ownKeys() { evidenceTraps += 1; return []; }, get() { evidenceTraps += 1; }, getPrototypeOf() { evidenceTraps += 1; return Object.prototype; } }), hostileInventory = collisionQueryStateCandidates(hostileEvidence); assert(hostileInventory.error); assert.strictEqual(evidenceTraps, 0, 'malformed proxy evidence is rejected without executing traps');

  const states = await buildCollisionQueryConditionReview(record(), request('states'), services);
  assert.strictEqual(states.status, 'ready', states.reason); assert.strictEqual(states.states.length, 2); assert.strictEqual(states.anchors.length, 0); assert.strictEqual(states.plan, null);
  const stateId = states.states.find(item => item.stateNumber === 200).id;
  const anchors = await buildCollisionQueryConditionReview(record(), request('anchors', { stateId }), services);
  assert.strictEqual(anchors.status, 'ready', anchors.reason); assert.deepStrictEqual(anchors.anchors.map(item => item.kind), ['if', 'else-if'], 'Function condition never leaks into the selected StateDef');
  const anchorId = anchors.anchors[0].id;
  const planned = await buildCollisionQueryConditionReview(record(), request('plan', { stateId, anchorId, review: true }), services);
  assert.strictEqual(planned.status, 'ready', planned.reason); assert.strictEqual(planned.plan.status, 'ready'); assert.strictEqual(planned.plan.operation.kind, 'and-condition'); assert.match(planned.plan.preview.after, /clsnOverlap\(Dummy, p2, ID, Clsn2\)/); assert.deepStrictEqual(planned.plan.effects, { filesystem: false, editor: false, clipboard: false, command: false, route: false, mutationAuthority: false });
  const { _authorityInput: internalAuthorityInput, ...publicPlanned } = planned; assert(internalAuthorityInput, 'ready plans retain private issuance evidence for the host queue'); const publicWire = JSON.stringify(publicPlanned); for (const forbidden of [statePath, stateText, 'snapshot', 'token', 'sourcePath']) assert(!publicWire.includes(forbidden), `public response omits ${forbidden}`);
  assert.strictEqual((planned.plan.limitations || []).some(item => /no Apply/i.test(item)), true, 'the pure plan itself still grants no mutation authority');
  const missingFingerprint = await buildCollisionQueryConditionReview(record(), request('states'), { ...services, collisionQueryConditionEvidence: async () => ({ ...evidence, capabilityFingerprint: '' }) });
  assert.strictEqual(missingFingerprint.status, 'unresolved'); assert.strictEqual(missingFingerprint.states.length, 0, 'missing capability evidence fails closed before exposing destinations');
  const excessiveSourceBuild = await buildCollisionQueryConditionReview(record(), request('states'), { ...services, collisionQueryConditionEvidence: async () => tooManySourcesEvidence });
  assert.strictEqual(excessiveSourceBuild.status, 'unresolved'); assert.strictEqual(excessiveSourceBuild.states.length, 0); assert.match(excessiveSourceBuild.reason, /128-source cap/i, 'a substituted service seam cannot bypass the source cap');

  const staleState = await buildCollisionQueryConditionReview(record(), request('anchors', { stateId: 'B'.repeat(64) }), services); assert.strictEqual(staleState.status, 'conflict'); assert.strictEqual(staleState.anchors.length, 0);
  const staleAnchor = await buildCollisionQueryConditionReview(record(), request('plan', { stateId, anchorId: 'B'.repeat(64), review: true }), services); assert.strictEqual(staleAnchor.status, 'conflict'); assert.strictEqual(staleAnchor.plan, null);

  const published = [], queuedRecord = record(); await queueCollisionQueryConditionReview(queuedRecord, request('states'), payload => published.push(payload), services); assert.strictEqual(published.length, 1); assert.strictEqual(published[0].type, 'collisionQueryConditionReview'); assert.strictEqual(published[0].action, 200); assert.strictEqual(queuedRecord.destinationApplyAuthority, null);
  const priorEpoch = queuedRecord.queryConditionEpoch; queuedRecord.destinationApplyAuthority = { token: 'stale' }; invalidateCollisionQueryConditionReview(queuedRecord); assert.strictEqual(queuedRecord.queryConditionEpoch, priorEpoch + 1); assert.strictEqual(queuedRecord.destinationApplyAuthority, null);
  let release, evidenceCalls=0; const latePublished = [], lateRecord = record(), pending = queueCollisionQueryConditionReview(lateRecord, request('states'), payload => latePublished.push(payload), { ...services, collisionQueryConditionEvidence: async () => evidenceCalls++?evidence:new Promise(resolve => { release = () => resolve(evidence); }) }); for(let spin=0;!release&&spin<20;spin+=1)await Promise.resolve(); assert.strictEqual(typeof release,'function'); lateRecord.queryConditionEpoch += 1; release(); await pending; assert.strictEqual(latePublished.length,0,'superseded query inventory cannot publish');

  const model = buildModel(airPath, airText, '', { available: true, items: [], occurrences: [], issues: [] }, { view: 'collisions', collisionMode: 'properties', action: 200, propertyState: { family: 'queries', kind: 'ClsnOverlap', ownerGroup: 'Clsn1', check: 'Clsn2', player: 'p2, ID', projectileListIndex: 0 } }), output = html(model);
  assert(output.includes('Condition destination') && output.includes('queryStateSlider') && output.includes('queryAnchorSlider') && output.includes('Review AND condition'));
  const conditionMarkup = output.slice(output.indexOf("queryConditionReview.innerHTML='"), output.indexOf("';collisionProperties.insertBefore", output.indexOf("queryConditionReview.innerHTML='")));
  assert(conditionMarkup.includes('queryConditionApplyButton') && conditionMarkup.includes('class="hidden" disabled'), 'Condition destination contains one compact hidden-by-default Apply control');
  assert(!/<button[^>]*>[^<]*(?:Copy|Open|Save)/i.test(conditionMarkup), 'Condition destination has no copy, navigation, or save button');
  assert(!/vscode\.setState\([^)]*queryCondition/i.test(output), 'query condition selection is not persisted');

  const browserScript = output.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1], sent = [];
  const node = (value = '') => ({ value, textContent: '', max: '0', disabled: false, open: true, dataset: {}, children: [], classList: { hidden: false, toggle(_name, hidden) { this.hidden = hidden; }, add(name) { if (name === 'hidden') this.hidden = true; }, remove(name) { if (name === 'hidden') this.hidden = false; } }, append(child) { this.children.push(child); }, addEventListener() {} });
  const stateA = 'C'.repeat(64), stateB = 'D'.repeat(64), anchorA = 'E'.repeat(64), queryClient = {
    queryConditionRequest: 4, queryConditionResponse: { status: 'ready', reason: '<unsafe reason>', selectedStateId: stateA, selectedAnchorId: anchorA, states: [{ id: stateA, label: '<img src=x>' }, { id: stateB, label: 'Second' }], anchors: [{ id: anchorA, label: '<script>bad()</script>' }], stats: {}, plan: null },
    queryConditionReview: node(), queryConditionState: node(), queryConditionAnchor: node(), queryStateSlider: node(), queryAnchorSlider: node(), queryStatePrevious: node(), queryStateNext: node(), queryAnchorPrevious: node(), queryAnchorNext: node(), queryConditionReviewButton: node(), queryConditionApplyButton: node(), queryConditionStatus: node(), queryConditionDiff: node(), queryConditionApplyAuthority: null, queryConditionPendingApply: -1,
    propertyFamily: node('queries'), propertyKind: node('ClsnOverlap'), propertyOwner: node('Dummy'), propertyCheck: node('Clsn2'), propertyPlayer: node('p2, ID'), propertyProjectileIndex: node('0'), propertyProjection: { status: 'ready', draftHash: 'F'.repeat(64) },
    primaryView: 'collisions', collisionMode: 'properties', selected: { number: 200 }, collisionElement: 0, collisionGroup: 'clsn1', collisionSlot: 0,
    document: { createElement: () => node() }, vscode: { postMessage: message => sent.push(JSON.parse(JSON.stringify(message))) }, Math, Number, String, Promise
  };
  vm.createContext(queryClient); for (const name of ['queryDraft', 'clearQueryConditionApply', 'invalidateQueryCondition', 'fillQuerySelect', 'renderQueryCondition', 'requestQueryCondition', 'setQueryStatePosition', 'setQueryAnchorPosition', 'applyQueryCondition', 'handleQueryConditionMessage']) vm.runInContext(clientFunction(browserScript, name), queryClient);
  queryClient.renderQueryCondition();
  assert.strictEqual(queryClient.queryConditionState.children[1].textContent, '<img src=x>'); assert.strictEqual(queryClient.queryConditionState.children[1].innerHTML, undefined, 'hostile labels are assigned only through textContent');
  assert.strictEqual(queryClient.queryStateSlider.max, '2'); assert.strictEqual(queryClient.queryStateSlider.value, '1'); assert.strictEqual(queryClient.queryConditionReviewButton.disabled, false);
  queryClient.setQueryStatePosition(0); assert.strictEqual(queryClient.queryConditionState.value, ''); assert.strictEqual(queryClient.queryStateSlider.value, '0', 'slider position zero is the explicit placeholder');
  queryClient.queryConditionResponse = { status: 'ready', states: [{ id: stateA, label: 'One' }, { id: stateB, label: 'Two' }], anchors: [], stats: {} }; queryClient.setQueryStatePosition(99); assert.strictEqual(queryClient.queryConditionState.value, stateB); assert.strictEqual(sent.at(-1).phase, 'anchors', 'StateDef arrows/sliders clamp and request only the selected exact state');
  queryClient.queryConditionResponse = { status: 'ready', selectedStateId: stateB, states: [{ id: stateB, label: 'Two' }], selectedAnchorId: anchorA, anchors: [{ id: anchorA, label: 'if' }], stats: {} }; queryClient.renderQueryCondition();
  const accepted = { type: 'collisionQueryConditionReview', request: queryClient.queryConditionRequest, action: 200, elementIndex: 0, groupKey: 'clsn1', index: 0, propertyDraftHash: 'F'.repeat(64), status: 'ready', states: [], anchors: [], plan: null };
  assert.strictEqual(queryClient.handleQueryConditionMessage({ ...accepted, request: accepted.request - 1 }), false); assert.strictEqual(queryClient.handleQueryConditionMessage({ ...accepted, propertyDraftHash: '0'.repeat(64) }), false); assert.strictEqual(queryClient.handleQueryConditionMessage(accepted), true, 'only the exact current binding can repaint the generated client');
  const inventoryBindingHash = '1'.repeat(64), planHash = '2'.repeat(64), readyReview = { ...accepted, selectedStateId: stateA, selectedAnchorId: anchorA, inventoryBindingHash, states: [{ id: stateA, label: 'State' }], anchors: [{ id: anchorA, label: 'if' }], plan: { status: 'ready', planHash, preview: {}, limitations: [] }, applyAuthority: { token: 'b'.repeat(48), applyRequest: 41, label: 'Apply reviewed AND condition…' } };
  assert.strictEqual(queryClient.handleQueryConditionMessage(readyReview), true); assert.strictEqual(queryClient.queryConditionApplyButton.classList.hidden, false); assert.strictEqual(queryClient.queryConditionApplyButton.disabled, false, 'Apply appears only with an exact ready plan and public one-use authority');
  queryClient.applyQueryCondition(); const applyMessage = sent.at(-1); assert.deepStrictEqual(JSON.parse(JSON.stringify(applyMessage)), { type: 'applyCollisionQueryCondition', request: 41, token: 'b'.repeat(48), action: 200, propertyDraftHash: 'F'.repeat(64), stateId: stateA, anchorId: anchorA, inventoryBindingHash, planHash }); assert.strictEqual(queryClient.queryConditionApplyButton.classList.hidden, true);
  const newerReview = { ...readyReview, applyAuthority: { token: 'd'.repeat(48), applyRequest: 42, label: 'Apply reviewed AND condition…' } }; assert.strictEqual(queryClient.handleQueryConditionMessage(newerReview), true); assert.strictEqual(queryClient.queryConditionApplyAuthority.token, 'd'.repeat(48));
  assert.strictEqual(queryClient.handleQueryConditionMessage({ type: 'collisionQueryConditionApplied', ...applyMessage, status: 'cancelled', message: 'old modal' }), false); assert.strictEqual(queryClient.queryConditionApplyAuthority.token, 'd'.repeat(48), 'a stale modal completion cannot clear a newer reviewed authority');
  let coercions = 0; const hostileNumber = { [Symbol.toPrimitive]() { coercions += 1; return 4; } }; assert.strictEqual(queryClient.handleQueryConditionMessage({ ...readyReview, request: hostileNumber }), false); assert.strictEqual(queryClient.handleQueryConditionMessage({ ...readyReview, request: String(queryClient.queryConditionRequest) }), false); assert.strictEqual(queryClient.handleQueryConditionMessage({ type: 'collisionQueryConditionApplied', ...applyMessage, request: hostileNumber }), false); assert.strictEqual(coercions, 0, 'generated-client correlations never coerce hostile response values'); assert.strictEqual(queryClient.queryConditionApplyAuthority.token, 'd'.repeat(48));
  const beforeInvalidate = queryClient.queryConditionRequest; queryClient.invalidateQueryCondition(true); assert.strictEqual(queryClient.queryConditionRequest, beforeInvalidate + 1); assert.strictEqual(queryClient.queryConditionReview.open, false); assert.strictEqual(queryClient.queryConditionReviewButton.disabled, true); assert.strictEqual(sent.at(-1).type, 'invalidateCollisionQueryConditionReview');
  assert(output.includes("if(previous==='properties'&&collisionMode!=='properties'){if(typeof invalidateQueryCondition==='function')invalidateQueryCondition(true);revokeProperty()}") && output.includes("if(leavingCollisions){if(typeof invalidateQueryCondition==='function')invalidateQueryCondition(true);"), 'leaving Properties or the Collisions primary view clears the dedicated query lifecycle');
  assert(output.includes("for(const control of [propertyFamily,propertyKind,propertyOwner,propertyCheck,propertyPlayer,propertyProjectileIndex])control.addEventListener('change',()=>invalidateQueryCondition"), 'every binding-changing query control clears the dedicated review');

  console.log('AIR docking query-condition review is compact, source-authoritative, bounded, stale-safe, and read-only');
})().catch(error => { console.error(error); process.exitCode = 1; });
