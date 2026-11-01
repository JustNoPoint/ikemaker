'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const originalLoad = Module._load;
let encodeCalls = 0;
Module._load = function(request, parent, main) {
  if (request === './sff_reader' && /air_action_sequence_export/.test(parent?.filename || '')) return {
    spritePng: (_archive, sprite, palette) => { encodeCalls += 1; return Buffer.from(`png:${sprite.index}:palette:${palette}`); },
    rgbaPng: () => Buffer.from('transparent-placeholder')
  };
  return originalLoad.call(this, request, parent, main);
};
const { readBoundedStableFile, planAirActionSequence, executeAirActionSequence } = require('../src/air_action_sequence_export');
Module._load = originalLoad;
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
let stats=0;const growingFs={openSync:()=>1,fstatSync:()=>stats++?{isFile:()=>true,size:5,mtimeMs:2,ino:1}:{isFile:()=>true,size:4,mtimeMs:1,ino:1},readSync:(_h,b)=>{Buffer.from('abcde').copy(b);return 5},closeSync(){}};
assert.throws(()=>readBoundedStableFile(growingFs,'x',10,'Growing source'),/changed while it was being admitted/,'post-stat growth is rejected without an unbounded read');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-air-sequence-'));
try {
  const airPath = path.join(root, 'Ryu.air'), sffPath = path.join(root, 'Ryu.sff'), destination = path.join(root, 'export');
  fs.writeFileSync(airPath, '[Begin Action 10]\n0,0,4,-3,2,H\n-1,0,0,0,1\n9,9,0,0,-1\n');
  fs.writeFileSync(sffPath, 'exact-sff');
  const action = { number: 10, line: 1, loopStart: 1, frames: [
    { group: 0, index: 0, x: 4, y: -3, rawTime: 2, flags: 'H' },
    { group: -1, index: 0, x: 0, y: 0, rawTime: 1, flags: '' },
    { group: 9, index: 9, x: 0, y: 0, rawTime: -1, flags: '' }
  ] };
  const archive = { sprites: [{ index: 7, group: 0, number: 0, colorDepth: 8, width: 64, height: 96 }] };
  const plan = planAirActionSequence(fs, { action, archive, destination, airPath, sffPath, airHash: sha(fs.readFileSync(airPath)), sffHash: sha(fs.readFileSync(sffPath)), paletteForGroup: () => 2 });
  assert.deepStrictEqual(plan.manifest.summary, { drawable: 1, blank: 1, missing: 1, ambiguous: 0, pngBytes: Buffer.byteLength('png:7:palette:2') + Buffer.byteLength('transparent-placeholder') * 2 });
  assert.deepStrictEqual(plan.manifest.frames.map(frame => frame.status), ['sprite', 'blank', 'missing-sprite']);
  assert.strictEqual(plan.manifest.action.loopStartElement, 1);
  assert.deepStrictEqual({ x: plan.manifest.frames[0].x, y: plan.manifest.frames[0].y, rawTicks: plan.manifest.frames[0].rawTicks, flags: plan.manifest.frames[0].flags, paletteIndex: plan.manifest.frames[0].paletteIndex }, { x: 4, y: -3, rawTicks: 2, flags: 'H', paletteIndex: 2 });
  const result = executeAirActionSequence(fs, plan);
  assert.strictEqual(result.files, 4);
  assert.strictEqual(fs.readdirSync(destination).filter(name => name.endsWith('.png')).length, 3, 'every AIR element retains an ordered PNG slot');
  assert.strictEqual(JSON.parse(fs.readFileSync(result.manifest, 'utf8')).source.sffSha256, sha(fs.readFileSync(sffPath)));

  const duplicate = planAirActionSequence(fs, { action: { ...action, frames: [action.frames[0]] }, archive: { sprites: [archive.sprites[0], { ...archive.sprites[0], index: 8 }] }, destination: path.join(root, 'duplicate'), airPath, sffPath, airHash: sha(fs.readFileSync(airPath)), sffHash: sha(fs.readFileSync(sffPath)), paletteForGroup: () => 2 });
  assert.strictEqual(duplicate.manifest.frames[0].status, 'ambiguous-sprite');
  assert.deepStrictEqual(duplicate.manifest.frames[0].candidatePhysicalIndices, [7, 8]);
  const beforeHuge = encodeCalls;
  assert.throws(() => planAirActionSequence(fs, { action: { ...action, frames: [action.frames[0]] }, archive: { sprites: [{ ...archive.sprites[0], width: 100000, height: 100000 }] }, destination: path.join(root, 'huge'), airPath, sffPath, airHash: sha(fs.readFileSync(airPath)), sffHash: sha(fs.readFileSync(sffPath)), paletteForGroup: () => 2 }), /16-megapixel/);
  assert.strictEqual(encodeCalls, beforeHuge, 'oversized sprites are rejected before PNG decoding or encoding');

  const staleDestination = path.join(root, 'stale'), stale = planAirActionSequence(fs, { action, archive, destination: staleDestination, airPath, sffPath, airHash: sha(fs.readFileSync(airPath)), sffHash: sha(fs.readFileSync(sffPath)), paletteForGroup: () => 2 });
  fs.appendFileSync(airPath, '; drift\n');
  assert.throws(() => executeAirActionSequence(fs, stale), /AIR source changed after review/);
  assert.strictEqual(fs.existsSync(staleDestination), false, 'stale review writes no partial output');
} finally { fs.rmSync(root, { recursive: true, force: true }); }

console.log('AIR Action PNG sequence export preserves authored timing/provenance and fails closed on drift');
