'use strict';

const fs = require('fs');
const crypto = require('crypto');

const SIGNATURE = Buffer.from('ElecbyteSnd\0', 'binary');

function need(buffer, offset, size, label) {
  if (!Buffer.isBuffer(buffer) || offset < 0 || size < 0 || offset + size > buffer.length) throw new Error(`${label} is outside the SND file.`);
}

function wavInfo(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') return { valid: false };
  let offset = 12, format = null, dataSize = 0, dataOffset = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4), size = buffer.readUInt32LE(offset + 4), start = offset + 8;
    if (start + size > buffer.length) break;
    if (id === 'fmt ' && size >= 16) format = { format: buffer.readUInt16LE(start), channels: buffer.readUInt16LE(start + 2), sampleRate: buffer.readUInt32LE(start + 4), byteRate: buffer.readUInt32LE(start + 8), blockAlign: buffer.readUInt16LE(start + 12), bitsPerSample: buffer.readUInt16LE(start + 14) };
    if (id === 'data') { if (dataOffset === null) dataOffset = start; dataSize += size; }
    offset = start + size + (size & 1);
  }
  if (!format) return { valid: false };
  return { valid: true, ...format, dataOffset, dataSize, durationSeconds: format.byteRate > 0 ? dataSize / format.byteRate : 0 };
}

function parseSndBuffer(buffer, filename = '') {
  need(buffer, 0, 24, 'SND header');
  if (!buffer.subarray(0, 12).equals(SIGNATURE)) throw new Error('Unrecognized SND file: invalid ElecbyteSnd signature.');
  const version = [buffer.readUInt16LE(12), buffer.readUInt16LE(14)], declaredCount = buffer.readUInt32LE(16), firstSubheaderOffset = buffer.readUInt32LE(20), entries = [], issues = [], identities = new Map(), visited = new Set();
  let offset = firstSubheaderOffset;
  for (let archiveIndex = 0; archiveIndex < declaredCount; archiveIndex += 1) {
    if (!offset) { issues.push(`Archive ended after ${archiveIndex} of ${declaredCount} declared sounds.`); break; }
    if (visited.has(offset)) { issues.push(`Sound subheader chain loops at byte ${offset}.`); break; }
    visited.add(offset); need(buffer, offset, 16, `Sound ${archiveIndex} subheader`);
    const nextOffset = buffer.readUInt32LE(offset), dataSize = buffer.readUInt32LE(offset + 4), group = buffer.readInt32LE(offset + 8), index = buffer.readInt32LE(offset + 12), dataOffset = offset + 16;
    need(buffer, dataOffset, dataSize, `Sound ${group},${index} WAV data`);
    const data = buffer.subarray(dataOffset, dataOffset + dataSize), identity = `${group},${index}`, duplicateOf = identities.has(identity) ? identities.get(identity) : null;
    if (duplicateOf !== null) issues.push(`Duplicate sound ${identity} at archive index ${archiveIndex}; IKEMEN keeps the first entry.`); else identities.set(identity, archiveIndex);
    const info = wavInfo(data); if (!info.valid) issues.push(`Sound ${identity} is not a readable RIFF/WAVE entry.`);
    entries.push({ archiveIndex, group, index, identity, duplicateOf, subheaderOffset: offset, dataOffset, dataSize, nextOffset, wav: info });
    offset = nextOffset;
  }
  // SndMaker commonly terminates the chain with the exact end-of-file offset
  // instead of zero. Both forms are valid; only an offset to additional bytes
  // represents an unexpected undeclared subheader.
  if (entries.length === declaredCount && offset && offset !== buffer.length) issues.push(`The final declared sound points to another subheader at byte ${offset}.`);
  return { filename, buffer, version, declaredCount, firstSubheaderOffset, entries, issues };
}

function readSnd(filename) { return parseSndBuffer(fs.readFileSync(filename), filename); }
function soundBuffer(archive, entry) { return archive.buffer.subarray(entry.dataOffset, entry.dataOffset + entry.dataSize); }
function soundDataUri(archive, entry) { return `data:audio/wav;base64,${soundBuffer(archive, entry).toString('base64')}`; }
function soundPeaks(archive, entry, buckets = 360) {
  const wav = soundBuffer(archive, entry), info = entry.wav || wavInfo(wav);
  if (!info.valid || info.format !== 1 || info.bitsPerSample !== 16 || info.dataOffset === null || !info.blockAlign) return [];
  const frames = Math.floor(info.dataSize / info.blockAlign), count = Math.max(1, Math.min(Number(buckets) || 360, frames)), peaks = [];
  for (let bucket = 0; bucket < count; bucket += 1) {
    const first = Math.floor(bucket * frames / count), last = Math.max(first + 1, Math.floor((bucket + 1) * frames / count)); let peak = 0;
    for (let frame = first; frame < last; frame += 1) for (let channel = 0; channel < info.channels; channel += 1) { const at = info.dataOffset + frame * info.blockAlign + channel * 2; if (at + 2 <= wav.length) peak = Math.max(peak, Math.abs(wav.readInt16LE(at)) / 32768); }
    peaks.push(peak);
  }
  return peaks;
}

