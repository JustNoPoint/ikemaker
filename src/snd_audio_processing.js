'use strict';
const wavFormats = require('./wav_sample_formats');
const fs = require('fs'),
    os = require('os'),
    path = require('path'),
    crypto = require('crypto');
const {
    spawn
} = require('child_process');
const {
    wavInfo,
    soundBuffer,
    parseSndBuffer
} = require('./snd_reader');
const FFMPEG_OPERATIONS = Object.freeze(['pitch', 'tempo', 'speed', 'resample', 'bitDepth', 'downsample']);
const OPERATIONS = {
    volume: 'Change Volume',
    normalize: 'Maximize Volume',
    loudness: 'Increase Loudness',
    fadeIn: 'Fade In',
    fadeOut: 'Fade Out',
    pitch: 'Change Pitch',
    tempo: 'Change Tempo',
    speed: 'Change Speed',
    reverse: 'Reverse',
    echo: 'Echo',
    trimSilence: 'Trim Silence',
    trimSelection: 'Trim to Selection',
    insertSilence: 'Insert Silence',
    resample: 'Resample',
    bitDepth: 'Change Bit Depth',
    mono: 'Convert to Mono',
    downsample: 'Downsample Above Rate'
};
const {
    sampleRange
} = require('./audio_sample_range');
const loudness = require('./snd_audio_loudness');
const encodingStats = new WeakMap();
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function pcm(bytes) {
    const info = wavInfo(bytes);
    if (!info.valid || !wavFormats.supported(info) || ![1, 2].includes(info.channels) || !info.sampleRate || info.dataOffset === null || info.dataSize % info.blockAlign || info.dataOffset + info.dataSize > bytes.length || bytes.readUInt32LE(4) + 8 !== bytes.length) throw Error('Requires complete mono/stereo PCM 8/16/24/32-bit or IEEE float32/64 WAV (including extensible headers).');
    if (info.blockAlign !== info.channels * info.bitsPerSample / 8 || info.byteRate !== info.sampleRate * info.blockAlign) throw Error('Invalid PCM block alignment or byte rate.');
    let dataChunks = 0,
        formatChunks = 0;
    for (let at = 12; at < bytes.length;) {
        if (at + 8 > bytes.length) throw Error('Truncated WAV chunk.');
        const id = bytes.toString('ascii', at, at + 4),
            size = bytes.readUInt32LE(at + 4);
        if (at + 8 + size + (size % 2) > bytes.length) throw Error('Truncated WAV chunk.');
        if (!['fmt ', 'data', 'JUNK', 'LIST', 'fact'].includes(id)) throw Error('Unsupported channel/time-dependent WAV metadata: ' + id + '. Export a plain PCM WAV before processing.');
        if (id === 'LIST' && (size < 4 || bytes.toString('ascii', at + 8, at + 12) !== 'INFO'))
            throw Error('Unsupported WAV list metadata. Only descriptive LIST/INFO tags can be retained during audio processing.');
        if(id==='fact'&&size<4)throw Error('WAV fact chunk is incomplete.');
        if (id === 'data') dataChunks++;
        if (id === 'fmt ') formatChunks++;
        at += 8 + size + (size % 2);
    }
    if (dataChunks !== 1 || formatChunks !== 1) throw Error('Requires exactly one format and one data chunk.');
    const width = info.bitsPerSample / 8,
        frames = info.dataSize / info.blockAlign;
    if (frames > 10000000) throw Error('Sound exceeds 10 million frames.');
    const samples = Float64Array.from({
        length: frames * info.channels
    }, (_, i) => {
        const at = info.dataOffset + i * width;
        if((info.effectiveFormat??info.format)===1&&info.validBitsPerSample<info.bitsPerSample){const raw=width===1?bytes[at]-128:bytes.readIntLE(at,width);if(raw%2**(info.bitsPerSample-info.validBitsPerSample)!==0)throw Error('Extensible PCM has nonzero unused sample bits.');}
        return wavFormats.sample(bytes,at,info)
    });
    if(samples.some(value=>!Number.isFinite(value)))throw Error('WAV contains non-finite float samples.');
    return {
        ...info,
        frames,
        samples
    };
}

