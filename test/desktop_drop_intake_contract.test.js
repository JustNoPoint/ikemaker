'use strict';

const assert = require('assert');
const crypto = require('crypto');
const {
  SURFACES, createDropSession, sessionIsCurrent, assertCurrentDropSession,
  admitDesktopDrop, assertCurrentDropCandidate
} = require('../src/desktop_drop_intake_contract');

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const pngHeader = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const wavHeader = Buffer.from('524946462400000057415645666d7420', 'hex');
const limits = { maxItems: 3, maxFileBytes: 100, maxAggregateBytes: 150, maxDecodedPixels: 1000, maxAggregateDecodedPixels: 1000, maxHeaderBytes: 32 };
const sff = createDropSession({ surface: SURFACES.SFF, generation: 7, sessionNonce: 'sff-drop-7', limits });
const sameSff = createDropSession({ surface: SURFACES.SFF, generation: 7, sessionNonce: 'sff-drop-7', limits });
const staleSff = createDropSession({ surface: SURFACES.SFF, generation: 8, sessionNonce: 'sff-drop-8', limits: sff.limits });
assert(sessionIsCurrent(sff, sameSff));
assert(!sessionIsCurrent(sff, staleSff));
assert.throws(() => assertCurrentDropSession(sff, staleSff), /stale/i);
assert(Object.isFrozen(sff) && Object.isFrozen(sff.limits));

const first = { kind: 'file', path: 'C:\\Sprites\\idle.png', canonicalPathEvidence: 'c:\\sprites\\idle.png', byteLength: 40, byteHash: sha(Buffer.from('idle')), headerBytes: pngHeader, decodedPixels: { width: 10, height: 10, frames: 1, pixelCount: 100 } };
const second = { kind: 'file', path: 'C:\\Sprites\\walk.png', canonicalPathEvidence: 'C:\\Sprites\\walk.png', byteLength: 50, byteHash: sha(Buffer.from('walk')), headerBytes: pngHeader, decodedPixels: { width: 20, height: 10, frames: 2, pixelCount: 400 } };
const accepted = admitDesktopDrop({ session: sff, currentSession: sameSff, items: [first, second] });
assert.strictEqual(accepted.status, 'admitted');
assert.deepStrictEqual(accepted.admitted.map((row) => row.sourceOrdinal), [0, 1]);
assert.deepStrictEqual(accepted.admitted.map((row) => row.canonicalPath), ['c:\\sprites\\idle.png', 'C:\\Sprites\\walk.png']);
assert.match(accepted.admitted[0].identity, /^[0-9a-f]{64}$/);
assert.match(accepted.candidate.candidateId, /^[0-9a-f]{64}$/);
assert(Object.isFrozen(accepted) && Object.isFrozen(accepted.admitted) && Object.isFrozen(accepted.admitted[0]) && Object.isFrozen(accepted.candidate.records));
assertCurrentDropCandidate(accepted.candidate, sameSff);
assert.throws(() => assertCurrentDropCandidate(accepted.candidate, staleSff), /stale/i);
assert.deepStrictEqual(first.decodedPixels, { width: 10, height: 10, frames: 1, pixelCount: 100 });

const cancelled = admitDesktopDrop({ session: sff, currentSession: sameSff, items: [first], cancelled: true });
assert.strictEqual(cancelled.status, 'cancelled');
assert.strictEqual(cancelled.candidate, null);
assert.deepStrictEqual(cancelled.admitted, []);

