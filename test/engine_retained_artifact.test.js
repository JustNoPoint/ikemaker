'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const migration = require('../src/engine_migration');
const engineModel = require('../src/engine_registry_model');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-retained-test-'));
try {
  const zip = path.join(root, 'custom.zip');
  fs.writeFileSync(zip, Buffer.from('exact retained artifact'));
  const digest = migration.sha256File(zip);
  const manifest = path.join(root, 'custom.json');
  const body = { schemaVersion: 1, engine: 'IKEMEN GO', repository: 'creator/ikemen-fork', platform: 'windows-x64', channel: 'nightly', version: 'feature-branch', commit: '1'.repeat(40), id: 'ikemen-go-1.0.0-windows-x64', localArtifact: 'custom.zip', artifactSize: fs.statSync(zip).size, artifactSha256: digest };
  fs.writeFileSync(manifest, JSON.stringify(body));

  const unreviewed = migration.parseRetainedArtifact(manifest, zip, []);
  assert.strictEqual(unreviewed.reviewedBinding, null, 'custom fork must not certify itself');
  assert.strictEqual(unreviewed.candidate.provenance.repository, 'creator/ikemen-fork');
  assert.strictEqual(unreviewed.candidate.channel, 'custom', 'a custom repository cannot self-label as official Nightly');
  assert.notStrictEqual(unreviewed.candidate.id, body.id, 'a manifest cannot forge an official catalog ID');
  const reviewed = migration.parseRetainedArtifact(manifest, zip, [{ repository: body.repository, platform: body.platform, commit: body.commit, artifactSha256: digest }]);
  assert(reviewed.reviewedBinding, 'an independently supplied exact binding should be recognized');
  const persisted = engineModel.normalizeBuild({ ...unreviewed.candidate, source: { futureAutomaticUpgradeAuthorized: false } });
  assert.strictEqual(persisted.provenance.repository, body.repository, 'repository provenance must survive catalog normalization');
  assert.strictEqual(persisted.source.futureAutomaticUpgradeAuthorized, false, 'automatic upgrades must remain unauthorized');

  const otherZip = path.join(root, 'other.zip'); fs.writeFileSync(otherZip, Buffer.from('different exact bytes'));
  const otherDigest = migration.sha256File(otherZip), otherManifest = path.join(root, 'other.json');
  fs.writeFileSync(otherManifest, JSON.stringify({ ...body, localArtifact: 'other.zip', artifactSize: fs.statSync(otherZip).size, artifactSha256: otherDigest }));
  const other = migration.parseRetainedArtifact(otherManifest, otherZip, []);
  assert.notStrictEqual(other.candidate.id, unreviewed.candidate.id, 'same commit with different artifact bytes needs a different immutable ID');
  const otherRepoManifest = path.join(root, 'other-repo.json');
  fs.writeFileSync(otherRepoManifest, JSON.stringify({ ...body, repository: 'another/ikemen-fork' }));
  const otherRepo = migration.parseRetainedArtifact(otherRepoManifest, zip, []);
  assert.notStrictEqual(otherRepo.candidate.id, unreviewed.candidate.id, 'different repositories need different immutable IDs');

  assert.throws(() => migration.parseRetainedArtifact(manifest, otherZip, []), /does not match/, 'a different selected ZIP must fail');
  const forged = { ...body, verification: { artifact: 'verified' } }; fs.writeFileSync(manifest, JSON.stringify(forged));
  assert.strictEqual(migration.parseRetainedArtifact(manifest, zip, []).reviewedBinding, null, 'manifest verification labels must be ignored');
  fs.writeFileSync(manifest, JSON.stringify({ ...body, localArtifact: '../custom.zip' }));
  assert.throws(() => migration.parseRetainedArtifact(manifest, zip, []), /simple filename/, 'path escape must fail');
  fs.writeFileSync(manifest, JSON.stringify(body));
  fs.writeFileSync(manifest, JSON.stringify({ ...body, localArtifactSha256: '2'.repeat(64) }));
  assert.throws(() => migration.parseRetainedArtifact(manifest, zip, []), /conflicting localArtifactSha256/, 'conflicting digest claims must fail');
  fs.writeFileSync(manifest, JSON.stringify({ ...body, recoveredFrom: { workflowHeadSha: '2'.repeat(40) } }));
  assert.throws(() => migration.parseRetainedArtifact(manifest, zip, []), /workflow head/, 'conflicting commit claims must fail');
  fs.writeFileSync(manifest, JSON.stringify(body));
  const frozen = migration.parseRetainedArtifact(manifest, zip, []);
  const acquisition = migration.acquireCandidate(frozen.candidate, path.join(root, 'thenable-stage'), frozen);
  assert(acquisition && typeof acquisition.then === 'function', 'VS Code progress acquisition must always return a Thenable');
  fs.appendFileSync(zip, '!');
  assert.throws(() => migration.stageRetainedArtifact(frozen, path.join(root, 'stage')), /changed after review/, 'selected file alteration must fail before staging');
  console.log('Retained/custom artifacts require exact identity, ignore self-certification, reject path escape, and freeze selected bytes');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
