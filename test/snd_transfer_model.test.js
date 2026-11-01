'use strict';

const assert = require('assert');
const { parseSndBuffer } = require('../src/snd_reader');
const { sndTransferSelectionItems, analyzeSndTransfer } = require('../src/snd_transfer_model');
const { planSndTransferResolution } = require('../src/snd_transfer_resolution_model');
function wav(sample) { const data = Buffer.from([sample, 0]); const out = Buffer.alloc(46); out.write('RIFF'); out.writeUInt32LE(38, 4); out.write('WAVEfmt ', 8); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22); out.writeUInt32LE(8000, 24); out.writeUInt32LE(16000, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(2, 40); data.copy(out, 44); return out; }
function snd(rows) { const chunks = [], header = Buffer.alloc(24); header.write('ElecbyteSnd\0', 0, 'binary'); header.writeUInt16LE(1, 12); header.writeUInt32LE(rows.length, 16); header.writeUInt32LE(rows.length ? 24 : 0, 20); let offset = 24; rows.forEach((row, at) => { const bytes = wav(row.sample), entry = Buffer.alloc(16 + bytes.length), next = at === rows.length - 1 ? offset + entry.length : offset + entry.length; entry.writeUInt32LE(next, 0); entry.writeUInt32LE(bytes.length, 4); entry.writeInt32LE(row.group, 8); entry.writeInt32LE(row.index, 12); bytes.copy(entry, 16); chunks.push(entry); offset += entry.length; }); return parseSndBuffer(Buffer.concat([header, ...chunks])); }
const source = snd([{ group: 1, index: 0, sample: 1 }, { group: 1, index: 1, sample: 2 }]), destination = snd([{ group: 1, index: 0, sample: 9 }]);
const selection = sndTransferSelectionItems(source, [0, 1]), analysis = analyzeSndTransfer({ sourceArchive: source, destinationArchive: destination, selection });
assert.equal(analysis.items[0].destinationConflict.status, 'occupied'); assert.equal(analysis.items[1].destinationConflict.status, 'clear'); assert.match(analysis.analysisIdentity, /^[A-F0-9]{64}$/); assert(Object.isFrozen(analysis.items));
const plan = planSndTransferResolution({ analysis, destinationArchive: destination, decisions: [{ id: selection[0].id, action: 'add-next-free', startIndex: 0 }, { id: selection[1].id, action: 'manual-identity', group: 2, index: 5 }] });
assert.equal(plan.status, 'ready'); assert.deepStrictEqual(plan.items.map(item => [item.destinationGroup, item.destinationIndex]), [[1, 1], [2, 5]]); assert.match(plan.planIdentity, /^[A-F0-9]{64}$/);
const partial = planSndTransferResolution({ analysis, destinationArchive: destination, decisions: [] }); assert.equal(partial.status, 'blocked'); assert.equal(partial.unresolved.length, 2);
assert.throws(() => sndTransferSelectionItems(source, [0, 0]), /invalid or repeated/); assert.throws(() => analyzeSndTransfer({ sourceArchive: source, destinationArchive: destination, selection: selection.map((item, index) => index ? item : { ...item, contentFingerprint: 'A'.repeat(64) }) }), /selection changed/);
console.log('SND Transfer exact physical selection, conflicts and deterministic resolution passed');
