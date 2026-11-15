'use strict';

const fs = require('fs');
const crypto = require('crypto');
const wavFormats = require('./wav_sample_formats');

const SIGNATURE = Buffer.from('ElecbyteSnd\0', 'binary');

function need(buffer, offset, size, label) {
  if (!Buffer.isBuffer(buffer) || offset < 0 || size < 0 || offset + size > buffer.length) throw new Error(`${label} is outside the SND file.`);
}

function wavInfo(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') return { valid: false };
  let offset = 12, format = null, dataSize = 0, dataOffset = null, dataChunks;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4), size = buffer.readUInt32LE(offset + 4), start = offset + 8;
    if (start + size > buffer.length) return { ...format, valid: false, formatError: 'WAV contains a truncated '+id+' chunk.' };
    if (id === 'fmt ' && size >= 16) format = wavFormats.formatInfo(buffer,start,size);
    if (id === 'data') {
      if (dataOffset === null) dataOffset = start;
      else {
        if (!dataChunks) dataChunks = [{ offset: dataOffset, size: dataSize }];
        dataChunks.push({ offset: start, size });
      }
      dataSize += size;
    }
    offset = start + size + (size & 1);
  }
  if (!format) return { valid: false };
  if (dataOffset === null && !format.formatError) format.formatError = 'WAV has no complete data chunk.';
  return { valid: !format.formatError, ...format, dataOffset, dataSize, ...(dataChunks ? {dataChunks} : {}), durationSeconds: format.byteRate > 0 ? dataSize / format.byteRate : 0 };
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
function wavDataUri(bytes) {
  const info = wavInfo(bytes);
  if (info.valid && (info.format === 65534 || info.effectiveFormat === 3 || info.bitsPerSample === 32)) {
    const data = pcmSampleBytes(bytes, info);
    if (data) {
      const width = info.bitsPerSample / 8;
      const sampleCount = data.length / width;
      const header = wavFormats.encodeLike([], info.sampleRate, info.channels, {format:1, bitsPerSample:16}).bytes;
      const preview = Buffer.allocUnsafe(header.length + sampleCount * 2);
      header.copy(preview);
      preview.writeUInt32LE(preview.length - 8, 4);
      preview.writeUInt32LE(sampleCount * 2, header.length - 4);
      for (let i = 0; i < sampleCount; i++) {
        const value = wavFormats.sample(data, i * width, info);
        // A non-finite source sample is silent in the browser audition copy.
        const pcm = Number.isFinite(value) ? wavFormats.roundEven(Math.max(-1, Math.min(32767 / 32768, value)) * 32768) : 0;
        preview.writeInt16LE(pcm, header.length + i * 2);
      }
      bytes = preview;
    }
  }
  return 'data:audio/wav;base64,' + bytes.toString('base64');
}
function soundDataUri(archive,entry){return wavDataUri(soundBuffer(archive,entry));}
function pcmSampleBytes(wav, info) {
  const width = info.bitsPerSample / 8;
  if (!info.valid || !wavFormats.supported(info) || !info.channels || !info.sampleRate ||
      info.blockAlign !== width * info.channels || info.dataOffset == null || info.dataSize % info.blockAlign ||
      info.dataOffset + info.dataSize > wav.length) return null;
  return info.dataChunks
    ? Buffer.concat(info.dataChunks.map(chunk => wav.subarray(chunk.offset, chunk.offset + chunk.size)))
    : wav.subarray(info.dataOffset, info.dataOffset + info.dataSize);
}

function pcmSampleReader(wav, info) {
  const data = pcmSampleBytes(wav, info);
  if (!data) return null;
  const width = info.bitsPerSample / 8;
  return index => {
    const offset = index * width;
    return wavFormats.sample(data,offset,info);
  };
}

