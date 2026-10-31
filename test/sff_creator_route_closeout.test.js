'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const inventory = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'IKEMaker-Control-Route-Inventory.json'), 'utf8'));
const surface = inventory.bySurface.find(item => item.surface === 'sff.creator');
assert(surface, 'generated control-route inventory must include SFF Creator');
assert.strictEqual(surface.discovered, 139, 'SFF Creator candidate count changed; regenerate and review new candidates rather than silently inheriting closeout');
assert.strictEqual(surface.audited, surface.discovered, 'every discovered SFF Creator candidate must have an explicit traced classification');
assert.strictEqual(surface.pending, 0, 'SFF Creator route closeout must not leave an unclassified candidate');

const rows = inventory.controls.filter(item => item.surface === 'sff.creator');
assert.strictEqual(rows.length, surface.discovered);
assert(rows.every(item => item.status === 'audited'), 'every SFF Creator inventory row must be audited');
assert(rows.every(item => item.owner || item.owners?.length), 'every SFF Creator row must retain an owner');
assert(rows.every(item => item.destination), 'every SFF Creator row must name its destination');
assert(rows.every(item => item.availability), 'every SFF Creator row must state availability');
assert(rows.every(item => item.visibleReason), 'every SFF Creator row must expose a reason/evidence boundary');

for (const control of ['openNeedsPalette', 'desktopDropZone', 'logicalGroupDropLane', 'savedRuleRows', 'nearestColorRows', 'writerComparisonRunStatus']) {
  assert(rows.some(item => item.control === control && item.status === 'audited'), `missing traced SFF Creator closeout row: ${control}`);
}

console.log('SFF Creator route inventory closes all 139 discovered candidates with explicit route metadata');
