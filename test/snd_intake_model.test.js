'use strict';

const assert = require('assert');
const crypto = require('crypto');
const { SURFACES, createDropSession, admitDesktopDrop } = require('../src/desktop_drop_intake_contract');
const { manifestFingerprint, createDraft, resolveRow, planDraft, materializeManifest } = require('../src/snd_intake_model');

const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const header = Buffer.from('524946462400000057415645666d7420', 'hex');
const session = createDropSession({ surface: SURFACES.SND, generation: 4, sessionNonce: 'snd-intake-test' });
const item = (name, ordinal) => ({ kind: 'file', path: `C:\\Sounds\\${name}.wav`, canonicalPathEvidence: `C:\\Sounds\\${name}.wav`, byteLength: 44 + ordinal, byteHash: sha(Buffer.from(name)), headerBytes: header, soundEvidence: { valid: true } });
const admission = admitDesktopDrop({ session, currentSession: session, items: [item('first', 0), item('second', 1)] });
const manifest = { output: 'char.snd', entries: [{ source: 'wav/old.wav', group: 10, index: 0 }, { source: 'wav/hit.wav', group: 20, index: 0 }] };
const fingerprint = manifestFingerprint(manifest);

const appended = createDraft({ manifest, manifestPath: 'C:\\Char\\sound-build\\build.txt', candidate: admission.candidate, targetFingerprint: fingerprint, destinationHint: { kind: 'group', group: 10, startIndex: 0 } });
assert.deepStrictEqual(appended.rows.map(row => [row.group, row.index, row.action]), [[10, 1, 'add'], [10, 2, 'add']], 'group drops propose deterministic next-free identities in source order');
assert(Object.isFrozen(appended) && Object.isFrozen(appended.rows) && Object.isFrozen(appended.rows[0]));
assert.deepStrictEqual(admission.candidate.records.map(row => row.sourceOrdinal), [0, 1], 'planning never mutates or reorders the admitted desktop sources');
const appendPlan = planDraft(appended, manifest, admission.candidate.candidateId);
const built = materializeManifest(appendPlan, manifest, operation => `wav/${operation.sourceOrdinal ?? operation.rowId}.wav`);
assert.deepStrictEqual(manifest.entries.map(entry => `${entry.group},${entry.index}`), ['10,0', '20,0'], 'materialization never mutates the caller-owned manifest');
assert.deepStrictEqual(built.entries.map(entry => `${entry.group},${entry.index}`), ['10,0', '20,0', '10,1', '10,2'], 'accepted additions retain existing manifest order and append in reviewed drop order');

const collision = createDraft({ manifest, candidate: admission.candidate, destinationHint: { kind: 'replace-or-insert', group: 20, index: 0 } });
assert.strictEqual(collision.rows[0].state, 'collision');
assert.throws(() => planDraft(collision, manifest), /require review/);
const replaced = resolveRow(collision, collision.rows[0].rowId, { action: 'replace' }, manifest);
const replacementPlan = planDraft(replaced, manifest);
const replacement = materializeManifest(replacementPlan, manifest, operation => `wav/${operation.rowId}.wav`);
assert.strictEqual(replacement.entries[1].source, `wav/${replacementPlan.operations[0].rowId}.wav`, 'Replace changes only the reviewed existing identity in the returned manifest');
assert.strictEqual(replacement.entries[1].group, 20);
assert.strictEqual(replacement.entries[1].index, 0);

const moved = resolveRow(collision, collision.rows[0].rowId, { action: 'next-free' }, manifest);
assert.deepStrictEqual([moved.rows[0].group, moved.rows[0].index, moved.rows[0].action], [20, 2, 'add'], 'Next Free accounts for the later ready dropped row as well as existing entries');
const skipped = resolveRow(collision, collision.rows[0].rowId, { action: 'skip' }, manifest);
assert.strictEqual(planDraft(skipped, manifest).operations[0].action, 'skip');
assert.throws(() => resolveRow(collision, collision.rows[0].rowId, { action: 'manual', group: 10, index: 0 }, manifest), /occupied/);
const manual = resolveRow(collision, collision.rows[0].rowId, { action: 'manual', group: 30, index: 4 }, manifest);
assert.deepStrictEqual([manual.rows[0].group, manual.rows[0].index], [30, 4]);

const changedManifest = { ...manifest, entries: [...manifest.entries, { source: 'wav/new.wav', group: 99, index: 0 }] };
assert.throws(() => createDraft({ manifest, candidate: admission.candidate, targetFingerprint: '0'.repeat(64) }), /changed before/);
assert.throws(() => resolveRow(collision, collision.rows[0].rowId, { action: 'skip' }, changedManifest), /changed after/);
assert.throws(() => planDraft(appended, changedManifest), /changed after/);
assert.throws(() => planDraft(appended, manifest, 'different-candidate'), /candidate changed/);
assert.throws(() => materializeManifest(appendPlan, changedManifest, () => 'x.wav'), /changed before/);

const duplicateManifest = { output: 'bad.snd', entries: [{ source: 'a.wav', group: 1, index: 0 }, { source: 'b.wav', group: 1, index: 0 }] };
assert.throws(() => createDraft({ manifest: duplicateManifest, candidate: admission.candidate }), /duplicate identity/);
assert.throws(() => materializeManifest(appendPlan, manifest, () => ''), /No retained WAV source/);
console.log('SND intake model keeps dropped WAV batches reviewed, ordered, stale-safe, and manifest-only');
