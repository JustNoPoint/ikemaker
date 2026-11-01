'use strict';

const assert = require('assert');
const { cases } = require('../tools/generate_sff_v1_runtime_certification_fixtures');
const { createSffV1Pcx8Bytes } = require('../src/sff_v1_pcx8_writer');
const { assertSffV1Pcx8, validateSffV1Pcx8 } = require('../src/sff_v1_pcx8_strict_validator');

function fixture(id) { const item = cases().find(row => row.id === id), bytes = createSffV1Pcx8Bytes(item.specification, { decodedPixelsByEntryId: item.decodedPixelsByEntryId }); return { item, bytes, report: assertSffV1Pcx8(bytes, item.specification) }; }
function mutation(bytes, edit) { const copy = Buffer.from(bytes); edit(copy); assert.strictEqual(validateSffV1Pcx8(copy).ok, false); }

const own = fixture('different-own-palettes'), first = own.report.sprites[0], pcx = first.headerOffset + 32;
mutation(own.bytes, bytes => { bytes[0] ^= 1; });
mutation(own.bytes, bytes => { bytes[12] ^= 1; });
mutation(own.bytes, bytes => bytes.writeUInt32LE(99, 16));
mutation(own.bytes, bytes => bytes.writeUInt32LE(3, 20));
mutation(own.bytes, bytes => bytes.writeUInt32LE(511, 24));
mutation(own.bytes, bytes => bytes.writeUInt32LE(31, 28));
mutation(own.bytes, bytes => { bytes[32] = 1; });
mutation(own.bytes, bytes => { bytes[33] = 1; });
mutation(own.bytes, bytes => bytes.writeUInt32LE(0, first.headerOffset));
mutation(own.bytes, bytes => bytes.writeUInt32LE(first.headerOffset + 31, first.headerOffset));
mutation(own.bytes, bytes => bytes.writeUInt32LE(first.nextOffset + 1, first.headerOffset));
mutation(Buffer.concat([own.bytes, Buffer.from([0])]), () => {});
mutation(own.bytes, bytes => bytes.writeUInt32LE(first.declaredLength - 1, first.headerOffset + 4));
mutation(own.bytes, bytes => bytes.writeUInt16LE(1, first.headerOffset + 16));
mutation(own.bytes, bytes => { bytes[first.headerOffset + 18] = 1; });
mutation(own.bytes, bytes => { bytes[first.headerOffset + 19] = 1; });
for (const [offset, value] of [[0, 0], [1, 4], [2, 0], [3, 4], [4, 1], [12, 0], [64, 1], [65, 2], [66, 1], [68, 2], [70, 1]]) mutation(own.bytes, bytes => { bytes[pcx + offset] = value; });
mutation(own.bytes, bytes => { bytes[first.nextOffset - 769] = 0; });
mutation(own.bytes, bytes => { bytes[pcx + 128] = 0xc0; });
mutation(own.bytes, bytes => { bytes[pcx + 128] = 0xc5; bytes[pcx + 129] = 0; });

const reused = fixture('successive-reuse-final'), reuse = reused.report.sprites[1];
mutation(reused.bytes, bytes => bytes.writeUInt32LE(reuse.declaredLength - 1, reuse.headerOffset + 4));
mutation(reused.bytes, bytes => { bytes[reuse.nextOffset - 1] = 0; });
mutation(reused.bytes, bytes => { bytes[reuse.headerOffset + 18] = 0; });

const linked = fixture('direct-link'), link = linked.report.sprites[1];
mutation(linked.bytes, bytes => bytes.writeUInt16LE(1, link.headerOffset + 16));
mutation(linked.bytes, bytes => bytes.writeUInt16LE(2, link.headerOffset + 16));
mutation(linked.bytes, bytes => bytes.writeUInt32LE(1, link.headerOffset + 4));
mutation(linked.bytes, bytes => { bytes[link.headerOffset + 18] = 0; });
mutation(linked.bytes, bytes => bytes.writeUInt32LE(link.nextOffset + 1, link.headerOffset));

console.log('Strict SFF v1.01 PCX8 validator rejects header, chain, size-quirk, link, PCX, RLE, palette-marker, reserved-byte, and trailing-data drift');
