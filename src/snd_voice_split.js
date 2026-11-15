'use strict';

function readWave(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 12 || bytes.toString('ascii', 0, 4) !== 'RIFF' ||
      bytes.toString('ascii', 8, 12) !== 'WAVE' || bytes.readUInt32LE(4) + 8 !== bytes.length) {
    throw Error('Choose a complete RIFF/WAVE file.');
  }
  let fmt, data;
  for (let offset = 12; offset < bytes.length;) {
    if (offset + 8 > bytes.length) throw Error('Incomplete WAV chunk header.');
    const size = bytes.readUInt32LE(offset + 4), start = offset + 8, end = start + size;
    const next = end + (size & 1);
    if (next > bytes.length) throw Error('Incomplete WAV chunk.');
    const id = bytes.toString('ascii', offset, offset + 4);
    if (id === 'fmt ') {
      if (fmt) throw Error('The WAV has multiple format descriptions.');
      fmt = bytes.subarray(start, end);
    } else if (id === 'data') {
      if (data) throw Error('Choose a WAV with one continuous audio data chunk.');
      data = bytes.subarray(start, end);
    }
    offset = next;
  }
  if (!fmt || fmt.length < 16 || !data) throw Error('Missing WAV format or audio data.');
  return {...waveFormat(fmt, data.length), data};
}

function waveFormat(fmt, dataLength) {
  let format = fmt.readUInt16LE(0);
  const channels = fmt.readUInt16LE(2), sampleRate = fmt.readUInt32LE(4);
  const align = fmt.readUInt16LE(12), bits = fmt.readUInt16LE(14), width = bits / 8;
  if (format === 65534) {
    if (fmt.length < 40 || fmt.readUInt16LE(16) < 22 || 18 + fmt.readUInt16LE(16) > fmt.length ||
        fmt.subarray(28, 40).toString('hex') !== '00001000800000aa00389b71') throw Error('Unsupported extended WAV format.');
    format = fmt.readUInt32LE(24);
    const validBits = fmt.readUInt16LE(18);
    if (validBits > bits || (format === 3 && validBits !== 0 && validBits !== bits)) throw Error('The extended WAV valid bit count does not match its sample format.');
  }
  const floating = format === 3;
  if (!(format === 1 && [8,16,24,32].includes(bits)) && !(floating && [32,64].includes(bits))) {
    throw Error('Choose an uncompressed integer PCM or floating-point WAV.');
  }
  if (!channels || !sampleRate || align !== channels * width || fmt.readUInt32LE(8) !== align * sampleRate ||
      dataLength % align) throw Error('WAV frame alignment or sample rate is inconsistent.');
  return {fmt, floating, channels, sampleRate, align, bits, width, frames:dataLength / align};
}

function setting(value, fallback, min, max, label) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (value === null || value === '' || !Number.isFinite(number) || number < min || number > max) {
    throw Error(label + ' must be between ' + min + ' and ' + max + '.');
  }
  return number;
}

function detector({sampleRate, frames, bits, width, align, floating}, options) {
  const db = setting(options.thresholdDb, -42, -120, 0, 'Silence threshold (dB)');
  const pause = setting(options.minSilenceMs, 350, 1, 60000, 'Minimum pause (ms)');
  const pad = setting(options.paddingMs, 25, 0, 60000, 'Edge padding (ms)');
  const gap = Math.max(1, Math.ceil(sampleRate * pause / 1000));
  const padding = Math.round(sampleRate * pad / 1000);
  const threshold = 10 ** (db / 20) * (floating ? 1 : 2 ** (bits - 1));
  const clips = [];
  let start = -1, last = -1;
  function scan(data, firstFrame) {
    let sample;
    if (floating) sample = width === 4 ? i => data.readFloatLE(i) : i => data.readDoubleLE(i);
    else if (width === 1) sample = i => data[i] - 128;
    else if (width === 2) sample = i => data.readInt16LE(i);
    else if (width === 3) sample = i => data.readIntLE(i, 3);
    else sample = i => data.readInt32LE(i);
    for (let frame = firstFrame, offset = 0; offset < data.length; frame++, offset += align) {
      let voiced = false;
      for (let at = offset; at < offset + align; at += width) {
        const value = sample(at);
        if (floating && !Number.isFinite(value)) throw Error('Invalid floating-point audio at frame ' + frame + '. The recording contains a non-finite sample.');
        if (Math.abs(value) >= threshold) {
          voiced = true;
          if (!floating) break;
        }
      }
      if (!voiced) continue;
      if (start === -1) start = frame;
      else if (frame - last - 1 >= gap) {
        clips.push({start, end:last + 1});
        start = frame;
      }
      last = frame;
    }
  }
  function finish() {
    if (start >= 0) clips.push({start, end:last + 1});
    // Share short gaps at their midpoint so padded takes never overlap.
    let leftLimit = 0;
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i], next = clips[i + 1];
      const rightLimit = next ? Math.floor((clip.end + next.start) / 2) : frames;
      clip.start = Math.max(leftLimit, clip.start - padding);
      clip.end = Math.min(rightLimit, clip.end + padding);
      leftLimit = rightLimit;
    }
    return {sampleRate, frames, clips};
  }
  return {scan, finish};
}

function analyze(bytes, options = {}) {
  const wave = readWave(bytes), scan = detector(wave, options);
  scan.scan(wave.data, 0);
  return scan.finish();
}

function clipBuffer({fmt, frames, align, floating}, start, end, maxBytes = Infinity) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > frames) {
    throw Error('Select a nonempty range inside the recording.');
  }
  const size = (end - start) * align, factSize = floating ? 12 : 0;
  const factOffset = 20 + fmt.length + (fmt.length & 1), dataOffset = factOffset + factSize;
  const length = dataOffset + 8 + size + (size & 1);
  if (length > maxBytes) throw Error('This cut exceeds the available audio size limit. Split the clip or select a smaller batch.');
  const out = Buffer.alloc(length);
  out.write('RIFF'); out.writeUInt32LE(out.length - 8, 4); out.write('WAVEfmt ', 8);
  out.writeUInt32LE(fmt.length, 16); fmt.copy(out, 20);
  if (floating) { out.write('fact', factOffset); out.writeUInt32LE(4, factOffset + 4); out.writeUInt32LE(end - start, factOffset + 8); }
  out.write('data', dataOffset); out.writeUInt32LE(size, dataOffset + 4);
  return {out, payload:out.subarray(dataOffset + 8, dataOffset + 8 + size)};
}

function clipWav(bytes, start, end) {
  const wave = readWave(bytes);
  const {out, payload} = clipBuffer(wave, start, end);
  wave.data.copy(payload, 0, start * wave.align, end * wave.align);
  return out;
}

module.exports = { analyze, clipWav, waveFormat, detector, clipBuffer };
