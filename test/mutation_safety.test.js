'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { hash, transactionalWrite, transactionalWriteSet, beginExternalMutation, journalPath } = require('../src/mutation_safety');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemen-mutation-test-'));
try {
  const one = path.join(root, 'one.txt');
  fs.writeFileSync(one, 'before');
  const result = transactionalWrite(fs, one, 'after', { journal: true, backup: true, label: 'position edit', journalRoot: root, token: 'one', now: new Date('2026-09-01T12:00:00Z') });
  assert.strictEqual(fs.readFileSync(one, 'utf8'), 'after');
  assert.strictEqual(result.backup, '', 'Legacy backup requests must not create automatic backups');
  assert.ok(fs.existsSync(journalPath(root)));
  assert.strictEqual(JSON.parse(fs.readFileSync(journalPath(root), 'utf8')).entries.length, 1);

  assert.throws(() => transactionalWrite(fs, one, 'stale', { expectedHash: hash('not current'), journalRoot: root, token: 'stale' }), /changed after it was loaded/);
  assert.strictEqual(fs.readFileSync(one, 'utf8'), 'after');

  const two = path.join(root, 'two.txt'), three = path.join(root, 'three.txt');
  fs.writeFileSync(two, 'two-before');
  const failing = Object.create(fs);
  let targetCommits = 0;
  failing.renameSync = (from, to) => {
    if (/\.tmp$/.test(from)) { targetCommits += 1; if (targetCommits === 2) throw new Error('simulated commit failure'); }
    return fs.renameSync(from, to);
  };
  assert.throws(() => transactionalWriteSet(failing, [[two, 'two-after'], [three, 'three-after']], { journalRoot: root, token: 'set' }), /simulated/);
  assert.strictEqual(fs.readFileSync(two, 'utf8'), 'two-before');
  assert.ok(!fs.existsSync(three));

  assert.throws(() => transactionalWriteSet(fs, [[one, 'x']], { allowExisting: false, journalRoot: root, token: 'conflict' }), /already exists/);
  assert.strictEqual(fs.readFileSync(one, 'utf8'), 'after');

  const four = path.join(root, 'four.txt'), five = path.join(root, 'five.txt');
  transactionalWriteSet(fs, [[four, 'four'], [five, 'five']], { journal: true, label: 'bulk export', journalRoot: root, token: 'bulk', aggregateJournal: true });
  const journal = JSON.parse(fs.readFileSync(journalPath(root), 'utf8'));
  assert.strictEqual(journal.entries.length, 2);
  assert.strictEqual(journal.entries[1].file, '2 files');
  assert.deepStrictEqual(journal.entries[1].files, ['four.txt', 'five.txt']);

  const external = path.join(root, 'built.snd'); fs.writeFileSync(external, 'old-build');
  const externalGuard = beginExternalMutation(fs, external, { journal: true, label: 'sndmaker-build', journalRoot: root, token: 'external' });
  fs.writeFileSync(external, 'new-build'); const externalResult = externalGuard.complete();
  assert.strictEqual(fs.readFileSync(external, 'utf8'), 'new-build');
  assert.strictEqual(externalResult.backup, '');
  assert.strictEqual(JSON.parse(fs.readFileSync(journalPath(root), 'utf8')).entries.length, 3);

  const partial = path.join(root, 'partial.snd'), partialGuard = beginExternalMutation(fs, partial, { journalRoot: root, token: 'partial' });
  fs.writeFileSync(partial, 'partial-build'); partialGuard.rollback(); assert.ok(!fs.existsSync(partial));

  const failedExisting = path.join(root, 'failed-existing.snd'); fs.writeFileSync(failedExisting, 'good');
  const failedGuard = beginExternalMutation(fs, failedExisting, { journalRoot: root, token: 'failed' });
  fs.writeFileSync(failedExisting, 'broken'); failedGuard.rollback(); assert.strictEqual(fs.readFileSync(failedExisting, 'utf8'), 'good');
  const noBackup = path.join(root, 'no-backup.snd'); fs.writeFileSync(noBackup, 'original');
  const noBackupGuard = beginExternalMutation(fs, noBackup, { backup: false, journal: false });
  fs.writeFileSync(noBackup, 'failed build'); noBackupGuard.rollback();
  assert.strictEqual(fs.readFileSync(noBackup, 'utf8'), 'original', 'External rollback must work without persistent backups');
  assert.strictEqual(noBackupGuard.backup, '');

  const untouched = path.join(root, 'untouched.txt'); fs.writeFileSync(untouched, 'original');
  assert.throws(() => transactionalWriteSet(fs, [[untouched, 'changed'], [untouched, 'duplicate']], { backup: false, journal: false, token: 'duplicate' }), /same target/);
  assert.strictEqual(fs.readFileSync(untouched, 'utf8'), 'original', 'Preparation failure must preserve untouched files');
  assert.ok(!fs.existsSync(path.join(root, '.untouched.txt.duplicate.tmp')));

  const staleSecond = path.join(root, 'stale-second.txt'); fs.writeFileSync(staleSecond, 'current');
  assert.throws(() => transactionalWriteSet(fs, [[untouched, 'changed'], [staleSecond, 'changed']], { backup: false, journal: false, expectedHashes: { [staleSecond]: hash('stale') } }), /changed after/);
  assert.strictEqual(fs.readFileSync(untouched, 'utf8'), 'original');
  assert.strictEqual(fs.readFileSync(staleSecond, 'utf8'), 'current');

  const failBeforeMove = Object.create(fs);
  failBeforeMove.renameSync = () => { throw new Error('target locked'); };
  assert.throws(() => transactionalWriteSet(failBeforeMove, [[untouched, 'changed']], { backup: false, journal: false }), /target locked/);
  assert.strictEqual(fs.readFileSync(untouched, 'utf8'), 'original', 'A failed first rename must preserve the source');
  const recoveryTarget=path.join(root,'recovery.txt');fs.writeFileSync(recoveryTarget,'recover me');
  const recoveryFs=Object.create(fs);recoveryFs.renameSync=(from,to)=>{if(from.endsWith('.tmp')||from.endsWith('.rollback'))throw Error('locked during replacement/recovery');return fs.renameSync(from,to);};
  assert.throws(()=>transactionalWrite(recoveryFs,recoveryTarget,'new',{token:'recovery'}),error=>error.name==='MutationRecoveryError'&&error.message.includes('.recovery.txt.recovery.rollback'));
  assert.strictEqual(fs.readFileSync(path.join(root,'.recovery.txt.recovery.rollback'),'utf8'),'recover me','Failed recovery must retain original bytes');
  const cleanupTarget=path.join(root,'cleanup.txt');fs.writeFileSync(cleanupTarget,'old contents');
  const cleanupFs=Object.create(fs);cleanupFs.unlinkSync=file=>{if(file.endsWith('.rollback'))throw Error('locked cleanup');return fs.unlinkSync(file);};
  assert.throws(()=>transactionalWrite(cleanupFs,cleanupTarget,'saved contents',{token:'cleanup'}),error=>error.name==='MutationCleanupError'&&error.committed===true&&error.message.includes('saved successfully'));
  assert.strictEqual(fs.readFileSync(cleanupTarget,'utf8'),'saved contents');assert.strictEqual(fs.readFileSync(path.join(root,'.cleanup.txt.cleanup.rollback'),'utf8'),'old contents');
  console.log('Mutation safety tests passed');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
