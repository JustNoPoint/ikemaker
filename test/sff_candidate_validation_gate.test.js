'use strict';

const assert = require('assert');
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');

const original = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return { Uri: { file: (fsPath) => ({ fsPath }) }, workspace: { workspaceFolders: [], getConfiguration: () => ({ get: (_key, fallback) => fallback }) }, window: {}, commands: {}, env: {}, UIKind: { Web: 2 }, ProgressLocation: { Notification: 1 } };
  return original.call(this, request, parent, main);
};
const { verifyCandidateArchive, validateExistingSprMake2Output } = require('../src/sff_commands');
Module._load = original;

let friendlyCalls = 0, strictCalls = 0;
const validators = {
  friendly: (_filename, mapping, palettes, options) => { friendlyCalls += 1; assert.strictEqual(mapping.length, 1); assert.strictEqual(palettes.length, 1); assert.strictEqual(options.sffVersion, '2.1'); return { ok: true }; },
  strict: (_filename, specification) => { strictCalls += 1; assert.strictEqual(specification.schema, 'ikemaker.sff-build-specification'); return { ok: true, profile: 'strict-test', evidence: 'structural-validation' }; }
};
const palette = { colors: Array.from({ length: 256 }, () => [0, 0, 0, 255]) };
const eligible = {
  mapping: [{ group: 1, index: 1 }], expectedPalettes: [palette],
  specification: { schema: 'ikemaker.sff-build-specification', sprites: [{ format: 'png8', compression: 'png8', colorDepth: 8, paletteId: '1,1' }], palettes: [palette] }
};
assert.deepStrictEqual(verifyCandidateArchive('candidate.sff', eligible, validators).strict, { status: 'passed', profile: 'strict-test', compatibilityProfile: 'sprmake2-v2.1', evidence: 'structural-validation', candidateByteHash: null, specificationHash: '' });
assert.strictEqual(friendlyCalls, 1);
assert.strictEqual(strictCalls, 1);

const unsupported = { ...eligible, specification: { ...eligible.specification, sprites: [{ ...eligible.specification.sprites[0], format: 'png24', compression: 'png24', colorDepth: 24 }] } };
const report = verifyCandidateArchive('candidate.sff', unsupported, validators);
assert.strictEqual(report.strict.status, 'not-applicable');
assert.strictEqual(friendlyCalls, 2, 'the permanent SprMake2 route retains friendly semantic validation');
assert.strictEqual(strictCalls, 1, 'unsupported profiles are not misrepresented as independently certified');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-existing-sff-validation-'));
const existing = path.join(root, 'external-output.sff'); fs.writeFileSync(existing, Buffer.from('sealed candidate bytes'));
const existingValidation = validateExistingSprMake2Output({ ...eligible, outputDirectory: root, specificationHash: 'a'.repeat(64) }, existing, validators);
assert.strictEqual(existingValidation.report.kind, 'ikemaker-existing-sprmake2-output-validation');
assert.strictEqual(existingValidation.report.candidate.identity, 'external-output.sff');
assert.strictEqual(existingValidation.report.validation.strict.status, 'passed');
assert.deepStrictEqual(existingValidation.report.adoption, { allowed: false, performed: false });
assert(fs.existsSync(existingValidation.reportPath), 'existing output validation writes an immutable report beside the reviewed package');
assert.strictEqual(fs.readFileSync(existing, 'utf8'), 'sealed candidate bytes', 'validation never mutates or adopts the chosen output');

console.log('SFF candidate validation requires both friendly and independent strict gates for the certified PNG8 profile');