function soundPeaks(archive, entry, buckets = 360, frameBudget = Infinity) {
  const wav = soundBuffer(archive, entry), info = entry.wav || wavInfo(wav);
  const sample = pcmSampleReader(wav, info);
  if (!sample || !info.dataSize) return [];
  const frames = Math.floor(info.dataSize / info.blockAlign), count = Math.max(1, Math.min(Number(buckets) || 360, frames)), peaks = [];
  for (let bucket = 0; bucket < count; bucket += 1) {
    const first = Math.floor(bucket * frames / count), last = Math.max(first + 1, Math.floor((bucket + 1) * frames / count)); let peak = 0;
    const framesPerBucket = Math.max(1, Math.floor(frameBudget / count));
    const stride = Math.max(1, Math.ceil((last - first) / framesPerBucket));
    for (let frame = first; frame < last; frame += stride) {
      for (let channel = 0; channel < info.channels; channel++) {
        const value = sample(frame * info.channels + channel);
        if (!Number.isFinite(value)) return [];
        peak = Math.max(peak, Math.abs(value));
      }
    }
    peaks.push(peak);
  }
  return peaks;
}

function soundAnalysis(archive, entry, options = {}) {
  const wav = soundBuffer(archive, entry), info = entry.wav || wavInfo(wav), limit = Math.max(1000, Number(options.maxSamples) || 50000);
  const sample = pcmSampleReader(wav, info);
  if (!sample) return { supported: false, reason: 'Audio QA requires complete supported PCM or IEEE-float frames.' };
  const frames = info.dataSize / info.blockAlign, totalSamples = frames * info.channels, stride = Math.max(1, Math.ceil(totalSamples / limit));
  let analyzedSamples = 0, peak = 0, sum = 0, sumSquares = 0, clippedSamples = 0, nearClippedSamples = 0;
  const floating = (info.effectiveFormat ?? info.format) === 3;
  const positiveLimit = floating ? 1 : 1 - 2 ** (1 - (info.validBitsPerSample || info.bitsPerSample));
  // Sample complete frames so a stride divisible by the channel count cannot hide a channel.
  for (let frame = 0; frame < frames; frame += stride) {
    for (let channel = 0; channel < info.channels; channel++) {
      const value = sample(frame * info.channels + channel);
      if (!Number.isFinite(value)) return {supported:false, reason:'WAV contains non-finite float samples.'};
      const absolute = Math.abs(value);
      analyzedSamples++;
      peak = Math.max(peak, absolute);
      sum += value;
      sumSquares += value * value;
      if (value <= -1 || value >= positiveLimit) clippedSamples++;
      if (absolute >= .98) nearClippedSamples++;
    }
  }
  const silentFrame = frame => { for (let channel = 0; channel < info.channels; channel += 1) if (Math.abs(sample(frame * info.channels + channel)) > .0032) return false; return true; }, silenceSeconds = Math.max(.05, Math.min(10, Number(options.silenceScanSeconds) || 1)), silenceLimit = Math.min(frames, Math.max(1, Math.floor(info.sampleRate * silenceSeconds)));
  let leadingFrames = 0, trailingFrames = 0;
  while (leadingFrames < silenceLimit && silentFrame(leadingFrames)) leadingFrames += 1;
  while (trailingFrames < silenceLimit && trailingFrames < frames - leadingFrames && silentFrame(frames - trailingFrames - 1)) trailingFrames += 1;
  return { supported: true, sampled: stride > 1, analyzedSamples, totalSamples, peak, rms: analyzedSamples ? Math.sqrt(sumSquares / analyzedSamples) : 0, dcOffset: analyzedSamples ? sum / analyzedSamples : 0, clippedSamples, nearClippedSamples, leadingSilenceSeconds: leadingFrames / info.sampleRate, trailingSilenceSeconds: trailingFrames / info.sampleRate };
}

function duplicateMembers(archive, matches) {
  const members = new Set();
  for (const entry of archive.entries) {
    const match = matches.get(entry.archiveIndex);
    for (const original of [entry.duplicateOf, match?.exactOf, match?.pcmOf]) {
      if (Number.isInteger(original)) {
        members.add(original);
        members.add(entry.archiveIndex);
      }
    }
  }
  return members;
}

