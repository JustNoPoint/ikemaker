'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const migration = require('../src/engine_migration');

const release = { id: 2, tag_name: 'nightly', html_url: 'https://example.test/release', assets: [{ id: 5, name: 'Ikemen_GO-nightly-windows-x64.zip', browser_download_url: 'https://example.test/a.zip', size: 20, digest: `sha256:${'a'.repeat(64)}` }] };
assert.equal(migration.chooseWindowsAsset(release).id, 5);
assert.throws(() => migration.chooseWindowsAsset({ assets: [] }), /Expected one/);
const reviewed = { id: 'n', commit: 'c', releaseId: 1, releaseTag: 'nightly', assetId: 2, artifactName: 'a.zip', artifactUrl: 'https://x' };
assert(migration.sameCandidate(reviewed, { ...reviewed })); assert(!migration.sameCandidate(reviewed, { ...reviewed, assetId: 3 }));
assert.equal(migration.commonArchiveRoot([{ path: 'root/a' }, { path: 'root/b' }]), 'root');
const migrated = migration.applyConfigMappings('[Default]\nLegacyGameDistanceSpec = 1\n\n[Legacy]\nOther = 2\n', { changes: [{ fromSection: 'Default', fromKey: 'LegacyGameDistanceSpec', toSection: 'Legacy', toKey: 'GameDistanceSpec', oldValue: '1' }] });
assert(/\[Legacy\][\s\S]*GameDistanceSpec = 1/.test(migrated));
const escaped = migration.applyConfigMappings('[A+B]\nOld.Key = custom\n', { changes: [{ fromSection: 'A+B', fromKey: 'Old.Key', toSection: 'New[Key]', toKey: 'Value+', oldValue: 'custom' }] });
assert(/\[New\[Key\]\][\s\S]*Value\+ = custom/.test(escaped), 'INI names containing regex characters must migrate literally');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-engine-snapshot-'));
try {
  const game = path.join(temp, 'game'), backups = path.join(temp, 'backups'); fs.mkdirSync(path.join(game, 'data'), { recursive: true }); fs.mkdirSync(path.join(game, 'chars'), { recursive: true }); fs.mkdirSync(path.join(game, 'save'), { recursive: true });
  fs.writeFileSync(path.join(game, 'Ikemen_GO.exe'), 'stable'); fs.writeFileSync(path.join(game, 'LICENSES.txt'), 'license'); fs.writeFileSync(path.join(game, 'data', 'common.const'), 'common'); fs.writeFileSync(path.join(game, 'chars', 'private.def'), 'private'); fs.writeFileSync(path.join(game, 'save', 'config.ini'), '[Default]\n');
  const result = migration.snapshotEngine(game, backups, { version: '1.0.0', commit: 'a'.repeat(40) });
  assert(fs.existsSync(path.join(result.target, 'Ikemen_GO.exe'))); assert(fs.existsSync(path.join(result.target, 'data', 'common.const'))); assert(fs.existsSync(path.join(result.target, 'save', 'config.ini'))); assert(!fs.existsSync(path.join(result.target, 'chars', 'private.def'))); assert(result.manifest.exclusions.includes('chars'));
  const installedHash = migration.sha256File(path.join(game, 'Ikemen_GO.exe')), fake = { journal: { state: 'files-applied', root: game, backup: result.target, writes: [{ relative: 'Ikemen_GO.exe', existed: true, beforeSha256: installedHash, intendedSha256: installedHash, installedSha256: installedHash }] }, journalFile: path.join(backups, 'journal.json'), lock: { release() {} } };
  fs.writeFileSync(fake.journalFile, '{}'); migration.rollbackMigration(fake); assert.equal(fs.readFileSync(path.join(game, 'Ikemen_GO.exe'), 'utf8'), 'stable');
  const baseline = path.join(temp, 'baseline'), candidate = path.join(temp, 'candidate'); fs.mkdirSync(path.join(baseline, 'data'), { recursive: true }); fs.mkdirSync(path.join(candidate, 'data'), { recursive: true });
  fs.writeFileSync(path.join(baseline, 'data', 'same'), 'base'); fs.writeFileSync(path.join(candidate, 'data', 'same'), 'next'); fs.writeFileSync(path.join(game, 'data', 'same'), 'base');
  fs.writeFileSync(path.join(baseline, 'data', 'custom'), 'base'); fs.writeFileSync(path.join(candidate, 'data', 'custom'), 'base'); fs.writeFileSync(path.join(game, 'data', 'custom'), 'mine');
  fs.writeFileSync(path.join(baseline, 'data', 'conflict'), 'base'); fs.writeFileSync(path.join(candidate, 'data', 'conflict'), 'next'); fs.writeFileSync(path.join(game, 'data', 'conflict'), 'mine');
  const classified = migration.classifyLocalFiles(game, baseline, candidate, ['same','custom','conflict'].map((name) => ({ relative: `data/${name}`, type: 'file' })));
  assert.equal(classified.install.length, 1); assert.equal(classified.preserve.length, 1); assert.equal(classified.conflicts.length, 1);
  fs.writeFileSync(path.join(baseline, 'data', 'obsolete-clean'), 'old'); fs.writeFileSync(path.join(game, 'data', 'obsolete-clean'), 'old');
  fs.writeFileSync(path.join(baseline, 'data', 'obsolete-custom'), 'old'); fs.writeFileSync(path.join(game, 'data', 'obsolete-custom'), 'mine');
  const obsolete = migration.classifyObsoleteFiles(game, baseline, candidate, ['obsolete-clean','obsolete-custom'].map((name) => ({ relative: `data/${name}`, type: 'file' })), []);
  assert.deepEqual(obsolete.safeRemove.map((item) => item.relative), ['data/obsolete-clean']);
  assert.deepEqual(obsolete.preserve.map((item) => item.relative), ['data/obsolete-custom']);

  const live = path.join(temp, 'live'), staged = path.join(temp, 'staged'), recovery = path.join(temp, 'recovery'), registry = path.join(live, '.ikemen', 'project-registry.json');
  fs.mkdirSync(path.join(live, 'data'), { recursive: true }); fs.mkdirSync(path.join(staged, 'data'), { recursive: true }); fs.mkdirSync(path.dirname(registry), { recursive: true });
  fs.writeFileSync(path.join(live, 'Ikemen_GO.exe'), 'stable-exe'); fs.writeFileSync(path.join(staged, 'Ikemen_GO.exe'), 'nightly-exe');
  fs.writeFileSync(path.join(live, 'data', 'obsolete'), 'old-engine-file'); fs.writeFileSync(registry, '{"old":true}\n');
  const applied = migration.executeMigration({ root: live, stagedRoot: staged, accepted: [{ relative: 'Ikemen_GO.exe', type: 'file', length: 11 }], removals: [{ relative: 'data/obsolete', liveHash: migration.sha256File(path.join(live, 'data', 'obsolete')) }], backupRoot: recovery, candidate: { commit: 'b'.repeat(40) }, registryFile: registry, oldTarget: { version: '1.0.0', commit: 'a'.repeat(40) } });
  assert.equal(fs.readFileSync(path.join(live, 'Ikemen_GO.exe'), 'utf8'), 'nightly-exe'); assert(!fs.existsSync(path.join(live, 'data', 'obsolete')));
  const nextRegistry = '{"old":false}\n'; migration.prepareRegistryWrite(applied, nextRegistry); fs.writeFileSync(registry, nextRegistry); migration.recordRegistryWrite(applied);
  migration.rollbackMigration(applied);
  assert.equal(fs.readFileSync(path.join(live, 'Ikemen_GO.exe'), 'utf8'), 'stable-exe'); assert.equal(fs.readFileSync(path.join(live, 'data', 'obsolete'), 'utf8'), 'old-engine-file'); assert.equal(fs.readFileSync(registry, 'utf8'), '{"old":true}\n');
  assert.equal(migration.pendingMigrations(recovery).length, 0, 'completed rollback must not prompt as interrupted');

  const crashLive = path.join(temp, 'crash-live'), crashStaged = path.join(temp, 'crash-staged'), crashRecovery = path.join(temp, 'crash-recovery');
  fs.mkdirSync(crashLive, { recursive: true }); fs.mkdirSync(crashStaged, { recursive: true });
  fs.writeFileSync(path.join(crashLive, 'Ikemen_GO.exe'), 'stable-crash'); fs.writeFileSync(path.join(crashStaged, 'Ikemen_GO.exe'), 'nightly-crash');
  let sawWriteAhead = false;
  assert.throws(() => migration.executeMigration({ root: crashLive, stagedRoot: crashStaged, accepted: [{ relative: 'Ikemen_GO.exe', type: 'file', length: 13, liveHash: migration.sha256File(path.join(crashLive, 'Ikemen_GO.exe')), candidateHash: migration.sha256File(path.join(crashStaged, 'Ikemen_GO.exe')) }], backupRoot: crashRecovery, candidate: { commit: 'c'.repeat(40) }, oldTarget: { version: '1.0.0', commit: 'a'.repeat(40) }, hooks: { afterDurableMutation(kind, relative, journalFile) { const journal = JSON.parse(fs.readFileSync(journalFile, 'utf8')); sawWriteAhead = kind === 'write' && relative === 'Ikemen_GO.exe' && journal.writes[0].status === 'in-progress' && journal.writes[0].intendedSha256; fs.writeFileSync(path.join(crashLive, 'Ikemen_GO.exe'), 'partial-copy-preserved'); throw new Error('simulated termination gap'); } } }), /simulated termination gap/);
  assert(sawWriteAhead, 'write intent and identities must be durable before the file mutation completes');
  assert.equal(fs.readFileSync(path.join(crashLive, 'Ikemen_GO.exe'), 'utf8'), 'stable-crash');
  const interruptedCopy = fs.readdirSync(crashRecovery, { recursive: true }).map(String).find((name) => name.endsWith(path.join('.interrupted-current', 'Ikemen_GO.exe')));
  assert(interruptedCopy, 'an ambiguous partial/intervening file must be retained before restoring the backup');

  const resumeLive = path.join(temp, 'resume-live'), resumeStaged = path.join(temp, 'resume-staged'), resumeRecovery = path.join(temp, 'resume-recovery');
  fs.mkdirSync(resumeLive, { recursive: true }); fs.mkdirSync(resumeStaged, { recursive: true });
  fs.writeFileSync(path.join(resumeLive, 'Ikemen_GO.exe'), 'stable-resume'); fs.writeFileSync(path.join(resumeStaged, 'Ikemen_GO.exe'), 'nightly-resume');
  let rollbackInterrupted = false;
  assert.throws(() => migration.executeMigration({ root: resumeLive, stagedRoot: resumeStaged, accepted: [{ relative: 'Ikemen_GO.exe', type: 'file', length: 14, liveHash: migration.sha256File(path.join(resumeLive, 'Ikemen_GO.exe')), candidateHash: migration.sha256File(path.join(resumeStaged, 'Ikemen_GO.exe')) }], backupRoot: resumeRecovery, candidate: { commit: 'd'.repeat(40) }, oldTarget: { version: '1.0.0', commit: 'a'.repeat(40) }, hooks: { afterDurableMutation() { throw new Error('start rollback'); }, afterRollbackMutation() { if (!rollbackInterrupted) { rollbackInterrupted = true; fs.writeFileSync(path.join(resumeLive, 'Ikemen_GO.exe'), 'partial-rollback-bytes'); throw new Error('simulated rollback termination'); } } } }), /Automatic rollback stopped/);
  const pending = migration.pendingMigrations(resumeRecovery); assert.equal(pending.length, 1); assert.equal(pending[0].state, 'rolling-back');
  const pendingFile = path.join(resumeRecovery, '.migration-state', `${pending[0].migrationId}.json`); migration.recoverPendingMigration(pendingFile);
  assert.equal(fs.readFileSync(path.join(resumeLive, 'Ikemen_GO.exe'), 'utf8'), 'stable-resume'); assert.equal(migration.pendingMigrations(resumeRecovery).length, 0);
  assert(fs.readdirSync(resumeRecovery, { recursive: true }).map(String).some((name) => name.endsWith(path.join('.interrupted-current', 'Ikemen_GO.exe'))), 'partial rollback bytes must be retained before a resumed restore');

  const corruptLive = path.join(temp, 'corrupt-live'), corruptStaged = path.join(temp, 'corrupt-staged'), corruptRecovery = path.join(temp, 'corrupt-recovery');
  fs.mkdirSync(corruptLive, { recursive: true }); fs.mkdirSync(corruptStaged, { recursive: true }); fs.writeFileSync(path.join(corruptLive, 'Ikemen_GO.exe'), 'stable-corrupt'); fs.writeFileSync(path.join(corruptStaged, 'Ikemen_GO.exe'), 'nightly-corrupt');
  const corruptApplied = migration.executeMigration({ root: corruptLive, stagedRoot: corruptStaged, accepted: [{ relative: 'Ikemen_GO.exe', type: 'file', length: 15, liveHash: migration.sha256File(path.join(corruptLive, 'Ikemen_GO.exe')), candidateHash: migration.sha256File(path.join(corruptStaged, 'Ikemen_GO.exe')) }], backupRoot: corruptRecovery, candidate: { commit: 'f'.repeat(40) }, oldTarget: { version: '1.0.0', commit: 'a'.repeat(40) } });
  fs.writeFileSync(path.join(corruptApplied.backup, 'Ikemen_GO.exe'), 'corrupted-backup');
  assert.throws(() => migration.rollbackMigration(corruptApplied), /integrity verification/); assert.equal(fs.readFileSync(path.join(corruptLive, 'Ikemen_GO.exe'), 'utf8'), 'nightly-corrupt'); assert.equal(corruptApplied.journal.state, 'rollback-backup-invalid'); corruptApplied.lock.release();

  const registryLive = path.join(temp, 'registry-live'), registryStaged = path.join(temp, 'registry-staged'), registryRecovery = path.join(temp, 'registry-recovery'), registryFile = path.join(registryLive, '.ikemen', 'project-registry.json');
  fs.mkdirSync(path.dirname(registryFile), { recursive: true }); fs.mkdirSync(registryStaged, { recursive: true }); fs.writeFileSync(path.join(registryLive, 'Ikemen_GO.exe'), 'stable-registry'); fs.writeFileSync(path.join(registryStaged, 'Ikemen_GO.exe'), 'nightly-registry'); fs.writeFileSync(registryFile, '{"stable":true}\n');
  const registryApplied = migration.executeMigration({ root: registryLive, stagedRoot: registryStaged, accepted: [{ relative: 'Ikemen_GO.exe', type: 'file', length: 16, liveHash: migration.sha256File(path.join(registryLive, 'Ikemen_GO.exe')), candidateHash: migration.sha256File(path.join(registryStaged, 'Ikemen_GO.exe')) }], backupRoot: registryRecovery, candidate: { commit: '1'.repeat(40) }, registryFile, oldTarget: { version: '1.0.0', commit: 'a'.repeat(40) } });
  const changedRegistry = '{"stable":false}\n'; migration.prepareRegistryWrite(registryApplied, changedRegistry); fs.writeFileSync(registryFile, changedRegistry); migration.recordRegistryWrite(registryApplied); fs.writeFileSync(path.join(registryApplied.backup, '.ikemen', 'project-registry.json'), '{"corrupt":true}\n');
  assert.throws(() => migration.rollbackMigration(registryApplied), /integrity verification/); assert.equal(fs.readFileSync(registryFile, 'utf8'), changedRegistry); assert.equal(fs.readFileSync(path.join(registryLive, 'Ikemen_GO.exe'), 'utf8'), 'nightly-registry'); registryApplied.lock.release();

  const partialRegistryLive = path.join(temp, 'partial-registry-live'), partialRegistryStaged = path.join(temp, 'partial-registry-staged'), partialRegistryRecovery = path.join(temp, 'partial-registry-recovery'), partialRegistryFile = path.join(partialRegistryLive, '.ikemen', 'project-registry.json');
  fs.mkdirSync(path.dirname(partialRegistryFile), { recursive: true }); fs.mkdirSync(partialRegistryStaged, { recursive: true }); fs.writeFileSync(path.join(partialRegistryLive, 'Ikemen_GO.exe'), 'stable-partial-registry'); fs.writeFileSync(path.join(partialRegistryStaged, 'Ikemen_GO.exe'), 'nightly-partial-registry'); fs.writeFileSync(partialRegistryFile, '{"original":true}\n');
  const partialRegistryApplied = migration.executeMigration({ root: partialRegistryLive, stagedRoot: partialRegistryStaged, accepted: [{ relative: 'Ikemen_GO.exe', type: 'file', length: 24, liveHash: migration.sha256File(path.join(partialRegistryLive, 'Ikemen_GO.exe')), candidateHash: migration.sha256File(path.join(partialRegistryStaged, 'Ikemen_GO.exe')) }], backupRoot: partialRegistryRecovery, candidate: { commit: '2'.repeat(40) }, registryFile: partialRegistryFile, oldTarget: { version: '1.0.0', commit: 'a'.repeat(40) } });
  const partialRegistryNext = '{"original":false}\n'; migration.prepareRegistryWrite(partialRegistryApplied, partialRegistryNext); fs.writeFileSync(partialRegistryFile, partialRegistryNext); migration.recordRegistryWrite(partialRegistryApplied);
  partialRegistryApplied.journal.registryRollbackStatus = 'in-progress'; partialRegistryApplied.journal.state = 'rolling-back'; fs.writeFileSync(partialRegistryApplied.journalFile, `${JSON.stringify(partialRegistryApplied.journal, null, 2)}\n`); fs.writeFileSync(partialRegistryFile, 'PARTIAL REGISTRY RESTORE');
  migration.rollbackMigration(partialRegistryApplied); assert.equal(fs.readFileSync(partialRegistryFile, 'utf8'), '{"original":true}\n'); assert(partialRegistryApplied.journal.interruptedCopy && fs.existsSync(partialRegistryApplied.journal.interruptedCopy));

  const missingRegistryLive = path.join(temp, 'missing-registry-live'), missingRegistryStaged = path.join(temp, 'missing-registry-staged'), missingRegistryRecovery = path.join(temp, 'missing-registry-recovery'), missingRegistryFile = path.join(missingRegistryLive, '.ikemen', 'project-registry.json');
  fs.mkdirSync(path.dirname(missingRegistryFile), { recursive: true }); fs.mkdirSync(missingRegistryStaged, { recursive: true }); fs.writeFileSync(path.join(missingRegistryLive, 'Ikemen_GO.exe'), 'stable-missing-registry'); fs.writeFileSync(path.join(missingRegistryStaged, 'Ikemen_GO.exe'), 'nightly-missing-registry'); fs.writeFileSync(missingRegistryFile, '{"exists":true}\n');
  const missingRegistryApplied = migration.executeMigration({ root: missingRegistryLive, stagedRoot: missingRegistryStaged, accepted: [{ relative: 'Ikemen_GO.exe', type: 'file', length: 24, liveHash: migration.sha256File(path.join(missingRegistryLive, 'Ikemen_GO.exe')), candidateHash: migration.sha256File(path.join(missingRegistryStaged, 'Ikemen_GO.exe')) }], backupRoot: missingRegistryRecovery, candidate: { commit: '3'.repeat(40) }, registryFile: missingRegistryFile, oldTarget: { version: '1.0.0', commit: 'a'.repeat(40) } });
  const missingRegistryNext = '{"exists":false}\n'; migration.prepareRegistryWrite(missingRegistryApplied, missingRegistryNext); fs.writeFileSync(missingRegistryFile, missingRegistryNext); migration.recordRegistryWrite(missingRegistryApplied); fs.unlinkSync(missingRegistryFile);
  assert.throws(() => migration.rollbackMigration(missingRegistryApplied), /Rollback stopped/); assert.equal(fs.readFileSync(path.join(missingRegistryLive, 'Ikemen_GO.exe'), 'utf8'), 'nightly-missing-registry'); assert.equal(missingRegistryApplied.journal.state, 'rollback-conflict'); missingRegistryApplied.lock.release();

  const removeLive = path.join(temp, 'remove-live'), removeStaged = path.join(temp, 'remove-staged'), removeRecovery = path.join(temp, 'remove-recovery');
  fs.mkdirSync(path.join(removeLive, 'data'), { recursive: true }); fs.mkdirSync(removeStaged, { recursive: true }); fs.writeFileSync(path.join(removeLive, 'Ikemen_GO.exe'), 'stable-remove'); fs.writeFileSync(path.join(removeLive, 'data', 'obsolete'), 'obsolete');
  const obsoleteHash = migration.sha256File(path.join(removeLive, 'data', 'obsolete')); let sawRemovalIntent = false;
  assert.throws(() => migration.executeMigration({ root: removeLive, stagedRoot: removeStaged, accepted: [], removals: [{ relative: 'data/obsolete', liveHash: obsoleteHash }], backupRoot: removeRecovery, candidate: { commit: 'e'.repeat(40) }, oldTarget: { version: '1.0.0', commit: 'a'.repeat(40) }, hooks: { afterDurableMutation(kind, relative, journalFile) { if (kind !== 'remove') return; const journal = JSON.parse(fs.readFileSync(journalFile, 'utf8')); sawRemovalIntent = relative === 'data/obsolete' && journal.removals[0].status === 'in-progress' && journal.removals[0].beforeSha256 === obsoleteHash; throw new Error('simulated removal termination'); } } }), /simulated removal termination/);
  assert(sawRemovalIntent); assert.equal(fs.readFileSync(path.join(removeLive, 'data', 'obsolete'), 'utf8'), 'obsolete');

  if (process.platform === 'win32') {
    const zipArea = path.join(temp, 'zip path with spaces'), zipSource = path.join(zipArea, 'source'), zipFile = path.join(zipArea, 'small archive.zip'), zipOut = path.join(zipArea, 'output with spaces');
    fs.mkdirSync(zipSource, { recursive: true }); fs.writeFileSync(path.join(zipSource, 'entry.txt'), 'zip-ok');
    const env = { ...process.env, IKEMAKER_TEST_SOURCE: path.join(zipSource, '*'), IKEMAKER_TEST_ZIP: zipFile };
    const zipped = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference='Stop'; Compress-Archive -Path $env:IKEMAKER_TEST_SOURCE -DestinationPath $env:IKEMAKER_TEST_ZIP"], { env, encoding: 'utf8' });
    assert.equal(zipped.status, 0, zipped.stderr || zipped.stdout); const inspected = migration.inspectZip(zipFile); assert.equal(inspected.length, 1); assert.equal(inspected[0].path, 'entry.txt');
    migration.extractZip(zipFile, zipOut); assert.equal(fs.readFileSync(path.join(zipOut, 'entry.txt'), 'utf8'), 'zip-ok');
  }
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
console.log('Engine migration provenance and snapshot tests passed');
