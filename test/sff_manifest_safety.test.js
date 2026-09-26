'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return {
    Uri: { file: (fsPath) => ({ fsPath }) },
    workspace: { getConfiguration: () => ({ get: (_name, fallback) => fallback }) }
  };
  return originalLoad.call(this, request, parent, main);
};
const { readManifest, writeManifest } = require('../src/sff_commands');
Module._load = originalLoad;

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemen-sff-manifest-safety-'));
try {
  fs.writeFileSync(path.join(root, 'Ikemen_GO.exe'), '');
  const manifest = path.join(root, 'sprites.csv');
  fs.writeFileSync(manifest, 'Group,Index,AxisX,AxisY\n0,0,0,0\n', 'utf8');

  const staleRows = readManifest(manifest);
  staleRows[0].AxisX = '4';
  fs.writeFileSync(manifest, 'Group,Index,AxisX,AxisY\n0,0,9,0\n', 'utf8');
  assert.throws(() => writeManifest(manifest, staleRows, 'test-stale-manifest'), /changed after it was loaded/);
  assert.match(fs.readFileSync(manifest, 'utf8'), /0,0,9,0/);

  const currentRows = readManifest(manifest);
  currentRows[0].AxisY = '7';
  writeManifest(manifest, currentRows, 'test-safe-manifest');
  assert.match(fs.readFileSync(manifest, 'utf8'), /0,0,9,7/);
  assert.ok(!fs.existsSync(path.join(root, '.ikemen-tools', 'mutations.json')), 'Default saves must not create mutation metadata');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log('SFF manifest safety tests passed');