function roundEven(value){return require('./wav_sample_formats').roundEven(value);}

function encode(samples, rate, channels, bits) {
    if (samples.length > 20000000) throw Error('Processed audio exceeds 20 million samples.');
    const width = bits / 8,
        dataSize = samples.length * width,
        out = Buffer.alloc(44 + dataSize + (dataSize % 2));
    out.write('RIFF');
    out.writeUInt32LE(out.length - 8, 4);
    out.write('WAVEfmt ', 8);
    out.writeUInt32LE(16, 16);
    out.writeUInt16LE(1, 20);
    out.writeUInt16LE(channels, 22);
    out.writeUInt32LE(rate, 24);
    out.writeUInt32LE(rate * channels * width, 28);
    out.writeUInt16LE(channels * width, 32);
    out.writeUInt16LE(bits, 34);
    out.write('data', 36);
    out.writeUInt32LE(dataSize, 40);
    let clippedSamples = 0;
    samples.forEach((sample, i) => {
        if (sample < -1 || sample > 1 - 1 / 2 ** (bits - 1)) clippedSamples++;
        const value = Math.max(-1, Math.min(1 - 1 / 2 ** (bits - 1), sample));
        if (width === 1) out[44 + i] = Math.max(0, Math.min(255, roundEven(value * 128 + 128)));
        else out.writeIntLE(roundEven(value * 2 ** (bits - 1)), 44 + i * width, width)
    });
    encodingStats.set(out, {
        clippedSamples,
        preClipPeak: loudness.peak(samples)
    });
    return out;
}

function encodeFor(samples,rate,channels,info){
 if(info.format===1&&[8,16,24].includes(info.bitsPerSample))return encode(samples,rate,channels,info.bitsPerSample);
 const result=wavFormats.encodeLike(samples,rate,channels,info);encodingStats.set(result.bytes,{clippedSamples:result.clippedSamples,overFullScaleSamples:result.overFullScaleSamples,preClipPeak:loudness.peak(samples)});return result.bytes;
}

function number(value, fallback, min, max) {
    const n = value === undefined ? fallback : Number(value);
    if (!Number.isFinite(n) || n < min || n > max) throw Error(`Value must be ${min} through ${max}.`);
    return n
}

function atempo(factor) {
    const filters = [];
    while (factor > 2) {
        filters.push('atempo=2');
        factor /= 2
    }
    while (factor < 0.5) {
        filters.push('atempo=0.5');
        factor /= 0.5
    }
    return [...filters, `atempo=${factor}`].join(',')
}

let processorQueue = Promise.resolve();
async function external(bytes, info, operation, options) {
    const previous = processorQueue;
    let release;
    processorQueue = new Promise(resolve => {
        release = resolve;
    });
    await previous;
    try {
        if (options.signal?.aborted) throw Error('Audio processing cancelled.');
        return await externalOne(bytes, info, operation, options);
    } finally {
        release();
    }
}
function timeFactor(operation, options) {
    if (operation === 'pitch' && options.semitones !== undefined) return 2 ** (number(options.semitones, 0, -24, 24) / 12);
    if (options.percent !== undefined) return number(options.percent, 100, 25, 400) / 100;
    return number(options.factor, 1.25, 0.25, 4);
}
function neutralEffect(operation, options, info) {
    if (['pitch','tempo','speed'].includes(operation)) return timeFactor(operation, options) === 1;
    if (operation === 'volume') return options.percent !== undefined
        ? number(options.percent, 100, 0, 1000) === 100 : number(options.db, 6, -60, 24) === 0;
    if (operation === 'resample') return number(options.rate, 22050, 4000, 192000) === info.sampleRate;
    if (operation === 'bitDepth') return [8,16,24].includes(info.bitsPerSample) && number(options.bits, 16, 8, 24) === info.bitsPerSample;
    return false;
}
// WSOLA alignment at low source rates can quantize a sustained pitch by a
// few cents. Work at >=96 kHz, then return to the authored rate and frame count.
// Time-stretch the higher-frequency representation: before lowering pitch,
// after raising it. This also avoids the much larger low-tone atempo errors.
function pitchFilter(info, factor) {
    const workRate = Math.max(96000, info.sampleRate);
    const shiftedRate = Math.round(workRate * factor);
    const effectiveFactor = shiftedRate / workRate;
    const stretch = atempo(1 / effectiveFactor);
    const pitch = `asetrate=${shiftedRate}`;
    const stages = factor < 1
        ? [`aresample=${workRate}`, stretch, pitch]
        : [`aresample=${workRate}`, pitch, `aresample=${workRate}`, stretch];
    return [...stages, `aresample=${info.sampleRate}`, 'apad',
        `atrim=end_sample=${info.frames}`].join(',');
}

