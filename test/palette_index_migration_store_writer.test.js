'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { encodeIndexedPng, readIndexedPng } = require('../src/palette_indexed_png');
const sources = require('../src/palette_index_migration_sources');
const model = require('../src/palette_index_migration_model');
const { PaletteIndexMigrationStore } = require('../src/palette_index_migration_store');
const { writeStandaloneCopies, verifyReceipt, recoverStandaloneReceipt, prepareSffHandoff } = require('../src/palette_index_migration_writer');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-migration-'));
const png = path.join(root, 'source.png');
const colors = Array.from({ length: 256 }, (_, i) => [i, i, 255 - i, i === 0 ? 0 : 255]);
fs.writeFileSync(png, encodeIndexedPng({ width: 2, height: 2 }, Buffer.from([0, 1, 2, 1]), colors));
try {
  const authority = sources.pngFamily([png]);
  const plan = model.createPlan({ operationId: 'migration-1000', sourceAuthorityHash: authority.authorityHash, colors: authority.colors, usedSourceIndexes: authority.usedSourceIndexes, reclaimableSourceIndexes: [3, 4, 5] });
  const store = new PaletteIndexMigrationStore(root);
  const created = store.create(authority, plan);
  assert.strictEqual(created.head.revision, 1);
  const moved = model.move(created.plan, 1, 'right');
  const saved = store.append(plan.operationId, created.headByteHash, moved);
  assert.strictEqual(saved.head.revision, 2);
  assert.throws(() => store.append(plan.operationId, created.headByteHash, moved), /changed after review/);
  const restored = store.restore(plan.operationId, saved.headByteHash, 1);
  assert.strictEqual(restored.head.revision, 3);

  const hostileAuthority = JSON.parse(JSON.stringify(authority));
  hostileAuthority.colors[1] = [9, 9, 9, 9];
  const badRoot = path.join(root, 'bad-authority'); fs.mkdirSync(badRoot);
  assert.throws(() => new PaletteIndexMigrationStore(badRoot).create(hostileAuthority, model.createPlan({ operationId: 'migration-badauth', sourceAuthorityHash: authority.authorityHash, colors: authority.colors, usedSourceIndexes: [0, 1] })), /self-hash/);
  const hostilePlan = JSON.parse(JSON.stringify(restored.plan));
  hostilePlan.slots.find(slot => slot?.kind === 'source' && slot.sourceIndex === 1).rgba = [9, 9, 9, 9];
  assert.throws(() => writeStandaloneCopies({ authority, plan: hostilePlan, outputRoot: path.join(root, 'hostile-copy') }), /altered immutable/);
  assert.throws(() => prepareSffHandoff({ ...authority, kind: 'embedded-sff-palette-cluster' }, hostilePlan, path.join(root, 'hostile-handoff')), /altered immutable/);

  const out = path.join(root, 'copies');
  const before = fs.readFileSync(png);
  const result = writeStandaloneCopies({ authority, plan: restored.plan, outputRoot: out });
  assert(fs.existsSync(result.receiptFile));
  assert(fs.readFileSync(png).equals(before));
  const output = fs.readdirSync(out).find(name => /\.png$/i.test(name));
  const decoded = readIndexedPng(fs.readFileSync(path.join(out, output)));
  assert.strictEqual(decoded.indices[1], model.mapping(restored.plan).oldToNew[1]);
  assert.throws(() => writeStandaloneCopies({ authority, plan: restored.plan, outputRoot: out }), /empty/);
  const savedReceipt = JSON.parse(fs.readFileSync(result.receiptFile, 'utf8'));
  savedReceipt.outputs[0].byteHash = '0'.repeat(64);
  savedReceipt.receiptHash = model.semanticHash(Object.fromEntries(Object.entries(savedReceipt).filter(([key]) => key !== 'receiptHash')));
  fs.writeFileSync(result.receiptFile, `${JSON.stringify(savedReceipt, null, 2)}\n`);
  assert.throws(() => verifyReceipt(result.receiptFile), /output verification/);
  fs.writeFileSync(result.receiptFile, `${JSON.stringify(result.receipt, null, 2)}\n`);
  fs.unlinkSync(result.receiptFile);
  const recovered = recoverStandaloneReceipt({ authority, plan: restored.plan, outputRoot: out });
  assert.strictEqual(recovered.recovered, true);
  assert.strictEqual(verifyReceipt(recovered.receiptFile).receiptHash, recovered.receipt.receiptHash);

  const faultRoot = path.join(root, 'fault-copy');
  const originalRead = fs.readFileSync;
  fs.readFileSync = function (filename, ...args) {
    const value = originalRead.call(fs, filename, ...args);
    if (typeof filename === 'string' && path.dirname(path.resolve(filename)) === path.resolve(faultRoot) && /\.png$/i.test(filename)) return Buffer.from(value.subarray(0, value.length - 1));
    return value;
  };
  try { assert.throws(() => writeStandaloneCopies({ authority, plan: restored.plan, outputRoot: faultRoot }), error => error?.name === 'MigrationOutputRecoveryRequired' && error.committed === true); }
  finally { fs.readFileSync = originalRead; }
  assert(!fs.existsSync(path.join(faultRoot, 'palette-index-migration-receipt.json')), 'failed reopen may not claim success');
  assert.strictEqual(recoverStandaloneReceipt({ authority, plan: restored.plan, outputRoot: faultRoot }).recovered, true);

  const sameA = path.join(root, 'same-a'), sameB = path.join(root, 'same-b'); fs.mkdirSync(sameA); fs.mkdirSync(sameB);
  fs.copyFileSync(png, path.join(sameA, 'same.png')); fs.copyFileSync(png, path.join(sameB, 'same.png'));
  const duplicateAuthority = sources.pngFamily([path.join(sameA, 'same.png'), path.join(sameB, 'same.png')]);
  const duplicatePlan = model.createPlan({ operationId: 'migration-duplicate', sourceAuthorityHash: duplicateAuthority.authorityHash, colors: duplicateAuthority.colors, usedSourceIndexes: duplicateAuthority.usedSourceIndexes });
  assert.throws(() => writeStandaloneCopies({ authority: duplicateAuthority, plan: duplicatePlan, outputRoot: path.join(root, 'duplicate-output') }), /duplicate output basename/);

  const operation = store.load(plan.operationId);
  const sourceBytes = fs.readFileSync(operation.paths.source);
  const tamperedSource = JSON.parse(sourceBytes); tamperedSource.colors[2] = [1, 1, 1, 1];
  fs.writeFileSync(operation.paths.source, `${JSON.stringify(tamperedSource, null, 2)}\n`);
  assert.throws(() => store.load(plan.operationId), /self-hash/);
  fs.writeFileSync(operation.paths.source, sourceBytes);

  const headBytes = fs.readFileSync(operation.paths.head), archivedHeadPath = path.join(operation.paths.heads, '000003.json'), archivedHeadBytes = fs.readFileSync(archivedHeadPath);
  const badHead = JSON.parse(headBytes); badHead.parentHeadHash = 'f'.repeat(64);
  const badHeadBytes = Buffer.from(`${JSON.stringify(badHead, null, 2)}\n`);
  fs.writeFileSync(operation.paths.head, badHeadBytes); fs.writeFileSync(archivedHeadPath, badHeadBytes);
  assert.throws(() => store.load(plan.operationId), /HEAD parent chain/);
  fs.writeFileSync(operation.paths.head, headBytes); fs.writeFileSync(archivedHeadPath, archivedHeadBytes);

  const revisionPath = path.join(operation.paths.revisions, '000003.json'), revisionBytes = fs.readFileSync(revisionPath), badRevision = JSON.parse(revisionBytes);
  badRevision.parentRevisionHash = 'e'.repeat(64);
  const fixedHead = JSON.parse(headBytes); fixedHead.revisionHash = model.semanticHash(badRevision);
  const fixedHeadBytes = Buffer.from(`${JSON.stringify(fixedHead, null, 2)}\n`);
  fs.writeFileSync(revisionPath, `${JSON.stringify(badRevision, null, 2)}\n`); fs.writeFileSync(operation.paths.head, fixedHeadBytes); fs.writeFileSync(archivedHeadPath, fixedHeadBytes);
  assert.throws(() => store.load(plan.operationId), /revision parent chain/);
  fs.writeFileSync(revisionPath, revisionBytes); fs.writeFileSync(operation.paths.head, headBytes); fs.writeFileSync(archivedHeadPath, archivedHeadBytes);

  const linkedProject = path.join(root, 'linked-project'); fs.mkdirSync(path.join(linkedProject, '.ikemen-tools', 'palette-workspace', 'index-migrations'), { recursive: true });
  const linkedOperation = path.join(linkedProject, '.ikemen-tools', 'palette-workspace', 'index-migrations', plan.operationId);
  try { fs.symlinkSync(operation.paths.root, linkedOperation, process.platform === 'win32' ? 'junction' : 'dir'); assert.throws(() => new PaletteIndexMigrationStore(linkedProject).load(plan.operationId), /symbolic link|junction|unsafe/); }
  catch (error) { if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error; }

  const fake = { ...authority, kind: 'embedded-sff-palette-cluster', sff: { filename: png, physicalPaletteIndex: 0, group: 1, number: 1 }, sprites: [] };
  assert.throws(() => prepareSffHandoff(fake, restored.plan, path.join(root, 'handoff')), /evidence changed|Unrecognized SFF|self-hash/);
} finally { fs.rmSync(root, { recursive: true, force: true }); }
console.log('Palette index migration CAS chain, authority tamper, undo, copy recovery, receipts, drift, and fail-closed tests passed');
