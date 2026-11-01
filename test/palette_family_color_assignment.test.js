'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const colors = require('../src/palette_family_color_assignment');

const hash = character => character.repeat(64);
const MASTER = [20, 30, 40, 255];
const RED = [210, 20, 30, 255];
const BLUE = [20, 30, 210, 255];
const GREEN = [20, 210, 30, 255];

function fixture(defaults = {}, slotCount = 1) {
  const selections = [
    { physicalIndex: 0, coordinate: { group: 1, number: 1 }, provenance: [{ kind: 'named', groupId: 'costume-remap', rangeIndex: 0 }, { kind: 'explicit', rangeIndex: 0 }] },
    { physicalIndex: 1, coordinate: { group: 1, number: 2 }, provenance: [{ kind: 'named', groupId: 'costume-remap', rangeIndex: 0 }] },
    { physicalIndex: 2, coordinate: { group: 2, number: 1 }, provenance: [{ kind: 'named', groupId: 'costume-remap', rangeIndex: 0 }, { kind: 'explicit', rangeIndex: 0 }] },
    { physicalIndex: 3, coordinate: { group: 2, number: 2 }, provenance: [{ kind: 'named', groupId: 'costume-remap', rangeIndex: 0 }] }
  ];
  const expansionPlan = { planHash: hash('e'), inventoryHash: hash('i'), metadataHash: hash('m'), metadataRevision: 7, selections };
  const slotTopology = [{ destinationIndex: 250, kind: 'new', rgba: MASTER, label: 'new accent' }];
  if (slotCount > 1) slotTopology.push({ destinationIndex: 251, kind: 'new', rgba: [50, 60, 70, 255], label: 'new shade' });
  const candidate = { candidateHash: hash('c'), topologyPlanHash: hash('t'), topologyMappingHash: hash('p'), expansionPlanHash: expansionPlan.planHash, inventoryHash: expansionPlan.inventoryHash, metadataHash: expansionPlan.metadataHash, metadataRevision: expansionPlan.metadataRevision, slotTopology, activeSffChanged: false, adoption: false };
  return { candidate, expansionPlan, state: colors.createState({ candidate, expansionPlan, defaults }) };
}

// Exact expansion order remains palette-major, then new-index order.
const ordered = fixture({}, 2);
assert.deepStrictEqual(ordered.state.items.map(item => [item.physicalIndex, item.index]), [[0, 250], [0, 251], [1, 250], [1, 251], [2, 250], [2, 251], [3, 250], [3, 251]]);
assert.strictEqual(colors.status(ordered.state).current.sourceBadge, 'Master color');
assert.deepStrictEqual(colors.status(ordered.state).current.color, MASTER);

// Deterministic precedence: palette override > non-conflicting scoped default > operation > master.
const precedence = fixture({ operation: { 250: GREEN }, named: [{ groupId: 'costume-remap', index: 250, rgba: RED }], explicitRanges: [{ rangeIndex: 0, index: 250, rgba: RED }], perPalette: [{ physicalIndex: 0, index: 250, rgba: BLUE }] });
let report = colors.status(precedence.state);
assert.deepStrictEqual(report.current.color, BLUE);
assert.strictEqual(report.current.sourceBadge, 'Palette override');
let state = colors.next(precedence.state);
report = colors.status(state);
assert.deepStrictEqual(report.current.color, RED);
assert.strictEqual(report.current.sourceBadge, 'Named mapping default');
assert(report.current.provenance.some(entry => entry.kind === 'named-mapping-default'));
const operationOnly = fixture({ operation: { 250: GREEN } });
assert.strictEqual(colors.status(operationOnly.state).current.sourceBadge, 'Operation default');
const rangeOnly = fixture({ explicitRanges: [{ rangeIndex: 0, index: 250, rgba: BLUE }] });
assert.strictEqual(colors.status(rangeOnly.state).current.sourceBadge, 'Range default');
assert.deepStrictEqual(colors.status(rangeOnly.state).current.color, BLUE);

