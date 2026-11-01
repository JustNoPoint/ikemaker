'use strict';

const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const { prepareDesktopDrop, prepareDesktopDropAsync, inspectImageDimensions, gifFrameCount, SURFACES } = require('../src/desktop_drop_host_evidence');

const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010803000000', 'hex');
function pcmWav(payload = Buffer.from([0, 0])) {
  const body = Buffer.from(payload), bytes = Buffer.alloc(44 + body.length);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(body.length, 40); body.copy(bytes, 44); return bytes;
}
const wav = pcmWav();
const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');
function fakeFs(entries) {
  const handles = new Map(); let next = 1;
  const normalize = value => path.win32.normalize(value).toLowerCase();
  return {
    lstatSync(filename) { const entry = entries[normalize(filename)]; if (!entry) throw new Error('ENOENT'); return { size: entry.bytes?.length || 0, isSymbolicLink: () => Boolean(entry.link), isDirectory: () => entry.kind === 'folder', isFile: () => entry.kind === 'file' }; },
    realpathSync: Object.assign(filename => entries[normalize(filename)]?.canonical || filename, { native: filename => entries[normalize(filename)]?.canonical || filename }),
    openSync(filename) { const entry = entries[normalize(filename)]; if (!entry?.bytes) throw new Error('ENOENT'); const id = next++; handles.set(id, entry.bytes); return id; },
    readSync(id, target, offset, length, position) { const bytes = handles.get(id); const count = Math.min(length, Math.max(0, bytes.length - position)); bytes.copy(target, offset, position, position + count); return count; },
    closeSync(id) { handles.delete(id); }
  };
}

const files = fakeFs({
  'c:\\sprites\\idle.png': { kind: 'file', bytes: png, canonical: 'C:\\Sprites\\idle.png' },
  'c:\\sounds\\hit.wav': { kind: 'file', bytes: wav, canonical: 'C:\\Sounds\\hit.wav' },
  'c:\\sprites\\batch': { kind: 'folder', canonical: 'C:\\Sprites\\batch' },
  'c:\\sprites\\linked.png': { kind: 'file', link: true, bytes: png, canonical: 'C:\\Sprites\\real.png' }
});
files.readFileSync = filename => ({ 'c:\\sprites\\idle.png': png, 'c:\\sprites\\one.gif': gif }[path.win32.normalize(filename).toLowerCase()] || (() => { throw new Error('ENOENT'); })());
assert.strictEqual(gifFrameCount(gif), 1);
assert.deepStrictEqual(inspectImageDimensions('C:\\Sprites\\one.gif', 'gif', files), { width: 1, height: 1, frames: 1, pixelCount: 1 });
const image = prepareDesktopDrop({ surface: SURFACES.SFF, generation: 2, sessionNonce: 'creator-2', paths: ['C:\\Sprites\\idle.png'], inspectImage: () => ({ width: 1, height: 1, frames: 1, pixelCount: 1 }), fsApi: files });
assert.strictEqual(image.admission.status, 'admitted');
assert.strictEqual(image.admission.admitted[0].byteHash, crypto.createHash('sha256').update(png).digest('hex'));
assert.deepStrictEqual(image.admission.admitted[0].decodedPixels, { width: 1, height: 1, frames: 1, pixelCount: 1 });
const folder = prepareDesktopDrop({ surface: SURFACES.SFF, generation: 3, sessionNonce: 'creator-3', paths: ['C:\\Sprites\\batch'], inspectImage: () => { throw new Error('not called'); }, fsApi: files });
assert.strictEqual(folder.admission.admitted[0].kind, 'folder');
const sound = prepareDesktopDrop({ surface: SURFACES.SND, generation: 4, sessionNonce: 'snd-4', paths: ['C:\\Sounds\\hit.wav'], inspectSound: () => ({ valid: true }), fsApi: files });
assert.strictEqual(sound.admission.admitted[0].format, 'wav');
const linked = prepareDesktopDrop({ surface: SURFACES.SFF, generation: 5, sessionNonce: 'creator-5', paths: ['C:\\Sprites\\linked.png'], inspectImage: () => ({ width: 1, height: 1, frames: 1 }), fsApi: files });
assert.strictEqual(linked.admission.status, 'rejected');
assert(linked.admission.rejected[0].reasons.includes('canonical-path-evidence-mismatch'));
const missing = prepareDesktopDrop({ surface: SURFACES.SFF, generation: 6, sessionNonce: 'creator-6', paths: ['C:\\Sprites\\missing.png'], inspectImage: () => ({ width: 1, height: 1, frames: 1 }), fsApi: files });
assert.strictEqual(missing.admission.status, 'rejected');
assert.strictEqual(missing.admission.candidate, null);

