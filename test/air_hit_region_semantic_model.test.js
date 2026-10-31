'use strict';

const assert = require('assert');
const path = require('path');
const { hash } = require('../src/mutation_safety');
const { MAX_EVIDENCE, buildSelectedBoxHitRegionEvidence } = require('../src/air_hit_region_semantic_model');
const { SF6_HIT_REGION_PROVIDER } = require('../src/sf6_hit_region_provider');

const optionsText = `[Function JNP_SF6_InitializeOptions()]
map(JNP_SF6_cfg_hit_region_high_clsn2_index) := 2;
map(JNP_SF6_cfg_hit_region_low_clsn2_index) := 0;
`;
const regionsText = `[Function JNP_SF6_ClassifyClsnHitRegion(defenderID) region]
let hurtBoxCount = playerId($defenderID), animElemVar(NumClsn2);
let highIndex = map(JNP_SF6_cfg_hit_region_high_clsn2_index);
let lowIndex = map(JNP_SF6_cfg_hit_region_low_clsn2_index);
for hurtIndex = 0; $hurtBoxCount - 1; 1 {
  let hurtBack = playerId($defenderID), clsnVar(Clsn2, $hurtIndex, Back);
  let hurtFront = playerId($defenderID), clsnVar(Clsn2, $hurtIndex, Front);
}

[Function JNP_SF6_AttackBlockedByRegions(attackerID, traits) blocked]
let attackBoxCount = playerId($attackerID), animElemVar(NumClsn1);
for attackIndex = 0; $attackBoxCount - 1; 1 {
  let attackBack = playerId($attackerID), clsnVar(Clsn1, $attackIndex, Back);
  let attackTop = playerId($attackerID), clsnVar(Clsn1, $attackIndex, Top);
}

[Function JNP_SF6_BoxesOverlap(otherID) overlap]
let overlap = clsnOverlap(Clsn2, $otherID, Clsn1);
let projectileOnly = projClsnOverlap(0, Clsn2, $otherID, Clsn1);

[Function BrokenOverlap(otherID) overlap]
let overlap = clsnOverlap(Clsn2, $otherID, Dummy);

[StateDef -4]
ignoreHitPause if numEnemy = 1 {
  let blocked = call JNP_SF6_AttackBlockedByRegions(enemynear, ID, 0);
  let invalidOverlap = call BrokenOverlap(enemynear, ID);
}
`;

function source(filename, text, extra = {}) {
  return Object.freeze({ filename: path.resolve(filename), text, sourceHash: hash(text), syntax: 'zss', available: true, version: 4, dirty: false, ...extra });
}
const files = [source('/char/SF6template/sf6_game_options.zss', optionsText), source('/char/SF6template/sf6_hit_regions.zss', regionsText)];
const assignedSources = files.map(item => item.filename), airText = '[Begin Action 200]\nClsn2: 4\nClsn2[0]=-1,-2,3,4\nClsn2[2]=-2,-4,4,1\nClsn2[3]=-3,-5,5,2\n0,0,0,0,1\n';
function selected(groupKey, effectiveSlot) { return Object.freeze({ airPath: path.resolve('/char/hero.air'), airHash: hash(airText), action: 200, actionOccurrence: 0, elementIndex: 0, groupKey, effectiveSlot, authoredLabel: effectiveSlot, ownership: 'local' }); }
function build(groupKey, effectiveSlot, overrides = {}) {
  return buildSelectedBoxHitRegionEvidence({ inventoryComplete: true, assignedSources, sources: files, selectedBox: selected(groupKey, effectiveSlot), routeFor: item => item.id.slice(0, 48), ...overrides });
}

const high = build('clsn2', 2);
assert.strictEqual(high.complete, true);
assert.deepStrictEqual([high.sourceMeaning.status, high.sourceMeaning.name, high.scope.kind, high.runtimeStatus.status], ['source-proven', 'Configured High', 'character-config', 'unresolved']);
assert(high.meanings.some(item => item.name === 'Configured High' && item.status === 'source-proven'));
const highMap = high.evidence.find(item => item.kind === 'sf6-config-map' && item.meaning === 'Configured High index 2');
assert(highMap && highMap.route.length === 48 && highMap.noRouteReason === '');
assert.strictEqual(highMap.source.sourceHash, files[0].sourceHash);
assert.strictEqual(optionsText.slice(highMap.source.start, highMap.source.end), '2');
assert.strictEqual(high.runtimeStatus.reason.includes('does not prove'), true);

const low = build('clsn2', 0);
assert.deepStrictEqual([low.sourceMeaning.status, low.sourceMeaning.name], ['source-proven', 'Configured Low']);
assert(low.meanings.some(item => item.name === 'Configured Low'));

