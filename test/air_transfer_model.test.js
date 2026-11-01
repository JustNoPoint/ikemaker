'use strict';

const assert = require('assert');
const { airTransferSelectionItems, analyzeAirTransfer } = require('../src/air_transfer_model');

const source = `[Begin Action 0]\n0,0,0,0,2\n0,1,0,0,2\n\n[Begin Action 5]\nCopy Action 0\n\n[Begin Action 10]\n2,3,0,0,1\n0,1,0,0,1\n`, destination = `[Begin Action 0]\n9,9,0,0,1\n`;
const selection = airTransferSelectionItems(source, [0, 1, 2]); assert.equal(selection.length, 3); assert.match(selection[1].id, /action:5@1/);
const sourceSff = { sprites: [{ index: 0, group: 0, number: 0 }, { index: 1, group: 0, number: 1 }, { index: 2, group: 2, number: 3 }] }, destinationSff = { sprites: [{ index: 0, group: 0, number: 1 }] };
const reviewed = analyzeAirTransfer({ sourceText: source, destinationText: destination, selection, dependencyMode: 'animation-with-sprites', sourceSff, destinationSff });
assert.equal(reviewed.items[0].destinationConflict.status, 'occupied'); assert.equal(reviewed.items[1].copyDependencyStatus, 'self-contained', 'selected Copy Action target satisfies the dependency');
assert.deepStrictEqual(reviewed.spriteDependencies.map(item => item.id).sort(), ['0,0', '0,1', '2,3']); assert.equal(reviewed.spriteDependencies.find(item => item.id === '0,1').destinationMatches.length, 1); assert.equal(reviewed.missingSourceSprites.length, 0); assert.equal(reviewed.includeSprites, true); assert.deepStrictEqual(reviewed.effects, { filesystem: false, persistence: false, sourceMutation: false, destinationMutation: false, autosave: false });
const copyOnly = analyzeAirTransfer({ sourceText: source, destinationText: '', selection: airTransferSelectionItems(source, [1]), dependencyMode: 'animation-only', sourceSff, destinationSff }); assert.equal(copyOnly.items[0].copyDependencyStatus, 'referenced-action-not-selected'); assert.equal(copyOnly.includeSprites, false);
assert.throws(() => analyzeAirTransfer({ sourceText: source.replace('0,0,0,0,2', '0,0,0,0,3'), destinationText: destination, selection, sourceSff }), /selection changed/);
assert.throws(() => airTransferSelectionItems(source, [0, 0]), /stale, repeated/);

const duplicateAuthority = `[Begin Action 0]\n1,1,0,0,1\n\n[Begin Action 0]\n2,2,0,0,1\n\n[Begin Action 5]\nCopy Action 0\n`;
const duplicateReview = analyzeAirTransfer({ sourceText: duplicateAuthority, destinationText: '', selection: airTransferSelectionItems(duplicateAuthority, [1, 2]) });
assert.equal(duplicateReview.items[1].copyDependencyStatus, 'referenced-action-not-selected', 'a selected shadow duplicate cannot satisfy the exact first Copy Action authority');
assert.equal(duplicateReview.items[1].copyDependency.directTargetId, 'action:0@0');
assert.equal(duplicateReview.items[1].copyDependency.authorityId, 'action:0@0');
assert.deepStrictEqual(duplicateReview.copyClosureItems.map(item => item.id), ['action:0@0']);
assert(/^[A-F0-9]{64}$/.test(duplicateReview.analysisIdentity)); assert(Object.isFrozen(duplicateReview.copyClosureItems[0]));

const chain = `[Begin Action 1]\n3,4,0,0,1\n[Begin Action 2]\nCopy Action 1\n[Begin Action 3]\nCopy Action 2\n`;
const chainReview = analyzeAirTransfer({ sourceText: chain, destinationText: '', selection: airTransferSelectionItems(chain, [2]) });
assert.deepStrictEqual(chainReview.items[0].copyDependency.chainIds, ['action:2@1', 'action:1@0']);
assert.equal(chainReview.items[0].copyDependency.authorityId, 'action:1@0');
const cycle = `[Begin Action 1]\nCopy Action 2\n[Begin Action 2]\nCopy Action 1\n`;
assert.equal(analyzeAirTransfer({ sourceText: cycle, destinationText: '', selection: airTransferSelectionItems(cycle, [0]) }).items[0].copyDependencyStatus, 'cycle');
const missingCopy = `[Begin Action 4]\nCopy Action 99\n`, negativeCopy = `[Begin Action 4]\nCopy Action -1\n`;
assert.equal(analyzeAirTransfer({ sourceText: missingCopy, destinationText: '', selection: airTransferSelectionItems(missingCopy, [0]) }).items[0].copyDependencyStatus, 'unresolved');
assert.equal(analyzeAirTransfer({ sourceText: negativeCopy, destinationText: '', selection: airTransferSelectionItems(negativeCopy, [0]) }).items[0].copyDependencyStatus, 'invalid-negative-target');
let deepCopy = `[Begin Action 0]\n1,1,0,0,1\n`; for (let action = 1; action <= 9; action += 1) deepCopy += `[Begin Action ${action}]\nCopy Action ${action - 1}\n`;
assert.equal(analyzeAirTransfer({ sourceText: deepCopy, destinationText: '', selection: airTransferSelectionItems(deepCopy, [9]) }).items[0].copyDependencyStatus, 'chain-too-deep');

assert.throws(() => analyzeAirTransfer({ sourceText: source, destinationText: '', selection: null }), /selection/i);
let getterRuns = 0; const accessor = {}; Object.defineProperty(accessor, 'sourceText', { enumerable: true, get() { getterRuns += 1; return source; } });
assert.throws(() => analyzeAirTransfer(accessor), /accessor|data object/i); assert.equal(getterRuns, 0, 'hostile analysis accessors are never invoked');
let proxyRuns = 0; const proxy = new Proxy({}, { ownKeys() { proxyRuns += 1; throw new Error('trap'); } });
assert.throws(() => analyzeAirTransfer(proxy), /plain data object/i); assert.equal(proxyRuns, 0, 'hostile analysis proxies are rejected before traps run');
console.log('AIR Transfer exact action selection, shared sprite dependencies, conflict and animation-only/with-sprites review passed');