async function externalOne(bytes, info, operation, options) {
    const factor = ['pitch','tempo','speed'].includes(operation) ? timeFactor(operation, options) : 1,
        rate = ['resample','downsample'].includes(operation)?number(options.rate, 22050, 4000, 192000):info.sampleRate,
        bits = operation==='bitDepth'?number(options.bits, 16, 8, 24):info.bitsPerSample;
    if (!Number.isInteger(rate)) throw Error('Sample rate must be an integer.');
    let filter, outputRate = info.sampleRate,
        outputBits = info.bitsPerSample;const outputFloat=(info.effectiveFormat??info.format)===3&&operation!=='bitDepth';
    if (operation === 'pitch') filter = pitchFilter(info, factor);
    if (operation === 'tempo') filter = atempo(factor);
    if (operation === 'speed') filter = `asetrate=${info.sampleRate*factor},aresample=${info.sampleRate}`;
    if (operation === 'resample' || operation === 'downsample') {
        filter = `aresample=${rate}`;
        outputRate = rate
    }
    if (operation === 'bitDepth') {
        if (![8, 16, 24].includes(bits)) throw Error('Choose 8, 16 or 24 bits.');
        outputBits = bits;
        filter = Number(options.dither) === 1 && bits < info.bitsPerSample
            ? 'aresample=osf=' + ({8:'u8',16:'s16',24:'s32'})[bits] + ':output_sample_bits=' + bits + ':dither_method=triangular'
            : 'anull';
    }
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-audio-'));
    try {
        const input = path.join(directory, 'original.wav'),
            output = path.join(directory, 'processed.raw');
        fs.writeFileSync(input, bytes);
        await new Promise((resolve, reject) => {
            const child = spawn(options.ffmpeg || 'ffmpeg', ['-v', 'error', '-nostdin', '-y', '-i', input, '-af', filter, '-ar', String(outputRate), '-c:a', outputFloat?(outputBits===64?'pcm_f64le':'pcm_f32le'):outputBits === 8 ? 'pcm_u8' : outputBits === 24 ? 'pcm_s24le' :outputBits===32?'pcm_s32le': 'pcm_s16le', '-f', outputFloat?(outputBits===64?'f64le':'f32le'):outputBits === 8 ? 'u8' : outputBits === 24 ? 's24le' :outputBits===32?'s32le': 's16le', output], {
                windowsHide: true,
                stdio: ['ignore', 'ignore', 'pipe'],
                signal: options.signal
            });
            let stderr = '',
                timedOut = false;
            const timeout = setTimeout(() => {
                timedOut = true;
                child.kill();
            }, 60000);
            child.stderr.on('data', bytes => {
                stderr = (stderr + bytes.toString()).slice(-8192);
            });
            child.once('error', error => {
                clearTimeout(timeout);
                reject(Error('Audio processing failed: ' + error.message));
            });
            child.once('close', code => {
                clearTimeout(timeout);
                if (timedOut || code !== 0) reject(Error('Audio processing failed: ' + (timedOut ? '60 second timeout' : stderr.slice(0, 800))));
                else resolve();
            });
        });
        if (fs.statSync(output).size > 64 * 1024 * 1024) throw Error('Processed sound exceeds 64 MB.');
        const raw = fs.readFileSync(output),
            width = outputBits / 8;
        if (raw.length % (width * info.channels)) throw Error('Processed samples have invalid alignment.');
        const samples = Float64Array.from({
            length: raw.length / width
        }, (_, i) => outputFloat?(outputBits===64?raw.readDoubleLE(i*width):raw.readFloatLE(i*width)):width === 1 ? (raw[i] - 128) / 128 : raw.readIntLE(i * width, width) / 2 ** (outputBits - 1));
        return encodeFor(samples,outputRate,info.channels,{...info,bitsPerSample:outputBits,effectiveFormat:outputFloat?3:1,validBitsPerSample:operation==='bitDepth'?outputBits:info.validBitsPerSample})
    } finally {
        fs.rmSync(directory, {
            recursive: true,
            force: true
        })
    }
}