// Differing overlapping named/range defaults are blockers, not hidden priority.
const overlap = fixture({ named: [{ groupId: 'costume-remap', index: 250, rgba: RED }], explicitRanges: [{ rangeIndex: 0, index: 250, rgba: BLUE }] });
report = colors.status(overlap.state);
assert.strictEqual(report.current.conflict, true);
assert.strictEqual(report.current.color, null);
assert.throws(() => colors.applyAndNext(overlap.state), /conflicting scoped defaults/);
assert.strictEqual(colors.summary(overlap.state).counts.conflicts, 2);
const resolvedOverlap = fixture({ named: [{ groupId: 'costume-remap', index: 250, rgba: RED }], explicitRanges: [{ rangeIndex: 0, index: 250, rgba: BLUE }], perPalette: [{ physicalIndex: 0, index: 250, rgba: GREEN }] });
assert.deepStrictEqual(colors.status(resolvedOverlap.state).current.color, GREEN);

// Editing is local. Enter/Apply & Next records provenance and does not mutate the base.
state = colors.editCurrent(precedence.state, GREEN);
assert.deepStrictEqual(colors.status(state).current.color, GREEN);
assert.strictEqual(colors.status(state).current.sourceBadge, 'Palette override draft');
state = colors.applyAndNext(state);
assert.strictEqual(state.cursor, 1);
assert.strictEqual(colors.summary(state).rows[0].sourceBadge, 'Palette override');
assert.deepStrictEqual(colors.status(state).current.color, RED, 'the next palette still inherits the named mapping base');

// Copy master, copy previous, navigation, skip, and undo retain explicit state.
state = colors.copyMaster(precedence.state);
assert.deepStrictEqual(colors.status(state).current.color, MASTER);
state = colors.applyAndNext(state);
state = colors.copyPrevious(state);
assert.deepStrictEqual(colors.status(state).current.color, MASTER);
state = colors.skipCurrent(state);
assert.strictEqual(colors.summary(state).counts.skipped, 1);
assert.strictEqual(colors.summary(state).counts.unresolved, 3, 'skipped items remain unresolved for atomic Finish');
const beforeBack = state.cursor;
state = colors.back(state);
assert.strictEqual(state.cursor, beforeBack - 1);
state = colors.next(state);
assert.strictEqual(state.cursor, beforeBack);
state = colors.undo(state);
assert.strictEqual(state.cursor, beforeBack - 1, 'undo reverses the last navigation mutation');
let undoEdit = colors.editCurrent(fixture().state, RED);
undoEdit = colors.undo(undoEdit);
assert.strictEqual(colors.status(undoEdit).current.sourceBadge, 'Master color', 'undo removes a local palette edit');

// Base-from-here only changes remaining unresolved members of the visible scope.
state = colors.applyAndNext(fixture({ operation: { 250: GREEN } }).state); // physical 0 is reviewed green
state = colors.setActiveScope(state, { kind: 'named', id: 'costume-remap' });
state = colors.setBaseFromHere(state, RED);
assert.deepStrictEqual(colors.summary(state).rows[0].color, GREEN, 'reviewed palettes retain their accepted value');
assert.deepStrictEqual(colors.status(state).current.color, RED);
assert.strictEqual(colors.status(state).current.sourceBadge, 'Base from here');

