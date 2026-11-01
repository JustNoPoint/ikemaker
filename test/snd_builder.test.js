'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function(request, parent, main) {
  if (request === 'vscode') return {};
  return originalLoad.call(this, request, parent, main);
};
const { buildSndManifest } = require('../src/snd_builder');
Module._load = originalLoad;

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-snd-builder-'));
  try {
    const manifestPath = path.join(root, 'build.txt'), output = path.join(root, 'built.snd');
    fs.writeFileSync(manifestPath, 'built.snd\r\n');
    fs.writeFileSync(output, 'OLD');
    let completed = 0, rolledBack = 0, spawned = 0, refreshed = 0;
    const notices = [];
    const api = {
      env: {}, UIKind: {}, Uri: { file: fsPath => ({ fsPath }) },
      workspace: { getConfiguration: () => ({ get: () => 'sndmaker.exe' }) },
      window: {
        async showWarningMessage() { throw new Error('confirm:false must not prompt twice'); },
        async showInformationMessage(message) { notices.push(message); }
      }
    };
    const result = await buildSndManifest(manifestPath, {
      api,
      confirm: false,
      hostCapabilities: () => ({ nativeBuilders: true }),
      resolveProjectTool: () => 'resolved-sndmaker.exe',
      mutationOptions: () => ({ label: 'test' }),
      beginExternalMutation: () => ({ complete() { completed++; }, rollback() { rolledBack++; } }),
      spawnSync(executable, args, options) {
        spawned++;
        assert.strictEqual(executable, 'resolved-sndmaker.exe');
        assert.strictEqual(options.cwd, root);
        assert.strictEqual(options.input, 'built.snd\r\n');
        return { status: 0 };
      },
      refresh: async builtOutput => { refreshed++; assert.strictEqual(builtOutput, output); }
    });
    assert.strictEqual(result.built, true);
    assert.strictEqual(result.output, output);
    assert.strictEqual(spawned, 1);
    assert.strictEqual(completed, 1);
    assert.strictEqual(rolledBack, 0);
    assert.strictEqual(refreshed, 1);
    assert(notices.some(message => /Built/.test(message)));
    console.log('Shared SND builder validates and executes one protected SndMaker route for viewer and compact intake');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