function processWhole(bytes, operation, options = {}) {
    const result = renderWhole(bytes, operation, options);
    // encode() writes standard PCM. Restore the source container when it carries
    // extra chunks, preserving their order, padding, and the PCM format extension.
    const standard = bytes.toString('ascii', 12, 16) === 'fmt ' && bytes.readUInt32LE(16) === 16 &&
        bytes.toString('ascii', 36, 40) === 'data' &&
        bytes.length === 44 + bytes.readUInt32LE(40) + bytes.readUInt32LE(40) % 2;
    if (standard || result === bytes) return result;
    const restore = rendered => {
        const format=wavInfo(rendered),renderedFmtSize=rendered.readUInt32LE(16),renderedFmt=rendered.subarray(20,20+renderedFmtSize),data=rendered.subarray(format.dataOffset,format.dataOffset+format.dataSize),pieces=[Buffer.from(bytes.subarray(0,12))];
        for(let at=12;at<bytes.length;){const size=bytes.readUInt32LE(at+4),id=bytes.toString('ascii',at,at+4),whole=Buffer.from(bytes.subarray(at,at+8+size+size%2));if(id==='fmt '){renderedFmt.copy(whole,8,0,Math.min(size,renderedFmt.length));pieces.push(whole);}else if(id==='data'){const head=Buffer.from(whole.subarray(0,8));head.writeUInt32LE(data.length,4);pieces.push(head,data,Buffer.alloc(data.length%2));}else{if(id==='fact'&&size>=4)whole.writeUInt32LE(format.dataSize/format.blockAlign,8);pieces.push(whole);}at+=8+size+size%2;}
        const restored=Buffer.concat(pieces);restored.writeUInt32LE(restored.length-8,4);if(encodingStats.has(rendered))encodingStats.set(restored,encodingStats.get(rendered));return restored;
    };
    return Buffer.isBuffer(result) ? restore(result) : result.then(restore);
}

