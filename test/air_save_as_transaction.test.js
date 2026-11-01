'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patched(request, parent, main) { if (request === 'vscode') return {}; return originalLoad.call(this, request, parent, main); };
const { saveAirCopy } = require('../src/air_viewer');
Module._load = originalLoad;

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-air-save-as-'));
try {
  const target = path.join(root, 'Copy.air');
  const result = saveAirCopy(target, '[Begin Action 0]\n0,0,0,0,1\n', true, fs, { journal: false });
  assert.strictEqual(result.filename, target);
  assert.deepStrictEqual(fs.readFileSync(target), Buffer.from('\ufeff[Begin Action 0]\n0,0,0,0,1\n', 'utf8'), 'Save As preserves the exact open text and requested BOM in a new AIR');
  const original = fs.readFileSync(target);
  assert.throws(() => saveAirCopy(target, 'replacement', false, fs, { journal: false }), /does not replace an existing file/i);
  assert.deepStrictEqual(fs.readFileSync(target), original, 'Save As never replaces an existing destination');
  assert.throws(() => saveAirCopy(path.join(root, 'Wrong.txt'), 'text', false, fs, { journal: false }), /requires a \.air destination/i);
  assert.deepStrictEqual(fs.readdirSync(root), ['Copy.air'], 'a rejected extension creates no side file');
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', 'src', 'air_viewer.js'), 'utf8'), /fs\.(?:writeFileSync|renameSync|copyFileSync)\s*\(/, 'AIR Save As no longer escapes mutation safety');
  console.log('AIR Save As transaction preserves exact text/BOM and rejects overwrite or non-AIR destinations');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
