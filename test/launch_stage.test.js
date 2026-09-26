'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os');
const { chooseLaunchStage } = require('../src/launch_stage');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-launch-stage-'));
fs.mkdirSync(path.join(root, 'stages'));fs.writeFileSync(path.join(root, 'stages', 'local.def'), '[Info]\nname = Local');
(async () => {
  assert.strictEqual(await chooseLaunchStage(root, 'stages/local.def', () => { throw Error('Existing stage must not prompt'); }), 'stages/local.def');
  assert.strictEqual(await chooseLaunchStage(root, 'stages/stage0.def', async choices => {
    assert.deepStrictEqual(choices.map(c => c.stage), ['stages/local.def']); return choices[0];
  }), 'stages/local.def');
  assert.strictEqual(await chooseLaunchStage(root, 'stages/missing.def', async () => undefined), null);
  assert.strictEqual(fs.readdirSync(path.join(root, 'stages')).length, 1);
  console.log('Game-local launch stage selection tests passed');
})().catch(error => { console.error(error); process.exitCode=1; }).finally(() => {
  fs.unlinkSync(path.join(root,'stages','local.def'));fs.rmdirSync(path.join(root,'stages'));fs.rmdirSync(root);
});
