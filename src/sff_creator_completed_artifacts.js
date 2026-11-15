'use strict';

const path = require('path');
const crypto = require('crypto');
const { reviewedPathKey } = require('./sff_creator_reviewed_path');
const { hashCanonical } = require('./sff_capability_report');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

// A filename prefix alone never establishes ownership. Only immutable bytes
// retained by an independently verified Completed operation can be excluded.
function readAuthorities(vaultRoot, activePath, dependencies) {
  if (!vaultRoot) return [];
  const vault = dependencies.vault;
  let found;
  try {
    found = vault.discoverCreatorOperationVaults({vaultRoot, maximumOperations:256});
  } catch (error) {
    // No partial discovery result can authorize a foreign artifact. Preserve a
    // bounded explanation so callers can present an ordinary blocked plan.
    return Object.defineProperty([], 'discoveryFailure', {
      value:String(error?.message || error).slice(0,1000), enumerable:false
    });
  }
  const result = [];
  for (const operation of found.operations) {
    if (operation.lifecycleState !== 'Completed') continue;
    const locator = {operationDirectory:operation.operationDirectory,
      expectedOperationId:operation.operationId,
      expectedLatestCheckpointHash:operation.latestCheckpointHash,
      expectedVaultRoot:vaultRoot};
    try {
      const snapshot = vault.readCreatorOperationVaultCheckpointSnapshot(locator);
      if (reviewedPathKey(snapshot.authority.activePath) !== reviewedPathKey(activePath)) continue;
      const verified = dependencies.verifyCompleted(locator);
      if (reviewedPathKey(verified.activePath) !== reviewedPathKey(activePath)) continue;
      const operationRows = [];
      // One freshly verified inventory is a coherent observation of these retained
      // artifacts. Per-artifact accessors would replay the entire vault for every
      // journal. Do not retain this inventory between calls or user actions.
      const artifacts = new Map(snapshot.readArtifactInventoryBytes()
        .map(row => [row.name, row.bytes]));
      const layout = JSON.parse(artifacts.get('sff17b-execution-layout-approval-receipt'));
      const layoutHash = hashCanonical(layout);
      const addDigest = (filename, byteHash, byteLength) => {
        if (typeof filename !== 'string' || !/^[0-9a-f]{64}$/.test(byteHash) ||
            !Number.isSafeInteger(byteLength) || byteLength < 0 ||
            reviewedPathKey(path.dirname(filename)) !== reviewedPathKey(path.dirname(activePath))) return;
        operationRows.push({path:filename, byteHash, byteLength, operationId:operation.operationId,
          completedCheckpointHash:operation.latestCheckpointHash});
      };
      const add = (filename, bytes) => {
        if (Buffer.isBuffer(bytes)) addDigest(filename, sha(bytes), bytes.length);
      };
      for (const row of snapshot.authority.artifacts) {
        if (!/^sff17d-j\d+-/.test(row.name)) continue;
        const bytes = artifacts.get(row.name), journal = JSON.parse(bytes);
        if (journal.operationId !== layoutHash ||
            journal.layoutApprovalReceiptHash !== journal.operationId) continue;
        add(layout.paths.journalPaths[journal.state], bytes);
      }
      if (snapshot.authority.artifacts.some(row=>row.name==='sff19-history-replay-input')) {
        const input = dependencies.restoreHistory(snapshot);
        const receipt = JSON.parse(input.recoveryReceiptArtifactBytes);
        if (receipt.status !== 'completed' || receipt.terminalState !== 'recovery_complete' ||
            receipt.recoveryCompleted !== true) throw new Error('Completed recovery receipt is not terminal.');
        for (const row of input.recoveryJournalArtifacts) {
          add(row.path, row.artifactBytes);
          // The capsule's exact bytes are attested by each retained recovery
          // journal, including the terminal journal. Keep it; never remove it.
          const journal = JSON.parse(row.artifactBytes);
          const capsule = journal.observations?.paths?.capsule;
          if (capsule?.exists && receipt.retainedRecoveryArtifacts.includes(capsule.path)) {
            addDigest(capsule.path, capsule.byteHash, capsule.byteLength);
          }
        }
      }
      result.push(...operationRows);
    } catch (_) { /* Unverifiable operations grant no exclusion. */ }
  }
  return result;
}

function completedArtifactAuthorities(vaultRoot, activePath) {
  return readAuthorities(vaultRoot, activePath, {
    vault:require('./sff_creator_operation_vault'),
    verifyCompleted:require('./sff_creator_saved_completed_verifier').verifySavedCreatorCompletedFromVault,
    restoreHistory:require('./sff_creator_recovery_history_input').restoreHistoryInput
  });
}

function matchesCompletedArtifact(row, authorities) {
  const matches = authorities.filter(item=>reviewedPathKey(item.path)===reviewedPathKey(row.path));
  return row.status === 'observed' && matches.length > 0 &&
    new Set(matches.map(item=>item.operationId)).size === 1 &&
    matches.every(item=>item.byteHash===row.byteHash && item.byteLength===row.byteLength);
}

module.exports = {completedArtifactAuthorities, matchesCompletedArtifact,
  createCompletedArtifactReaderForTest:dependencies=>(root,active)=>readAuthorities(root,active,dependencies)};
