'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { safePrefix, planFrameSequenceExport, executeFrameSequenceExport } = require('../src/frame_sequence_export');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-frame-export-'));
try {
  const staging = path.join(root, 'staging'), destination = path.join(root, 'export');
  fs.mkdirSync(staging); fs.mkdirSync(destination);
  const first = path.join(staging, 'frame_00001.png'), second = path.join(staging, 'frame_00002.png');
  fs.writeFileSync(first, Buffer.from('png-one')); fs.writeFileSync(second, Buffer.from('png-two'));
  assert.strictEqual(safePrefix(' Ryu Beard / FX '), 'Ryu_Beard_FX');
  const sourceHash = 'AB'.repeat(32);
  const plan = planFrameSequenceExport(fs, [{ filename: first, ordinal: 0, delayMs: 17 }, { filename: second, ordinal: 1, delayMs: 33 }], destination, { prefix: 'Ryu FX', start: 4, padding: 3, source: { kind: 'animated-gif', path: path.join(root, 'source.gif'), sha256: sourceHash } });
  assert.deepStrictEqual(plan.frames.map(item => item.outputName), ['Ryu_FX_004.png', 'Ryu_FX_005.png']);
  assert.deepStrictEqual(plan.frames.map(item => item.delayMs), [17, 33], 'GIF delay provenance remains available to the AIR handoff');
  const result = executeFrameSequenceExport(fs, plan);
  assert.deepStrictEqual(result.frames.map(item => path.basename(item.target)), ['Ryu_FX_004.png', 'Ryu_FX_005.png']);
  assert.strictEqual(fs.readFileSync(path.join(destination, 'Ryu_FX_004.png'), 'utf8'), 'png-one');
  const manifest = JSON.parse(fs.readFileSync(result.manifest, 'utf8'));
  assert.deepStrictEqual(manifest.source, { kind: 'animated-gif', path: path.join(root, 'source.gif'), sha256: sourceHash.toLowerCase() });
  assert.deepStrictEqual(manifest.frames, [{ filename: 'Ryu_FX_004.png', sourceOrdinal: 0, delayMs: 17 }, { filename: 'Ryu_FX_005.png', sourceOrdinal: 1, delayMs: 33 }]);
  assert.throws(() => planFrameSequenceExport(fs, [first], destination, { prefix: 'Ryu FX', start: 4, padding: 3 }), /already exists/);

  const psdDestination = path.join(root, 'psd-export'); fs.mkdirSync(psdDestination);
  const psd = planFrameSequenceExport(fs, [{ filename: first, sourceOrdinal: 7, role: 'composited-variant', label: 'Ryu + Beard', pages: [{ index: 1, name: 'Ryu' }, { index: 7, name: 'Beard' }] }], psdDestination, { prefix: 'Ryu Beard', source: { kind: 'photoshop-psd', path: path.join(root, 'Ryu.psd'), sha256: 'cd'.repeat(32), mode: 'base-with-overlays' } });
  executeFrameSequenceExport(fs, psd);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(psd.manifestTarget, 'utf8')).frames[0], { filename: 'Ryu_Beard_00000.png', sourceOrdinal: 7, label: 'Ryu + Beard', role: 'composited-variant', pages: [{ index: 1, name: 'Ryu' }, { index: 7, name: 'Beard' }] });

  const driftDestination = path.join(root, 'drift'); fs.mkdirSync(driftDestination);
  const drift = planFrameSequenceExport(fs, [first], driftDestination, { prefix: 'frame' });
  fs.writeFileSync(first, Buffer.from('changed-after-review'));
  assert.throws(() => executeFrameSequenceExport(fs, drift), /changed after review/);
  assert.deepStrictEqual(fs.readdirSync(driftDestination), [], 'source drift cannot leave a partial export');

  assert.throws(() => planFrameSequenceExport(fs, [], destination), /At least one/);
  assert.throws(() => planFrameSequenceExport(fs, [path.join(staging, 'missing.png')], destination), /missing/);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log('Standalone GIF/PSD PNG sequence exports are ordered, collision-safe, and drift-safe');
