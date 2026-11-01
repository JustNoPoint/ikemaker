'use strict';

const assert = require('assert');
const {
  SCHEMA, VERSION, MAX_ARTIFACT_BYTES, decodePresetArtifact, encodePresetArtifact,
  importReview, defaultKeepBothLabel, buildImportPlan
} = require('../src/command_preset_transfer');

const stable = { target: { channel: 'stable' }, enabledCapabilities: [] };
const nightly = { target: { channel: 'nightly' }, enabledCapabilities: ['command.nightly-expressions'] };
const text = '[Command]\r\nname = "fireball"\r\ncommand = D, DF, F, x\r\n';
const original = [{ id: 'custom:one', label: 'Fireball', text }];
const bytes = encodePresetArtifact(original);
const json = JSON.parse(bytes.toString('utf8'));
assert.deepStrictEqual(Object.keys(json), ['schema', 'version', 'presets']);
assert.strictEqual(json.schema, SCHEMA); assert.strictEqual(json.version, VERSION);
assert.deepStrictEqual(json.presets, [{ label: 'Fireball', text }], 'exports strip internal IDs and preserve exact authored text');
const decoded = decodePresetArtifact(bytes, stable);
assert.strictEqual(decoded[0].text, text); assert.strictEqual(decoded[0].definitionCount, 1); assert.strictEqual(decoded[0].compatibility.status, 'available');

const broad = Buffer.from(JSON.stringify({ schema: SCHEMA, version: VERSION, presets: [{ label: 'Nightly broad direction', text: '[Command]\nname="broad"\ncommand=*F, x' }] }));
assert.strictEqual(decodePresetArtifact(broad, stable)[0].compatibility.status, 'unavailable', 'unsupported Nightly syntax may be safely stored but is marked unavailable');
assert.strictEqual(decodePresetArtifact(broad, nightly)[0].compatibility.status, 'available', 'compatibility is recomputed from the current exact target');

for (const [artifact, pattern] of [
  [Buffer.from('{"schema":"ikemaker.command-presets","schema":"ikemaker.command-presets","version":1,"presets":[]}'), /strict JSON/],
  [Buffer.from(JSON.stringify({ schema: SCHEMA, version: VERSION, presets: [{ label: 'Bad', text: '[Command]\nname="x"\ncommand=$*F' }] })), /structurally valid/],
  [Buffer.from(JSON.stringify({ schema: SCHEMA, version: VERSION, presets: [{ label: 'Incomplete', text: '[Command]\nname="x"' }] })), /both a name and a command/],
  [Buffer.alloc(MAX_ARTIFACT_BYTES + 1), /1024 KiB/]
]) assert.throws(() => decodePresetArtifact(artifact, stable), pattern);

const candidates = decodePresetArtifact(Buffer.from(JSON.stringify({ schema: SCHEMA, version: VERSION, presets: [
  { label: 'fireball', text: '[Command]\nname="new_fireball"\ncommand=y' },
  { label: 'Uppercut', text: '[Command]\nname="uppercut"\ncommand=F,D,DF,x' }
] })), stable);
const review = importReview(candidates, original);
assert.strictEqual(review[0].collision, true); assert.strictEqual(review[1].collision, false);
const renamed = defaultKeepBothLabel('Fireball', new Set(['fireball', 'fireball (imported)']));
assert.strictEqual(renamed, 'Fireball (imported 2)');
const replaced = buildImportPlan(candidates, original, [0, 1], { 0: { action: 'replace' } });
assert.strictEqual(replaced.presets[0].id, 'custom:one', 'replace retains the existing internal identity');
assert.deepStrictEqual(replaced.presets.map(item => item.label), ['fireball', 'Uppercut']);
assert.notStrictEqual(replaced.presets[1].id, replaced.presets[0].id, 'bulk additions receive collision-safe IDs');
const kept = buildImportPlan(candidates, original, [0], { 0: { action: 'keep-both', label: 'Fireball imported' } });
assert.deepStrictEqual(kept.presets.map(item => item.label), ['Fireball', 'Fireball imported']);
assert.throws(() => buildImportPlan(candidates, original, [0], {}), /Choose how/);

console.log('Strict .inp2 command preset transfer tests passed');
