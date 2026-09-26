'use strict';
const assert = require('assert');
const model = require('../src/engine_update_model');

const project = { id: 'game', engineTarget: { buildId: 'stable' } }, candidate = { id: 'nightly-a', commit: 'a'.repeat(40), assetId: 7, artifactUrl: 'https://example.test/a.zip', artifactSha256: 'b'.repeat(64) };
assert(model.shouldPrompt({}, project, candidate));
const stayed = model.recordDecision({}, project, candidate, 'stay', { decidedAt: '2026-09-25T00:00:00Z', projectFingerprint: 'one' });
assert.equal(model.shouldPrompt(stayed, project, candidate, { projectFingerprint: 'one' }), false);
assert.equal(model.shouldPrompt(stayed, project, { ...candidate, commit: 'c'.repeat(40) }, { projectFingerprint: 'one' }), true);
assert.equal(model.shouldPrompt(stayed, project, candidate, { projectFingerprint: 'changed' }), true);
const reminded = model.recordDecision({}, project, candidate, 'remind', { remindAfter: '2026-10-01T00:00:00Z' });
assert.equal(model.shouldPrompt(reminded, project, candidate, { now: '2026-09-26T00:00:00Z' }), false);
assert.equal(model.shouldPrompt(reminded, project, candidate, { now: '2026-10-02T00:00:00Z' }), true);

const safe = model.validateArchiveEntries([{ path: 'Ikemen_GO/data/common.const' }, { path: 'Ikemen_GO/Ikemen_GO.exe' }], { stripRoot: 'Ikemen_GO' });
assert.equal(safe.valid, true); assert.equal(safe.accepted.length, 2);
for (const entry of ['Ikemen_GO/../evil.exe', 'C:/evil.exe', '/evil.exe', 'Ikemen_GO/unknown.bin']) {
  assert.equal(model.validateArchiveEntries([{ path: entry }], { stripRoot: 'Ikemen_GO' }).valid, false, entry);
}
const protectedResult = model.validateArchiveEntries([{ path: 'Ikemen_GO/chars/kfm/kfm.def' }], { stripRoot: 'Ikemen_GO' });
assert.equal(protectedResult.valid, true); assert.equal(protectedResult.accepted.length, 0); assert.equal(protectedResult.protectedEntries.length, 1);
assert.equal(model.validateArchiveEntries([{ path: 'Ikemen_GO/data/A' }, { path: 'Ikemen_GO/data/a' }], { stripRoot: 'Ikemen_GO' }).valid, false);
assert.equal(model.validateArchiveEntries([{ path: 'Ikemen_GO/data/x', type: 'symlink' }], { stripRoot: 'Ikemen_GO' }).valid, false);

const cfg = model.configMigrationPlan('[Default]\nLegacyGameDistanceSpec = 1\n', '[Legacy]\nGameDistanceSpec = 0\n', [{ fromSection: 'Default', fromKey: 'LegacyGameDistanceSpec', toSection: 'Legacy', toKey: 'GameDistanceSpec' }]);
assert.equal(cfg.supported, true); assert.equal(cfg.changes[0].oldValue, '1');
assert.equal(model.configMigrationPlan('[A]\nKnown=1\n', '[A]\nKnown=2\nNew=3\n[B]\nOther=4\n').additions.length, 2);
const conflict = model.configMigrationPlan('[Default]\nLegacyGameDistanceSpec = 1\n[Legacy]\nGameDistanceSpec = 2\n', '[Legacy]\nGameDistanceSpec = 0\n', [{ fromSection: 'Default', fromKey: 'LegacyGameDistanceSpec', toSection: 'Legacy', toKey: 'GameDistanceSpec' }]);
assert.equal(conflict.supported, false);

assert.equal(model.rollbackConflicts({ writes: [{ relative: 'Ikemen_GO.exe', installedSha256: 'a'.repeat(64) }] }, { 'Ikemen_GO.exe': 'b'.repeat(64) }).length, 1);
const risk = model.riskAssessment({ candidate, semanticChanges: ['push'], configMigrations: ['rename'], onlineChanges: ['rollback'], projectMaturity: 'early' });
assert.notEqual(risk.level, 'Low'); assert.equal(risk.guidanceOnly, true);
const unknown = model.riskAssessment({ candidate: { id: 'x' } }); assert.equal(unknown.level, 'Unknown');
console.log('Engine update decision and migration-safety model tests passed');
