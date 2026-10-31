'use strict';

const assert = require('assert');
const inventory = require('../data/IKEMaker-Control-Route-Inventory.json');

const summary = inventory.bySurface.find(item => item.surface === 'snd.viewer');
assert(summary, 'SND Viewer must remain registered in the all-screen inventory');
assert.strictEqual(summary.discovered, 110, 'candidate drift requires an explicit SND Viewer re-audit');
assert.strictEqual(summary.audited, summary.discovered, 'every currently discovered SND Viewer candidate must have one truthful classification');
assert.strictEqual(summary.pending, 0, 'SND Viewer closeout must not leave an unclassified candidate');

const controls = inventory.controls.filter(item => item.surface === 'snd.viewer');
assert.strictEqual(new Set(controls.map(item => item.control)).size, controls.length, 'physical SND Viewer candidates are classified once');
for (const item of controls) {
  assert.strictEqual(item.status, 'audited', `${item.control} is not audited`);
  assert(item.label && item.handler && item.destination && item.context && item.availability && item.visibleReason && item.evidence, `${item.control} lacks complete route/state evidence`);
}

for (const control of ['sndArchiveSelect', 'sndArchiveOpen', 'sndArchivePrevious', 'sndArchiveNext', 'sndDropZone', 'wave', 'sndHelp', 'delete', 'sndDelete']) {
  assert(controls.some(item => item.control === control), `missing high-impact SND Viewer route: ${control}`);
}

console.log('SND Viewer route inventory is fully classified at 110/110 with no duplicate physical candidates');