function soundDuplicates(archive) {
  const exact = new Map(), pcm = new Map(), result = new Map();
  for (const entry of archive.entries || []) {
    const wav = soundBuffer(archive, entry), info = entry.wav || wavInfo(wav), exactKey = crypto.createHash('sha256').update(wav).digest('hex'), exactOf = exact.has(exactKey) ? exact.get(exactKey) : null;
    if (exactOf === null) exact.set(exactKey, entry.archiveIndex);
    let pcmOf = null;
    if (info.valid && wavFormats.supported(info) && info.dataOffset !== null && info.dataSize >= 0 && info.dataOffset + info.dataSize <= wav.length) {
      const sampleHash = crypto.createHash('sha256');
      for (const chunk of info.dataChunks || [{offset:info.dataOffset,size:info.dataSize}]) {
        sampleHash.update(wav.subarray(chunk.offset, chunk.offset + chunk.size));
      }
      const formatKey = [info.effectiveFormat??info.format,info.channels,info.sampleRate,info.bitsPerSample,info.validBitsPerSample||info.bitsPerSample,info.channelMask||0,info.blockAlign].join(':');
      const pcmKey = formatKey + ':' + sampleHash.digest('hex');
      pcmOf = pcm.has(pcmKey) ? pcm.get(pcmKey) : null;
      if (pcmOf === null) pcm.set(pcmKey, entry.archiveIndex);
    }
    result.set(entry.archiveIndex, { exactOf, pcmOf: pcmOf === exactOf ? null : pcmOf });
  }
  return result;
}

function slicePcmWav(wav, startSeconds, endSeconds) {
  const info = wavInfo(wav);
  const samples = pcmSampleBytes(wav, info);
  if (!samples) throw new Error('A/B export requires complete supported PCM or IEEE-float frames.');
  const frames = Math.floor(info.dataSize / info.blockAlign),{start,end}=require('./audio_sample_range').sampleRange({frames,sampleRate:info.sampleRate},{start:Number(startSeconds),end:Number(endSeconds)});
  if (!Number.isFinite(Number(startSeconds)) || !Number.isFinite(Number(endSeconds)) || end <= start) throw new Error('Choose a non-empty A/B audition range first.');
  if(info.format!==1||info.bitsPerSample===32){const data=samples.subarray(start*info.blockAlign,end*info.blockAlign),pieces=[Buffer.from(wav.subarray(0,12))];let wrote=false;for(let at=12;at+8<=wav.length;){const size=wav.readUInt32LE(at+4),id=wav.toString('ascii',at,at+4),whole=Buffer.from(wav.subarray(at,at+8+size+size%2));if(!['fmt ','data','JUNK','LIST','fact'].includes(id)||id==='LIST'&&wav.toString('ascii',at+8,at+12)!=='INFO')throw Error('A/B export cannot remap this WAV metadata: '+id);if(id==='data'){if(!wrote){const head=Buffer.from(whole.subarray(0,8));head.writeUInt32LE(data.length,4);pieces.push(head,data,Buffer.alloc(data.length%2));wrote=true;}}else{if(id==='fact'&&size>=4)whole.writeUInt32LE(end-start,8);pieces.push(whole);}at+=8+size+size%2;}const output=Buffer.concat(pieces);output.writeUInt32LE(output.length-8,4);return output;}
  const data = samples.subarray(start * info.blockAlign, end * info.blockAlign), output = Buffer.alloc(44 + data.length + (data.length & 1));
  output.write('RIFF', 0); output.writeUInt32LE(output.length - 8, 4); output.write('WAVEfmt ', 8); output.writeUInt32LE(16, 16); output.writeUInt16LE(1, 20); output.writeUInt16LE(info.channels, 22); output.writeUInt32LE(info.sampleRate, 24); output.writeUInt32LE(info.sampleRate * info.blockAlign, 28); output.writeUInt16LE(info.blockAlign, 32); output.writeUInt16LE(info.bitsPerSample, 34); output.write('data', 36); output.writeUInt32LE(data.length, 40); data.copy(output, 44);
  return output;
}

module.exports = { duplicateMembers, parseSndBuffer, readSnd, wavInfo, soundBuffer, soundDataUri, wavDataUri, soundPeaks, soundAnalysis, soundDuplicates, slicePcmWav };
