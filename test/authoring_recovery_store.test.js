'use strict';

const assert = require('assert');
const { AuthoringRecoveryStore } = require('../src/authoring_recovery_store');

(async () => {
  const writes = []; let releaseFirst;
  const memento = { get:() => ({}), update:(_key,value) => { writes.push(JSON.parse(JSON.stringify(value))); if (writes.length === 1) return new Promise((resolve) => { releaseFirst = resolve; }); return Promise.resolve(); } };
  const store = new AuthoringRecoveryStore(memento, 'drafts');
  const first = store.set('file:a', { text:'first' });
  const second = store.set('file:a', { text:'newest' });
  await Promise.resolve();
  assert.strictEqual(writes.length, 1, 'a newer Memento update waits for the prior write instead of racing it');
  releaseFirst(); await Promise.all([first,second,store.flush()]);
  assert.strictEqual(writes.length, 2); assert.strictEqual(writes[1].records['file:a'].text, 'newest');
  assert(writes[1].records['file:a'].revision > writes[0].records['file:a'].revision); assert.strictEqual(writes[1].schema,'ikemaker.authoring-recovery'); assert.strictEqual(writes[1].version,1);
  const deleting = store.delete('file:a'); await deleting; assert.strictEqual(writes.at(-1).records['file:a'], undefined);
  const boundedStore=new AuthoringRecoveryStore({get:()=>({bad:{noText:true},good:{text:'kept',filename:'good.zss',revision:3},oversized:{text:'x'.repeat(2000),revision:4}}),update:()=>Promise.resolve()},'bounded',undefined,{maxRecords:2,maxBytes:1024});
  assert.strictEqual(boundedStore.get('bad'),null); assert.strictEqual(boundedStore.get('oversized'),null); assert.strictEqual(boundedStore.get('good').text,'kept');
  await boundedStore.set('new',{text:'new',filename:'new.zss'}); await boundedStore.set('newer',{text:'newer',filename:'newer.zss'});
  assert.deepStrictEqual(Object.keys(boundedStore.snapshot()),['newer','new'],'oldest records are deterministically pruned first');
  const before=boundedStore.snapshot(); await assert.rejects(()=>boundedStore.set('too-large',{text:'x'.repeat(2000)}),/aggregate storage limit/); assert.deepStrictEqual(boundedStore.snapshot(),before,'an oversized record cannot displace valid recovery data');
  await assert.rejects(()=>boundedStore.set('x'.repeat(9000),{text:'tiny'}),/id exceeds/);
  const perFile=new AuthoringRecoveryStore({get:()=>({}),update:()=>Promise.resolve()},'per-file',undefined,{maxRecords:2,maxBytes:4096});
  await perFile.set('a-old',{text:'a1',filename:'a.zss'}); await perFile.set('b-only',{text:'b1',filename:'b.zss'}); await perFile.set('a-new',{text:'a2',filename:'a.zss'});
  assert(perFile.get('a-new')&&perFile.get('b-only')); assert.strictEqual(perFile.get('a-old'),null,'older same-file history prunes before another file\'s sole newest recovery');
  const raceStore=new AuthoringRecoveryStore({get:()=>({}),update:()=>Promise.resolve()},'race'); await raceStore.set('same-id',{text:'reviewed',filename:'a.zss'});
  const reviewedRevision=raceStore.get('same-id').revision; await raceStore.set('same-id',{text:'replacement',filename:'a.zss'});
  assert.strictEqual(await raceStore.deleteIfRevision('same-id',reviewedRevision),false,'a stale menu cannot delete a newer replacement'); assert.strictEqual(raceStore.get('same-id').text,'replacement');
  assert.strictEqual(await raceStore.deleteIfRevision('same-id',raceStore.get('same-id').revision),true); assert.strictEqual(raceStore.get('same-id'),null);
  console.log('Coding Viewer draft recovery serializes delayed Memento writes and preserves the newest revision');
})().catch((error) => { console.error(error); process.exitCode = 1; });
