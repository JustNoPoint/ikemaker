'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const original = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return { Uri: { file: fsPath => ({ fsPath }) }, workspace: { workspaceFolders: [], getConfiguration: () => ({ get: (_key, fallback) => fallback }) }, window: {}, commands: {}, env: {}, UIKind: { Web: 2 }, ProgressLocation: { Notification: 1 } };
  return original.call(this, request, parent, main);
};
const { runSprMake } = require('../src/sff_commands');
Module._load = original;

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-sprmake2-no-candidate-'));
  try {
    const noOutputScript = path.join(root, 'returns-success.js'), candidateOutputSff = path.join(root, 'missing.sff');
    fs.writeFileSync(noOutputScript, "process.stdout.write('manifest accepted but no archive written');\n", 'utf8');
    await assert.rejects(
      runSprMake({ sprmake: process.execPath, definitionPath: noOutputScript, outputDirectory: root, candidateOutputSff }),
      error => /reported success but produced no private candidate/.test(error.message) && /manifest accepted/.test(error.message)
    );
    const noisyScript = path.join(root, 'excessive-output.js'); fs.writeFileSync(noisyScript, "process.stdout.write('x'.repeat(4096)); setInterval(() => {}, 1000);\n", 'utf8');
    await assert.rejects(runSprMake({ sprmake: process.execPath, definitionPath: noisyScript, outputDirectory: root, candidateOutputSff }, { maxOutputBytes: 64, timeoutMs: 5000 }), /bounded 64-byte process log limit/);
    const slowScript = path.join(root, 'slow.js'); fs.writeFileSync(slowScript, "setInterval(() => {}, 1000);\n", 'utf8');
    await assert.rejects(runSprMake({ sprmake: process.execPath, definitionPath: slowScript, outputDirectory: root, candidateOutputSff }, { maxOutputBytes: 64, timeoutMs: 50 }), /bounded 50ms timeout/);
    const controller = new AbortController(), cancelled = runSprMake({ sprmake: process.execPath, definitionPath: slowScript, outputDirectory: root, candidateOutputSff }, { maxOutputBytes: 64, timeoutMs: 5000, signal: controller.signal }); controller.abort();
    await assert.rejects(cancelled, /execution was cancelled/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log('SprMake2 zero-exit missing-candidate failures are reported truthfully');
})().catch(error => { console.error(error); process.exitCode = 1; });
