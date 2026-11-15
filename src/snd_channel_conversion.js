'use strict';

const { soundBuffer, parseSndBuffer, wavInfo } = require('./snd_reader');

function stereoWavToMono(source, inspectOnly = false) {
  if (source.length < 44 || source.toString('ascii', 0, 4) !== 'RIFF' ||
      source.toString('ascii', 8, 12) !== 'WAVE' || source.readUInt32LE(4) + 8 !== source.length) {
    throw Error('requires a complete RIFF WAV');
  }
  const chunks = [];
  let fmt = null, data = null;
  for (let at = 12; at < source.length;) {
    if (at + 8 > source.length) throw Error('incomplete WAV chunk');
    const size = source.readUInt32LE(at + 4), end = at + 8 + size, padded = end + (size % 2);
    if (padded > source.length) throw Error('incomplete WAV chunk');
    const id = source.toString('ascii', at, at + 4);
    if (id === 'fmt ') {
      if (fmt) throw Error('multiple WAV format chunks are unsupported');
      fmt = source.subarray(at + 8, end);
    }
    if (id === 'data') {
      if (data) throw Error('multiple WAV data chunks are unsupported');
      data = source.subarray(at + 8, end);
    }
    chunks.push({ id, bytes: source.subarray(at, padded) });
    at = padded;
  }
  if (!fmt || fmt.length < 16) throw Error('missing standard PCM format');
  const format = fmt.readUInt16LE(0), channels = fmt.readUInt16LE(2), bits = fmt.readUInt16LE(14);
  if (channels !== 2) throw Error(`requires stereo; this sound has ${channels} channel(s)`);
  if (format !== 1) throw Error(format === 0xFFFE ? 'WAVE_FORMAT_EXTENSIBLE is unsupported' : `WAV format ${format} is unsupported`);
  if (fmt.length !== 16 && !(fmt.length === 18 && fmt.readUInt16LE(16) === 0)) throw Error('unsupported PCM format extension');
  if (![8, 16].includes(bits)) throw Error(`${bits}-bit PCM is unsupported; use 8 or 16 bit`);
  const width = bits / 8, rate = fmt.readUInt32LE(4), align = width * 2;
  if (!rate || fmt.readUInt16LE(12) !== align || fmt.readUInt32LE(8) !== rate * align || !data || data.length % align) {
    throw Error('invalid stereo PCM frame alignment or sample rate');
  }
  // Refuse channel-dependent auxiliary metadata rather than silently corrupting it.
  const unsupported = chunks.find(chunk => !['fmt ', 'data', 'JUNK', 'LIST', 'id3 ', 'DISP', '_PMX'].includes(chunk.id));
  if (unsupported) throw Error(`auxiliary WAV chunk ${JSON.stringify(unsupported.id)} is unsupported`);
  for (const chunk of chunks.filter(item => item.id === '_PMX')) {
    // Replace only the declared channel type. Keep packet encoding, padding and byte offsets.
    const field = 'xmpDM:audioChannelType="Stereo"';
    const at = chunk.bytes.indexOf(field, 8);
    if (at < 0 || chunk.bytes.indexOf('audioChannelType', at + field.length) >= 0 ||
        chunk.bytes.indexOf('audioChannelType', 8) !== at + 6) throw Error('unrecognized XMP channel declaration');
    if (!inspectOnly) {
      chunk.bytes = Buffer.from(chunk.bytes);
      chunk.bytes.write('xmpDM:audioChannelType="Mono"  ', at, 'ascii');
    }
  }
  if (inspectOnly) return true;
  const mono = Buffer.alloc(data.length / 2);
  for (let offset = 0, out = 0; offset < data.length; offset += align, out += width) {
    if (bits === 8) mono[out] = Math.round((data[offset] + data[offset + 1]) / 2);
    else mono.writeInt16LE(Math.round((data.readInt16LE(offset) + data.readInt16LE(offset + 2)) / 2), out);
  }
  const outputChunks = chunks.map(chunk => {
    if (chunk.id === 'fmt ') {
      const bytes = Buffer.from(chunk.bytes);
      bytes.writeUInt16LE(1, 10);
      bytes.writeUInt32LE(rate * width, 16);
      bytes.writeUInt16LE(width, 20);
      return bytes;
    }
    if (chunk.id === 'data') {
      const bytes = Buffer.alloc(8 + mono.length + (mono.length % 2));
      bytes.write('data');
      bytes.writeUInt32LE(mono.length, 4);
      mono.copy(bytes, 8);
      return bytes;
    }
    return chunk.bytes;
  });
  const output = Buffer.concat([Buffer.from(source.subarray(0, 12)), ...outputChunks]);
  output.writeUInt32LE(output.length - 8, 4);
  return output;
}

