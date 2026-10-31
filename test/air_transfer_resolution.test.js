'use strict';

const assert = require('assert');
const { parseAir } = require('../src/air_preview_model');
const { airTransferSelectionItems, analyzeAirTransfer } = require('../src/air_transfer_model');
const { resolveAirTransfer } = require('../src/air_transfer_resolution');

const source = `[Begin Action 0]\n0,0,0,0,2\n\n[Begin Action 5]\nCopy Action 0\n\n[Begin Action 10]\n2,3,0,0,1\n`, destination = `[Begin Action 0]\n9,9,0,0,1\n`;
const selection = airTransferSelectionItems(source, [0, 1, 2]);
const review = analyzeAirTransfer({ sourceText: source, destinationText: destination, selection, dependencyMode: 'animation-with-sprites', sourceSff: { sprites: [{ index: 0, group: 0, number: 0 }, { index: 1, group: 2, number: 3 }] }, destinationSff: { sprites: [] } });
const decisions = [
  { id: review.items[0].id, identity: 'add-next-free', copyDependency: 'preserve' },
  { id: review.items[1].id, identity: 'manual-action', manualAction: 8, copyDependency: 'include-reference' },
  { id: review.items[2].id, identity: 'preserve-action', copyDependency: 'preserve' }
];
const mappings = [{ sourceId: '0,0', destinationGroup: 20, destinationIndex: 1, verified: true }, { sourceId: '2,3', destinationGroup: 20, destinationIndex: 2, verified: true }];
const plan = resolveAirTransfer({ review, sourceText: source, destinationText: destination, decisions, spriteMappings: mappings });
assert.equal(plan.status, 'ready'); assert.deepStrictEqual(plan.outcomes.map(item => item.destinationAction), [1, 8, 10]);
const actions = parseAir(plan.outputText); assert.deepStrictEqual(actions.map(item => item.number), [0, 1, 8, 10]);
assert.deepStrictEqual(actions.find(item => item.number === 1).frames.map(frame => [frame.group, frame.index]), [[20, 1]]);
assert.equal(actions.find(item => item.number === 8).copyAction, 1, 'Copy Action follows the exact transferred target mapping'); assert.deepStrictEqual(actions.find(item => item.number === 10).frames.map(frame => [frame.group, frame.index]), [[20, 2]]);
const missingMapping = resolveAirTransfer({ review, sourceText: source, destinationText: destination, decisions, spriteMappings: mappings.slice(0, 1) }); assert.equal(missingMapping.status, 'blocked'); assert.match(missingMapping.unresolved.join('\n'), /Sprite 2,3/); assert.equal(missingMapping.outputText, destination);
const copyOnlyReview = analyzeAirTransfer({ sourceText: source, destinationText: '', selection: airTransferSelectionItems(source, [1]), dependencyMode: 'animation-only' });
const materialized = resolveAirTransfer({ review: copyOnlyReview, sourceText: source, destinationText: '', decisions: [{ id: copyOnlyReview.items[0].id, identity: 'preserve-action', copyDependency: 'materialize' }] });
assert.equal(materialized.status, 'ready'); assert.equal(parseAir(materialized.outputText)[0].number, 5); assert.equal(parseAir(materialized.outputText)[0].copyAction, undefined); assert.equal(parseAir(materialized.outputText)[0].frames.length, 1);
const unresolvedCopy = resolveAirTransfer({ review: copyOnlyReview, sourceText: source, destinationText: '', decisions: [{ id: copyOnlyReview.items[0].id, identity: 'preserve-action', copyDependency: 'include-reference' }] }); assert.equal(unresolvedCopy.status, 'blocked');
assert.throws(() => resolveAirTransfer({ review, sourceText: source, destinationText: destination + '; changed\n', decisions, spriteMappings: mappings }), /destination changed/);

const duplicateAuthority = `[Begin Action 0]\n1,1,0,0,1\n\n[Begin Action 0]\n2,2,0,0,1\n\n[Begin Action 5]\nCopy Action 0\n`;
const duplicateCopy = analyzeAirTransfer({ sourceText: duplicateAuthority, destinationText: '', selection: airTransferSelectionItems(duplicateAuthority, [2]) });
const exactMaterialization = resolveAirTransfer({ review: duplicateCopy, sourceText: duplicateAuthority, destinationText: '', decisions: [{ id: 'action:5@2', identity: 'preserve-action', copyDependency: 'materialize-copy' }] });
assert.equal(exactMaterialization.status, 'ready'); assert.deepStrictEqual(parseAir(exactMaterialization.outputText)[0].frames.map(frame => [frame.group, frame.index]), [[1, 1]], 'materialization uses the first exact Copy authority, never a shadow duplicate');
const included = resolveAirTransfer({ review: duplicateCopy, sourceText: duplicateAuthority, destinationText: '', decisions: [
  { id: 'action:5@2', identity: 'manual-action', manualAction: 5, copyDependency: 'include-copy-targets' },
  { id: 'action:0@0', identity: 'preserve-action', copyDependency: 'preserve-copy' }
] });
assert.equal(included.status, 'ready'); assert.deepStrictEqual(parseAir(included.outputText).map(action => action.number), [0, 5]); assert.equal(parseAir(included.outputText)[1].copyAction, 0);

