'use strict';
const fs = require('node:fs');
const path = require('node:path');
const codec = require('./media_editor_manifest');
const { parseSndBuffer, soundBuffer, wavInfo } = require('./snd_reader');
const { hash, replacePayloads } = require('./snd_audio_processing');
const MAX_BYTES = 256 * 1024 * 1024;

function validateEntries(entries) {
    if (!entries.length || entries.length > 4096) throw new Error('A sound manifest must contain 1 through 4096 sounds.');
    const seen = new Set();
    for (const entry of entries) {
        if (entry.type !== 'sound') throw new Error('This sound import accepts sound sections only. Import mixed sprite/palette sections through the SFF route.');
        if (![entry.group, entry.index].every(value => Number.isInteger(value) && value >= 0 && value <= 2147483647)) throw new Error('Sound group and index must be 0 through 2147483647.');
        const identity = `${entry.group},${entry.index}`;
        if (seen.has(identity)) throw new Error(`Repeated sound ID ${identity}.`);
        seen.add(identity);
    }
}

function exportPackage(archive) {
    if (archive.issues.length || archive.entries.length !== archive.declaredCount) throw new Error('Resolve SND diagnostics before manifest export.');
    const entries = archive.entries.map(entry => ({ type: 'sound', group: entry.group, index: entry.index, file: `sounds/${entry.group}_${entry.index}.wav` }));
    validateEntries(entries);
    return { text: codec.write(entries), files: entries.map((entry, index) => ({ file: entry.file, bytes: Buffer.from(soundBuffer(archive, archive.entries[index])) })) };
}

function buildArchive(sounds) {
    validateEntries(sounds);
    const header = Buffer.alloc(512), pieces = [header];
    header.write('ElecbyteSnd\0', 0, 'binary');
    header.writeUInt16LE(1, 12);
    header.writeUInt32LE(sounds.length, 16);
    header.writeUInt32LE(512, 20);
    let offset = 512;
    sounds.forEach((entry, index) => {
        if (!Buffer.isBuffer(entry.bytes) || !wavInfo(entry.bytes).valid) throw new Error(`Sound ${entry.group},${entry.index} is not a readable WAV.`);
        const subheader = Buffer.alloc(16);
        offset += 16 + entry.bytes.length;
        if (offset > MAX_BYTES) throw new Error('Imported SND exceeds 256 MB.');
        subheader.writeUInt32LE(index === sounds.length - 1 ? 0 : offset, 0);
        subheader.writeUInt32LE(entry.bytes.length, 4);
        subheader.writeInt32LE(entry.group, 8);
        subheader.writeInt32LE(entry.index, 12);
        pieces.push(subheader, entry.bytes);
    });
    const bytes = Buffer.concat(pieces), reopened = parseSndBuffer(bytes);
    if (reopened.issues.length || reopened.entries.length !== sounds.length) throw new Error('Imported SND failed reopen verification.');
    sounds.forEach((entry, index) => {
        const candidate = reopened.entries[index];
        if (candidate.group !== entry.group || candidate.index !== entry.index || !soundBuffer(reopened, candidate).equals(entry.bytes)) throw new Error('Imported sound identity, order or WAV bytes changed.');
    });
    return bytes;
}

