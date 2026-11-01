'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readSff } = require('../src/sff_reader');
const { readIndexedPng8 } = require('../src/sff_png8_source');
const { decodePng } = require('../src/palette_index_organizer_model');
const { generate } = require('../tools/generate_sff_runtime_certification_fixtures');
const { REQUIRED_CHECKS, validateCertificationLedger, validateCertificationEvidence } = require('../src/sff_runtime_certification');
const { requireSffBackend } = require('../src/sff_backend_registry');

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-sff-runtime-certification-'));
try {
  const result = generate(path.join(root, 'fixtures'));
  assert.strictEqual(result.manifest.adoptionAllowed, false);
  assert.strictEqual(result.manifest.version, 4);
  assert.strictEqual(result.manifest.backendId, 'ikemaker-builtin-sff-v21-png8-prerelease');
  assert.strictEqual(result.manifest.fixtures.length, 10);
  assert(fs.existsSync(result.ledgerPath));
  assert(fs.existsSync(result.instructionsPath));
  assert.strictEqual(result.ledger.adoptionAllowed, false);
  assert.deepStrictEqual(result.ledger.gatePolicy.requiredPlatforms, ['windows-x64', 'linux-x64']);
  assert(result.ledger.platforms.every(platform => platform.fixtures.length === result.manifest.fixtures.length));
  assert(result.manifest.manualChecks.some(item => /IKEMEN build/.test(item)));
  for (const fixture of result.manifest.fixtures) {
    const filename = path.join(result.root, fixture.filename), bytes = fs.readFileSync(filename), archive = readSff(filename);
    assert.strictEqual(sha256(bytes), fixture.byteHash);
    assert.strictEqual(archive.sprites.length, fixture.sprites.length);
    assert.strictEqual(archive.palettes.length, fixture.palettes.length);
    const specificationBytes = fs.readFileSync(path.join(result.root, ...fixture.specification.filename.split('/'))), validationBytes = fs.readFileSync(path.join(result.root, ...fixture.strictValidation.filename.split('/')));
    assert.strictEqual(sha256(specificationBytes), fixture.specification.byteHash);
    assert.strictEqual(sha256(validationBytes), fixture.strictValidation.byteHash);
    assert.strictEqual(JSON.parse(specificationBytes).specificationHash, fixture.specificationHash);
    assert.strictEqual(JSON.parse(validationBytes).ok, true);
    for (const sprite of fixture.sprites) {
      const expectedPng = fs.readFileSync(path.join(result.root, ...sprite.expectedPng.split('/')));
      assert.strictEqual(sha256(expectedPng), sprite.expectedPngByteHash);
      assert.match(sprite.sourcePngByteHash, /^[0-9a-f]{64}$/);
      if (sprite.format === 'png24' || sprite.format === 'png32') {
        const decoded = decodePng(expectedPng), pixels = sprite.format === 'png32' ? decoded.rgba : Buffer.from(decoded.rgba.filter((_, index) => index % 4 !== 3));
        assert.strictEqual(sha256(pixels), sprite.expectedDecodedHash);
      } else {
        const decoded = readIndexedPng8(expectedPng); assert.strictEqual(decoded.decodedHash, sprite.expectedDecodedIndexHash); assert.match(sprite.expectedPaletteRgbaHash, /^[0-9a-f]{64}$/);
      }
    }
    for (const palette of fixture.palettes) assert.match(palette.expectedRgbaHash, /^[0-9a-f]{64}$/);
  }
  const empty = result.manifest.fixtures.find(item => item.id === 'empty-built-in-only');
  assert(empty, 'the runtime corpus includes the deterministic empty archive');
  assert.strictEqual(empty.builtInOnly, true);
  assert.strictEqual(empty.byteLength, 64);
  assert.deepStrictEqual(empty.sprites, []);
  assert.deepStrictEqual(empty.palettes, []);
  const afterAxis = result.manifest.fixtures.find(item => item.id === 'prepared-after-axis');
  assert(afterAxis, 'the runtime corpus includes the sealed after-axis crop');
  assert.deepStrictEqual(afterAxis.sprites.map(item => [item.axisX, item.axisY, item.width, item.height]), [[100, -100, 3, 2]]);
  const repeated = result.manifest.fixtures.find(item => item.id === 'repeated-identity-built-in-only');
  assert.strictEqual(repeated.builtInOnly, true);
  assert.deepStrictEqual(repeated.sprites.map(item => `${item.group},${item.number}`), ['3,7', '3,7']);
  const trueColor = result.manifest.fixtures.find(item => item.id === 'truecolor-rgb24-rgba32');
  assert.deepStrictEqual(trueColor.sprites.map(item => [item.format, item.colorDepth, item.link]), [['png24', 24, null], ['png32', 32, null], ['png32', 32, 1]]);
  const stored = result.manifest.fixtures.find(item => item.id === 'stored-palette-overrides-png');
  assert(stored && !stored.builtInOnly, 'the runtime corpus includes the physically SprMake2-compared stored-palette override');
  assert.notStrictEqual(stored.sprites[0].sourcePngByteHash, stored.sprites[0].expectedPngByteHash, 'the sealed expected render must apply the assigned stored table instead of preserving misleading PNG display colors');
  const storedExpected = readIndexedPng8(fs.readFileSync(path.join(result.root, ...stored.sprites[0].expectedPng.split('/'))));
  assert.strictEqual(sha256(Buffer.from(storedExpected.colors.flat())), stored.sprites[0].expectedPaletteRgbaHash);
  const compound = result.manifest.fixtures.find(item => item.id === 'own-image-palettes-multihop-alpha');
  assert(compound, 'the runtime corpus includes own-image palettes, multihop links, noncanonical filters and partial alpha');
  assert.strictEqual(compound.builtInOnly, true, 'the partial-alpha fixture must not imply SprMake2 parity that the trusted backend cannot preserve');
  assert.deepStrictEqual(compound.sprites.map(item => `${item.group},${item.number}`), ['40,9', '3,700', '60000,2']);
  assert.deepStrictEqual(compound.sprites.map(item => item.link), [null, 0, 1]);
  assert.deepStrictEqual(compound.palettes.map(item => item.link), [null, 0, 1]);
  const compoundPng = readIndexedPng8(fs.readFileSync(path.join(result.root, ...compound.sprites[0].expectedPng.split('/'))));
  assert.deepStrictEqual([compoundPng.colors[1][3], compoundPng.colors[2][3], compoundPng.colors[3][3]], [48, 96, 144]);
  const compoundSpecification = JSON.parse(fs.readFileSync(path.join(result.root, ...compound.specification.filename.split('/')), 'utf8'));
  assert.deepStrictEqual(compoundSpecification.sprites[0].source.provenance.filters, [0, 1, 2, 3, 4]);
  assert.strictEqual(compoundSpecification.sprites[0].source.provenance.splitIdat, true);
  assert.strictEqual(compoundSpecification.sprites[0].source.provenance.partialTransparency, true);
  const repeat = generate(path.join(root, 'repeat'));
  assert.deepStrictEqual(repeat.manifest.fixtures, result.manifest.fixtures);
  assert.deepStrictEqual(repeat.ledger, result.ledger);
  const manifestBytes = fs.readFileSync(result.manifestPath), pending = validateCertificationLedger(result.manifest, manifestBytes, result.ledger);
  assert.strictEqual(pending.valid, true);
  assert.strictEqual(pending.physicalGateSatisfied, false);
  assert.strictEqual(pending.adoptionAllowed, false);
  const completed = JSON.parse(JSON.stringify(result.ledger));
  const evidenceArtifacts = {};
  for (const platform of completed.platforms.filter(item => item.required)) {
    platform.tester = 'physical tester'; platform.testedAt = '2026-10-08T12:00:00.000Z'; platform.osVersion = `${platform.platformId} test host`; platform.ikemenBuild = 'nightly-test-build';
    for (const fixture of platform.fixtures) for (const check of REQUIRED_CHECKS) { const evidenceBytes = Buffer.from(`${platform.platformId}:${fixture.fixtureId}:${check}`), id = `${platform.platformId}/${fixture.fixtureId}/${check}.png`; fixture.checks[check] = 'pass'; fixture.checkEvidence[check] = [{ id, sha256: sha256(evidenceBytes), description: `Captured physical ${check} evidence.` }]; evidenceArtifacts[id] = evidenceBytes.toString('base64'); }
  }
  const passed = validateCertificationLedger(result.manifest, manifestBytes, completed);
  assert.strictEqual(passed.physicalGateSatisfied, true);
  assert.strictEqual(passed.adoptionAllowed, false, 'even complete evidence does not enable adoption automatically');
  const exactEvidence = validateCertificationEvidence(requireSffBackend('ikemaker-builtin-sff-v21-png8-prerelease'), 'sff-v2.1', { manifestText: manifestBytes.toString('utf8'), ledgerText: JSON.stringify(completed), evidenceArtifacts });
  assert.strictEqual(exactEvidence.valid, true, exactEvidence.error);
  assert.strictEqual(exactEvidence.adoptionAllowed, false);
  const missingArtifact = { ...evidenceArtifacts }; delete missingArtifact[Object.keys(missingArtifact)[0]];
  assert.strictEqual(validateCertificationEvidence(requireSffBackend('ikemaker-builtin-sff-v21-png8-prerelease'), 'sff-v2.1', { manifestText: manifestBytes.toString('utf8'), ledgerText: JSON.stringify(completed), evidenceArtifacts: missingArtifact }).valid, false);
  const evidenceMissing = JSON.parse(JSON.stringify(completed)); evidenceMissing.platforms.find(item => item.required).fixtures[0].checkEvidence.load = [];
  const missingResult = validateCertificationLedger(result.manifest, manifestBytes, evidenceMissing);
  assert.strictEqual(missingResult.valid, false); assert.strictEqual(missingResult.physicalGateSatisfied, false); assert(missingResult.issues.some(item => /attach hashed evidence/.test(item)));
  const badTimestamp = JSON.parse(JSON.stringify(completed)); badTimestamp.platforms.find(item => item.required).testedAt = 'yesterday';
  assert(validateCertificationLedger(result.manifest, manifestBytes, badTimestamp).issues.some(item => /UTC ISO timestamp/.test(item)));
  const badArchitecture = JSON.parse(JSON.stringify(completed)); badArchitecture.platforms.find(item => item.platformId === 'linux-x64').architecture = 'arm64';
  assert(validateCertificationLedger(result.manifest, manifestBytes, badArchitecture).issues.some(item => /architecture x64/.test(item)));
  const tampered = JSON.parse(JSON.stringify(completed)); tampered.fixtureManifestSha256 = '0'.repeat(64);
  assert.strictEqual(validateCertificationLedger(result.manifest, manifestBytes, tampered).valid, false);
  assert.throws(() => generate(result.root), /not empty/);
  console.log('SFF runtime certification fixture generator is deterministic, sealed and adoption-disabled');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
