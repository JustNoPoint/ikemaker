'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const original = Module._load;
Module._load = function(request, parent, main) { if (request === 'vscode') return {}; return original.call(this, request, parent, main); };
const { normalizedExtensions, collectCandidateFiles, browseChoices } = require('../src/open_target_picker');
Module._load = original;

assert.deepStrictEqual(normalizedExtensions({ Code: ['cns', '.txt'], More: ['TXT', 'zss'] }), ['cns', 'txt', 'zss']);
assert.strictEqual(browseChoices()[0].mode, 'folder');
assert.match(browseChoices()[0].label, /folder-opened/);
assert.strictEqual(browseChoices()[1].mode, 'file');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-open-picker-'));
try {
  fs.mkdirSync(path.join(root, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(root, 'readme.md'), '');
  fs.writeFileSync(path.join(root, 'nested', 'options.txt'), '[StateDef 200]');
  fs.writeFileSync(path.join(root, 'nested', 'states.cns'), '[Statedef 200]');
  assert.deepStrictEqual(collectCandidateFiles(root, { extensions: ['txt'], maxDepth: 2 }).map((filename) => path.basename(filename)), ['options.txt']);
  assert.strictEqual(collectCandidateFiles(root, { extensions: ['txt', 'cns'], maxDepth: 2 }).length, 2);
  assert.strictEqual(collectCandidateFiles(root, { extensions: [], maxDepth: 2 }).length, 3);
} finally { fs.rmSync(root, { recursive: true, force: true }); }
console.log('Open file/folder picker tests passed');
