'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return { env: {}, window: {}, workspace: {} };
  return originalLoad.call(this, request, parent, isMain);
};
const { INSTALLED_UPDATE_MANIFEST, updateTemplate, updateFileEntries, createUpdaterArtifacts } = require('../src/release_builder');
Module._load = originalLoad;

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-release-updater-'));
  const publicRoot = path.join(root, 'HDBZ-Public.__building__'), destination = path.join(root, 'HDBZ-Public');
  try {
    fs.mkdirSync(path.join(publicRoot, 'data'), { recursive: true });
    fs.mkdirSync(path.join(publicRoot, 'save'), { recursive: true });
    fs.writeFileSync(path.join(publicRoot, 'HDBZ.exe'), 'engine');
    fs.writeFileSync(path.join(publicRoot, 'data', 'system.def'), '[Info]\n');
    fs.writeFileSync(path.join(publicRoot, 'save', 'config.ini'), '[Options]\n');
    const updater = updateTemplate({ enabled: true, productId: 'hdbz', displayName: 'HDBZ', version: '6.2.0', channel: 'testing', manifestUrl: 'https://updates.example.com/hdbz/update-manifest.json', createFullZip: true });
    const entries = await updateFileEntries(publicRoot, updater);
    assert.strictEqual(entries.find((entry) => entry.path === 'HDBZ.exe').ownership, 'managed');
    assert.strictEqual(entries.find((entry) => entry.path === 'save/config.ini').ownership, 'preserve');
    const result = await createUpdaterArtifacts(root, publicRoot, destination, { updater });
    assert(fs.existsSync(path.join(publicRoot, INSTALLED_UPDATE_MANIFEST)));
    assert(fs.existsSync(result.manifest));
    assert(result.package && fs.existsSync(path.join(result.artifactRoot, result.package.filename)));
    assert(fs.existsSync(path.join(result.artifactRoot, 'SHA256SUMS.txt')));
    const feed = JSON.parse(fs.readFileSync(result.manifest, 'utf8'));
    assert.strictEqual(feed.version, '6.2.0');
    assert.strictEqual(feed.package.sha256.length, 64);
    assert.strictEqual(feed.ownershipPolicy.unknownFiles, 'preserve');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log('Release updater artifact tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });

