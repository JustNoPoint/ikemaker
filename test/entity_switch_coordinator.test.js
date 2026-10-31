'use strict';

const assert = require('assert');
const path = require('path');
const { createEntitySwitchCoordinator, normalizeDescriptor, MAX_ENTITIES } = require('../src/entity_switch_coordinator');

const owner = (name) => path.resolve('C:/Game', name);
const character = (name, extra = {}) => ({ kind:'character', projectId:'sf6', ownerFile:owner(`chars/${name}/${name}.def`), label:name, ...extra });
const stage = (name, extra = {}) => ({ kind:'stage', projectId:'sf6', ownerFile:owner(`stages/${name}.def`), label:name, ...extra });
const screenpack = (name, extra = {}) => ({ kind:'screenpack', projectId:'sf6', ownerFile:owner(`data/${name}.def`), label:name, ...extra });

(async () => {
  assert.throws(() => normalizeDescriptor({ kind:'character', projectId:'sf6', ownerFile:'relative.def', label:'Ryu' }), /absolute/);
  assert.throws(() => normalizeDescriptor({ kind:'character', projectId:'sf6', ownerFile:owner('Ryu.air'), label:'Ryu' }), /exact DEF/);
  assert.throws(() => normalizeDescriptor({ kind:'character', projectId:'sf6', ownerFile:owner('Ryu.def'), label:'Ryu', extra:true }), /unsupported field/);
  assert.throws(() => normalizeDescriptor(character('Ryu', { supported:false })), /unavailableReason/);
  const exactA = normalizeDescriptor(character('Ryu')), exactB = normalizeDescriptor({ ...character('Ryu'), projectId:'other-project' });
  assert.notStrictEqual(exactA.id, exactB.id, 'project identity participates in the exact entity identity');
  assert.strictEqual(exactA.identity, exactA.id, 'coordinator entities expose the identity field consumed by shared header projections');

  const coordinator = createEntitySwitchCoordinator(), snapshots = [];
  const subscription = coordinator.subscribe(snapshot => snapshots.push(snapshot));
  const ryu = coordinator.register(character('Ryu', { dirty:true, shared:true, detail:'Ryu.def; modified: Ryu.air; shared: common1.cns' }), { active:true, retainedState:{ action:0, cursor:{ line:3 } } });
  const ken = coordinator.register(character('Ken'), { retainedState:{ action:5 } });
  const training = coordinator.register(stage('Training'));
  const motif = coordinator.register(screenpack('system'));
  assert.deepStrictEqual(coordinator.snapshot().entities.map(item => item.id), [ryu, ken, training, motif], 'loaded entity order is stable');
  assert.strictEqual(coordinator.snapshot().activeIdentity, ryu);
  const ryuProjection=coordinator.snapshot().entities[0];
  assert.deepStrictEqual({dirty:ryuProjection.dirty,shared:ryuProjection.shared,detail:ryuProjection.detail}, {dirty:true,shared:true,detail:'Ryu.def; modified: Ryu.air; shared: common1.cns'}, 'modified/shared accessibility evidence survives the coordinator projection');
  assert(Object.isFrozen(coordinator.snapshot()) && Object.isFrozen(coordinator.snapshot().entities[0].retainedState));
  assert.throws(() => { coordinator.snapshot().entities.push({}); }, TypeError);
  coordinator.retain(ken, { action:12, selection:[1,2] });
  assert.deepStrictEqual(coordinator.snapshot().entities.find(item => item.id === ken).retainedState, { action:12, selection:[1,2] });
  assert.throws(() => coordinator.retain(ken, { payload:'x'.repeat(300 * 1024) }), /exceeds/);
  assert.strictEqual(coordinator.setPinned(training,true),true);assert.deepStrictEqual(coordinator.snapshot().entities.map(item=>item.id),[training,ryu,ken,motif],'pinning moves an entity to the pinned prefix without activating it');
  assert.strictEqual(coordinator.snapshot().activeIdentity,ryu);assert.strictEqual(coordinator.snapshot().entities[0].pinned,true);
  assert.throws(()=>coordinator.reorder(ryu,training),/within their own section/,'drag reordering cannot silently change pin membership');
  assert.strictEqual(coordinator.reorder(motif,ken),true);assert.deepStrictEqual(coordinator.snapshot().entities.map(item=>item.id),[training,ryu,motif,ken]);
  assert.strictEqual(coordinator.setPinned(training,false),true);assert.deepStrictEqual(coordinator.snapshot().entities.map(item=>item.id),[training,ryu,motif,ken],'unpinning places the entity at the beginning of the unpinned section');
  assert.strictEqual(coordinator.reorder(ken,null),false,'moving the final unpinned entity to the end is a no-op');

  const phases = [];
  const switched = await coordinator.switchTo(ken, {
    prepare: async transaction => { phases.push(`prepare:${transaction.from.label}->${transaction.to.label}`); return { token:'prepared' }; },
    validate: async (transaction, prepared) => { phases.push(`validate:${prepared.token}`); return transaction.toState.action === 12; },
    commit: async () => { phases.push('commit'); }
  });
  assert.strictEqual(switched.status, 'committed');
  assert.deepStrictEqual(phases, ['prepare:Ryu->Ken','validate:prepared','commit']);
  assert.strictEqual(coordinator.snapshot().activeIdentity, ken);
  assert.strictEqual(coordinator.snapshot().previousIdentity, ryu);

  const beforeCancellation = coordinator.snapshot(), rolledBack = [];
  const cancelled = await coordinator.switchTo(training, {
    prepare: async () => ({ layout:'temporary' }),
    validate: async () => ({ ok:false, reason:'Stage adapter refused its pending draft.' }),
    rollback: async (_transaction, prepared, reason) => rolledBack.push({ prepared, reason })
  });
  assert.strictEqual(cancelled.status, 'cancelled');
  assert.strictEqual(cancelled.phase, 'validate');
  assert.strictEqual(coordinator.snapshot().activeIdentity, ken, 'cancel leaves the prior entity coherent');
  assert.strictEqual(coordinator.snapshot().previousIdentity, ryu);
  assert(coordinator.snapshot().revision > beforeCancellation.revision && coordinator.snapshot().generation > beforeCancellation.generation);
  assert.strictEqual(rolledBack.length, 1);

  const failed = await coordinator.switchTo(training, {
    prepare: async () => ({ temporary:true }),
    validate: async () => true,
    commit: async () => { throw new Error('adapter failed'); },
    rollback: async () => rolledBack.push({ failed:true })
  });
  assert.strictEqual(failed.status, 'failed');
  assert.strictEqual(failed.phase, 'commit');
  assert.strictEqual(coordinator.snapshot().activeIdentity, ken, 'failed commit does not publish the destination');

  const unsupported = coordinator.register(screenpack('unsupported', { supported:false, unavailableReason:'No assigned system.def resources.', transferPinned:true }));
  const unsupportedResult = await coordinator.switchTo(unsupported);
  assert.deepStrictEqual(unsupportedResult, { status:'unsupported', identity:unsupported, reason:'No assigned system.def resources.' });
  assert.strictEqual(coordinator.snapshot().entities.find(item => item.id === unsupported).transferPinned, true, 'the transfer-pinned exception survives projection without implementing transfer UI');
  const missing = await coordinator.switchTo('not-loaded');
  assert.strictEqual(missing.status, 'missing');
  assert.match(missing.reason, /No viewer was opened/);

  let releaseSlow;
  const slowGate = new Promise(resolve => { releaseSlow = resolve; });
  const staleRollback = [];
  const slow = coordinator.switchTo(training, {
    prepare: async () => { await slowGate; return { stage:'prepared' }; },
    rollback: async (_transaction, prepared) => staleRollback.push(prepared)
  });
  const fast = await coordinator.switchTo(motif, { prepare:async () => ({ motif:'prepared' }), validate:async () => true });
  releaseSlow();
  const stale = await slow;
  assert.strictEqual(fast.status, 'committed');
  assert.strictEqual(stale.status, 'stale', 'an older async request cannot commit after a newer generation');
  assert.deepStrictEqual(staleRollback, [{ stage:'prepared' }]);
  assert.strictEqual(coordinator.snapshot().activeIdentity, motif);
  assert.strictEqual(coordinator.snapshot().previousIdentity, ken);

  let releaseCancelled;
  const cancellationGate = new Promise(resolve => { releaseCancelled = resolve; });
  const manual = coordinator.switchTo(training, { prepare:async transaction => { await cancellationGate; return { aborted:transaction.signal.aborted }; } });
  assert.strictEqual(coordinator.cancel('User kept the current entity.'), true);
  releaseCancelled();
  assert.strictEqual((await manual).status, 'stale');
  assert.strictEqual(coordinator.snapshot().activeIdentity, motif);

  const revision = coordinator.snapshot().revision;
  coordinator.update(training, { label:'Training Room', detail:'Training Room — stage.def', dirty:true, shared:false, transferPinned:true });
  assert.strictEqual(coordinator.snapshot().entities.find(item => item.id === training).label, 'Training Room');
  assert.strictEqual(coordinator.snapshot().entities.find(item => item.id === training).dirty, true);
  assert(coordinator.snapshot().revision > revision);
  assert.strictEqual(coordinator.remove(training), true);
  assert.strictEqual(coordinator.remove(training), false);
  assert(!coordinator.snapshot().entities.some(item => item.id === training));
  const removable = coordinator.register(stage('Temporary'));
  await coordinator.switchTo(removable);
  coordinator.remove(removable);
  assert.strictEqual(coordinator.snapshot().activeIdentity, '');
  assert.notStrictEqual(coordinator.snapshot().previousIdentity, removable, 'removing the active entity cannot retain an unloaded previous identity');
  assert(snapshots.every(snapshot => Object.isFrozen(snapshot)));
  subscription.dispose();

  const bounded = createEntitySwitchCoordinator();
  for (let index = 0; index < MAX_ENTITIES; index += 1) bounded.register({ kind:'workspace', projectId:'p', ownerFile:owner(`work/${index}.json`), label:String(index) });
  assert.throws(() => bounded.register({ kind:'workspace', projectId:'p', ownerFile:owner('work/overflow.json'), label:'overflow' }), /No more than/);

  console.log('Entity switch coordinator keeps exact ordered identities, retained state, immutable revisions, and transactional stale-safe switching');
})().catch(error => { console.error(error); process.exitCode = 1; });