let inspectedOversize = false;
const oversized = prepareDesktopDrop({ surface: SURFACES.SFF, generation: 9, sessionNonce: 'oversize-9', paths: ['C:\\Sprites\\idle.png'], limits: { maxFileBytes: png.length - 1 }, inspectImage: () => { inspectedOversize = true; throw new Error('must not decode'); }, fsApi: files });
assert.strictEqual(inspectedOversize, false, 'oversized files are rejected before decoder or full-file reads');
assert(oversized.admission.rejected[0].reasons.includes('per-file-byte-limit-exceeded'));
let inspectedPastLimit = false;
const beyondCount = prepareDesktopDrop({ surface: SURFACES.SFF, generation: 10, sessionNonce: 'count-10', paths: ['C:\\Sprites\\idle.png', 'C:\\Sprites\\missing.png'], limits: { maxItems: 1 }, inspectImage: filename => { if (/missing/i.test(filename)) inspectedPastLimit = true; return { width: 1, height: 1, frames: 1, pixelCount: 1 }; }, fsApi: files });
assert.strictEqual(inspectedPastLimit, false, 'the count-limit sentinel performs no filesystem or decode work');
assert(beyondCount.admission.rejected[0].reasons.includes('item-count-limit-exceeded'));
let aggregateInspections = 0;
const aggregate = prepareDesktopDrop({ surface: SURFACES.SFF, generation: 11, sessionNonce: 'aggregate-11', paths: ['C:\\Sprites\\idle.png', 'C:\\Sprites\\idle.png'], limits: { maxAggregateBytes: png.length }, inspectImage: () => { aggregateInspections += 1; return { width: 1, height: 1, frames: 1, pixelCount: 1 }; }, fsApi: files });
assert.strictEqual(aggregateInspections, 1, 'aggregate byte exhaustion prevents later image decoding and hashing');
assert(aggregate.admission.rejected[0].reasons.includes('aggregate-byte-limit-exceeded'));
let pixelInspections = 0;
const aggregatePixels = prepareDesktopDrop({ surface: SURFACES.SFF, generation: 12, sessionNonce: 'pixels-12', paths: ['C:\\Sprites\\idle.png', 'C:\\Sprites\\idle.png'], limits: { maxAggregateDecodedPixels: 1 }, inspectImage: () => { pixelInspections += 1; return { width: 1, height: 1, frames: 1, pixelCount: 1 }; }, fsApi: files });
assert.strictEqual(pixelInspections, 1, 'aggregate decoded-pixel exhaustion prevents later decoder work');
assert(aggregatePixels.admission.rejected[0].reasons.includes('aggregate-decoded-pixel-limit-exceeded'));
let malformedInspections = 0;
const malformedAggregate = prepareDesktopDrop({ surface: SURFACES.SFF, generation: 13, sessionNonce: 'malformed-13', paths: ['C:\\Sprites\\idle.png', 'C:\\Sprites\\idle.png', 'C:\\Sprites\\idle.png'], limits: { maxAggregateBytes: png.length }, inspectImage: () => { malformedInspections += 1; throw new Error('malformed-image'); }, fsApi: files });
assert.strictEqual(malformedInspections, 1, 'a malformed inspected file still consumes aggregate byte budget before later decoder work');
assert.strictEqual(malformedAggregate.admission.status, 'rejected');

console.log('Desktop-drop host evidence canonicalizes and hashes before admission without mutation.');

(async () => {
  let completed = 0;
  const cancelled = await prepareDesktopDropAsync({ surface: SURFACES.SFF, generation: 7, sessionNonce: 'cancel-7', paths: ['C:\\Sprites\\idle.png', 'C:\\Sprites\\idle.png'], inspectImage: () => ({ width: 1, height: 1, frames: 1 }), fsApi: files, isCancelled: () => completed >= 1, onProgress: progress => { completed = progress.completed + (progress.completed < progress.total ? 1 : 0); } });
  assert.strictEqual(cancelled.admission.status, 'cancelled');
  assert.strictEqual(cancelled.admission.candidate, null, 'cancellation never yields a partial candidate');
  const progress = [];
  const complete = await prepareDesktopDropAsync({ surface: SURFACES.SFF, generation: 8, sessionNonce: 'complete-8', paths: ['C:\\Sprites\\idle.png'], inspectImage: () => ({ width: 1, height: 1, frames: 1 }), fsApi: files, onProgress: value => progress.push(value.completed) });
  assert.strictEqual(complete.admission.status, 'admitted');
  assert.deepStrictEqual(progress, [0, 1]);
  console.log('Desktop-drop async evidence reports progress and cancels without a candidate.');
})().catch(error => { console.error(error); process.exitCode = 1; });
