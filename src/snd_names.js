'use strict';
const fs = require('node:fs');
const path = require('node:path');
const SCHEMA = 'ikemaker.snd-names';
const empty = () => ({ schema: SCHEMA, version: 1, groups: {}, sounds: {} });
function filenameFor(filename) { return path.join(path.dirname(path.resolve(filename)), '.ikemen-tools', 'snd-names', path.basename(filename) + '.json'); }
function id(value) { if (!Number.isInteger(value) || value < 0 || value > 2147483647) throw new Error('Sound IDs must be whole numbers from 0 through 2147483647.'); return value; }
function name(value) { if (typeof value !== 'string' || value.length > 160 || /[\r\n\u0000-\u001f]/.test(value)) throw new Error('Names must be a single line of at most 160 characters.'); return value.trim(); }
function validate(document) {
    if (!document || document.schema !== SCHEMA || document.version !== 1 || !document.groups || !document.sounds || Array.isArray(document.groups) || Array.isArray(document.sounds)) throw new Error('Unsupported SND names document.');
    for (const [key, record] of Object.entries(document.groups)) { if (!/^\d+$/.test(key)) throw new Error('Invalid group name ID.'); id(Number(key)); name(record.name); }
    for (const [key, record] of Object.entries(document.sounds)) { if (!/^\d+,\d+$/.test(key)) throw new Error('Invalid sound name ID.'); key.split(',').forEach(value => id(Number(value))); name(record.name); }
    return document;
}
function encode(document) {
    const content = JSON.stringify(validate(document), null, 2) + '\n';
    if (Buffer.byteLength(content) > 4 * 1024 * 1024) throw Error('SND names metadata exceeds 4 MB.');
    return content;
}
function readSnapshot(filename) {
    const target = filenameFor(filename);
    try {
        if (fs.statSync(target).size > 4 * 1024 * 1024) throw Error('SND names metadata exceeds 4 MB.');
        const bytes = fs.readFileSync(target);
        return { bytes, document: validate(JSON.parse(bytes.toString('utf8'))) };
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        return { bytes: Buffer.alloc(0), document: empty() };
    }
}
function read(filename) { return readSnapshot(filename).document; }
function setGroup(document, group, value) {
    validate(document); const result = structuredClone(document), key = String(id(group)), text = name(value);
    if (text) result.groups[key] = { ...result.groups[key], name: text, origin: 'manual' }; else delete result.groups[key];
    return result;
}
function setSound(document, group, index, value, provenance) {
    validate(document); const result = structuredClone(document), key = `${id(group)},${id(index)}`, text = name(value);
    const source = provenance || result.sounds[key]?.provenance;
    if (text || source) {
        result.sounds[key] = {
            ...result.sounds[key], name: text, origin: provenance ? 'import' : 'manual',
            ...(source ? { provenance: structuredClone(source) } : {})
        };
    } else {
        delete result.sounds[key];
    }
    return result;
}
function labels(document, entry, fallback = '') {
    const groupName = document.groups[String(entry.group)]?.name || '', indexName = document.sounds[`${entry.group},${entry.index}`]?.name || '';
    const source = document.sounds[`${entry.group},${entry.index}`]?.provenance;
    const labels = { groupName, indexName, name: indexName || fallback };
    if (typeof source?.sourcePath === 'string') {
        labels.sourcePath = source.sourcePath;
        labels.sourceDevice = typeof source.sourceDevice === 'string' ? source.sourceDevice : '';
        if (Number.isSafeInteger(source.startFrame) && Number.isSafeInteger(source.endFrame) && source.sampleRate > 0) {
            labels.sourceStartSeconds = source.startFrame / source.sampleRate;
            labels.sourceEndSeconds = source.endFrame / source.sampleRate;
            labels.sourceRange = labels.sourceStartSeconds.toFixed(3) + ' to ' + labels.sourceEndSeconds.toFixed(3) + ' s';
        }
    }
    return labels;
}
function applyImports(document, entries, options = {}) {
    const result = structuredClone(validate(document));
    for (const entry of entries) {
        const key = `${id(entry.group)},${id(entry.index)}`;
        if (!entry.name) continue;
        const incoming = name(entry.name);
        if (!incoming) continue;
        const existing = result.sounds[key];
        const keepLabel = existing?.name && existing.origin !== 'import' && !options.overwrite;
        result.sounds[key] = {
            ...existing,
            name: keepLabel ? existing.name : incoming,
            origin: keepLabel ? 'manual' : 'import',
            provenance: structuredClone(entry.provenance || { imported: true })
        };
    }
    return result;
}
module.exports = { empty, filenameFor, validate, encode, read, readSnapshot, setGroup, setSound, labels, applyImports };
