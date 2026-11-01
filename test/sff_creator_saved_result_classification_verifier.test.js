'use strict';

const assert = require('assert');
const fs = require('fs');
const { CREATOR_LIFECYCLE_EVIDENCE_REGISTRY } = require('../src/sff_creator_lifecycle_evidence_registry');
const { verifySavedCreatorResultClassificationFromVault } = require('../src/sff_creator_saved_result_classification_verifier');

assert.strictEqual(typeof verifySavedCreatorResultClassificationFromVault, 'function');
let traps = 0;
const proxy = new Proxy({}, { getPrototypeOf() { traps += 1; throw new Error('must not run'); } });
assert.throws(() => verifySavedCreatorResultClassificationFromVault(proxy), /plain closed|locator/i);
assert.strictEqual(traps, 0);

for (const name of ['TerminalNeedsHistory', 'RestartRecoveryRequired', 'ManualRecoveryRequired']) {
  const row = CREATOR_LIFECYCLE_EVIDENCE_REGISTRY.states.find(item => item.state === name);
  assert.strictEqual(row.authoritative, true);
  assert.strictEqual(row.supportStatus, 'replay-available');
  assert.deepStrictEqual(row.prerequisiteIds, []);
  assert.strictEqual(row.replayContract.module, './sff_creator_saved_result_classification_verifier');
  assert.strictEqual(row.replayContract.export, 'verifySavedCreatorResultClassificationFromVault');
  assert.strictEqual(row.replayContract.observationClass, 'filesystem-read-only');
  assert.strictEqual(row.replayContract.canonicalComparisonOnly, true);
  assert.deepStrictEqual(row.evidenceRoles.map(role => role.id), ['retained-integration-and-state-root-authorities', 'result-classification-route-manifest', 'immutable-result-captured-predecessor-relationship', 'saved-result-classification-plan', name === 'TerminalNeedsHistory' ? 'saved-history-reconciliation-plan' : 'saved-restart-recovery-plan', 'inherited-result-capture-evidence']);
}

const source = fs.readFileSync(require.resolve('../src/sff_creator_saved_result_classification_verifier'), 'utf8');
assert(!/child_process|vscode|executeCreatorAdoption|appendCreatorOperationCheckpoint|writeCreatorHistoryRecord/.test(source));
console.log('sff_creator_saved_result_classification_verifier.test.js: all tests passed');
