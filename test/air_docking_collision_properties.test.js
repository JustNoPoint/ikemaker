'use strict';

const assert = require('assert');
const path = require('path');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {};
  if (request === './air_viewer' && /air_docking_workspace\.js$/.test(parent?.filename || '')) return {
    parseAir: () => [], inferCharacterFiles: () => ({}), collisionRuntimeOptions: () => ({}), collisionRuntimeDraftEntries: () => []
  };
  return originalLoad.call(this, request, parent, isMain);
};
const { buildModel, html, MAX_PUBLIC_EXISTING_FIELDS, projectCollisionExistingFields, buildCollisionPropertyDraft, queueCollisionPropertyDraft, buildCollisionDestinationReview, queueCollisionDestinationReview, revokeCollisionDestinationApply, invalidateCollisionDestinationContext, applyCollisionDestinationReview } = require('../src/air_docking_workspace');
Module._load = originalLoad;
const dockingSource = require('fs').readFileSync(path.join(__dirname, '../src/air_docking_workspace.js'), 'utf8');

const airPath = path.resolve('/char/main.air');
const airText = '[Begin Action 200]\nClsn1: 2\nClsn1[0] = -4,-5,6,7\nClsn1[1] = 8,9,10,11\nClsn2: 1\nClsn2[0] = -8,-9,12,13\n0,0,0,0,1\n';
const fingerprint = 'A'.repeat(64);
const document = { fileName: airPath, isClosed: false, version: 9, getText: () => airText };
const workspace = { textDocuments: [document], openTextDocument: async () => document };
const nightly = () => ({
  target: { channel: 'nightly', buildId: 'verified' }, targetBuildId: 'verified', capabilityFingerprint: fingerprint,
  allowIndexed: true, dummyReferenceDecision: true,
  allocationDecision: { capabilityId: 'collision.air-index-allocation', enabled: true, status: 'supported', capabilityFingerprint: fingerprint }
});
const stable = () => ({
  target: { channel: 'stable', version: '1.0' }, targetBuildId: 'stable-1.0', capabilityFingerprint: fingerprint,
  allowIndexed: false, dummyReferenceDecision: false,
  allocationDecision: { capabilityId: 'collision.air-index-allocation', enabled: false, status: 'unsupported', capabilityFingerprint: fingerprint }
});
const services = runtime => ({ workspace, collisionRuntimeOptions: runtime, readRuntimePlan: () => ({ entries: [] }), collisionRuntimeDraftEntries: () => [] });
const makeRecord = () => ({ panel: { active: true }, airSourceAvailable: true, data: { airPath }, collisionGeneration: 0, collisionEpoch: 0, propertyEpoch: 0, collisionAuthorities: new Map(), consumedCollisionRoutes: new Set(), propertyQueue: Promise.resolve() });