const bad = admitDesktopDrop({ session: sff, currentSession: sameSff, items: [
  { ...first, path: '..\\idle.png', canonicalPathEvidence: 'C:\\Sprites\\idle.png' },
  { ...first, path: 'C:\\Sprites\\bad.wav', canonicalPathEvidence: 'C:\\Sprites\\bad.wav', headerBytes: wavHeader },
  { ...first, path: 'C:\\Sprites\\lie.png', canonicalPathEvidence: 'C:\\Sprites\\lie.png', headerBytes: wavHeader },
  { ...first, path: 'C:\\Sprites\\huge.png', canonicalPathEvidence: 'C:\\Sprites\\huge.png', byteLength: 101, decodedPixels: { width: 40, height: 40 } }
] });
assert.strictEqual(bad.status, 'rejected');
assert.strictEqual(bad.candidate, null);
assert(bad.rejected[0].reasons.includes('noncanonical-local-path'));
assert(bad.rejected[0].reasons.includes('canonical-path-evidence-mismatch'));
assert(bad.rejected[1].reasons.includes('unsupported-format-for-surface'));
assert(bad.rejected[2].reasons.includes('magic-extension-mismatch'));
assert(bad.rejected[3].reasons.includes('item-count-limit-exceeded'));
assert(bad.rejected[3].reasons.includes('per-file-byte-limit-exceeded'));
assert(bad.rejected[3].reasons.includes('decoded-pixel-limit-exceeded'));

const aggregate = admitDesktopDrop({ session: sff, currentSession: sameSff, items: [first, second, { ...second, path: 'C:\\Sprites\\third.png', canonicalPathEvidence: 'C:\\Sprites\\third.png', byteLength: 70 }] });
assert.strictEqual(aggregate.status, 'partial');
assert(aggregate.rejected[0].reasons.includes('aggregate-byte-limit-exceeded'));
const pixelSession = createDropSession({ surface: SURFACES.SFF, generation: 9, sessionNonce: 'pixel-bound', limits: { ...limits, maxAggregateDecodedPixels: 450 } });
const aggregatePixels = admitDesktopDrop({ session: pixelSession, currentSession: pixelSession, items: [first, second] });
assert.strictEqual(aggregatePixels.status, 'partial');
assert(aggregatePixels.rejected[0].reasons.includes('aggregate-decoded-pixel-limit-exceeded'));

const mixed = admitDesktopDrop({ session: sff, currentSession: sameSff, items: [first, { kind: 'folder', path: 'C:\\Sprites\\More', canonicalPathEvidence: 'C:\\Sprites\\More' }] });
assert.strictEqual(mixed.status, 'rejected');
assert(mixed.rejected.every((row) => row.reasons.includes('mixed-file-folder-drop')));
const folder = admitDesktopDrop({ session: sff, currentSession: sameSff, items: [{ kind: 'folder', path: 'C:\\Sprites\\More', canonicalPathEvidence: 'C:\\Sprites\\More' }] });
assert.strictEqual(folder.status, 'admitted');
assert.strictEqual(folder.admitted[0].format, 'folder');
assert.match(folder.admitted[0].identity, /^[0-9a-f]{64}$/);
const unsupportedImage = admitDesktopDrop({ session: sff, currentSession: sameSff, items: [{ ...first, path: 'C:\\Sprites\\photo.jpg', canonicalPathEvidence: 'C:\\Sprites\\photo.jpg', headerBytes: Buffer.from('ffd8ff', 'hex') }] });
assert.strictEqual(unsupportedImage.status, 'rejected');
assert(unsupportedImage.rejected[0].reasons.includes('unsupported-format-for-surface'));

const snd = createDropSession({ surface: SURFACES.SND, generation: 1, sessionNonce: 'snd-drop-1' });
const sound = admitDesktopDrop({ session: snd, currentSession: snd, items: [{ kind: 'file', path: 'D:\\Sounds\\hit.wav', canonicalPathEvidence: 'D:\\Sounds\\hit.wav', byteLength: 44, byteHash: sha(Buffer.from('sound')), headerBytes: wavHeader, soundEvidence: { valid: true } }] });
assert.strictEqual(sound.status, 'admitted');
assert.strictEqual(sound.admitted[0].format, 'wav');
const sndFolder = admitDesktopDrop({ session: snd, currentSession: snd, items: [{ kind: 'folder', path: 'D:\\Sounds', canonicalPathEvidence: 'D:\\Sounds' }] });
assert.strictEqual(sndFolder.status, 'rejected');
assert(sndFolder.rejected[0].reasons.includes('unsupported-format-for-surface'));

assert.throws(() => admitDesktopDrop({ session: sff, currentSession: staleSff, items: [first] }), /stale/i);
console.log('Desktop-drop intake contract rejects unsafe evidence and seals ordered mutation-free SFF/SND candidates');
