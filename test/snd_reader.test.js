'use strict';

const assert = require('assert');
const { parseSndBuffer, wavInfo, soundBuffer, soundDataUri, soundPeaks, soundAnalysis, soundDuplicates, slicePcmWav } = require('../src/snd_reader');

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
const clippedRange = slicePcmWav(wave, .00025, .00075), clippedRangeInfo = wavInfo(clippedRange);
assert.strictEqual(clippedRangeInfo.dataSize, 8, 'A/B export keeps the requested four aligned 16-bit frames');
assert.strictEqual(clippedRangeInfo.durationSeconds, .0005);
assert.throws(() => slicePcmWav(wave, .0005, .0005), /non-empty A\/B/);
const quietAnalysis = soundAnalysis(archive, archive.entries[0]);
assert.strictEqual(quietAnalysis.supported, true);
assert.strictEqual(quietAnalysis.peak, 0);
assert.strictEqual(quietAnalysis.leadingSilenceSeconds, .001);
const clippedWave = wav(); clippedWave.writeInt16LE(32767, 44); clippedWave.writeInt16LE(-32768, 46); clippedWave.writeInt16LE(8192, 48);
const clippedArchive = parseSndBuffer(snd([{ group: 9, index: 1, data: clippedWave }]));
const clippedAnalysis = soundAnalysis(clippedArchive, clippedArchive.entries[0]);
assert.strictEqual(clippedAnalysis.clippedSamples, 2);
assert(clippedAnalysis.peak >= 1);
assert(clippedAnalysis.dcOffset < 1);
const largeWave = wav(8000, 2000), largeArchive = parseSndBuffer(snd([{ group: 9, index: 2, data: largeWave }]));
const sampledAnalysis = soundAnalysis(largeArchive, largeArchive.entries[0], { maxSamples: 1000, silenceScanSeconds: .05 });
assert.strictEqual(sampledAnalysis.sampled, true, 'large sounds use a bounded representative QA scan');
assert(sampledAnalysis.analyzedSamples <= 1000, 'bounded QA does not traverse every sample');
assert.strictEqual(wavInfo(Buffer.from('bad')).valid, false);
assert.deepStrictEqual(parseSndBuffer(snd([{ group: 3, index: 0, data: wave }], true)).issues, []);
const duplicate = parseSndBuffer(snd([{ group: 1, index: 0, data: wave }, { group: 1, index: 0, data: wave }]));
assert(duplicate.issues.some((issue) => issue.includes('Duplicate sound 1,0')));
const audioDuplicates = soundDuplicates(parseSndBuffer(snd([{ group: 1, index: 0, data: wave }, { group: 2, index: 0, data: wave }])));
assert.deepStrictEqual(audioDuplicates.get(0), { exactOf: null, pcmOf: null });
assert.deepStrictEqual(audioDuplicates.get(1), { exactOf: 0, pcmOf: null });
const metadataVariant = Buffer.from(wave); metadataVariant.writeUInt32LE(1234, 4);
const pcmDuplicates = soundDuplicates(parseSndBuffer(snd([{ group: 1, index: 0, data: wave }, { group: 3, index: 0, data: metadataVariant }])));
assert.deepStrictEqual(pcmDuplicates.get(1), { exactOf: null, pcmOf: 0 });
assert.throws(() => parseSndBuffer(Buffer.alloc(24)), /invalid ElecbyteSnd signature/);
console.log('SND reader tests passed');