function soundAnalysis(archive, entry, options = {}) {
  const wav = soundBuffer(archive, entry), info = entry.wav || wavInfo(wav), limit = Math.max(1000, Number(options.maxSamples) || 50000);
  if (!info.valid || info.format !== 1 || ![8, 16].includes(info.bitsPerSample) || info.dataOffset === null || !info.blockAlign || !info.channels || !info.sampleRate) return { supported: false, reason: 'Audio QA currently supports PCM 8-bit and PCM 16-bit WAV data.' };
  const bytes = info.bitsPerSample / 8, frames = Math.floor(info.dataSize / info.blockAlign), totalSamples = frames * info.channels, stride = Math.max(1, Math.ceil(totalSamples / limit));
  let analyzedSamples = 0, peak = 0, sum = 0, sumSquares = 0, clippedSamples = 0, nearClippedSamples = 0;
  const sample = sampleIndex => { const at = info.dataOffset + sampleIndex * bytes; if (at + bytes > wav.length) return 0; return info.bitsPerSample === 16 ? wav.readInt16LE(at) / 32768 : (wav.readUInt8(at) - 128) / 128; };
  for (let sampleIndex = 0; sampleIndex < totalSamples; sampleIndex += stride) { const value = sample(sampleIndex), absolute = Math.abs(value); analyzedSamples += 1; peak = Math.max(peak, absolute); sum += value; sumSquares += value * value; if (info.bitsPerSample === 16 ? value <= -1 || value >= 32767 / 32768 : value <= -1 || value >= 127 / 128) clippedSamples += 1; if (absolute >= .98) nearClippedSamples += 1; }
  const silentFrame = frame => { for (let channel = 0; channel < info.channels; channel += 1) if (Math.abs(sample(frame * info.channels + channel)) > .0032) return false; return true; }, silenceSeconds = Math.max(.05, Math.min(10, Number(options.silenceScanSeconds) || 1)), silenceLimit = Math.min(frames, Math.max(1, Math.floor(info.sampleRate * silenceSeconds)));
  let leadingFrames = 0, trailingFrames = 0;
  while (leadingFrames < silenceLimit && silentFrame(leadingFrames)) leadingFrames += 1;
  while (trailingFrames < silenceLimit && trailingFrames < frames - leadingFrames && silentFrame(frames - trailingFrames - 1)) trailingFrames += 1;
  return { supported: true, sampled: stride > 1, analyzedSamples, totalSamples, peak, rms: analyzedSamples ? Math.sqrt(sumSquares / analyzedSamples) : 0, dcOffset: analyzedSamples ? sum / analyzedSamples : 0, clippedSamples, nearClippedSamples, leadingSilenceSeconds: leadingFrames / info.sampleRate, trailingSilenceSeconds: trailingFrames / info.sampleRate };
}

function soundDuplicates(archive) {
  const exact = new Map(), pcm = new Map(), result = new Map();
  for (const entry of archive.entries || []) {
    const wav = soundBuffer(archive, entry), info = entry.wav || wavInfo(wav), exactKey = crypto.createHash('sha256').update(wav).digest('hex'), exactOf = exact.has(exactKey) ? exact.get(exactKey) : null;
    if (exactOf === null) exact.set(exactKey, entry.archiveIndex);
    let pcmOf = null;
    if (info.valid && info.dataOffset !== null && info.dataSize >= 0 && info.dataOffset + info.dataSize <= wav.length) {
      const formatKey = `${info.format}:${info.channels}:${info.sampleRate}:${info.bitsPerSample}:`, pcmKey = formatKey + crypto.createHash('sha256').update(wav.subarray(info.dataOffset, info.dataOffset + info.dataSize)).digest('hex');
      pcmOf = pcm.has(pcmKey) ? pcm.get(pcmKey) : null;
      if (pcmOf === null) pcm.set(pcmKey, entry.archiveIndex);
    }
    result.set(entry.archiveIndex, { exactOf, pcmOf: pcmOf === exactOf ? null : pcmOf });
  }
  return result;
}

function slicePcmWav(wav, startSeconds, endSeconds) {
  const info = wavInfo(wav);
  if (!info.valid || info.format !== 1 || ![8, 16].includes(info.bitsPerSample) || info.dataOffset === null || !info.blockAlign || !info.sampleRate) throw new Error('A/B export currently supports PCM 8-bit and PCM 16-bit WAV data.');
  const frames = Math.floor(info.dataSize / info.blockAlign), start = Math.max(0, Math.min(frames, Math.floor(Number(startSeconds) * info.sampleRate))), end = Math.max(start, Math.min(frames, Math.ceil(Number(endSeconds) * info.sampleRate)));
  if (!Number.isFinite(Number(startSeconds)) || !Number.isFinite(Number(endSeconds)) || end <= start) throw new Error('Choose a non-empty A/B audition range first.');
  const data = wav.subarray(info.dataOffset + start * info.blockAlign, info.dataOffset + end * info.blockAlign), output = Buffer.alloc(44 + data.length);
  output.write('RIFF', 0); output.writeUInt32LE(output.length - 8, 4); output.write('WAVEfmt ', 8); output.writeUInt32LE(16, 16); output.writeUInt16LE(1, 20); output.writeUInt16LE(info.channels, 22); output.writeUInt32LE(info.sampleRate, 24); output.writeUInt32LE(info.sampleRate * info.blockAlign, 28); output.writeUInt16LE(info.blockAlign, 32); output.writeUInt16LE(info.bitsPerSample, 34); output.write('data', 36); output.writeUInt32LE(data.length, 40); data.copy(output, 44);
  return output;
}

module.exports = { parseSndBuffer, readSnd, wavInfo, soundBuffer, soundDataUri, soundPeaks, soundAnalysis, soundDuplicates, slicePcmWav };
