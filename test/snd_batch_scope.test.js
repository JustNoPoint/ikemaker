'use strict';

const assert = require('assert');
const { snapshot, indicesForRequest, resolveScope, createWorkSet } = require('../src/snd_batch_scope');

const archive = { filename: '/char/voice.snd', buffer: Buffer.from('snd-v1'), entries: [
  { archiveIndex: 0, group: 0, index: 0, dataSize: 10 },
  { archiveIndex: 1, group: 100, index: 0, dataSize: 20 },
  { archiveIndex: 2, group: 100, index: 1, dataSize: 30 },
  { archiveIndex: 3, group: 200, index: 0, dataSize: 40 }
] };
const snap = snapshot(archive);
assert.strictEqual(snap.entries[2].id, '100,1');
assert.deepStrictEqual(indicesForRequest(snap, { mode: 'current', currentIndex: 2 }), [2]);
assert.deepStrictEqual(indicesForRequest(snap, { mode: 'marked', markedIndices: [3, 1, 3] }), [1, 3]);
assert.deepStrictEqual(indicesForRequest(snap, { mode: 'visible', visibleIndices: [2, 0] }), [0, 2]);
assert.deepStrictEqual(indicesForRequest(snap, { mode: 'group', group: 100 }), [1, 2]);
assert.deepStrictEqual(indicesForRequest(snap, { mode: 'range', first: 1, last: 2 }), [1, 2]);
assert.deepStrictEqual(indicesForRequest(snap, { mode: 'all' }), [0, 1, 2, 3]);
assert.throws(() => indicesForRequest(snap, { mode: 'range', first: 3, last: 2 }), /within 0-3/);
assert.throws(() => indicesForRequest(snap, { mode: 'visible', visibleIndices: [] }), /contains no sounds/);
assert.throws(() => indicesForRequest(snap, { mode: 'all', fingerprint: 'STALE' }), /changed after this scope/);

const set = createWorkSet(snap, 'Voices', [2, 1]);
assert.deepStrictEqual(set.entryIds, ['100,0', '100,1']);
assert.deepStrictEqual(indicesForRequest(snap, { mode: 'work-set', workSetId: set.id }, [set]), [1, 2]);
assert.throws(() => indicesForRequest(snap, { mode: 'work-set', workSetId: 'missing' }, [set]), /no longer exists/);
assert.throws(() => indicesForRequest(snap, { mode: 'work-set', workSetId: set.id }, [{ ...set, fingerprint: '0'.repeat(64) }]), /older version/);

const resolved = resolveScope(snap, { mode: 'group', group: 100 });
assert.deepStrictEqual(resolved.identities, ['100,0', '100,1']);
assert.strictEqual(resolved.assetKind, 'snd-sound');
assert.strictEqual(resolved.resolutionHash, resolveScope(snap, { mode: 'group', group: 100 }).resolutionHash);

const duplicateArchive = { ...archive, buffer: Buffer.from('duplicates'), entries: [{ archiveIndex: 0, group: 1, index: 0 }, { archiveIndex: 1, group: 1, index: 0 }] };
const duplicateSnap = snapshot(duplicateArchive);
assert.throws(() => indicesForRequest(duplicateSnap, { mode: 'all' }), /duplicate SND identities/);
assert.throws(() => createWorkSet(duplicateSnap, 'Unsafe', [0]), /ambiguous duplicate/);

console.log('SND batch scope tests passed');
