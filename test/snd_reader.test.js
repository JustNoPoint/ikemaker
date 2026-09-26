'use strict';

const assert = require('assert');
const { parseSndBuffer, wavInfo, soundBuffer, soundDataUri, soundPeaks } = require('../src/snd_reader');

function wav(sampleRate = 8000, samples = 8) {
  const data = Buffer.alloc(samples * 2), output = Buffer.alloc(44 + data.length);
  output.write('RIFF', 0); output.writeUInt32LE(output.length - 8, 4); output.write('WAVEfmt ', 8); output.writeUInt32LE(16, 16); output.writeUInt16LE(1, 20); output.writeUInt16LE(1, 22); output.writeUInt32LE(sampleRate, 24); output.writeUInt32LE(sampleRate * 2, 28); output.writeUInt16LE(2, 32); output.writeUInt16LE(16, 34); output.write('data', 36); output.writeUInt32LE(data.length, 40); data.copy(output, 44); return output;
}
function snd(items, eofTerminator = false) {
  const chunks = [], header = Buffer.alloc(24); header.write('ElecbyteSnd\0', 0, 'binary'); header.writeUInt16LE(1, 12); header.writeUInt16LE(0, 14); header.writeUInt32LE(items.length, 16); header.writeUInt32LE(items.length ? 24 : 0, 20);
  let offset = 24;
  for (let i = 0; i < items.length; i += 1) { const data = items[i].data, chunk = Buffer.alloc(16 + data.length), next = i + 1 < items.length ? offset + chunk.length : 0; chunk.writeUInt32LE(next, 0); chunk.writeUInt32LE(data.length, 4); chunk.writeInt32LE(items[i].group, 8); chunk.writeInt32LE(items[i].index, 12); data.copy(chunk, 16); chunks.push(chunk); offset += chunk.length; }
  const result = Buffer.concat([header, ...chunks]);
  if (eofTerminator && items.length) result.writeUInt32LE(result.length, result.length - items[items.length - 1].data.length - 16);
  return result;
}

const wave = wav(), archive = parseSndBuffer(snd([{ group: 200, index: 0, data: wave }, { group: 10200, index: 0, data: wave }]), 'Ryu.snd');
assert.deepStrictEqual(archive.version, [1, 0]);
assert.strictEqual(archive.entries.length, 2);
assert.strictEqual(archive.entries[0].wav.sampleRate, 8000);
assert.strictEqual(archive.entries[0].wav.bitsPerSample, 16);
assert.strictEqual(soundBuffer(archive, archive.entries[1]).length, wave.length);
assert(soundDataUri(archive, archive.entries[0]).startsWith('data:audio/wav;base64,'));
assert.strictEqual(soundPeaks(archive, archive.entries[0], 4).length, 4);
assert.strictEqual(wavInfo(Buffer.from('bad')).valid, false);
assert.deepStrictEqual(parseSndBuffer(snd([{ group: 3, index: 0, data: wave }], true)).issues, []);
const duplicate = parseSndBuffer(snd([{ group: 1, index: 0, data: wave }, { group: 1, index: 0, data: wave }]));
assert(duplicate.issues.some((issue) => issue.includes('Duplicate sound 1,0')));
assert.throws(() => parseSndBuffer(Buffer.alloc(24)), /invalid ElecbyteSnd signature/);
console.log('SND reader tests passed');
