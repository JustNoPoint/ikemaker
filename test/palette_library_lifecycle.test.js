'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { hash } = require('../src/mutation_safety');
const lifecycle = require('../src/palette_library_lifecycle');
const { paletteLibraryFiles } = require('../src/palette_library');

function delegatedIo(overrides = {}) {
  return new Proxy(fs, { get(target, property) { return overrides[property] || target[property]; } });
}

function operationReceipts(root, kind) {
  const history = path.join(root, lifecycle.HISTORY);
  if (!fs.existsSync(history)) return [];
  return fs.readdirSync(history, { withFileTypes: true }).filter(item => item.isDirectory()).map(item => path.join(history, item.name, 'receipt.json')).filter(filename => fs.existsSync(filename)).map(filename => JSON.parse(fs.readFileSync(filename, 'utf8'))).filter(receipt => receipt.kind === kind);
}

function exerciseSourceDrift(kind, colors) {
  const raceRoot = fs.mkdtempSync(path.join(os.tmpdir(), `ikemaker-palette-${kind}-race-`));
  try {
    const saved = lifecycle.save({ root: raceRoot, name: 'Reviewed', bytes: colors, now: new Date('2026-10-22T21:00:00.000Z') });
    const expected = { byteHash: hash(colors), byteLength: colors.length };
    const manifestBefore = fs.readFileSync(path.join(raceRoot, lifecycle.MANIFEST));
    const changed = Buffer.concat([colors, Buffer.from([17])]);
    if (kind === 'duplicate') {
      let sourceReads = 0;
      const io = delegatedIo({
        readFileSync(filename, ...args) {
          if (path.resolve(filename) === path.resolve(saved.filename) && ++sourceReads === 2) fs.writeFileSync(saved.filename, changed);
          return fs.readFileSync(filename, ...args);
        }
      });
      assert.throws(() => lifecycle.duplicate({ root: raceRoot, source: saved.filename, name: 'Unsafe Copy', expected, io }), /changed while it was being duplicated/i);
      assert(!fs.existsSync(path.join(raceRoot, 'Unsafe Copy.act')), 'duplicate drift never publishes target bytes');
      assert.deepStrictEqual(fs.readFileSync(saved.filename), changed, 'duplicate preserves the simulated external source change');
    } else {
      let injected = false;
      const io = delegatedIo({
        renameSync(from, to) {
          if (!injected && path.resolve(from) === path.resolve(saved.filename)) {
            injected = true;
            fs.writeFileSync(from, changed);
          }
          fs.renameSync(from, to);
        }
      });
      const invoke = kind === 'rename'
        ? () => lifecycle.rename({ root: raceRoot, source: saved.filename, name: 'Unsafe Rename', expected, io })
        : () => lifecycle.remove({ root: raceRoot, source: saved.filename, expected, io });
      assert.throws(invoke, /changed while the reviewed rename\/delete was committing/i);
      assert(fs.existsSync(saved.filename), `${kind} drift restores the source path`);
      assert.deepStrictEqual(fs.readFileSync(saved.filename), changed, `${kind} rollback preserves the simulated external source change`);
      if (kind === 'rename') assert(!fs.existsSync(path.join(raceRoot, 'Unsafe Rename.act')), 'rename drift never leaves a published target');
    }
    assert.deepStrictEqual(fs.readFileSync(path.join(raceRoot, lifecycle.MANIFEST)), manifestBefore, `${kind} drift never commits manifest state`);
    assert(operationReceipts(raceRoot, kind).every(receipt => receipt.status !== 'committed'), `${kind} drift never records a committed receipt`);
  } finally {
    fs.rmSync(raceRoot, { recursive: true, force: true });
  }
}