function renderWhole(bytes, operation, options = {}) {
    if (!OPERATIONS[operation]) throw Error('Unknown audio operation.');
    const info = pcm(bytes),
        c = info.channels,
        n = info.frames;
    let samples = info.samples;
    if (neutralEffect(operation, options, info)) return bytes;
    if (FFMPEG_OPERATIONS.includes(operation)) return external(bytes, info, operation, options);
    const fade = operation === 'fadeIn' || operation === 'fadeOut',
        usesDuration = fade || operation === 'insertSilence' || operation === 'echo',
        amount = fade && options.fadeSelection === true ? n :
            usesDuration ? Math.round(number(options.seconds, 0.1, 0, 30) * info.sampleRate) : 0;
    if (operation === 'volume') {
        const gain = options.percent !== undefined ? number(options.percent, 100, 0, 1000) / 100 : 10 ** (number(options.db, 6, -60, 24) / 20);
        samples = samples.map(x => x * gain);
    }
    if (operation === 'normalize') {
        const peak = loudness.peak(samples);
        if (peak) samples = samples.map(x => x / peak * (1 - 1 / 2 ** (info.bitsPerSample - 1)));
    }
    if (operation === 'loudness') samples = loudness.lift(samples, info.sampleRate, c, number(options.amount, 50, 1, 100));
    if (fade) samples = samples.map((x, i) => {
        const frame = Math.floor(i / c);
        const progress = Math.min(1, Math.max(0, (operation === 'fadeIn' ? frame : n - 1 - frame) / Math.max(1, amount - 1)));
        return x * (Number(options.equalPower) === 1 ? Math.sin(progress * Math.PI / 2) : progress);
    });
    if (operation === 'reverse') samples = Float64Array.from({
        length: samples.length
    }, (_, i) => samples[(n - 1 - Math.floor(i / c)) * c + i % c]);
    if (operation === 'mono') {
        if (c === 1) return bytes;
        return encodeFor(Float64Array.from({
            length: n
        }, (_, i) => (samples[i * 2] + samples[i * 2 + 1]) / 2), info.sampleRate, 1, info)
    }
    if (operation === 'trimSelection') {
        const {
            start,
            end
        } = sampleRange(info, options);
        samples = samples.slice(start * c, end * c);
    }
    if (operation === 'trimSilence') {
        const threshold = 10 ** (number(options.thresholdDb, -50, -100, 0) / 20),
            silent = i => {
                for (let j = 0; j < c; j++)
                    if (Math.abs(samples[i * c + j]) > threshold) return false;
                return true
            };
        let start = 0,
            end = n;
        while (start < end && silent(start)) start++;
        while (end > start && silent(end - 1)) end--;
        if (start === end) throw Error('The entire sound is below the silence threshold.');
        samples = samples.slice(start * c, end * c)
    }
    if (operation === 'insertSilence') {
        const leading = options.leadingSeconds !== undefined ? Math.round(number(options.leadingSeconds, 0, 0, 60) * info.sampleRate) : options.position === 'end' ? 0 : amount;
        const trailing = options.trailingSeconds !== undefined ? Math.round(number(options.trailingSeconds, 0, 0, 60) * info.sampleRate) : options.position === 'start' ? 0 : amount;
        if (samples.length + (leading + trailing) * c > 20000000) throw Error('Silence insertion exceeds 20 million samples.');
        const result = new Float64Array(samples.length + (leading + trailing) * c);
        result.set(samples, leading * c);
        samples = result;
    }
    if (operation === 'echo') {
        const decay = options.decayPercent !== undefined ? number(options.decayPercent, 50, 0, 100) / 100 : number(options.level, .4, 0, 1),
            delay = Math.max(1, amount) * c;
        const selected = options.echoSelection ? sampleRange(info, options) : {
                start: 0,
                end: n
            },
            start = selected.start * c,
            end = selected.end * c;
        if (end <= start) throw Error('Echo selection must contain samples.');
        let repeats;
        if (Number(options.autoRepeats) === 1) {
            const peak = loudness.peak(samples.subarray(start,end));
            const silence = 10 ** (number(options.echoThresholdDb,-40,-100,0) / 20);
            repeats = 1;
            while (repeats < 16 && peak * decay ** repeats > silence) repeats++;
        } else {
            repeats = number(options.repeats, 1, 1, 16);
            if (!Number.isInteger(repeats)) throw Error('Echo repeats must be an integer.');
        }
        const length = Math.max(samples.length, end + delay * repeats);
        if (length > 20000000) throw Error('Echo exceeds 20 million samples.');
        const result = new Float64Array(length);
        result.set(samples);
        for (let repeat = 1; repeat <= repeats; repeat++)
            for (let i = start; i < end; i++) result[i + delay * repeat] += samples[i] * decay ** repeat;
        samples = result;
    }
    return encodeFor(samples, info.sampleRate, c, info);
}

const RANGE_OPERATIONS = new Set(['volume', 'normalize', 'loudness', 'fadeIn', 'fadeOut', 'pitch', 'tempo', 'speed', 'reverse', 'echo']);

function processWav(bytes, operation, options = {}) {
    if (options.range === true && RANGE_OPERATIONS.has(operation)) return processRange(bytes, operation, options);
    return processWhole(bytes, operation, options);
}

