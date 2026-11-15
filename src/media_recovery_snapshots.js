'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {transactionalWrite} = require('./mutation_safety');
const MAX_BYTES = 32 * 1024 * 1024;
const SHA = /^[a-f0-9]{64}$/;
let storageRoot = '';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function configure(context) {
    storageRoot = context.globalStorageUri?.fsPath || '';
}
function enabled(vscode, filename) {
    return vscode.workspace.getConfiguration('ikemenZss', vscode.Uri.file(filename)).get('mediaRecoverySnapshots', false) === true;
}
function key(filename, kind) {
    const absolute = path.resolve(filename);
    return sha((process.platform === 'win32' ? absolute.toLowerCase() : absolute) + '\0' + kind);
}
function createStore(root) {
    function location(filename, kind) {
        if (!root) throw Error('Recovery storage is unavailable.');
        if (!['sff-axes', 'snd-audio'].includes(kind)) throw Error('Unknown media recovery kind.');
        return path.join(root, 'media-recovery', key(filename, kind) + '.json');
    }
    function read(filename, kind, sourceHash) {
        const file = location(filename, kind);
        if (!fs.existsSync(file)) return null;
        if (fs.statSync(file).size > MAX_BYTES) throw Error('Recovery snapshot exceeds 32 MB.');
        const bytes = fs.readFileSync(file);
        const record = JSON.parse(bytes);
        if (!record || record.version !== 1 || record.kind !== kind ||
            typeof record.filename !== 'string' || key(record.filename, kind) !== key(filename, kind) ||
            typeof record.sourceHash !== 'string' || !SHA.test(record.sourceHash)) {
            throw Error('Invalid recovery snapshot.');
        }
        return {...record, stale: record.sourceHash !== sourceHash, snapshotHash: sha(bytes)};
    }
    function save(filename, kind, sourceHash, payload, expectedSnapshotHash = null) {
        if (typeof sourceHash !== 'string' || !SHA.test(sourceHash)) throw Error('Invalid recovery source hash.');
        if (expectedSnapshotHash !== null && (typeof expectedSnapshotHash !== 'string' || !SHA.test(expectedSnapshotHash))) {
            throw Error('Invalid prior recovery hash.');
        }
        const record = {version: 1, kind, filename: path.resolve(filename), sourceHash, time: new Date().toISOString(), payload};
        const bytes = Buffer.from(JSON.stringify(record));
        if (bytes.length > MAX_BYTES) throw Error('Recovery snapshot exceeds 32 MB; save/export this draft explicitly.');
        const file = location(filename, kind);
        // An explicit missing expectation prevents a second tab overwriting the first draft.
        transactionalWrite(fs, file, bytes, {
            backupVersions: 0, journal: false,
            expectedHash: expectedSnapshotHash || sha(Buffer.alloc(0))
        });
        return sha(bytes);
    }
    function clear(filename, kind, snapshotHash) {
        if (typeof snapshotHash !== 'string' || !SHA.test(snapshotHash)) return false;
        const file = location(filename, kind);
        if (!fs.existsSync(file)) return true;
        if (sha(fs.readFileSync(file)) !== snapshotHash) return false;
        fs.unlinkSync(file);
        return true;
    }
    return {read, save, clear};
}
function validateAxes(archive, changes) {
    if (!Array.isArray(changes) || !changes.length || changes.length > archive.sprites.length) {
        throw Error('Invalid recovered axis selection.');
    }
    const seen = new Set();
    return changes.map(change => {
        if (!change || !Number.isInteger(change.index) || !archive.sprites[change.index] || seen.has(change.index) ||
            ![change.x, change.y].every(value => Number.isInteger(value) && value >= -32768 && value <= 32767)) {
            throw Error('Invalid recovered axis values.');
        }
        seen.add(change.index);
        return {index: change.index, x: change.x, y: change.y};
    });
}
function current() {
    return createStore(storageRoot);
}
module.exports = {configure, enabled, createStore, current, validateAxes, MAX_BYTES};
