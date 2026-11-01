'use strict';

const assert = require('assert');
const path = require('path');
const { AuthoringContextModel, contextIdentity, normalized, uniqueFiles } = require('../src/authoring_context_model');

const root = path.join('C:', 'Game', 'chars', 'Ryu');
const def = path.join(root, 'Ryu.def');
const air = path.join(root, 'Ryu.air');
const model = new AuthoringContextModel({
  type: 'character', key: root, label: 'Ryu', root,
  files: [def, def.toUpperCase(), { fsPath: air }],
  activeSurfaceId: 'air.viewer',
  selection: { action: 200, frames: [0, 1] }
});

assert.strictEqual(model.identity, contextIdentity({ type: 'character', key: root }));
assert(model.identity.endsWith(normalized(root)));
assert.strictEqual(contextIdentity({type:'character',key:def}),contextIdentity({type:'character',key:root,ownerDef:def}),'a DEF-keyed panel and an owner-bound character panel share one exact character identity');
assert.notStrictEqual(contextIdentity({type:'character',key:root,ownerDef:def}),contextIdentity({type:'character',key:root,ownerDef:path.join(root,'Ryu-Nightly.def')}),'same-folder DEF variants retain distinct character identities');
assert.notStrictEqual(contextIdentity({type:'character',key:root,ownerDef:def,projectId:path.join('C:','Game')}),contextIdentity({type:'character',key:root,ownerDef:def,projectId:path.join('D:','OtherGame')}),'project identity participates when supplied instead of collapsing equivalent owner labels');
assert(contextIdentity({type:'character',key:root,ownerDef:def,projectId:'SF6'}).includes('\0sf6\0'),'logical project IDs remain stable IDs rather than resolving against the extension process directory');
assert.deepStrictEqual(uniqueFiles([def, def.toUpperCase(), air]).map(normalized), [normalized(def), normalized(air)]);

const first = model.snapshot();
assert(Object.isFrozen(first) && Object.isFrozen(first.files) && Object.isFrozen(first.selection.frames), 'snapshots are recursively immutable');
assert.strictEqual(first, model.snapshot(), 'unchanged snapshots retain reference identity');
assert.strictEqual(first.id, first.identity);
assert.strictEqual(first.kind, 'character');
assert.strictEqual(first.activeSurfaceId, 'air.viewer');
assert.deepStrictEqual(first.files.map(normalized), [normalized(def), normalized(air)], 'connected files are normalized and deduplicated');
assert.deepStrictEqual(first.connectedFiles, first.files);
assert.strictEqual(first.revision, 0);
assert.strictEqual(first.selectionRevision, 0);

const notices = [];
const subscription = model.subscribe(snapshot => notices.push(snapshot));
assert.strictEqual(model.update({ label: 'Ryu' }), first, 'no-op updates do not advance revisions');
const filesChanged = model.setConnectedFiles([air, path.join(root, 'states.zss'), air]);
assert.strictEqual(filesChanged.revision, 1);
assert.strictEqual(filesChanged.selectionRevision, 0, 'file updates do not invalidate selection revision');
assert.strictEqual(filesChanged.files.length, 2);
const selected = model.setSelection({ action: 201, frames: [2] });
assert.strictEqual(selected.revision, 2);
assert.strictEqual(selected.selectionRevision, 1);
assert.strictEqual(model.setSelection({ action: 201, frames: [2] }), selected, 'equal selection is a no-op');
assert.strictEqual(notices.length, 2);
const active = model.setActiveSurface('sff.viewer');
assert.strictEqual(active.activeSurfaceId, 'sff.viewer');
assert.strictEqual(active.revision, 3);

const lease = model.acquireDraftLease('move-lab');
assert(lease && model.hasDraftLease('move-lab'));
assert.throws(() => new AuthoringContextModel({ type: 'character', key: 'x' }).acquireDraftLease({ id: 'cyclic' }), /stable nonempty string/);
assert.strictEqual(model.acquireDraftLease('helper-lab'), null, 'only one draft owner may hold the context');
assert.strictEqual(model.releaseDraftLease({}), false, 'a different token cannot release the draft owner');
assert.strictEqual(model.hasDraftLease(), true);
assert.strictEqual(model.releaseDraftLease(lease), true);
assert.strictEqual(model.releaseDraftLease(lease), false, 'a lease can only be released once');

subscription.dispose();
const beforeDisposeNotices = notices.length;
assert.strictEqual(model.dispose(), true);
assert.strictEqual(model.snapshot().disposed, true);
assert.strictEqual(model.hasDraftLease(), false, 'cleanup releases draft ownership');
assert.strictEqual(model.dispose(), false, 'cleanup is idempotent');
assert.throws(() => model.update({ label: 'late' }), /disposed/);
assert.strictEqual(notices.length, beforeDisposeNotices, 'disposed subscriptions are not called during cleanup');

console.log('Authoring context identity, immutable snapshots, revisions, leases, subscriptions and cleanup tests passed');