function validateLayout(archive) {
  const { buffer, entries } = archive;
  if (!Buffer.isBuffer(buffer) || archive.declaredCount !== entries.length || !entries.length) {
    throw Error('The SND must have a complete nonempty subheader chain.');
  }
  let end = 24;
  for (const [index, entry] of entries.entries()) {
    if (entry.archiveIndex !== index || entry.subheaderOffset < end || entry.dataOffset !== entry.subheaderOffset + 16 ||
        entry.dataOffset + entry.dataSize > buffer.length) {
      throw Error('Conversion refuses overlapping or non-increasing SND subheaders.');
    }
    const expectedNext = entries[index + 1]?.subheaderOffset;
    if (expectedNext !== undefined ? entry.nextOffset !== expectedNext : ![0, buffer.length].includes(entry.nextOffset)) {
      throw Error('Conversion refuses an incomplete or undeclared SND subheader chain.');
    }
    end = entry.dataOffset + entry.dataSize;
  }
}

function inspectStereoSelection(archive, indices) {
  validateLayout(archive);
  if (!Array.isArray(indices) || !indices.length || indices.some(index => !Number.isSafeInteger(index) || !archive.entries[index])) {
    throw Error('Mark at least one existing stereo sound.');
  }
  const counts = new Map();
  for (const entry of archive.entries) counts.set(entry.identity, (counts.get(entry.identity) || 0) + 1);
  const eligible = [], ineligible = [];
  for (const index of [...new Set(indices)]) {
    const entry = archive.entries[index];
    try {
      if (counts.get(entry.identity) > 1) throw Error('duplicate group,index alias; make identities unique first');
      stereoWavToMono(soundBuffer(archive, entry), true);
      eligible.push(index);
    } catch (error) {
      ineligible.push({ archiveIndex: index, identity: entry.identity, reason: error.message });
    }
  }
  return { eligible, ineligible };
}

function validateConversionFidelity(source, output, indices) {
  const converted = parseSndBuffer(output, source.filename), chosen = new Set(indices);
  if (converted.entries.length !== source.entries.length) throw Error('Converted SND entry count changed.');
  for (const [index, entry] of source.entries.entries()) {
    const target = converted.entries[index], before = soundBuffer(source, entry), after = soundBuffer(converted, target);
    if (entry.group !== target.group || entry.index !== target.index) throw Error(`Sound ${entry.identity} changed identity.`);
    if (!chosen.has(index)) {
      if (!before.equals(after)) throw Error(`Unmarked sound ${entry.identity} changed payload.`);
    } else {
      const a = wavInfo(before), b = wavInfo(after);
      if (!b.valid || b.channels !== 1 || b.format !== 1 || b.sampleRate !== a.sampleRate ||
          b.bitsPerSample !== a.bitsPerSample || b.dataSize / b.blockAlign !== a.dataSize / a.blockAlign) {
        throw Error(`Converted sound ${entry.identity} failed rate, channel, or frame-count validation.`);
      }
    }
  }
  return converted;
}

function convertStereoSoundsToMono(archive, indices) {
  const review = inspectStereoSelection(archive, indices);
  if (review.ineligible.length) throw Error(review.ineligible.map(item => `${item.identity}: ${item.reason}`).join('\n'));
  const chosen = new Set(review.eligible), { entries, buffer } = archive;
  // Preserve the entire extended header, every gap, and trailing bytes. Only WAV
  // payloads, payload sizes, and the affected absolute chain pointers change.
  const prefix = Buffer.from(buffer.subarray(0, entries[0].subheaderOffset)), pieces = [prefix], headers = [];
  let at = prefix.length;
  for (const [index, entry] of entries.entries()) {
    const header = Buffer.from(buffer.subarray(entry.subheaderOffset, entry.dataOffset));
    const payload = chosen.has(index) ? stereoWavToMono(soundBuffer(archive, entry)) : soundBuffer(archive, entry);
    const gap = buffer.subarray(entry.dataOffset + entry.dataSize, entries[index + 1]?.subheaderOffset ?? buffer.length);
    header.writeUInt32LE(payload.length, 4);
    headers.push({ bytes: header, offset: at });
    pieces.push(header, payload, gap);
    at += header.length + payload.length + gap.length;
  }
  headers.forEach((item, index) => item.bytes.writeUInt32LE(headers[index + 1]?.offset ?? (entries[index].nextOffset ? at : 0), 0));
  const output = Buffer.concat(pieces);
  validateConversionFidelity(archive, output, review.eligible);
  return output;
}

module.exports = { stereoWavToMono, inspectStereoSelection, convertStereoSoundsToMono, validateConversionFidelity };