function rebuildPcm(bytes, info, data) {
    const oldEnd = info.dataOffset + info.dataSize + (info.dataSize % 2),
        out = Buffer.concat([bytes.subarray(0, info.dataOffset), data, Buffer.alloc(data.length % 2), bytes.subarray(oldEnd)]);
    out.writeUInt32LE(out.length - 8, 4);
    out.writeUInt32LE(data.length, info.dataOffset - 4);
    for(let at=12;at+8<=out.length;){const size=out.readUInt32LE(at+4);if(out.toString('ascii',at,at+4)==='fact'&&size>=4)out.writeUInt32LE(data.length/info.blockAlign,at+8);at+=8+size+size%2;}
    return out;
}
async function processRange(bytes, operation, options = {}) {
    const source = pcm(bytes),
        c = source.channels,
        {
            start,
            end
        } = sampleRange(source, options);
    if (neutralEffect(operation, options, source)) return bytes;
    // Echo repeats the selection over the underlying sound, rather than splicing
    // the rest of that sound after the echo tail (SndEdit.EchoMix).
    if (operation === 'echo') return processWhole(bytes, operation, {
        ...options,
        echoSelection: true
    });
    const slice = encodeFor(source.samples.slice(start * c, end * c), source.sampleRate, c, source),
        fade = operation === 'fadeIn' || operation === 'fadeOut';
    const editedBytes = await processWhole(slice, operation, {
            ...options,
            range: false,
            ...(fade ? {
                fadeSelection: true
            } : {})
        }),
        edited = pcm(editedBytes);
    if (edited.sampleRate !== source.sampleRate || edited.channels !== c || edited.bitsPerSample !== source.bitsPerSample) throw Error('Range effects must preserve the WAV format.');
    const total = source.frames - (end - start) + edited.frames;
    if (total * c > 20000000) throw Error('Range output exceeds 20 million samples.');
    const samples = new Float64Array(total * c);
    samples.set(source.samples.subarray(0, start * c));
    samples.set(edited.samples, start * c);
    samples.set(source.samples.subarray(end * c), (start + edited.frames) * c);
    const seam = fade ? 0 : Math.min(roundEven(number(options.crossfadeMilliseconds, 5, 0, 100) / 1000 * source.sampleRate), Math.floor(Math.min(edited.frames, end - start) / 2));
    for (let i = 0; i < seam; i++)
        for (let channel = 0; channel < c; channel++) {
            const w = Math.fround((i + .5) / seam),
                mix = (a, b) => Math.fround(a + Math.fround(Math.fround(b - a) * w));
            if (start > 0) samples[(start + i) * c + channel] = mix(source.samples[(start + i) * c + channel], edited.samples[i * c + channel]);
            if (end < source.frames) samples[(start + edited.frames - seam + i) * c + channel] = mix(edited.samples[(edited.frames - seam + i) * c + channel], source.samples[(end - seam + i) * c + channel]);
        }
    const encoded = encodeFor(samples, source.sampleRate, c, source),
        info = wavInfo(encoded),
        data = Buffer.from(encoded.subarray(info.dataOffset, info.dataOffset + info.dataSize)),
        raw = bytes.subarray(source.dataOffset, source.dataOffset + source.dataSize);
    // Preserve outside sample bytes exactly, including the relocated suffix for
    // a tempo/speed change. The crossfade touches only inside the selected span.
    raw.copy(data, 0, 0, start * source.blockAlign);
    raw.copy(data, (start + edited.frames) * source.blockAlign, end * source.blockAlign);
    const out = rebuildPcm(bytes, source, data);
    encodingStats.set(out, {
        ...encodingStats.get(encoded),
        clippedSamples: encodingStats.get(editedBytes)?.clippedSamples || 0
    });
    return out;
}

function replacePayloads(archive, replacements) {
    if (archive.issues.length || archive.entries.length !== archive.declaredCount) throw Error('Resolve archive diagnostics before processing.');
    const pieces = [Buffer.from(archive.buffer.subarray(0, archive.entries[0]?.subheaderOffset || 24))],
        headers = [];
    let at = pieces[0].length;
    archive.entries.forEach((entry, index) => {
        const header = Buffer.from(archive.buffer.subarray(entry.subheaderOffset, entry.dataOffset)),
            payload = replacements.get(index) || soundBuffer(archive, entry),
            gap = archive.buffer.subarray(entry.dataOffset + entry.dataSize, archive.entries[index + 1]?.subheaderOffset ?? archive.buffer.length);
        header.writeUInt32LE(payload.length, 4);
        headers.push({
            header,
            at
        });
        pieces.push(header, payload, gap);
        at += header.length + payload.length + gap.length
    });
    headers.forEach((x, i) => x.header.writeUInt32LE(headers[i + 1]?.at ?? (archive.entries[i].nextOffset ? at : 0), 0));
    const bytes = Buffer.concat(pieces);
    verifyCandidate(archive, bytes, replacements);
    return bytes;
}

