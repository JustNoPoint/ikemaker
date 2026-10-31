'use strict';

const assert = require('assert');
const { controllerBlocks, analyzeSoundLifecycle } = require('../src/zss_sound_lifecycle');
const { analyzeZss } = require('../src/analyzer');

const source = `[StateDef 200]\nplaySnd{value: S1,0; loop: 1}\nplaySnd{value: S1,1; loop: 1; channel: -1}\nplaySnd{value: S1,2; loop: 1; channel: 3}\nplaySnd{value: S1,3; loop: 1; loopCount: 2}\nplaySnd{value: S1,4; loop: 1; loopCount: map(LoopCount)}\nstopSnd{channel: -1}\nstopSnd{channel: -2}\nstopSnd{channel: map(Channel)}\nmodifySnd{position: 200}\nmodifySnd{channel: -1; position: 300}\nmodifySnd{channel: 4; position: 400}\nmodifySnd{channel: map(Channel); position: 500}\nmodifySnd{channel: -1; volumeScale: 50}\n# stopSnd{channel: -1}\nlet note = "playSnd{loop: 1}";`;
const blocks = controllerBlocks(source);
assert.strictEqual(blocks.length, 13, 'only real controller blocks survive strings and comments');
const findings = analyzeSoundLifecycle(source);
assert.deepStrictEqual(findings.map(item => item.code), [
  'playsnd-loop-auto-channel', 'playsnd-loop-auto-channel', 'stopsnd-global-channel',
  'modifysnd-auto-position', 'modifysnd-auto-position'
]);
assert(findings.every(item => item.help && item.length > 0), 'each sound finding is explainable and field-targeted');
assert.deepStrictEqual(analyzeZss(source).issues.filter(item => /snd|playsnd/i.test(item.code)).map(item => item.code), findings.map(item => item.code), 'the native analyzer publishes the sound lifecycle findings');

const dynamic = `playSnd{loop: map(Loop); channel: -1}\nplaySnd{loop: 1; channel: map(Channel)}\nstopSnd{channel: const(Channel)}\nmodifySnd{channel: var(0); position: 20}`;
assert.deepStrictEqual(analyzeSoundLifecycle(dynamic), [], 'dynamic expressions remain silent because ownership and lifecycle cannot be proven');
console.log('Literal ZSS sound-channel lifecycle diagnostic tests passed');
