'use strict';
function tokenize(query) {
    const words = [];
    let word = '', quote = '';
    for (const ch of String(query || '')) {
        if (quote) {
            if (ch === quote) quote = ''; else word += ch;
        } else if ((ch === '"' || ch === "'") && (!word || word.endsWith(':') || word === '-')) {
            quote = ch;
        } else if (/\s/.test(ch)) {
            if (word) words.push(word);
            word = '';
        } else word += ch;
    }
    if (word) words.push(word);
    return words;
}
function numericMatch(actual, expression) {
    if (actual === null || actual === undefined || !Number.isFinite(Number(actual))) return false;
    const number = Number(actual), range = /^(-?\d+(?:\.\d+)?)\.\.(-?\d+(?:\.\d+)?)$/.exec(expression);
    if (range) return number >= Number(range[1]) && number <= Number(range[2]);
    const comparison = /^(>=|<=|>|<|=)?(-?\d+(?:\.\d+)?)$/.exec(expression);
    if (!comparison) return false;
    const target = Number(comparison[2]);
    return comparison[1] === '>=' ? number >= target : comparison[1] === '<=' ? number <= target : comparison[1] === '>' ? number > target : comparison[1] === '<' ? number < target : number === target;
}
function matches(entry, query) {
    const numeric = { group:'group', g:'group', index:'index', i:'index', rate:'sampleRate', hz:'sampleRate', channels:'channels', ch:'channels', bits:'bitsPerSample', duration:'durationSeconds', seconds:'durationSeconds', size:'dataSize', bytes:'dataSize', position:'archiveIndex', format:'format' };
    numeric.start = 'sourceStartSeconds';
    numeric.end = 'sourceEndSeconds';
    const textFields = { name:'name', groupname:'groupName', indexname:'indexName', category:'category', role:'role', file:'filename', source:'sourcePath', device:'sourceDevice' };
    const all = [entry.identity, entry.group, entry.index, entry.name, entry.groupName, entry.indexName, entry.category, entry.role, entry.filename, entry.sourcePath, entry.sourceDevice, ...(entry.namedBuckets || [])].join(' ').toLowerCase();
    const clauses = [[]];
    for (const token of tokenize(query)) { if (token === '|' || token.toUpperCase() === 'OR') clauses.push([]); else clauses.at(-1).push(token); }
    function matchToken(raw) {
        const negative = raw.startsWith('-'), token = (negative ? raw.slice(1) : raw).toLowerCase(), colon = token.indexOf(':');
        let result;
        if (colon > 0) {
            const field = token.slice(0, colon), value = token.slice(colon + 1);
            if (numeric[field]) result = numericMatch(entry[numeric[field]], value);
            else if (textFields[field]) result = String(entry[textFields[field]] || '').toLowerCase().includes(value);
            else if (field === 'is') result = audioFilter(entry, value);
            else result = all.includes(token);
        } else if (['mono', 'stereo'].includes(token)) result = entry.channels === (token === 'mono' ? 1 : 2);
        else result = all.includes(token);
        return negative ? !result : result;
    }
    return clauses.some(clause => clause.length > 0 && clause.every(matchToken)) || !String(query || '').trim();
}
function audioFilter(entry, mode = 'all') {
    const qa = entry.qa || {};
    if (mode === 'all') return true;
    if (mode === 'mono') return entry.channels === 1;
    if (mode === 'stereo') return entry.channels === 2;
    if (mode === 'unreadable') return entry.valid === false;
    if (mode === 'named') return Boolean(entry.indexName || entry.name);
    if (mode === 'unnamed') return !entry.indexName && !entry.name;
    if (mode === 'duplicate') return entry.duplicateMember === true || entry.duplicateOf != null || entry.exactAudioDuplicateOf != null || entry.pcmDuplicateOf != null;
    if (mode === 'clipping') return Boolean(qa.supported && (qa.clippedSamples || qa.nearClippedSamples));
    if (mode === 'silence') return Boolean(qa.supported && (qa.leadingSilenceSeconds >= .02 || qa.trailingSilenceSeconds >= .02));
    if (mode === 'dc') return Boolean(qa.supported && Math.abs(qa.dcOffset) >= .01);
    if (mode === 'pcm') return !entry.formatError && (entry.effectiveFormat ?? entry.format) === 1;
    if (mode === 'float') return !entry.formatError && (entry.effectiveFormat ?? entry.format) === 3;
    return false;
}
function sort(entries, key = 'number', direction = 'asc') {
    const numeric = { number:'group', source:'archiveIndex', duration:'durationSeconds', sampleRate:'sampleRate', rate:'sampleRate', channels:'channels', bits:'bitsPerSample', size:'dataSize' };
    return entries.slice().sort((left, right) => {
        let comparison;
        if (key === 'number') comparison = left.group - right.group || left.index - right.index;
        else if (numeric[key]) {
            const a=left[numeric[key]],b=right[numeric[key]],validA=typeof a==='number'&&Number.isFinite(a),validB=typeof b==='number'&&Number.isFinite(b);
            if(validA!==validB)return validA?-1:1;
            comparison=validA?a-b:0;
        }
        else comparison = String(left[key] || (key === 'name' ? left.identity : '')).localeCompare(String(right[key] || (key === 'name' ? right.identity : '')), undefined, { numeric:true, sensitivity:'base' });
        return (direction === 'desc' ? -comparison : comparison) || left.archiveIndex - right.archiveIndex;
    });
}
function clientScript() { return [tokenize, numericMatch, matches, audioFilter, sort].map(fn => fn.toString()).join('\n'); }
module.exports = { tokenize, numericMatch, matches, audioFilter, sort, clientScript };