function verifyCandidate(source, bytes, replacements) {
    const candidate = parseSndBuffer(bytes);
    if (candidate.issues.length || candidate.entries.length !== source.entries.length) throw Error('Candidate SND failed reopen.');
    source.entries.forEach((entry, i) => {
        const next = candidate.entries[i];
        if (next.identity !== entry.identity) throw Error('Candidate changed sound identity.');
        const expected = replacements.get(i) || soundBuffer(source, entry);
        if (!soundBuffer(candidate, next).equals(expected)) throw Error(`Candidate payload mismatch: ${entry.identity}`)
    });
    return candidate
}

async function prepare(archive, indices, operation, options = {}) {
    if (!indices.length) throw Error('Select at least one sound.');
    if (indices.length > 512 || archive.buffer.length > 64 * 1024 * 1024) throw Error('Processing is limited to 512 selected sounds and a 64 MB archive.');
    const replacements = new Map(),
        reports = [];
    let totalOutput = 0;
    for (const index of [...new Set(indices)]) {
        if (options.signal?.aborted) throw Error('Audio processing cancelled.');
        const entry = archive.entries[index];
        if (!entry) throw Error('Selected sound no longer exists.');
        if (operation === 'downsample' && entry.wav.sampleRate <= number(options.rate, 22050, 4000, 192000)) continue;
        if (operation === 'mono' && entry.wav.channels === 1) continue;
        const original = soundBuffer(archive, entry);
        const bytes = await processWav(original, operation, options);
        if (bytes === original) continue;
        totalOutput += bytes.length;
        if (totalOutput > 64 * 1024 * 1024) throw Error('Processed WAV outputs exceed 64 MB.');
        const before = pcm(soundBuffer(archive, entry)),
            after = pcm(bytes),
            stats = encodingStats.get(bytes) || {
                clippedSamples: 0
            };
        let expectedFrames;
        if (operation === 'pitch') expectedFrames = before.frames;
        if (operation === 'tempo' || operation === 'speed') {
            const range = options.range === true ? sampleRange(before, options) : { start: 0, end: before.frames };
            const affected = range.end - range.start;
            expectedFrames = before.frames - affected + Math.round(affected / timeFactor(operation, options));
        }
        reports.push({
            identity: entry.identity,
            inputEncoding:wavFormats.label(before),outputEncoding:wavFormats.label(after),engineNotice:wavFormats.engineNotice(after),
            status: operation === 'loudness' ? (loudness.peak(before.samples) === 0 ? 'silent' : before.samples.length === after.samples.length && before.samples.every((x, i) => x === after.samples[i]) ? 'already-loud/no change' : 'processed') : 'processed',
            inputLufs: loudness.lufs(before.samples, before.sampleRate, before.channels),
            outputLufs: loudness.lufs(after.samples, after.sampleRate, after.channels),
            inputPeak: loudness.peak(before.samples),
            outputPeak: loudness.peak(after.samples),
            frames: after.frames,
            ...(expectedFrames === undefined ? {} : {expectedFrames}),
            ...stats
        });
        replacements.set(index, bytes);
        await new Promise(resolve => setImmediate(resolve));
    }
    if (!replacements.size) throw Error('No selected sounds need a change with these settings.');
    return {
        reports,
        sourceHash: hash(archive.buffer),
        replacements,
        bytes: replacePayloads(archive, replacements)
    }
}
module.exports = {
    FFMPEG_OPERATIONS,
    OPERATIONS,
    RANGE_OPERATIONS,
    processRange,
    hash,
    pcm,
    encode,
    atempo,
    processWav,
    replacePayloads,
    verifyCandidate,
    prepare
};
