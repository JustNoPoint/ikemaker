'use strict';

const assert = require('assert');
const { template, validate, fxDefText, prefixedValue, setEvent, contractAudit, sndMakerText } = require('../src/sound_profile');

const profile = template('Ryu');
profile.events = [{ group: 200, index: 0, role: 'voice', name: 'Standing light punch voice 1' }];
assert.strictEqual(profile.archives[0].prefix, 'RYUFX');
assert.deepStrictEqual(validate(profile).errors, []);
assert(fxDefText(profile.archives[1]).includes('prefix = RYUEN'));
assert(fxDefText(profile.archives[1]).includes('snd = Ryu_en.snd'));
assert.strictEqual(prefixedValue('RYUEN', 200, 0), 'RYUEN200, 0');
setEvent(profile, 201, 0, { name: 'Hadouken voice', role: 'voice' });
assert.strictEqual(profile.events.find((item) => item.group === 201).name, 'Hadouken voice');
const bad = JSON.parse(JSON.stringify(profile)); bad.archives[1].prefix = 'F'; bad.archives[2].prefix = 'RYUFX';
const badResult = validate(bad); assert(badResult.errors.some((item) => item.includes('reserved prefix F'))); assert(badResult.errors.some((item) => item.includes('Prefix RYUFX')));
const audit = contractAudit(profile, [{ definition: profile.archives[1], archive: { filename: 'en.snd', entries: [] } }]);
assert(audit.some((item) => item.includes('missing voice event 200,0')));
const mismatch = contractAudit(profile, [
  { definition: profile.archives[1], archive: { filename: 'en.snd', entries: [{ identity: '200,0', duplicateOf: null }] } },
  { definition: profile.archives[2], archive: { filename: 'custom.snd', entries: [] } }
]);
assert(mismatch.some((item) => item.includes('missing 200,0 required by default voice archive en')));
assert.strictEqual(sndMakerText('out.snd', [{ source: 'a.wav', group: 2, index: 3 }]), 'out.snd\r\na.wav\r\n2\r\n3\r\n');
console.log('Sound profile tests passed');
