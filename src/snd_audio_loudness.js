'use strict';
// Linked envelope and K-weighting/gating follow Ikemen Media Editor SndEdit.cs,
// upstream commit 41f2ac3. Mono/stereo PCM only, matching our processing contract.
function peak(samples) {
    return samples.reduce((value, x) => Math.max(value, Math.abs(x)), 0)
}

function lift(samples, rate, channels, amount = 50) {
    if (!Number.isFinite(amount) || amount < 1 || amount > 100) throw Error('Loudness amount must be 1 through 100.');
    const maximum = peak(samples),
        out = Float64Array.from(samples);
    if (!maximum) return out;
    const k = 1 - .8 * (amount - 1) / 99,
        attack = 1 - Math.exp(-1 / (rate * .005)),
        release = 1 - Math.exp(-1 / (rate * .1));
    let envelope = 0;
    for (let at = 0; at < samples.length; at += channels) {
        let framePeak = 0;
        for (let c = 0; c < channels; c++) framePeak = Math.max(framePeak, Math.abs(samples[at + c]));
        envelope += (framePeak - envelope) * (framePeak > envelope ? attack : release);
        let gain = envelope > 0 ? maximum * Math.pow(envelope / maximum, k) / envelope : 1;
        if (framePeak > 0) gain = Math.min(gain, maximum / framePeak);
        for (let c = 0; c < channels; c++) out[at + c] = samples[at + c] * gain
    }
    return out;
}

function biquad(signal, c) {
    let x1 = 0,
        x2 = 0,
        y1 = 0,
        y2 = 0;
    for (let i = 0; i < signal.length; i++) {
        const x = signal[i],
            y = c[0] * x + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2;
        signal[i] = y;
        x2 = x1;
        x1 = x;
        y2 = y1;
        y1 = y
    }
}

function coefficients(rate, shelf) {
    const k = Math.tan(Math.PI * (shelf ? 1681.974450955533 : 38.13547087602444) / rate),
        q = shelf ? .7071752369554196 : .5003270373238773,
        a0 = 1 + k / q + k * k,
        vh = 10 ** (3.999843853973347 / 20),
        vb = vh ** .4996667741545416;
    return shelf ? [(vh + vb * k / q + k * k) / a0, 2 * (k * k - vh) / a0, (vh - vb * k / q + k * k) / a0, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0] : [1 / a0, -2 / a0, 1 / a0, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0]
}

function lufs(samples, rate, channels) {
    const frames = samples.length / channels;
    if (!frames) return null;
    const energy = new Float64Array(frames);
    for (let c = 0; c < channels; c++) {
        const signal = Float64Array.from({
            length: frames
        }, (_, i) => samples[i * channels + c]);
        biquad(signal, coefficients(rate, true));
        biquad(signal, coefficients(rate, false));
        for (let i = 0; i < frames; i++) energy[i] += signal[i] * signal[i]
    }
    const block = Math.min(frames, Math.max(1, Math.round(rate * .4))),
        hop = Math.max(1, Math.round(rate * .1)),
        blocks = [],
        db = e => e > 0 ? -.691 + 10 * Math.log10(e) : -Infinity;
    // Running sums keep long clips bounded to O(frames), including overlapping blocks.
    let sum = 0;
    for (let i = 0; i < block; i++) sum += energy[i];
    for (let start = 0; start + block <= frames; start += frames < rate * .4 ? frames : hop) {
        if (start) {
            for (let i = start - hop; i < start; i++) sum -= energy[i];
            for (let i = start + block - hop; i < start + block; i++) sum += energy[i]
        }
        const value = Math.max(0, sum / block);
        if (db(value) >= -70) blocks.push(value);
        if (frames < rate * .4) break
    }
    if (!blocks.length) return null;
    const preliminary = db(blocks.reduce((a, b) => a + b, 0) / blocks.length),
        gate = Math.max(-70, preliminary - 10),
        retained = blocks.filter(e => db(e) >= gate);
    return retained.length ? db(retained.reduce((a, b) => a + b, 0) / retained.length) : null;
}
module.exports = {
    peak,
    lift,
    lufs
};