const contextual = build('clsn2', 0, { selectedBox: { ...selected('clsn2', 0), authoredLabel: 7, ownership: 'inherited-default' }, availableSlots: { authoritative: true, profile: 'stable-source-order', filledSlots: [0] }, runtimeContext: { saved: 1, recovery: 1, override: 1, transform: 1, omitted: 2 } });
assert(contextual.diagnostics.some(item => item.kind === 'label-slot-mismatch' && /label 7.*slot 0/i.test(item.message)));
assert(contextual.diagnostics.some(item => item.kind === 'inherited-ownership'));
assert(contextual.diagnostics.some(item => item.kind === 'index-outside-effective-slots' && /Configured High index 2/i.test(item.message)));
assert(contextual.diagnostics.some(item => item.kind === 'runtime-plan-presence' && item.status === 'runtime-unresolved'));

const middle = build('clsn2', 3);
assert.deepStrictEqual([middle.sourceMeaning.status, middle.sourceMeaning.name], ['unresolved', '']);
assert.match(middle.sourceMeaning.reason, /No named hit-region assignment/i);
assert(middle.evidence.some(item => item.kind === 'clsnvar-read' && item.status === 'candidate' && /\$hurtIndex/.test(item.explanation)));
assert(middle.evidence.some(item => item.kind === 'clsnvar-read' && item.scope.kind === 'shared-function'), 'shared-function ownership remains a candidate rather than selected-Action proof');
const groupOverlap = middle.evidence.find(item => item.kind === 'clsnoverlap-read');
assert(groupOverlap && groupOverlap.status === 'candidate' && /group as a whole/i.test(groupOverlap.explanation));
assert(!/selected slot overlaps at runtime\.$/i.test(groupOverlap.meaning), 'ClsnOverlap never becomes a selected-slot runtime meaning');
const invalidOverlap = middle.evidence.find(item => item.kind === 'clsnoverlap-read' && item.status === 'unresolved');
assert(invalidOverlap && /target group must be/i.test(invalidOverlap.explanation), 'invalid ClsnOverlap rows preserve the parser reason as unresolved evidence');
assert(!middle.evidence.some(item => item.kind === 'function-call-chain' && /BrokenOverlap/i.test(item.explanation)), 'invalid ClsnOverlap cannot seed bounded call-chain reachability');
assert(!middle.evidence.some(item => /projclsnoverlap/i.test(item.kind)), 'ProjClsnOverlap remains separate and unclaimed');
assert.strictEqual(middle.meanings.length, 0, 'an unassigned middle box receives no invented region name');

const attack = build('clsn1', 0);
assert.deepStrictEqual([attack.sourceMeaning.status, attack.sourceMeaning.name], ['unresolved', '']);
assert.match(attack.sourceMeaning.reason, /hurt-region names apply only to Clsn2/i);
assert(attack.evidence.some(item => item.kind === 'clsnvar-read' && item.status === 'candidate' && /\$attackIndex/.test(item.explanation)));
assert(attack.evidence.some(item => item.kind === 'function-call-chain' && item.status === 'candidate' && item.scope.kind === 'global-state'), 'StateDef -4 call chains remain global candidates');
assert(!attack.meanings.some(item => /High|Low|reaction/i.test(item.name)), 'Clsn1 never inherits Clsn2 region names');

const localText = `[StateDef -4]
# IKEMEN ZSS Tools: Hit Reaction Regions State 200 BEGIN
ignoreHitPause if stateNo = 200 {
  call JNP_SF6_SetHitReactionRegion(3, 2);
}
# IKEMEN ZSS Tools: Hit Reaction Regions State 200 END

# IKEMEN ZSS Tools: Hit Reaction Regions State 300 BEGIN
ignoreHitPause if stateNo = 300 {
  call JNP_SF6_SetHitReactionRegion(9, 1);
}
# IKEMEN ZSS Tools: Hit Reaction Regions State 300 END
`;
const localSource = source('/char/normals_extras.zss', localText), localInput = { inventoryComplete: true, assignedSources: [...assignedSources, localSource.filename], sources: [...files, localSource], selectedBox: selected('clsn2', 3) }, unlinked = buildSelectedBoxHitRegionEvidence(localInput), local = buildSelectedBoxHitRegionEvidence({ ...localInput, actionStateLinks: [{ action: 200, state: 200, status: 'proven', airHash: hash(airText), inventoryHash: unlinked.inventoryHash }], routeFor: item => item.id.slice(0, 48) });
assert.deepStrictEqual([local.sourceMeaning.status, local.sourceMeaning.name, local.scope.kind], ['source-proven', 'Forced Low', 'state-gated-global']);
assert(local.evidence.some(item => item.kind === 'sf6-region-assignment' && item.status === 'source-proven' && localText.slice(item.source.start, item.source.end) === 'call JNP_SF6_SetHitReactionRegion(3, 2)'));
const localDiagnostics = buildSelectedBoxHitRegionEvidence({ ...localInput, availableSlots: { authoritative: true, profile: 'indexed-label', filledSlots: [0, 1, 2, 3] }, actionStateLinks: [{ action: 200, state: 200, status: 'proven', airHash: hash(airText), inventoryHash: unlinked.inventoryHash }] });
assert(!localDiagnostics.diagnostics.some(item => item.kind === 'index-outside-effective-slots' && /index 9/i.test(item.message)), 'an unrelated-state literal assignment cannot become a selected-frame slot mismatch');
assert.deepStrictEqual([unlinked.sourceMeaning.status, unlinked.sourceMeaning.name], ['candidate', 'Forced Low'], 'a literal assignment without a proven Action/State link stays a candidate');
const staleLink = buildSelectedBoxHitRegionEvidence({ ...localInput, actionStateLinks: [{ action: 200, state: 200, status: 'proven', airHash: hash(airText), inventoryHash: 'f'.repeat(64) }] });
assert.strictEqual(staleLink.sourceMeaning.status, 'candidate', 'a stale Action/State authority cannot promote a literal assignment');

const duplicateOptions = `${optionsText}map(JNP_SF6_cfg_hit_region_high_clsn2_index) := 2;\n`, duplicateSource = source('/char/SF6template/sf6_game_options.zss', duplicateOptions);
const duplicate = buildSelectedBoxHitRegionEvidence({ inventoryComplete: true, assignedSources: [duplicateSource.filename, files[1].filename], sources: [duplicateSource, files[1]], selectedBox: selected('clsn2', 2) });
assert.strictEqual(duplicate.sourceMeaning.status, 'unresolved'); assert.match(duplicate.sourceMeaning.reason, /duplicated|conflicting/i);
const dynamicOptions = optionsText.replace(':= 2', ':= map(UserHighIndex)'), dynamicSource = source('/char/SF6template/sf6_game_options.zss', dynamicOptions);
const dynamic = buildSelectedBoxHitRegionEvidence({ inventoryComplete: true, assignedSources: [dynamicSource.filename, files[1].filename], sources: [dynamicSource, files[1]], selectedBox: selected('clsn2', 2) });
assert.strictEqual(dynamic.sourceMeaning.status, 'unresolved'); assert.match(dynamic.sourceMeaning.reason, /dynamic/i);
const conflictOptions = optionsText.replace('low_clsn2_index) := 0', 'low_clsn2_index) := 2'), conflictSource = source('/char/SF6template/sf6_game_options.zss', conflictOptions);
const conflict = buildSelectedBoxHitRegionEvidence({ inventoryComplete: true, assignedSources: [conflictSource.filename, files[1].filename], sources: [conflictSource, files[1]], selectedBox: selected('clsn2', 2) });
assert.strictEqual(conflict.sourceMeaning.status, 'unresolved'); assert.match(conflict.sourceMeaning.reason, /Conflicting/i);

const stale = buildSelectedBoxHitRegionEvidence({ inventoryComplete: true, assignedSources, sources: [{ ...files[0], sourceHash: 'a'.repeat(64) }, files[1]], selectedBox: selected('clsn2', 2) });
assert.strictEqual(stale.complete, false); assert.match(stale.reason, /stale|malformed/i); assert.strictEqual(stale.evidence.length, 0);
const incomplete = buildSelectedBoxHitRegionEvidence({ inventoryComplete: false, assignedSources, sources: files, selectedBox: selected('clsn2', 2) });
assert.strictEqual(incomplete.complete, false); assert.match(incomplete.reason, /incomplete/i);
const noRoute = buildSelectedBoxHitRegionEvidence({ inventoryComplete: true, assignedSources, sources: files, selectedBox: selected('clsn2', 2), routeFor: () => 'bad' });
assert(noRoute.evidence.every(item => !item.route && item.noRouteReason), 'every exact span has a route or an explicit no-route reason');

const manyReads = `[Function Many()]\n${Array.from({ length: MAX_EVIDENCE + 20 }, () => 'let x = clsnVar(Clsn2, $hurtIndex, Back);').join('\n')}\n`, manySource = source('/char/many.zss', manyReads);
const bounded = buildSelectedBoxHitRegionEvidence({ inventoryComplete: true, assignedSources: [manySource.filename], sources: [manySource], selectedBox: selected('clsn2', 3) });
assert.strictEqual(bounded.evidence.length, MAX_EVIDENCE); assert(bounded.omissions.evidence > 0); assert.match(bounded.reason, /omitted/i);

assert(Object.isFrozen(high) && Object.isFrozen(high.selectedBox) && Object.isFrozen(high.evidence) && Object.isFrozen(high.evidence[0]) && Object.isFrozen(high.diagnostics));
assert(Object.isFrozen(SF6_HIT_REGION_PROVIDER) && Object.isFrozen(SF6_HIT_REGION_PROVIDER.configurations) && SF6_HIT_REGION_PROVIDER.id === 'jnp-sf6-hit-regions');
assert.deepStrictEqual(high.effects, { filesystem: false, editor: false, clipboard: false, command: false, route: false, mutationAuthority: false, network: false, runtimeSimulation: false });
assert.strictEqual(build('clsn2', 2).modelHash, high.modelHash, 'same frozen source evidence is deterministic');

console.log('Selected-box SF6 hit-region evidence stays frozen, bounded, source-routed, and runtime-honest');
