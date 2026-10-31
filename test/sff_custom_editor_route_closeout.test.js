'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const inventory = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'IKEMaker-Control-Route-Inventory.json'), 'utf8'));
for (const [surfaceId, expected] of [['custom-editor.sff', 254], ['sff.viewer', 258]]) {
  const surface = inventory.bySurface.find(item => item.surface === surfaceId);
  assert(surface, `missing generated surface ${surfaceId}`);
  assert.strictEqual(surface.discovered, expected, `${surfaceId} candidate count changed; review new candidates explicitly`);
  assert.strictEqual(surface.audited, surface.discovered, `${surfaceId} must classify every discovered shared implementation control`);
  assert.strictEqual(surface.pending, 0, `${surfaceId} must not retain unclassified controls`);
  const rows = inventory.controls.filter(item => item.surface === surfaceId);
  assert.strictEqual(rows.length, expected);
  assert(rows.every(row => row.status === 'audited' && row.owners?.length && row.destination && row.availability && row.visibleReason), `${surfaceId} rows require owner, destination, state, and reason evidence`);
}

for (const control of ['action:addSprites','command:sff.openAssembly','axisSaveStatus','paletteStatus','canvas','sffMoveMenu','spritePosition']) {
  const row = inventory.controls.find(item => item.surface === 'custom-editor.sff' && item.control === control);
  assert(row && row.status === 'audited', `custom SFF editor missing traced route ${control}`);
}

console.log('Custom SFF editor and shared SFF Viewer route inventories close all discovered controls');