const duplicateSelection = analyzeAirTransfer({ sourceText: duplicateAuthority, destinationText: '', selection: airTransferSelectionItems(duplicateAuthority, [0, 1]) });
const allocated = resolveAirTransfer({ review: duplicateSelection, sourceText: duplicateAuthority, destinationText: '', decisions: [
  { id: 'action:0@0', identity: 'add-next-free', copyDependency: 'preserve-copy' },
  { id: 'action:0@1', identity: 'add-next-free', copyDependency: 'preserve-copy' }
] });
assert.equal(allocated.status, 'ready'); assert.deepStrictEqual(allocated.outcomes.map(item => item.destinationAction), [0, 1], 'selected duplicates reserve deterministic next-free IDs in physical order');
assert(/^[A-F0-9]{64}$/.test(allocated.planIdentity)); assert(Object.isFrozen(allocated.patches));

const duplicateDestination = `[Begin Action 0]\n7,7,0,0,1\n[Begin Action 0]\n8,8,0,0,1\n`;
const replaceReview = analyzeAirTransfer({ sourceText: source, destinationText: duplicateDestination, selection: airTransferSelectionItems(source, [0]) });
const replaceMissingOccurrence = resolveAirTransfer({ review: replaceReview, sourceText: source, destinationText: duplicateDestination, decisions: [{ id: 'action:0@0', identity: 'replace-existing', copyDependency: 'preserve-copy' }] });
assert.equal(replaceMissingOccurrence.status, 'blocked'); assert.match(replaceMissingOccurrence.unresolved.join('\n'), /exact Destination physical occurrence/);
const replaceExact = resolveAirTransfer({ review: replaceReview, sourceText: source, destinationText: duplicateDestination, decisions: [{ id: 'action:0@0', identity: 'replace-existing', destinationPhysicalIndex: 1, copyDependency: 'preserve-copy' }] });
assert.equal(replaceExact.status, 'ready'); assert.deepStrictEqual(parseAir(replaceExact.outputText).map(action => action.frames[0].group), [7, 0]);
const insertedReview = analyzeAirTransfer({ sourceText: source, destinationText: duplicateDestination, selection: airTransferSelectionItems(source, [2]) });
const insertedBetween = resolveAirTransfer({ review: insertedReview, sourceText: source, destinationText: duplicateDestination, placement: { kind: 'between-actions', targetPhysicalIndex: 0, targetId: 'action:0@0', position: 1 }, decisions: [{ id: 'action:10@2', identity: 'preserve-action', copyDependency: 'preserve-copy' }] });
assert.equal(insertedBetween.status, 'ready'); assert.deepStrictEqual(parseAir(insertedBetween.outputText).map(action => action.number), [0, 10, 0]);assert.equal(insertedBetween.placement.insertionPhysicalIndex,1);

const mixedReview=analyzeAirTransfer({sourceText:source,destinationText:duplicateDestination,selection:airTransferSelectionItems(source,[0,2])});
const mixed=resolveAirTransfer({review:mixedReview,sourceText:source,destinationText:duplicateDestination,placement:{kind:'between-actions',targetPhysicalIndex:0,targetId:'action:0@0',position:0},decisions:[
  {id:'action:0@0',identity:'replace-existing',destinationPhysicalIndex:0,copyDependency:'preserve-copy'},
  {id:'action:10@2',identity:'preserve-action',copyDependency:'preserve-copy'}
]});
assert.equal(mixed.status,'ready');assert.deepStrictEqual(parseAir(mixed.outputText).map(action=>action.number),[10,0,0],'insertion and replacement sharing one source offset compose without deleting either patch');assert.deepStrictEqual(mixed.outcomes.map(item=>item.destinationPhysicalIndex),[1,0],'outcomes carry exact post-edit physical occurrences after placement shifts replacement indexes');

const collisionPlan = resolveAirTransfer({ review: duplicateSelection, sourceText: duplicateAuthority, destinationText: '', decisions: [
  { id: 'action:0@0', identity: 'manual-action', manualAction: 9, copyDependency: 'preserve-copy' },
  { id: 'action:0@1', identity: 'manual-action', manualAction: 9, copyDependency: 'preserve-copy' }
] });
assert.equal(collisionPlan.status, 'blocked'); assert.match(collisionPlan.unresolved.join('\n'), /occupied or reserved/);

const mutableReview = JSON.parse(JSON.stringify(copyOnlyReview));
assert.throws(() => resolveAirTransfer({ review: mutableReview, sourceText: source, destinationText: '', decisions: [] }), /immutable/);
let decisionGetterRuns = 0; const hostileDecision = {}; Object.defineProperty(hostileDecision, 'id', { enumerable: true, get() { decisionGetterRuns += 1; return 'action:5@1'; } });
assert.throws(() => resolveAirTransfer({ review: copyOnlyReview, sourceText: source, destinationText: '', decisions: [hostileDecision] }), /accessor|plain data/i); assert.equal(decisionGetterRuns, 0);
console.log('AIR Transfer explicit action conflicts, Copy Action policy, verified sprite mappings and no-write blocked plans passed');
