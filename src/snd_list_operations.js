'use strict';
const {
    parseSndBuffer,
    soundBuffer
} = require('./snd_reader');
const soundBuild = require('./sound_build');

function invertSelection(marked, visible) {
    const result = new Set(marked);
    for (const index of new Set(visible)) {
        if (result.has(index)) result.delete(index);
        else result.add(index)
    }
    return [...result].sort((a, b) => a - b)
}

function planDuplicates(archive, indices, group, start = 0, extraEntries = []) {
    if (!Number.isInteger(group) || group < 0 || group > 2147483647 || !Number.isInteger(start) || start < 0 || start > 2147483647) throw Error('Group and starting index must be 0 through 2147483647.');
    if (!Array.isArray(indices) || !indices.length || indices.length > 512 || indices.some(index => !Number.isSafeInteger(index))) throw Error('Select 1 through 512 sounds.');
    if (archive.issues.length || archive.entries.length !== archive.declaredCount) throw Error('Resolve archive diagnostics before duplication.');
    const occupied = new Set([...archive.entries, ...extraEntries].map(e => `${e.group},${e.index}`)),
        mappings = [];
    let next = start;
    for (const index of [...new Set(indices)].sort((a, b) => a - b)) {
        const entry = archive.entries[index];
        if (!entry) throw Error('Selected sound no longer exists.');
        while (next <= 2147483647 && occupied.has(`${group},${next}`)) next++;
        if (next > 2147483647) throw Error('No free sound index remains in this group.');
        mappings.push({
            archiveIndex: index,
            from: entry.identity,
            group,
            index: next,
            identity: `${group},${next}`
        });
        occupied.add(`${group},${next++}`)
    }
    return mappings;
}

function duplicateArchive(archive, mappings) {
    if (!mappings.length) throw Error('Select sounds to duplicate.');
    const occupied = new Set(archive.entries.map(e => e.identity)),
        prefix = Buffer.from(archive.buffer),
        pieces = [prefix];
    let at = prefix.length;
    prefix.writeUInt32LE(archive.entries.length + mappings.length, 16);
    const last = archive.entries.at(-1);
    if (!last) throw Error('Archive is empty.');
    prefix.writeUInt32LE(at, last.subheaderOffset);
    for (const [i, mapping] of mappings.entries()) {
        if (occupied.has(mapping.identity)) throw Error('Duplicate destination is occupied.');
        occupied.add(mapping.identity);
        const source = archive.entries[mapping.archiveIndex];
        if (!source || source.identity !== mapping.from) throw Error('Duplicate source changed.');
        const payload = soundBuffer(archive, source),
            header = Buffer.alloc(16),
            next = at + 16 + payload.length;
        header.writeUInt32LE(i === mappings.length - 1 && !last.nextOffset ? 0 : next, 0);
        header.writeUInt32LE(payload.length, 4);
        header.writeInt32LE(mapping.group, 8);
        header.writeInt32LE(mapping.index, 12);
        pieces.push(header, payload);
        at = next
    }
    if (at > 256 * 1024 * 1024) throw Error('Duplicated archive exceeds 256 MB.');
    const bytes = Buffer.concat(pieces),
        candidate = parseSndBuffer(bytes, archive.filename);
    if (candidate.issues.length || candidate.entries.length !== archive.entries.length + mappings.length) throw Error('Duplicated SND failed reopen.');
    archive.entries.forEach((entry, i) => {
        if (candidate.entries[i].identity !== entry.identity || !soundBuffer(archive, entry).equals(soundBuffer(candidate, candidate.entries[i]))) throw Error('Existing sound changed during duplication.')
    });
    mappings.forEach((mapping, i) => {
        if (candidate.entries[archive.entries.length + i].identity !== mapping.identity || !soundBuffer(archive, archive.entries[mapping.archiveIndex]).equals(soundBuffer(candidate, candidate.entries[archive.entries.length + i]))) throw Error('Duplicated WAV failed fidelity check.')
    });
    return bytes;
}

function duplicateManifestText(text, mappings) {
    const manifest = soundBuild.parse(text),
        occupied = new Set(manifest.entries.map(e => `${e.group},${e.index}`)),
        lines = [];
    for (const mapping of mappings) {
        if (occupied.has(mapping.identity)) throw Error('Manifest destination is occupied.');
        const source = manifest.entries.filter(e => `${e.group},${e.index}` === mapping.from);
        if (source.length !== 1) throw Error('The source must occur exactly once in the manifest: ' + mapping.from);
        occupied.add(mapping.identity);
        lines.push(source[0].source, String(mapping.group), String(mapping.index))
    }
    const newline = text.includes('\r\n') ? '\r\n' : '\n';
    return text + (text.endsWith('\n') ? '' : newline) + lines.join(newline) + newline
}
module.exports = {
    invertSelection,
    planDuplicates,
    duplicateArchive,
    duplicateManifestText
};