(async () => {
  const exact = await buildCollisionPropertyDraft(makeRecord(), {
    action: 200, elementIndex: 0, groupKey: 'clsn1', index: 1,
    draft: { family: 'eligibility', kind: 'NotHitBy', attr: 'SCA, AP', time: 4, slot: 2, stack: true }
  }, services(nightly));
  assert.strictEqual(exact.projection.status, 'ready');
  assert.deepStrictEqual({ group: exact.projection.selection.group, index: exact.projection.selection.index }, { group: 'Clsn1', index: 1 });
  assert.match(exact.projection.recipe.preview.code, /clsn\.group: Clsn1; clsn\.index: 1/);

  const stableEligibility = await buildCollisionPropertyDraft(makeRecord(), {
    action: 200, elementIndex: 0, groupKey: 'clsn2', index: 0,
    draft: { family: 'eligibility', kind: 'HitBy' }
  }, services(stable));
  assert.strictEqual(stableEligibility.projection.status, 'unresolved', 'Stable 1.0 never receives invented indexed eligibility');
  const stableContact = await buildCollisionPropertyDraft(makeRecord(), {
    action: 200, elementIndex: 0, groupKey: 'clsn2', index: 0,
    draft: { family: 'contact', kind: 'ReversalDef', reversalAttr: 'SCA, AA', p2clsncheck: 'Clsn1', p2clsnrequire: 'None' }
  }, services(stable));
  assert.strictEqual(stableContact.projection.status, 'ready');
  assert.match(stableContact.projection.recipe.preview.notes.join(' '), /whole Clsn1 group/i);
  assert(!/clsn\.index/.test(stableContact.projection.recipe.preview.code), 'contact consumers must not claim selected-index ownership');

  const unknown = await buildCollisionPropertyDraft(makeRecord(), {
    action: 200, elementIndex: 0, groupKey: 'clsn1', index: 0,
    draft: { family: 'queries', kind: 'ClsnOverlap' }
  }, services(() => ({ target: null, targetBuildId: '', capabilityFingerprint: fingerprint, allowIndexed: false, dummyReferenceDecision: undefined, allocationDecision: null })));
  assert.strictEqual(unknown.projection.status, 'unresolved', 'an unresolved target fails closed');

  const nightlyDummyOwner = await buildCollisionPropertyDraft(makeRecord(), {
    action: 200, elementIndex: 0, groupKey: 'clsn1', index: 1,
    draft: { family: 'queries', kind: 'ClsnOverlap', ownerGroup: 'Dummy', target: 'Size', player: 'p2, ID' }
  }, services(nightly));
  assert.strictEqual(nightlyDummyOwner.projection.status, 'ready');
  assert.strictEqual(nightlyDummyOwner.projection.recipe.preview.code, 'clsnOverlap(Dummy, p2, ID, Size)');
  const stableDummyOwner = await buildCollisionPropertyDraft(makeRecord(), {
    action: 200, elementIndex: 0, groupKey: 'clsn1', index: 1,
    draft: { family: 'queries', kind: 'ClsnOverlap', ownerGroup: 'Dummy', target: 'Size', player: 'p2, ID' }
  }, services(stable));
  assert.strictEqual(stableDummyOwner.projection.status, 'unresolved');
  assert.match(stableDummyOwner.projection.recipe.reason, /same-fingerprint supporting Nightly/i);

  let release;
  const slowWorkspace = { textDocuments: [], openTextDocument: async () => new Promise(resolve => { release = () => resolve(document); }) };
  const record = makeRecord(), published = [];
  const old = queueCollisionPropertyDraft(record, { request: 1, action: 200, elementIndex: 0, groupKey: 'clsn1', index: 0, draft: { family: 'queries', kind: 'ClsnOverlap' } }, payload => published.push(payload), { ...services(nightly), workspace: slowWorkspace });
  await Promise.resolve(); await Promise.resolve();
  record.propertyEpoch += 1;
  release(); await old;
  assert.strictEqual(published.length, 0, 'a superseded property request cannot publish stale output');

  let releaseCollision;
  const secondRecord = makeRecord(), secondPublished = [];
  const pending = queueCollisionPropertyDraft(secondRecord, { request: 2, action: 200, elementIndex: 0, groupKey: 'clsn1', index: 0, draft: { family: 'contact', kind: 'HitDef', attr: 'S, NA' } }, payload => secondPublished.push(payload), { ...services(nightly), workspace: { textDocuments: [], openTextDocument: async () => new Promise(resolve => { releaseCollision = () => resolve(document); }) } });
  await Promise.resolve(); await Promise.resolve();
  secondRecord.collisionEpoch += 1;
  releaseCollision(); await pending;
  assert.strictEqual(secondPublished.length, 0, 'a changed collision selection invalidates a pending property projection');

  const statePath = path.resolve('/char/main.zss'), cnsPath = path.resolve('/char/legacy.cns'), stateText = '[StateDef 200]\nhitDef{\n\tattr: S, NA;\n}\n[StateDef 201]\nchangeAnim{value: 201}\n[StateDef map(dynamicState)]\np2, hitDef{attr: S, NA;}\n', cnsStateText = '[StateDef 900]\n[State 900, End]\ntype = ChangeState\nvalue = 0\n';
  const cleanContext = () => ({ defPath: path.resolve('/char/char.def'), defDirty: false, inventoryComplete: true, assignedSources: [statePath, cnsPath], sources: [
    { available: true, dirty: false, filename: statePath, syntax: 'zss', text: stateText, sourceHash: require('../src/mutation_safety').hash(stateText), version: null },
    { available: true, dirty: false, filename: cnsPath, syntax: 'cns', text: cnsStateText, sourceHash: require('../src/mutation_safety').hash(cnsStateText), version: null }
  ] });
  const destinationRecord = { ...makeRecord(), referenceContext: { generation: 4, defPath: path.resolve('/char/char.def') }, data: { airPath, ownerDef: path.resolve('/char/char.def') }, destinationEpoch: 0, destinationQueue: Promise.resolve() };
  const destinationServices = { ...services(nightly), referenceContext: cleanContext };
  const destinationInventory = await buildCollisionDestinationReview(destinationRecord, { action: 200, elementIndex: 0, groupKey: 'clsn1', index: 1, draft: { family: 'eligibility', kind: 'NotHitBy', attr: 'SCA, AP', time: 4 } }, destinationServices);
  assert.strictEqual(destinationInventory.available, true); assert.strictEqual(destinationInventory.candidates.length, 2, 'only exact ZSS StateDefs are publicly offered while CNS remains in the sealed inventory'); assert(destinationInventory.candidates.every(item => item.source === path.basename(statePath) && !Object.prototype.hasOwnProperty.call(item, 'destination')), 'public candidate IDs contain no destination authority'); assert.strictEqual(destinationInventory.stats.cnsSourcesExcluded, 1); assert.strictEqual(destinationInventory.stats.dynamicStatesExcluded, 1); assert.strictEqual(destinationInventory.plan, null);
  const destinationPlanned = await buildCollisionDestinationReview(destinationRecord, { action: 200, elementIndex: 0, groupKey: 'clsn1', index: 1, destinationId: destinationInventory.candidates[0].id, draft: { family: 'eligibility', kind: 'NotHitBy', attr: 'SCA, AP', time: 4 } }, destinationServices);
  assert.strictEqual(destinationPlanned.plan.status, 'ready'); assert.match(destinationPlanned.plan.preview.diff, /notHitBy\{/); assert.deepStrictEqual(destinationPlanned.plan.effects, { filesystem: false, editor: false, clipboard: false, command: false, route: false, mutationAuthority: false });
  const contactInventory = await buildCollisionDestinationReview(destinationRecord, { action: 200, elementIndex: 0, groupKey: 'clsn1', index: 1, draft: { family: 'contact', kind: 'HitDef', attr: 'S, NA', p2clsncheck: 'Clsn2' } }, destinationServices);
  assert.strictEqual(contactInventory.candidates.length, 1, 'Contact offers only exact matching controllers, not every StateDef'); assert.strictEqual(contactInventory.candidates[0].controller, 'HitDef'); assert.strictEqual(contactInventory.stats.redirectedControllersExcluded, 1, 'redirected controllers receive an honest exclusion count');
  const incomplete = await buildCollisionDestinationReview(destinationRecord, { action: 200, elementIndex: 0, groupKey: 'clsn1', index: 1, draft: { family: 'eligibility', kind: 'NotHitBy', attr: 'SCA, AP', time: 4 } }, { ...destinationServices, referenceContext: () => ({ inventoryComplete: false, defDirty: true, assignedSources: [], sources: [], reason: 'dirty inventory' }) });
  assert.strictEqual(incomplete.available, false); assert.match(incomplete.reason, /dirty inventory/i);
  const invalidContexts = [
    context => { context.assignedSources[0] = path.resolve('/char/wrong.zss'); },
    context => { context.assignedSources[1] = context.assignedSources[0]; context.sources[1] = { ...context.sources[1], filename: context.sources[0].filename }; },
    context => { context.sources[0] = { ...context.sources[0], sourceHash: '' }; },
    context => { context.sources[0] = { ...context.sources[0], syntax: 'cns' }; }
  ];
  for (const corrupt of invalidContexts) {
    const invalid = await buildCollisionDestinationReview(destinationRecord, { action: 200, elementIndex: 0, groupKey: 'clsn1', index: 1, draft: { family: 'eligibility', kind: 'NotHitBy', attr: 'SCA, AP', time: 4 } }, { ...destinationServices, referenceContext: () => { const context = cleanContext(); corrupt(context); return context; } });
    assert.strictEqual(invalid.available, false); assert.strictEqual(invalid.candidates.length, 0, 'invalid assigned-source evidence publishes no candidate IDs');
  }
  const duplicateText = stateText + '[StateDef 200]\nchangeAnim{value: 200}\n', duplicateContext = () => { const context = cleanContext(); context.sources[0] = { ...context.sources[0], text: duplicateText, sourceHash: require('../src/mutation_safety').hash(duplicateText) }; return context; }, duplicateInventory = await buildCollisionDestinationReview(destinationRecord, { action: 200, elementIndex: 0, groupKey: 'clsn1', index: 1, draft: { family: 'eligibility', kind: 'NotHitBy', attr: 'SCA, AP', time: 4 } }, { ...destinationServices, referenceContext: duplicateContext });
  assert.strictEqual(duplicateInventory.stats.duplicateStateNumbers, 1); assert.strictEqual(duplicateInventory.stats.ambiguousStateDeclarations, 2); assert.strictEqual(duplicateInventory.candidates.filter(item => item.ambiguousState).length, 2); assert(duplicateInventory.candidates.filter(item => item.ambiguousState).every(item => /duplicate\/ambiguous/.test(item.label)));
  let contextPass = 0; const changedReview = await buildCollisionDestinationReview(destinationRecord, { action: 200, elementIndex: 0, groupKey: 'clsn1', index: 1, destinationId: 'd0', draft: { family: 'eligibility', kind: 'NotHitBy', attr: 'SCA, AP', time: 4 } }, { ...destinationServices, referenceContext: () => { const result = cleanContext(); if (contextPass++ > 0) { const changed = stateText + '# changed\n'; result.sources[0] = { ...result.sources[0], text: changed, sourceHash: require('../src/mutation_safety').hash(changed) }; } return result; } });
  assert.strictEqual(changedReview.available, false); assert.match(changedReview.reason, /changed while reviewing/i); assert.strictEqual(changedReview.plan, null);
  const destinationPublished = [], destinationQueueRecord = { ...destinationRecord, destinationEpoch: 0, destinationQueue: Promise.resolve(), propertyEpoch: 0, collisionEpoch: 0 };
  await queueCollisionDestinationReview(destinationQueueRecord, { request: 9, action: 200, elementIndex: 0, groupKey: 'clsn1', index: 1, draft: { family: 'eligibility', kind: 'NotHitBy', attr: 'SCA, AP', time: 4 } }, payload => destinationPublished.push(payload), destinationServices);
  assert.strictEqual(destinationPublished.length, 1); assert.strictEqual(destinationPublished[0].type, 'collisionDestinationReview');
  const applyPublished = [], applyQueueRecord = { ...destinationRecord, destinationEpoch: 0, destinationQueue: Promise.resolve(), propertyEpoch: 0, collisionEpoch: 0 };
  await queueCollisionDestinationReview(applyQueueRecord, { request: 11, action: 200, elementIndex: 0, groupKey: 'clsn1', index: 1, destinationId: destinationInventory.candidates[0].id, draft: { family: 'eligibility', kind: 'NotHitBy', attr: 'SCA, AP', time: 4 } }, payload => applyPublished.push(payload), { ...destinationServices, applyToken: () => 'b'.repeat(48) });
  assert.strictEqual(applyPublished[0].applyAuthority.token, 'b'.repeat(48), 'only an exact ready destination publishes one-use Apply authority');
  assert(!Object.prototype.hasOwnProperty.call(applyPublished[0], '_authorityInput'), 'private review evidence never crosses the webview boundary');
  assert(applyQueueRecord.destinationApplyAuthority, 'the full authority stays on the extension host');
  let editedStateText = stateText, insertCalls = 0, applyCalls = 0, openSourceCalls = 0;
  const sourceDocument = { fileName: statePath, uri: { fsPath: statePath }, isClosed: false, isDirty: false, version: 1, getText: () => editedStateText, positionAt: offset => ({ offset }), offsetAt: position => position.offset };
  class WorkspaceEdit { insert(uri, position, text) { insertCalls += 1; this.insertion = { uri, position, text }; } }
  const applyWorkspace = {
    textDocuments: [document],
    openTextDocument: async filename => { assert.strictEqual(path.resolve(filename), statePath); openSourceCalls += 1; applyWorkspace.textDocuments.push(sourceDocument); return sourceDocument; },
    applyEdit: async edit => { applyCalls += 1; const offset = edit.insertion.position.offset; editedStateText = editedStateText.slice(0, offset) + edit.insertion.text + editedStateText.slice(offset); sourceDocument.version += 1; sourceDocument.isDirty = true; return true; }
  };
  const applied = await applyCollisionDestinationReview(applyQueueRecord, 'b'.repeat(48), { ...destinationServices, workspace: applyWorkspace, window: { showWarningMessage: async () => 'Apply Reviewed Diff' }, WorkspaceEdit });
  assert.strictEqual(applied.status, 'applied'); assert.match(editedStateText, /notHitBy\{/); assert.strictEqual(insertCalls, 1); assert.strictEqual(applyCalls, 1); assert.strictEqual(openSourceCalls, 1, 'a source closed at review stays closed until after the second confirmation rebuild');
  await assert.rejects(() => applyCollisionDestinationReview(applyQueueRecord, 'b'.repeat(48), { ...destinationServices, workspace: applyWorkspace, window: { showWarningMessage: async () => 'Apply Reviewed Diff' }, WorkspaceEdit }), /invalid, stale, or already consumed/i, 'the Apply token cannot replay');
  revokeCollisionDestinationApply(applyQueueRecord); assert.strictEqual(applyQueueRecord.destinationApplyAuthority, null, 'explicit revocation clears the host authority');
  applyQueueRecord.destinationApplyAuthority = { token: 'stale' }; const priorCollisionEpoch = applyQueueRecord.collisionEpoch; invalidateCollisionDestinationContext(applyQueueRecord, true); assert.strictEqual(applyQueueRecord.destinationApplyAuthority, null); assert.strictEqual(applyQueueRecord.collisionEpoch, priorCollisionEpoch + 1, 'a bound browser selection invalidates collision/property/destination authority synchronously');
  let releaseDestination; const staleDestinationPublished = [], staleDestinationRecord = { ...destinationRecord, destinationEpoch: 0, destinationQueue: Promise.resolve(), propertyEpoch: 0, collisionEpoch: 0 };
  const staleDestination = queueCollisionDestinationReview(staleDestinationRecord, { request: 10, action: 200, elementIndex: 0, groupKey: 'clsn1', index: 1, draft: { family: 'eligibility', kind: 'NotHitBy', attr: 'SCA, AP', time: 4 } }, payload => staleDestinationPublished.push(payload), { ...destinationServices, workspace: { textDocuments: [], openTextDocument: async () => new Promise(resolve => { releaseDestination = () => resolve(document); }) } });
  await Promise.resolve(); await Promise.resolve(); staleDestinationRecord.destinationEpoch += 1; releaseDestination(); await staleDestination;
  assert.strictEqual(staleDestinationPublished.length, 0, 'a superseded destination review cannot publish stale output');

  const retainedProperty = { family: 'queries', kind: 'ProjClsnOverlap', attr: 'S, AP', time: 7, ownerGroup: 'Dummy', check: 'Size', require: 'Clsn1', player: 'playerId(9)', projectileListIndex: 12, playerno: '2', playerid: 'enemyId', slot: 6, stack: true, advancedOpen: true };
  const model = buildModel(airPath, airText, '', { available: true, items: [], occurrences: [], issues: [], collisions: { available: true, items: [], perActionOmitted: { '200': 3, '900': 2 } } }, { view: 'collisions', collisionMode: 'properties', action: 200, propertyState: retainedProperty });
  assert.deepStrictEqual(model.initialProperty, retainedProperty, 'the host retains every bounded property control across dirty/capability refresh');
  const sourceProperty = { ...retainedProperty, family: 'source', kind: '' }, refreshed = buildModel(airPath, airText + '; changed fingerprint\n', '', model.references, { view: 'collisions', collisionMode: 'properties', action: 200, propertyState: buildModel(airPath, airText, '', model.references, { propertyState: sourceProperty }).initialProperty });
  assert.deepStrictEqual(refreshed.initialProperty, sourceProperty, 'Existing source and every retained control round-trip through host cleaning after a changed source fingerprint');
  const output = html(model), propertyStart = output.indexOf("collisionProperties.innerHTML='"), propertyEnd = output.indexOf("';document.getElementById('collisions').append", propertyStart);
  assert(propertyStart >= 0 && propertyEnd > propertyStart, 'Collisions contains the compact Properties subview');
  const propertyMarkup = output.slice(propertyStart, propertyEnd);
  assert(propertyMarkup.includes('Indexed hit filtering') && propertyMarkup.includes('Hit / reversal contact') && propertyMarkup.includes('Collision questions') && propertyMarkup.includes('Edit existing source'), 'Properties uses plain-language task labels while retaining the same exact recipe families');
  assert(propertyMarkup.includes('Code recipes') && propertyMarkup.includes('Nothing is written until a diff is reviewed and applied.'), 'the compact recipe screen explains purpose and mutation boundary before technical controls');
  assert(!/<button[^>]*>[^<]*\b(?:Copy|Save)\b/i.test(propertyMarkup), 'the companion exposes no copy or save action');
  assert.strictEqual((propertyMarkup.match(/Apply reviewed diff/g) || []).length, 1, 'only the exact reviewed-diff Apply action is present');
  assert(propertyMarkup.includes('Reviewed collision edit') && propertyMarkup.includes('Exact ZSS destination') && propertyMarkup.includes('propertyDestinationDiff'), 'the shared reviewed edit remains inside the compact Properties companion');
  assert(propertyMarkup.includes('propertyDestinationLabel') && propertyMarkup.includes('Review field diff') && propertyMarkup.includes('Replace') && propertyMarkup.includes('Remove'), 'Existing source receives one compact field review area without a new toolbar row');
  assert(propertyMarkup.includes('Own boxes') && propertyMarkup.includes('Runtime groups / query evidence'), 'Queries expose one compact owner selector and one collapsed evidence subsection');
  assert(output.includes("data-collision-mode=\"properties\""));
  assert(output.includes("vscode.postMessage({type:'draftCollisionProperty'"));
  assert(output.includes("vscode.postMessage({type:'openReference',route:item.route})"), 'existing-source cards reuse exact one-use navigation routes');
  assert(output.includes('title.textContent=item.label') && output.includes('details.textContent='), 'source-card fields are rendered as text rather than injected HTML');
  assert(output.includes("eligibilityOption.disabled=!indexedEligibility") && output.includes("propertyFamily.disabled=!collisionInspection"), 'Eligibility is visibly disabled until an exact indexed target is loaded');
  assert(output.includes("if(collisionInspection&&!indexedEligibility&&propertyFamily.value==='eligibility')propertyFamily.value='contact'"), 'Stable and unresolved targets cannot retain a usable-looking indexed Eligibility form');
  assert(output.includes("propertyState:propertyState()") && output.includes('propertyAdvancedOpen:property.advancedOpen'), 'every property control is sent to host state and serialized for panel restore');
  assert(output.includes("function requestProperty(){destinationRequest+=1;applyRequest+=1;destinationReview=null;clearDestinationApply();vscode.postMessage({type:'revokeCollisionDestinationApply'});publishBrowserState();persist();if("), 'every property change synchronously revokes host/client destination authority before any optional draft early return');
  assert(output.includes("type:'reviewCollisionDestination'") && output.includes("propertyDestinationDiff.textContent=plan?.preview?.diff||''"), 'destination and field IDs request host revalidation and exact diffs render with textContent only');
  assert(output.includes("propertyDestinationReview.ontoggle=()=>") && output.includes("else requestDestination('')"), 'review inventory scanning remains lazy until its compact disclosure is open');
  assert(output.includes('id="propertyDestinationPrevious"') && output.includes('id="propertyDestinationSlider"') && output.includes('id="propertyDestinationNext"') && output.includes("'CNS sources '+Number(stats.cnsSourcesExcluded||0)"), 'destination review uses cohesive arrows/slider and reports bounded exclusion categories');
  assert(!output.includes("propertyDestinationDiff.innerHTML") && output.includes("type:'applyCollisionDestination'") && !output.includes("type:'openCollisionDestination'"), 'destination review uses text-only diff rendering and the single reviewed Apply message, without a navigation route');
  assert(output.includes("type:'revokeCollisionDestinationApply'") && output.includes("message.type==='collisionDestinationApplied'"), 'leaving or changing the review revokes host authority and an Apply result is rendered honestly');
  assert(output.includes("!['eligibility','contact'].includes(propertyProjection.recipe?.family)"), 'read-only runtime queries never enter the reviewed insertion or Apply path');
  assert(output.includes("propertyOwner.dataset.requested=requested") && output.includes("delete propertyOwner.dataset.requested"), 'an unsupported or unresolved restored Dummy owner is retained honestly until the user changes it');
  assert(output.includes("limit=64") && output.includes("perActionOmitted") && output.includes("fields.textContent=") && output.includes("effective.textContent=item.effectiveExplanation||''") && output.includes("reason.textContent="), 'query evidence is bounded, reports authoritative omissions, and renders authoritative explanations and untrusted fields as text');
  assert(output.includes('propertyDestinationPrevious.disabled=!candidates.length||position<=0'), 'the first real row can navigate back to the signed placeholder');
  assert(output.includes("const request=++applyRequest") && output.includes("if(Number(message.request)!==applyRequest)return"), 'Apply completions are client-correlated so an older modal result cannot clear a newer review');
  const persistFunction = clientFunction(output.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1], 'persist'); assert(!/(?:token|plan|insertion|applyAuthority)/i.test(persistFunction), 'serialized webview state contains no token, plan, insertion, or Apply authority');
  assert(dockingSource.includes("if (messageType === 'selection') { const action = Number(message.action); invalidateCollisionDestinationContext(record, true)") && dockingSource.includes("if (changed) invalidateCollisionDestinationContext(record, collisionChanged)"), 'ordinary Action selection and primary/mode/property browser-state changes revoke host Apply authority');
  assert(output.includes("if(previous==='properties'&&collisionMode!=='properties'){if(typeof invalidateQueryCondition==='function')invalidateQueryCondition(true);revokeProperty()}") && output.includes("if(Number(message.request)!==propertyRequest||collisionMode!=='properties')return"), 'leaving Properties revokes query/property correlation and hidden late responses cannot repaint');
  assert(output.includes("inventoryOmitted=Object.values(projection.perActionOmitted||{})") && output.includes("selectedOmitted=Number(projection.perActionOmitted?.[String(selected?.number)]||0)"), 'Existing source distinguishes authoritative inventory omissions from its local card cap');
  const browserScript = output.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1];
  function clientFunction(source, name) { const start = source.indexOf(`function ${name}(`), open = source.indexOf('{', start); assert(start >= 0 && open >= 0); let depth = 0; for (let index = open; index < source.length; index += 1) { if (source[index] === '{') depth += 1; else if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1); } throw new Error(`unterminated ${name}`); }
  const destinationRequests = [], navigationClient = { destinationReview: { candidates: [{ id: 'd0' }, { id: 'd1' }] }, propertyFamily: { value: 'contact' }, propertyDestinationSlider: { value: '0' }, propertyDestination: { value: '' }, requestDestination: id => destinationRequests.push(id), Math, Number };
  require('vm').createContext(navigationClient); require('vm').runInContext(clientFunction(browserScript, 'setDestinationPosition'), navigationClient);
  navigationClient.setDestinationPosition(0); navigationClient.setDestinationPosition(1); navigationClient.setDestinationPosition(2); navigationClient.setDestinationPosition(99); navigationClient.setDestinationPosition(-1);
  assert.deepStrictEqual(destinationRequests, ['', 'd0', 'd1', 'd1', ''], 'position 0 is the placeholder, position 1 is candidate 0, and both slider boundaries clamp honestly');
  const existingSelections = [], revocations = [], existingClient = { destinationReview: { fields: [{ id: 'f0', expression: 'SCA, NA', canReplace: true }, { id: 'f1', expression: '2', canReplace: false }] }, propertyFamily: { value: 'source' }, propertyDestinationSlider: { value: '0' }, propertyDestination: { value: '', dataset: {} }, destinationRequest: 0, applyRequest: 0, clearDestinationApply: () => {}, vscode: { postMessage: message => revocations.push(message.type) }, propertyDestinationDiff: { textContent: '' }, propertyExistingValue: { value: '', disabled: false }, propertyEditAction: { value: 'replace' }, existingValue: '', renderDestinationReview: () => existingSelections.push(existingClient.propertyDestination.value), Math, Number };
  require('vm').createContext(existingClient); require('vm').runInContext(clientFunction(browserScript, 'setDestinationPosition'), existingClient);
  existingClient.setDestinationPosition(0); existingClient.setDestinationPosition(1); existingClient.setDestinationPosition(2); existingClient.setDestinationPosition(99); existingClient.setDestinationPosition(-1);
  assert.deepStrictEqual(existingSelections, ['', 'f0', 'f1', 'f1', ''], 'existing-field placeholder, first, last, overflow, and underflow positions clamp identically');
  assert.strictEqual(revocations.length, 5, 'every existing-field position change revokes any prior Apply authority');

  const evidenceClient = { model: { references: { collisions: { available: true, items: [
    { id: 'other', controller: 'HitDef', relatedActions: [200], fields: [] },
    { id: 'transform', controller: 'TransformClsn', relatedActions: [900], fields: [] },
    { id: 'dummy-literal', controller: 'VarSet', relatedActions: [900], fields: [{ key: 'owner.group', expression: ' Dummy ' }] },
    { id: 'dummy-wrong-field', controller: 'VarSet', relatedActions: [200], fields: [{ key: 'value', expression: 'Dummy' }] },
    { id: 'dummy-dynamic', controller: 'VarSet', relatedActions: [200], fields: [{ key: 'p2clsncheck', expression: 'ifElse(foo, Dummy, Clsn1)' }] },
    { id: 'selected-overlap', controller: 'ClsnOverlap', relatedActions: [200], fields: [] }
  ] } } }, selected: { number: 200 }, Set, String, Number };
  require('vm').createContext(evidenceClient); require('vm').runInContext(clientFunction(browserScript, 'runtimeEvidenceRows'), evidenceClient);
  const evidenceIds = evidenceClient.runtimeEvidenceRows().map(row => row.item.id);
  assert.deepStrictEqual(Array.from(evidenceIds), ['selected-overlap', 'transform', 'dummy-literal'], 'runtime evidence keeps only approved controller families or exact Dummy literals and sorts selected-Action candidates first');

  const allowed = ['attr', 'time', 'clsn.group', 'clsn.index', 'playerno', 'playerid', 'slot', 'stack'], synthetic = [];
  for (let index = 0; index < 40; index += 1) synthetic.push({ key: allowed[index % allowed.length], expression: String(index), start: index * 3, end: index * 3 + String(index).length });
  synthetic.push({ key: 'value', expression: 'SCA, NA', start: 1000, end: 1007 }, { key: 'redirectid', expression: '4', start: 1010, end: 1011 });
  const compact = projectCollisionExistingFields('a'.repeat(64), { recipe: { family: 'eligibility', kind: 'HitBy', fields: { attr: 'SCA, AP', time: 4, group: 'Clsn1', index: 0, playerno: 1, playerid: 2, slot: 0, stack: false } } }, synthetic, synthetic.map(() => ({ compatibility: 'nightly-indexed' })));
  assert.strictEqual(MAX_PUBLIC_EXISTING_FIELDS, 32); assert.strictEqual(compact.fields.length, 32); assert.strictEqual(compact.cappedFields, 8); assert.strictEqual(compact.unsupportedFields, 2); assert.strictEqual(compact.omittedFields, 10);
  assert(!compact.fields.some(field => field.key === 'value' || field.key === 'redirectid'), 'parser-recognized but unsupported fields are never advertised as editable');
  console.log('AIR docking collision Properties stays compact, exact, read-only, target-aware, and race-safe');
})().catch(error => { console.error(error); process.exitCode = 1; });
