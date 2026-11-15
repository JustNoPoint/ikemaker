"use strict";

const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { draftRevision } = require("./sff_creator_builtin_lifecycle");

function liveFileHash(filename) {
  const fd = fs.openSync(filename, "r");
  try {
    const before = fs.fstatSync(fd),
      digest = crypto.createHash("sha256"),
      chunk = Buffer.alloc(65536);
    if (!before.isFile())
      throw Error("The retained SFF target is not a regular file.");
    let count = 0,
      length;
    while ((length = fs.readSync(fd, chunk, 0, chunk.length, null)) > 0) {
      digest.update(chunk.subarray(0, length));
      count += length;
    }
    const after = fs.fstatSync(fd),
      named = fs.statSync(filename);
    for (const stat of [after, named]) {
      if (
        count !== before.size ||
        !stat.isFile() ||
        ["dev", "ino", "size", "mtimeMs", "ctimeMs"].some(
          (key) => stat[key] !== before[key],
        )
      )
        throw Error(
          "The retained SFF target changed while verifying its captured result.",
        );
    }
    return digest.digest("hex");
  } finally {
    fs.closeSync(fd);
  }
}

function readCapturedResult(locator) {
  const snapshot =
    require("./sff_creator_operation_vault").readCreatorOperationVaultCheckpointSnapshot(
      {
        operationDirectory: locator.operationDirectory,
        expectedOperationId: locator.expectedOperationId,
        expectedLatestCheckpointHash: locator.expectedLatestCheckpointHash,
        expectedVaultRoot: locator.expectedVaultRoot,
      },
    );
  const verifier = require("./sff_creator_saved_execution_result_verifier");
  const resultLocator = verifier.findCreatorRetainedExecutionResultLocator(locator);
  if (!resultLocator) return null;
  const retained =
    resultLocator.expectedLatestCheckpointHash === locator.expectedLatestCheckpointHash
      ? verifier.readCreatorSavedExecutionResultRestartAuthority(resultLocator)
      : verifier.readCreatorHistoricalExecutionResultRestartAuthority(
          locator,
          resultLocator,
        );
  const hashes = retained.copyRestartAuthority().expectedHashes;
  return {
    operationId: retained.verification.operationId,
    outcomeClass: retained.verification.outcomeClass,
    activePath: snapshot.authority.activePath,
    beforeHash: hashes.expectedActiveByteHash,
    resultHash: hashes.expectedCandidateByteHash,
  };
}

// Only host-persisted drafts and independently verified vault evidence participate.
// Never substitute target metadata supplied by a webview into the retained revision.
async function resolveOwnResultDraft({
  key,
  stored,
  current,
  normalize,
  continuations,
  readProof = readCapturedResult,
  readLiveHash = liveFileHash,
}) {
  const normalized = normalize(current),
    revision = draftRevision(normalized);
  const ordinary = await continuations.resume({
    draftKey: key,
    currentDraftRevision: revision,
  });
  const unchanged = {
    draft: normalized,
    revision,
    continuation: ordinary,
    reconciled: false,
  };
  if (
    ordinary.status !== "draft-drift-review-required" ||
    !stored?.target?.path
  )
    return unchanged;

  const retainedRevision = draftRevision(stored);
  if (retainedRevision !== ordinary.draftRevision) return unchanged;
  const refreshed = normalize(stored);
  // Every normalized non-target field must still equal the exact retained draft.
  // This includes source hashes/staleness, overrides, numbering and review evidence.
  if (
    draftRevision({ ...refreshed, target: stored.target }) !==
      retainedRevision ||
    draftRevision({ ...normalized, target: stored.target }) !== retainedRevision
  )
    return unchanged;
  for (const field of ["path", "expectedFingerprint"]) {
    if (normalized.target?.[field] !== stored.target[field]) return unchanged;
  }
  const locator = ordinary.continuationLocator;
  if (!locator) return unchanged;
  const proof = readProof(locator);
  if (
    !proof ||
    !["committed", "committed-cleanup-required"].includes(proof.outcomeClass) ||
    proof.operationId !== ordinary.operationId ||
    path.resolve(proof.activePath) !== path.resolve(stored.target.path) ||
    proof.beforeHash !== stored.target.expectedFingerprint ||
    proof.resultHash !== refreshed.target?.fingerprint ||
    normalized.target?.fingerprint !== proof.resultHash
  )
    return unchanged;
  if (readLiveHash(proof.activePath) !== proof.resultHash) return unchanged;

  // Re-run startup verification using the original revision; this does not append
  // a checkpoint or grant execution/classification authority.
  const continuation = await continuations.resume({
    draftKey: key,
    currentDraftRevision: retainedRevision,
  });
  if (
    continuation.status !== "restart-review-required" ||
    continuation.operationId !== ordinary.operationId ||
    continuation.draftRevision !== retainedRevision ||
    draftRevision({
      locator: continuation.continuationLocator,
      binding: continuation.binding || null,
    }) !==
      draftRevision({
        locator: ordinary.continuationLocator,
        binding: ordinary.binding || null,
      })
  )
    return unchanged;
  return {
    draft: JSON.parse(JSON.stringify(stored)),
    revision: retainedRevision,
    continuation,
    reconciled: true,
  };
}

module.exports = { resolveOwnResultDraft };
