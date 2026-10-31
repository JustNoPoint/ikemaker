'use strict';

const assert = require('assert');
const pending = require('../src/pending_changes');

(async () => {
  let stored, fail = false, tick = 100;
  const storage = {
    get: (_key, fallback) => stored || fallback,
    update: async (_key, value) => { if (fail) throw new Error('storage full'); stored = value; }
  };
  const service = new pending.PendingChanges(storage, { caseInsensitive: true, clock: () => ++tick });
  const seed = {
    ownerId: 'sff.writer', ownerLabel: 'SFF Creator', type: 'staged', resource: 'C:\\Game\\Chars\\Ryu\\ryu.sff', scope: 'sprites:1,0;1,1',
    title: 'Two reviewed sprites', detail: 'Candidate not adopted', persistence: 'workspace', sourceRevision: 'sha256:base',
    actions: { focus: { label: 'Review Build' }, apply: { label: 'Build Candidate' }, undo: { label: 'Discard Plan' } }, metadata: { planId: 'plan-7' }
  };
  const first = await service.upsert(seed);
  assert.equal(first.id, pending.identity({ ...seed, resource: 'c:/game/chars/ryu/ryu.sff' }, { caseInsensitive: true }).id, 'identity is stable across Windows path spelling');
  const second = await service.upsert({ ...seed, detail: 'Candidate verified' });
  assert.equal(second.id, first.id); assert.equal(second.revision, first.revision + 1, 'updates retain identity and advance optimistic revision');
  const conflicted = await service.upsert({ ...seed, type: 'conflict', title: 'Source changed', detail: 'Review the source revision before building' });
  assert.equal(conflicted.id, first.id, 'a staged item retains identity when it becomes a conflict');
  const resumed = await service.upsert({ ...seed, detail: 'Candidate verified' });
  assert.equal(resumed.id, first.id, 'resolving the conflict retains the same item identity');
  assert.equal(await service.remove(first.id, first.revision), false, 'an old completion cannot remove newer work');
  assert.equal(service.get(first.id).detail, 'Candidate verified');

  const calls = [];
  const owner = service.registerOwner({
    id: 'sff.writer', label: 'SFF Creator', focus: entry => calls.push(['focus', entry.revision]),
    apply: async entry => { calls.push(['apply', entry.revision]); await service.upsert({ ...seed, detail: 'Newer edit during build' }, entry.revision); },
    undo: entry => calls.push(['undo', entry.revision])
  });
  await service.execute(first.id, 'focus'); assert(service.get(first.id), 'focus does not resolve a change');
  await service.execute(first.id, 'apply'); assert(service.get(first.id), 'a successful older Apply cannot erase input staged while it ran');
  const latest = service.get(first.id); await service.execute(latest.id, 'undo'); assert.equal(service.get(latest.id), undefined, 'the canonical owner resolves the exact handled revision');
  assert.deepEqual(calls.map(item => item[0]), ['focus', 'apply', 'undo']);
  assert.throws(() => service.registerOwner({ id: 'sff.writer', focus() {} }), /already registered/, 'only one live mutation owner may claim an owner id');
  owner.dispose();

  const dirty = await service.upsert({ ownerId: 'text.document', type: 'dirty', resource: 'file:///C:/Game/Chars/Ryu/ryu.zss', scope: 'document', title: 'ryu.zss', actions: { focus: true, apply: { label: 'Save' } } });
  assert.equal(dirty.persistence, 'session');
  assert.throws(() => pending.identity({ ownerId: 'x', type: 'unknown', resource: 'a', scope: 'b' }), /Unknown pending change type/);
  assert.throws(() => service.upsert({ ownerId: 'x', type: 'dirty', resource: 'a', scope: 'b', title: 'a', persistence: 'workspace' }), /session-owned/);
  await service.flush();
  assert(!stored.entries.some(entry => entry.id === dirty.id), 'dirty documents never cross the session persistence boundary');
  const restored = new pending.PendingChanges(storage, { caseInsensitive: true, clock: () => ++tick });
  assert.equal(restored.list().length, 0, 'resolved workspace entries and session entries do not reappear');

  await service.upsert(seed); fail = true;
  await assert.rejects(service.upsert({ ...seed, detail: 'Retained after persistence failure' }), /storage full/);
  assert.equal(service.get(first.id).detail, 'Retained after persistence failure', 'failed storage retains the current session model for retry');
  fail = false; await service.flush();
  assert.equal(new pending.PendingChanges(storage, { caseInsensitive: true }).get(first.id).detail, 'Retained after persistence failure');
  console.log('Pending Changes keeps stable identities, one action owner, safe persistence boundaries, and revision-protected resolution');
})().catch(error => { console.error(error); process.exitCode = 1; });
