'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { hash } = require('./snd_audio_processing');
const empty = () => ({ schema: 'ikemaker.voice-cut-library', version: 1, id: randomUUID(), sources: {}, imports: [] });
function decode(bytes) {
    if (bytes.length > 64 * 1024 * 1024) throw Error('The voice library exceeds 64 MB.');
    const value = JSON.parse(bytes.toString('utf8'));
    if (value.schema !== 'ikemaker.voice-cut-library' || value.version !== 1 || !value.sources || !Array.isArray(value.imports)) throw Error('Unsupported voice cut library.');
    for (const [sourceHash, record] of Object.entries(value.sources)) {
        if (!/^[a-f0-9]{64}$/.test(sourceHash) || !record || !Array.isArray(record.clips)) throw Error('Invalid source in voice library.');
        validateClips(record.clips);
        let end = 0;
        for (const clip of record.clips) {
            if (!Number.isSafeInteger(clip.start) || !Number.isSafeInteger(clip.end) || clip.start < end || clip.end <= clip.start || clip.end > record.frames || typeof clip.rejected !== 'boolean') throw Error('Invalid cut bounds in voice library.');
            end = clip.end;
        }
    }
    const imports = new Set();
    for (const item of value.imports) {
        if (!item || typeof item.destination !== 'string' || !item.destination || typeof item.importId !== 'string' || imports.has(item.importId) || !Array.isArray(item.entries)) throw Error('Invalid placement history in voice library.');
        imports.add(item.importId);
        for (const entry of item.entries) if (typeof entry.clipId !== 'string' || !/^[a-f0-9]{64}$/.test(entry.wavHash) || !Number.isSafeInteger(entry.entryIndex) || entry.entryIndex < 0) throw Error('Invalid placement entry in voice library.');
    }
    return value;
}
function name(value) {
    if (typeof value !== 'string' || !value.trim() || value.length > 160 || /[\x00-\x1f]/.test(value)) throw Error('Choose a single-line cut name of 1–160 characters.');
    return value.trim().normalize('NFC');
}
function validateClips(clips) {
    const ids = new Set(), names = new Set(), pairs = new Set();
    for (const clip of clips) {
        if (typeof clip.id !== 'string' || !clip.id || ids.has(clip.id)) throw Error('Cut IDs must be unique.');
        ids.add(clip.id);
        const label = name(clip.name).toLocaleLowerCase('en-US');
        if (names.has(label)) throw Error('Cut names must be unique.');
        names.add(label);
        for (const value of [clip.group, clip.index]) if (!Number.isSafeInteger(value) || value < 0 || value > 2147483647) throw Error('Cut group and index must be whole numbers from 0 through 2147483647.');
        const pair = clip.group + ',' + clip.index;
        if (pairs.has(pair)) throw Error('Cut group and index pairs must be unique.');
        pairs.add(pair);
    }
    return clips;
}
function identify(clips, previous = []) {
    const rangeKey = clip => clip.start + ':' + clip.end;
    const byRange = new Map(previous.filter(clip => clip.id).map(clip => [rangeKey(clip),clip]));
    const retained = clips.map(clip => byRange.get(rangeKey(clip)));
    const names = new Set(), pairs = new Set();
    for (const old of retained) {
        if (!old) continue;
        names.add(old.name.toLocaleLowerCase('en-US'));
        pairs.add(old.group + ',' + old.index);
    }
    return clips.map((clip, index) => {
        const old = retained[index];
        if (old) return {...clip,...old};
        const base = 'Cut ' + (index + 1);
        let label = base, suffix = 2;
        while (names.has(label.toLocaleLowerCase('en-US'))) label = base + ' (' + suffix++ + ')';
        names.add(label.toLocaleLowerCase('en-US'));
        let number = index;
        while (pairs.has('0,' + number)) number++;
        pairs.add('0,' + number);
        return {...clip, id:randomUUID(), name:label, group:0, index:number};
    });
}
function source(document, sourceHash, filename, state) {
    const next = structuredClone(document), old = next.sources[sourceHash], now = new Date().toISOString();
    const alias = { deviceLabel: os.hostname(), path: path.resolve(filename), lastSeen: now };
    const aliases = (old?.origin?.aliases || []).filter(item => item.path !== alias.path || item.deviceLabel !== alias.deviceLabel);
    aliases.push(alias);
    next.sources[sourceHash] = { ...state, origin: { ...(old?.origin || alias), hash: sourceHash, aliases } };
    return next;
}
function readSnapshot(filename) {
    try {
        if (fs.statSync(filename).size > 64 * 1024 * 1024) throw Error('The voice library exceeds 64 MB.');
        const bytes = fs.readFileSync(filename);
        return { bytes, document: decode(bytes) };
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        return { bytes: Buffer.alloc(0), document: empty() };
    }
}
function read(filename) { return readSnapshot(filename).document; }
function snapshot(filename) { return fs.existsSync(filename) ? fs.readFileSync(filename) : Buffer.alloc(0); }
function encode(document) {
    const text = JSON.stringify(document, null, 2) + '\n';
    if (Buffer.byteLength(text) > 64 * 1024 * 1024) throw Error('The voice library exceeds 64 MB.');
    return text;
}
function writePlan(filename, document, observed = snapshot(filename)) {
    return { writes: [[filename, encode(document)]], expectedHashes: { [path.resolve(filename)]: hash(observed) } };
}
function placements(document, clipId) { return document.imports.flatMap(item => item.entries.filter(entry => entry.clipId === clipId).map(entry => ({ ...entry, destination: item.destination, entityId: item.entityId, importId: item.importId, importedAt: item.importedAt }))); }
module.exports = { empty, read, readSnapshot, name, validateClips, identify, source, snapshot, encode, writePlan, placements };
