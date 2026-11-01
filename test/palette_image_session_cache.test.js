'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { encodeRgbaPng, buildCollective } = require('../src/palette_collective_model');
const { createImageSessionDocument, parseImageSessionDocument } = require('../src/palette_image_session_cache');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-image-session-'));
try {
  const first = path.join(root, 'first.png'), second = path.join(root, 'second.png');
  fs.writeFileSync(first, encodeRgbaPng(2, 1, Buffer.from([255,0,255,255, 10,20,30,255])));
  fs.writeFileSync(second, encodeRgbaPng(1, 2, Buffer.from([255,0,255,255, 40,50,60,255])));
  const collective = buildCollective([first, second].map(filename => ({ filename, buffer: fs.readFileSync(filename) })));
  const session = { context: { section: 'template' }, collective: { inventoryHash: collective.inventoryHash, selectedImageIds: collective.evidence.map(item => item.imageId), excludedRegions: [{ imageId: collective.evidence[0].imageId, rect: { x: 0, y: 0, width: 1, height: 1 } }] }, organizer: { templateImageLayout: { revision: 3, items: [{ imageId: collective.evidence[0].imageId, x: 210, y: 8, z: 1 }] }, templateSwatches: { groups: [{ id: 'skin', name: 'Skin', colorIds: ['10,20,30,255'] }] }, templateDecorations: { lines: [{ x1: 1, y1: 2, x2: 8, y2: 2, groupId: 'skin', thickness: 1 }] } } };
  const document = createImageSessionDocument(collective, session), restored = parseImageSessionDocument(Buffer.from(JSON.stringify(document)));
  assert.strictEqual(restored.collective.inventoryHash, collective.inventoryHash);
  assert.deepStrictEqual(restored.collective.entries, collective.entries, 'combined exact color analysis is restored without rescanning pixels');
  assert.deepStrictEqual(restored.collective.images.map(item => [...item.decoded.rgba]), collective.images.map(item => [...item.decoded.rgba]), 'decoded RGBA planes round trip losslessly');
  assert.deepStrictEqual(restored.workspace.organizer, session.organizer, 'layout, named swatches, and separator lines round trip');
  assert.deepStrictEqual(restored.workspace.collective.excludedRegions, session.collective.excludedRegions, 'cleanup decisions round trip');
  assert.deepStrictEqual(restored.collective.images.map(item => item.buffer), [fs.readFileSync(first), fs.readFileSync(second)], 'original encoded PNG bytes remain available lazily');
  const touched = new Date(Date.now() + 2000);fs.utimesSync(first, touched, touched);assert.strictEqual(parseImageSessionDocument(document).collective.imageCount, 2, 'timestamp drift accepts the cache only after exact byte hashing');
  const tampered = JSON.parse(JSON.stringify(document));tampered.workspace.organizer.templateImageLayout.revision = 99;assert.throws(() => parseImageSessionDocument(tampered), /incomplete or has changed/);
  fs.writeFileSync(first, encodeRgbaPng(2, 1, Buffer.from([255,0,255,255, 11,20,30,255])));assert.throws(() => parseImageSessionDocument(document), /source changed|source size changed/);
} finally { fs.rmSync(root, { recursive: true, force: true }); }
console.log('Palette image-session cache tests passed');