function exerciseManifestDrift(colors) {
  const raceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-palette-manifest-race-'));
  try {
    const saved = lifecycle.save({ root: raceRoot, name: 'Reviewed', bytes: colors, now: new Date('2026-10-22T21:05:00.000Z') });
    const expected = { byteHash: hash(colors), byteLength: colors.length }, manifest = path.join(raceRoot, lifecycle.MANIFEST);
    const externalManifest = Buffer.from(`${JSON.stringify({ schema: lifecycle.SCHEMA, version: lifecycle.VERSION, entries: {}, external: true }, null, 2)}\n`);
    let manifestReads = 0;
    const io = delegatedIo({
      readFileSync(filename, ...args) {
        if (path.resolve(filename) === path.resolve(manifest) && ++manifestReads === 3) fs.writeFileSync(manifest, externalManifest);
        return fs.readFileSync(filename, ...args);
      }
    });
    assert.throws(() => lifecycle.rename({ root: raceRoot, source: saved.filename, name: 'Manifest Race', expected, io }), /changed after it was loaded and was not overwritten/i);
    assert(fs.existsSync(saved.filename), 'manifest CAS failure restores the reviewed source path');
    assert(!fs.existsSync(path.join(raceRoot, 'Manifest Race.act')), 'manifest CAS failure removes the uncommitted rename target');
    assert.deepStrictEqual(fs.readFileSync(manifest), externalManifest, 'manifest CAS failure preserves the external manifest bytes');
    assert(operationReceipts(raceRoot, 'rename').every(receipt => receipt.status !== 'committed'), 'manifest CAS failure never records a committed receipt');
  } finally {
    fs.rmSync(raceRoot, { recursive: true, force: true });
  }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-palette-library-'));
try {
  const colors = Buffer.alloc(768); for (let index = 0; index < colors.length; index += 1) colors[index] = index % 256;
  const saved = lifecycle.save({ root, name: 'Ryu Main', bytes: colors, metadata: { group: 1, number: 1 }, now: new Date('2026-10-22T20:00:00.000Z') });
  assert.strictEqual(path.basename(saved.filename), 'Ryu Main.act');
  assert.deepStrictEqual(fs.readFileSync(saved.filename), colors);
  let manifest = lifecycle.readManifest(root).document;
  assert.strictEqual(manifest.entries['Ryu Main.act'].displayName, 'Ryu Main');
  assert.strictEqual(manifest.entries['Ryu Main.act'].group, 1);
  assert(fs.existsSync(saved.receipt), 'save retains a human-readable recovery receipt');
  assert.deepStrictEqual(paletteLibraryFiles(root).map(filename => path.basename(filename)), ['Ryu Main.act'], 'internal recovery ACT files never leak into the browsable library');
  assert.throws(() => lifecycle.save({ root, name: 'Ryu Main', bytes: colors }), /already uses that name/i, 'save never overwrites implicitly');

  const expected = { byteHash: hash(colors), byteLength: colors.length };
  const copied = lifecycle.duplicate({ root, source: saved.filename, name: 'Ryu Alt', expected, now: new Date('2026-10-22T20:01:00.000Z') });
  assert.strictEqual(path.basename(copied.filename), 'Ryu Alt.act');
  assert.deepStrictEqual(fs.readFileSync(copied.filename), colors);
  const renamed = lifecycle.rename({ root, source: copied.filename, name: 'Ryu Alternate', expected, now: new Date('2026-10-22T20:02:00.000Z') });
  assert(!fs.existsSync(copied.filename));
  assert(fs.existsSync(renamed.filename));
  manifest = lifecycle.readManifest(root).document;
  assert(!manifest.entries['Ryu Alt.act'] && manifest.entries['Ryu Alternate.act'], 'rename updates the durable human-readable manifest');

  fs.appendFileSync(renamed.filename, Buffer.from([1]));
  assert.throws(() => lifecycle.remove({ root, source: renamed.filename, expected }), /changed after review/i, 'delete rejects stale source evidence');
  const fresh = { byteHash: hash(fs.readFileSync(renamed.filename)), byteLength: fs.statSync(renamed.filename).size };
  const removed = lifecycle.remove({ root, source: renamed.filename, expected: fresh, now: new Date('2026-10-22T20:03:00.000Z') });
  assert(!fs.existsSync(renamed.filename));
  const receipt = JSON.parse(fs.readFileSync(removed.receipt, 'utf8'));
  assert.strictEqual(receipt.status, 'committed');
  assert(receipt.recovery && fs.existsSync(path.join(root, receipt.recovery)), 'delete moves original bytes to a recoverable library-owned location');
  assert(!lifecycle.readManifest(root).document.entries['Ryu Alternate.act']);

  for (const kind of ['duplicate', 'rename', 'delete']) exerciseSourceDrift(kind, colors);
  exerciseManifestDrift(colors);

  for (const invalid of ['', '../outside', 'bad/name', 'CON', 'trailing.']) assert.throws(() => lifecycle.cleanName(invalid), /name/i);
  console.log('Palette Library save, duplicate, rename, confirmed-delete backend is exact, recoverable, and non-overwriting');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