// Reviewed batch-range updates unresolved (including skipped) members only.
state = colors.skipCurrent(state); // skip physical 1, move to physical 2
state = colors.applyBatchScope(state, BLUE);
report = colors.summary(state);
assert.deepStrictEqual(report.rows[0].color, GREEN);
assert.strictEqual(report.rows[0].sourceBadge, 'Operation default');
assert(report.rows.slice(1).every(row => row.status === 'reviewed' && row.sourceBadge === 'Reviewed batch range'));
assert.strictEqual(report.counts.unresolved, 0);
assert.strictEqual(report.readyForLaterCandidate, true);
let inheritedBatch = colors.setActiveScope(fixture({ named: [{ groupId: 'costume-remap', index: 250, rgba: RED }] }).state, { kind: 'named', id: 'costume-remap' });
inheritedBatch = colors.applyBatchScope(inheritedBatch);
assert(colors.summary(inheritedBatch).rows.every(row => row.status === 'reviewed' && row.color.join(',') === RED.join(',')), 'batch-range without an edited color accepts the current visible base');

// Explicit-range base applies to its exact visible members, not named-only palettes.
state = colors.setActiveScope(fixture({ operation: { 250: GREEN } }).state, { kind: 'explicit-range', rangeIndex: 0 });
state = colors.setBaseFromHere(state, BLUE);
report = colors.summary(state);
assert.deepStrictEqual(report.rows[0].color, BLUE);
assert.deepStrictEqual(report.rows[2].color, BLUE);
assert.deepStrictEqual(report.rows[1].color, GREEN);
assert.deepStrictEqual(report.rows[3].color, GREEN);
let outsideScope = colors.next(colors.setActiveScope(fixture().state, { kind: 'explicit-range', rangeIndex: 0 }));
assert.throws(() => colors.applyBatchScope(outsideScope), /outside the visible Quick Browse scope/);

// Escape retains drafts; Finish is an atomic, non-writing summary only.
state = colors.editCurrent(fixture().state, RED);
state = colors.escapeBrowse(state);
assert.strictEqual(colors.status(state).browsing, false);
assert.deepStrictEqual(colors.status(state).current.color, RED);
state = colors.resumeBrowse(state);
assert.strictEqual(colors.status(state).browsing, true);
report = colors.summary(state);
assert.strictEqual(report.counts.inherited, 4);
assert.strictEqual(report.counts.inheritedBySource['Palette override draft'], 1);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-family-color-finish-'));
const marker = path.join(root, 'active.sff');
fs.writeFileSync(marker, 'unchanged');
try {
  const finished = colors.finish(state);
  assert.strictEqual(finished.summary.committed, false);
  assert.strictEqual(finished.summary.activeSffChanged, false);
  assert.strictEqual(fs.readFileSync(marker, 'utf8'), 'unchanged');
} finally { fs.rmSync(root, { recursive: true, force: true }); }

// Every retained session is hash bound and rejects inventory/metadata/topology/candidate drift.
const bound = fixture();
colors.assertBindings(bound.state, bound);
assert.throws(() => colors.assertBindings(bound.state, { ...bound, candidate: { ...bound.candidate, candidateHash: hash('d') } }), /sources changed/);
assert.throws(() => colors.assertBindings(bound.state, { ...bound, candidate: { ...bound.candidate, topologyMappingHash: hash('q') } }), /sources changed/);
assert.throws(() => colors.assertBindings(bound.state, { ...bound, candidate: { ...bound.candidate, inventoryHash: hash('z') } }), /sources changed/);
assert.throws(() => colors.assertBindings(bound.state, { ...bound, expansionPlan: { ...bound.expansionPlan, planHash: hash('x') }, candidate: { ...bound.candidate, expansionPlanHash: hash('x') } }), /sources changed/);
assert.throws(() => colors.assertBindings(bound.state, { ...bound, expansionPlan: { ...bound.expansionPlan, metadataRevision: 8 }, candidate: { ...bound.candidate, metadataRevision: 8 } }), /sources changed/);
const tampered = JSON.parse(JSON.stringify(bound.state)); tampered.cursor = 2;
assert.throws(() => colors.verifyState(tampered), /state hash is invalid/);
assert.throws(() => colors.createState({ ...bound, defaults: { operation: { nope: RED } } }), /index must be 0 through 255/);

console.log('Palette-family retained color assignment, Quick Browse state, provenance, conflict, drift, and no-write tests passed');