async function prepareImport(filename, expectedPackage) {
    const manifestStat = await fs.promises.stat(filename);
    if (!manifestStat.isFile() || manifestStat.size > 2 * 1024 * 1024) throw new Error('Manifest exceeds 2 MB or is not a file.');
    const text = await fs.promises.readFile(filename, 'utf8');
    if (Buffer.byteLength(text) > 2 * 1024 * 1024) throw new Error('Manifest exceeds 2 MB.');
    if (expectedPackage && hash(Buffer.from(text)) !== expectedPackage.manifestHash) throw new Error('The exported voice manifest changed. Export the reviewed clips again.');
    const parsed = codec.read(text);
    if (parsed.errors.length) throw new Error(parsed.errors.join('\n'));
    validateEntries(parsed.entries);
    const sources = new Map(), sounds = [];
    let total = 512;
    for (const entry of parsed.entries) {
        const source = path.resolve(path.dirname(filename), entry.file);
        if (!sources.has(source)) {
            const stat = await fs.promises.stat(source);
            if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error(`Invalid or oversized WAV source: ${entry.file}`);
            const bytes = await fs.promises.readFile(source);
            if (expectedPackage && hash(bytes) !== expectedPackage.wavHashes.get(entry.file)) throw new Error('An exported voice WAV changed. Export the reviewed clips again.');
            sources.set(source, bytes);
        }
        const bytes = sources.get(source);
        total += 16 + bytes.length;
        if (total > MAX_BYTES) throw new Error('Imported SND exceeds 256 MB.');
        sounds.push({ ...entry, source, bytes });
    }
    return { filename, text, sounds, sourceHashes: [...sources].map(([file, bytes]) => ({ file, hash: hash(bytes) })), bytes: buildArchive(sounds) };
}

async function assertUnchanged(plan) {
    if (await fs.promises.readFile(plan.filename, 'utf8') !== plan.text) throw new Error('The manifest changed during review. Import again.');
    for (const source of plan.sourceHashes) {
        if (hash(await fs.promises.readFile(source.file)) !== source.hash) throw new Error('A WAV source changed during review. Import again.');
    }
}

function mergeArchive(archive, sounds) {
    validateEntries(sounds);
    if (archive.issues.length) throw new Error('Cannot update this SND. '+archive.issues[0]);
    const replacements = new Map(), additions = [];
    const originals = new Map(archive.entries.map(entry => [entry.identity, entry]));
    for (const sound of sounds) {
        if (!Buffer.isBuffer(sound.bytes) || !wavInfo(sound.bytes).valid) throw new Error('Every imported sound must be a readable WAV.');
        const existing = originals.get(`${sound.group},${sound.index}`);
        if (existing) replacements.set(existing.archiveIndex, sound.bytes);
        else additions.push(sound);
    }
    const replaced = replacements.size
        ? parseSndBuffer(replacePayloads(archive, replacements))
        : archive;
    if (!additions.length) return { bytes: replaced.buffer, replaced: replacements.size, added: 0 };
    const prefix = Buffer.from(replaced.buffer), pieces = [prefix];
    let offset = prefix.length;
    prefix.writeUInt32LE(replaced.entries.length + additions.length, 16);
    if (replaced.entries.length) prefix.writeUInt32LE(offset, replaced.entries.at(-1).subheaderOffset);
    else prefix.writeUInt32LE(offset, 20);
    additions.forEach((sound, index) => {
        const header = Buffer.alloc(16);
        offset += 16 + sound.bytes.length;
        if (offset > MAX_BYTES) throw new Error('Imported SND exceeds 256 MB.');
        header.writeUInt32LE(index === additions.length - 1 ? 0 : offset, 0);
        header.writeUInt32LE(sound.bytes.length, 4);
        header.writeInt32LE(sound.group, 8);
        header.writeInt32LE(sound.index, 12);
        pieces.push(header, sound.bytes);
    });
    const bytes = Buffer.concat(pieces), reopened = parseSndBuffer(bytes);
    if (reopened.issues.length || reopened.entries.length !== archive.entries.length + additions.length) throw new Error('Merged SND failed reopen.');
    const expected = new Map(sounds.map(sound => [`${sound.group},${sound.index}`, sound.bytes]));
    for (const entry of reopened.entries) {
        const original = originals.get(entry.identity);
        const payload = expected.get(entry.identity) || soundBuffer(archive, original);
        if (!soundBuffer(reopened, entry).equals(payload)) throw new Error('Merged WAV failed byte verification.');
    }
    return { bytes, replaced: replacements.size, added: additions.length };
}

module.exports = { exportPackage, buildArchive, prepareImport, assertUnchanged, mergeArchive };
