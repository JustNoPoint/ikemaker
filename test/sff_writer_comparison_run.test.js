'use strict';

const assert = require('assert');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');
const runner = require('../src/sff_writer_comparison_run');

const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-writer-run-test-'));
(async () => { try {
  const character = path.join(root, 'chars', 'Ryu'); fs.mkdirSync(character, { recursive: true });
  const executable = path.join(root, 'Ikemen_GO.exe'); fs.writeFileSync(executable, 'test executable');
  const originalSff = path.join(character, 'Ryu.sff'), originalDef = path.join(character, 'Ryu.def');
  const originalSffBytes = Buffer.from('ORIGINAL-SFF'), originalDefText = '[Info]\r\nname = Ryu\r\n[Files]\r\nsprite = Ryu.sff ; normal archive\r\nanim = Ryu.air\r\n';
  fs.writeFileSync(originalSff, originalSffBytes); fs.writeFileSync(originalDef, originalDefText);
  const output = path.join(root, 'comparison'); fs.mkdirSync(output);
  const builtIn = path.join(output, 'Ryu-IKEMaker-test.sff'), sprMake2 = path.join(output, 'Ryu-SprMake2-test.sff');
  const builtInBytes = Buffer.from('IKEMAKER-CANDIDATE'), sprMake2Bytes = Buffer.from('SPRMAKE2-CANDIDATE');
  fs.writeFileSync(builtIn, builtInBytes); fs.writeFileSync(sprMake2, sprMake2Bytes);
  const input = { targetSff: originalSff, targetHash: digest(originalSffBytes), builtInPath: builtIn, builtInHash: digest(builtInBytes), builtInSize: builtInBytes.length, sprMake2Path: sprMake2, sprMake2Hash: digest(sprMake2Bytes), sprMake2Size: sprMake2Bytes.length };
  const prepared = runner.prepare(input);
  assert.deepStrictEqual(fs.readFileSync(originalSff), originalSffBytes, 'the normal SFF is never replaced');
  assert.strictEqual(fs.readFileSync(originalDef, 'utf8'), originalDefText, 'the normal DEF is never rewritten');
  assert.match(fs.readFileSync(prepared.p1Def, 'utf8'), /sprite = \.ikemaker-writer-test-.+-p1-ikemaker\.sff ; normal archive/);
  assert.match(fs.readFileSync(prepared.p2Def, 'utf8'), /sprite = \.ikemaker-writer-test-.+-p2-sprmake2\.sff ; normal archive/);
  assert(fs.readFileSync(prepared.p1Def, 'utf8').includes('\r\n'), 'the alias preserves CRLF style');
  const child = new EventEmitter(); child.pid = 424242;
  let spawned;
  const launching = runner.launch(prepared, { gameRoot: root, executable, stage: 'stages/test.def' }, { spawn(file, args, options) { spawned = { file, args, options }; return child; } });
  child.emit('spawn'); const launched = await launching;
  assert.strictEqual(launched.pid, 424242);
  assert.strictEqual(spawned.file, executable);
  assert.strictEqual(spawned.args[0], '-loadmotif', 'the direct comparison run loads the configured motif before entering the match');
  assert.deepStrictEqual(spawned.args.slice(-4), ['-p1', path.relative(root, prepared.p1Def).split(path.sep).join('/'), '-p2', path.relative(root, prepared.p2Def).split(path.sep).join('/')]);
  assert(spawned.args.includes('1') && spawned.args.includes('stages/test.def'), 'the comparison uses one explicit round and selected stage');
  child.emit('exit', 0);
  for (const record of prepared.files) assert.strictEqual(fs.existsSync(record.path), false, 'owned comparison files clean on process exit');
  assert.strictEqual(fs.existsSync(launched.receiptPath), false, 'cleanup receipt is removed after exact cleanup');
  assert.deepStrictEqual(fs.readFileSync(originalSff), originalSffBytes);
  assert.strictEqual(fs.readFileSync(originalDef, 'utf8'), originalDefText);

  fs.writeFileSync(path.join(character, 'Alternate.def'), originalDefText.replace('name = Ryu', 'name = Alternate'));
  assert.throws(() => runner.resolveOwnerDef(originalSff), /More than one sibling character DEF/);
  fs.unlinkSync(path.join(character, 'Alternate.def'));
  assert.throws(() => runner.prepare({ ...input, builtInSize: builtInBytes.length + 1 }), /no longer matches its report/);
  assert.throws(() => runner.prepare({ ...input, targetHash: '0'.repeat(64) }), /active character SFF changed/);

  const failed = runner.prepare(input), beforeFailure = failed.files.map(record => record.path);
  await assert.rejects(() => runner.launch(failed, { gameRoot: root, executable, stage: 'stages/test.def' }, { spawn() { throw new Error('spawn failed'); } }), /spawn failed/);
  for (const filename of beforeFailure) assert.strictEqual(fs.existsSync(filename), false, 'sync launch failure cleans only owned temporary files');
  assert.deepStrictEqual(fs.readFileSync(originalSff), originalSffBytes);
  assert.strictEqual(fs.readFileSync(originalDef, 'utf8'), originalDefText);
  const asyncFailed = runner.prepare(input), asyncChild = new EventEmitter(); asyncChild.pid = 424243;
  const asyncLaunch = runner.launch(asyncFailed, { gameRoot: root, executable, stage: 'stages/test.def' }, { spawn() { queueMicrotask(() => asyncChild.emit('error', new Error('async spawn failed'))); return asyncChild; } });
  await assert.rejects(() => asyncLaunch, /async spawn failed/);
  for (const record of asyncFailed.files) assert.strictEqual(fs.existsSync(record.path), false, 'async spawn failure cleans owned files without leaving a receipt');
  assert.deepStrictEqual(fs.readFileSync(originalSff), originalSffBytes);
  assert.strictEqual(fs.readFileSync(originalDef, 'utf8'), originalDefText);

  const early = runner.prepare(input), earlyChild = new EventEmitter(); earlyChild.pid = 424244;
  const earlyLaunch = runner.launch(early, { gameRoot: root, executable, stage: 'stages/test.def' }, { spawn() { queueMicrotask(() => earlyChild.emit('exit', 1)); return earlyChild; } });
  await assert.rejects(() => earlyLaunch, /exited before the comparison run started/);
  for (const record of early.files) assert.strictEqual(fs.existsSync(record.path), false, 'exit before spawn admission cleans owned files');

  const ken = path.join(root, 'chars', 'Ken'); fs.mkdirSync(ken); const kenSff = path.join(ken, 'Ken.sff'), kenDef = path.join(ken, 'Ken.def');
  fs.writeFileSync(kenSff, originalSffBytes); fs.writeFileSync(kenDef, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(originalDefText.replaceAll('Ryu', 'Ken'))]));
  const kenPrepared = runner.prepare({ ...input, targetSff: kenSff, targetHash: digest(originalSffBytes) });
  assert.deepStrictEqual(fs.readFileSync(kenPrepared.p1Def).subarray(0, 3), Buffer.from([0xef, 0xbb, 0xbf]), 'UTF-8 BOM is preserved in aliases');
  runner.cleanupPrepared(kenPrepared);
  console.log('SFF writer comparison run uses isolated P1/P2 aliases and leaves the normal DEF/SFF byte-exact');
} finally { fs.rmSync(root, { recursive: true, force: true }); } })().catch(error => { console.error(error); process.exitCode = 1; });
