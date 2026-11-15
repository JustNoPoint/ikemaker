'use strict';

function samplePosition(seconds, rate, direction) {
    const product = Number(seconds) * rate;
    if (!Number.isFinite(product)) throw Error('Sample position must be finite.');
    const nearest = Math.round(product),
        tolerance = Number.EPSILON * Math.max(1, Math.abs(product)) * 8;
    return Math.abs(product - nearest) <= tolerance ? nearest : direction === 'end' ? Math.ceil(product) : Math.floor(product)
}

function sampleRange(info, options = {}) {
    const total = info.frames,
        rate = info.sampleRate;

    function position(which, fallback) {
        const exact = options[which + 'Frame'];
        if (exact !== undefined) {
            if (!Number.isSafeInteger(exact) || exact < 0 || exact > total) throw Error('Exact frame position is outside the sound.');
            return exact
        }
        const seconds = options[which] === undefined ? fallback : Number(options[which]);
        if (!Number.isFinite(seconds) || seconds < 0 || seconds > total / rate) throw Error('Selection time is outside the sound.');
        return Math.max(0, Math.min(total, samplePosition(seconds, rate, which)))
    }
    const start = position('start', 0),
        end = position('end', total / rate);
    if (end <= start) throw Error('Choose a nonempty selected range.');
    return {
        start,
        end
    }
}
module.exports = {
    samplePosition,
    sampleRange
};