'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  DIRECTORY_NAME,
  SEAL_NAME,
  createCreatorStateRootSealerForTest,
  sealCreatorStateRoot,
  sealCreatorStateRootFromContext
} = require('../src/sff_creator_state_root');

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-sff-state-root-'));
try {
  const workspace = path.join(root, 'workspace'), activeRoot = path.join(root, 'active'), candidateRoot = path.join(root, 'candidate'), history = path.join(root, 'history');
  for (const folder of [workspace, activeRoot, candidateRoot, history]) fs.mkdirSync(folder);
  const active = path.join(activeRoot, 'active.sff'), candidate = path.join(candidateRoot, 'candidate.sff'); fs.writeFileSync(active, 'active'); fs.writeFileSync(candidate, 'candidate');
  const globalStorage = path.join(root, 'extension-host', 'global-storage'), input = {
    globalStorageUri: { scheme: 'file', fsPath: globalStorage }, workspaceRoots: [workspace], activePaths: [active], candidatePaths: [candidate], historyRoots: [history]
  };
  const before = { active: fs.readFileSync(active), candidate: fs.readFileSync(candidate), history: fs.readdirSync(history), workspace: fs.readdirSync(workspace) };
  const first = sealCreatorStateRoot(input), stateRoot = path.join(globalStorage, DIRECTORY_NAME);
  assert.strictEqual(first.stateRootPath, fs.realpathSync.native ? fs.realpathSync.native(stateRoot) : fs.realpathSync(stateRoot));
  assert.strictEqual(first.authorityHash, first.authority.authorityHash); assert.strictEqual(first.artifactByteHash, sha(first.artifactBytes)); assert.deepStrictEqual(JSON.parse(first.artifactBytes), first.authority);
  assert.strictEqual(first.authority.physicalCertificationClaimed, false); assert.strictEqual(first.authority.executionAuthorityGranted, false); assert.strictEqual(first.authority.adoptionAllowed, false);
  assert(['completed', 'unsupported-by-platform'].includes(first.authority.directorySyncStatus));
  assert.strictEqual(first.effects.projectFilesWritten, false); assert.strictEqual(first.effects.activeArchiveModified, false); assert.strictEqual(first.effects.candidateModified, false); assert.strictEqual(first.effects.historyModified, false);
  assert.strictEqual(first.effects.rootSealCreated, true); assert(fs.statSync(path.join(globalStorage, SEAL_NAME)).isFile());
  assert.deepStrictEqual(fs.readFileSync(active), before.active); assert.deepStrictEqual(fs.readFileSync(candidate), before.candidate); assert.deepStrictEqual(fs.readdirSync(history), before.history); assert.deepStrictEqual(fs.readdirSync(workspace), before.workspace);

  const restarted = sealCreatorStateRoot(input);
  assert.strictEqual(restarted.created, false); assert.strictEqual(restarted.authorityHash, first.authorityHash, 'restart must reproduce the exact sealed authority'); assert.deepStrictEqual(restarted.artifactBytes, first.artifactBytes);
  const fromContext = sealCreatorStateRootFromContext({ globalStorageUri: { scheme: 'file', fsPath: globalStorage } }, { workspaceRoots: [workspace], activePaths: [active], candidatePaths: [candidate], historyRoots: [history] });
  assert.strictEqual(fromContext.authorityHash, first.authorityHash, 'the production context adapter must reach the same authority');

  const sibling = path.join(root, `${DIRECTORY_NAME}-sibling`); fs.mkdirSync(sibling);
  assert(sealCreatorStateRoot({ ...input, workspaceRoots: [sibling] }), 'path-prefix siblings must not be treated as containment');
  assert.throws(() => sealCreatorStateRoot({ ...input, workspaceRoots: [root] }), /collides with workspace/);
  assert.throws(() => sealCreatorStateRoot({ ...input, historyRoots: [stateRoot] }), /collides with history/);
  assert.throws(() => sealCreatorStateRoot({ ...input, activePaths: [active, active] }), /duplicates/);
  assert.throws(() => sealCreatorStateRoot({ ...input, globalStorageUri: { scheme: 'https', fsPath: globalStorage } }), /absolute file URI/);
  const rejectedStorage = path.join(workspace, 'must-not-be-created');
  assert.throws(() => sealCreatorStateRoot({ ...input, globalStorageUri: { scheme: 'file', fsPath: rejectedStorage } }), /collides with workspace/);
  assert.strictEqual(fs.existsSync(rejectedStorage), false, 'boundary rejection must happen before globalStorage creation');

  const alias = path.join(root, 'storage-alias');
  try {
    fs.symlinkSync(globalStorage, alias, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => sealCreatorStateRoot({ ...input, globalStorageUri: { scheme: 'file', fsPath: alias } }), /non-linked|aliased/);
  } catch (error) { if (error.code !== 'EPERM') throw error; }
  finally { try { if (fs.lstatSync(alias).isSymbolicLink()) fs.unlinkSync(alias); } catch (_) {} }

  const faultStorage = path.join(root, 'fault-storage'), faultInput = { ...input, globalStorageUri: { scheme: 'file', fsPath: faultStorage } };
  assert.throws(() => createCreatorStateRootSealerForTest({ fault(at) { if (at === 'after-create:state root') throw new Error('injected post-create fault'); } })(faultInput), /injected post-create fault/);
  assert(fs.statSync(path.join(faultStorage, DIRECTORY_NAME)).isDirectory(), 'an ambiguous post-create fault retains the owned empty root for restart verification');
  const recovered = sealCreatorStateRoot(faultInput); assert.strictEqual(recovered.effects.stateRootCreated, false); assert.strictEqual(recovered.effects.rootSealCreated, true); assert.strictEqual(recovered.stateRootPath, fs.realpathSync(path.join(faultStorage, DIRECTORY_NAME)));

  const replacedStorage = path.join(root, 'replaced-storage'), replacedInput = { ...input, globalStorageUri: { scheme: 'file', fsPath: replacedStorage } }, sealed = sealCreatorStateRoot(replacedInput), replacedRoot = sealed.stateRootPath;
  fs.renameSync(replacedRoot, `${replacedRoot}-old`); fs.mkdirSync(replacedRoot);
  assert.throws(() => sealCreatorStateRoot(replacedInput), /retained state-root seal does not match/, 'restart must detect deletion/recreation of the sealed root');

  const foreignStorage = path.join(root, 'foreign-storage'); fs.mkdirSync(path.join(foreignStorage, DIRECTORY_NAME), { recursive: true }); fs.writeFileSync(path.join(foreignStorage, DIRECTORY_NAME, 'foreign.txt'), 'foreign');
  assert.throws(() => sealCreatorStateRoot({ ...input, globalStorageUri: { scheme: 'file', fsPath: foreignStorage } }), /unsealed pre-existing state root must be empty/);

  const unsupportedFs = { ...fs, fsyncSync(fd) { const stat = fs.fstatSync(fd); if (stat.isDirectory()) { const error = new Error('directory sync unsupported'); error.code = 'ENOTSUP'; throw error; } return fs.fsyncSync(fd); } };
  const unsupportedStorage = path.join(root, 'unsupported-storage'), unsupported = createCreatorStateRootSealerForTest({ fsApi: unsupportedFs })({ ...input, globalStorageUri: { scheme: 'file', fsPath: unsupportedStorage } });
  assert.strictEqual(unsupported.authority.directorySyncStatus, 'unsupported-by-platform');

  const ioFailureFs = { ...fs, fsyncSync(fd) { const stat = fs.fstatSync(fd); if (stat.isDirectory()) { const error = new Error('directory sync I/O failure'); error.code = 'EIO'; throw error; } return fs.fsyncSync(fd); } };
  assert.throws(() => createCreatorStateRootSealerForTest({ fsApi: ioFailureFs })({ ...input, globalStorageUri: { scheme: 'file', fsPath: path.join(root, 'io-failure-storage') } }), /directory sync I\/O failure/);

  const linkedBoundary = path.join(root, 'workspace-link');
  try {
    fs.symlinkSync(workspace, linkedBoundary, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => sealCreatorStateRoot({ ...input, workspaceRoots: [linkedBoundary] }), /link|aliased/);
  } catch (error) { if (error.code !== 'EPERM') throw error; }
  finally { try { if (fs.lstatSync(linkedBoundary).isSymbolicLink()) fs.unlinkSync(linkedBoundary); } catch (_) {} }
} finally { fs.rmSync(root, { recursive: true, force: true }); }

console.log('SFF Creator globalStorage state root seals durable extension-owned identity outside project and lifecycle paths without granting execution authority');
