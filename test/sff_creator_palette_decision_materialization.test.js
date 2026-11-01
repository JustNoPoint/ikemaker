'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { encodeIndexed } = require('../src/sff_palette_remap');
const { readIndexedPng8 } = require('../src/sff_png8_source');
const workflow = require('../src/sff_unmatched_color_workflow');
const { paletteFingerprint } = require('../src/palette_master');

const filename = path.join(__dirname, '..', 'src', 'sff_creator_workspace.js'), originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'vscode') return { workspace: { workspaceFolders: [], getConfiguration: () => ({ get: (_key, fallback) => fallback }) }, window: {}, Uri: { file: fsPath => ({ fsPath, toString: () => `file://${fsPath}` }) }, ViewColumn: { Active: 1 } };
  return originalLoad.call(this, request, parent, isMain);
};

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-reviewed-colors-'));
try {
  delete require.cache[filename]; const workspace = require(filename);
  const master = Array.from({ length: 256 }, (_, index) => [index, index, index, 255]); master[0] = [0, 0, 0, 0]; master[7] = [90, 0, 0, 255];
  const sourceColors = master.map(color => color.slice()); sourceColors[5] = [99, 1, 2, 255];
  const sourcePath = path.join(root, 'source.png'), original = encodeIndexed(2, 1, Buffer.from([5, 6]), sourceColors); fs.writeFileSync(sourcePath, original);
  const source = workspace.sourceFromFile(sourcePath, { sourceIdentity: 'reviewed-color-source' });
  const scan = workflow.scan({ masterColors: master, masterFingerprint: paletteFingerprint(master), masterVersion: 'test-master', alphaPolicy: 'exact-alpha', conversionProfile: 'sff-creator-indexed-exact-v1', sources: [{ id: source.id, label: source.name, sourceHash: source.byteHash.toLowerCase(), bytes: original, order: 0, plannedIdentity: '0,0' }] });
  assert.strictEqual(scan.issues.length, 1);
  const issue = scan.issues[0], decision = { kind: 'map-index', destinationIndex: 7, destinationRgba: master[7], includedOccurrenceIndexes: [0] };
  const retained = { binding: { scan, evidence: { master: { colors: master, fingerprint: paletteFingerprint(master), version: 'test-master' } } }, resolved: { [issue.issueId]: decision } };
  const row = { sourceId: source.id, source, identity: '0,0', axisX: 0, axisY: 0, cropMode: 'none' }, plan = { ready: [row], rows: [row] }, packageRoot = path.join(root, 'package'); fs.mkdirSync(packageRoot);
  const prepared = workspace.prepareReviewedPaletteDecisionSources(packageRoot, plan, retained), output = readIndexedPng8(fs.readFileSync(prepared.plan.ready[0].source.path));
  assert.deepStrictEqual([...output.indices], [7, 6], 'only the explicitly reviewed unmatched occurrence is re-indexed');
  assert.deepStrictEqual(output.colors, master, 'the prepared PNG carries the exact reviewed master palette');
  assert.deepStrictEqual([...readIndexedPng8(fs.readFileSync(sourcePath)).indices], [5, 6], 'the original source remains unchanged');
  assert.strictEqual(prepared.plan.ready[0].source.provenance.kind, 'reviewed-palette-decisions');
  assert.strictEqual(prepared.plan.ready[0].source.provenance.changedPixelCount, 1);
  assert.match(prepared.decisionHash, /^[0-9a-f]{64}$/);
  const swappedColors = master.map(color => color.slice()); swappedColors[5] = [99, 1, 2, 255]; [swappedColors[6], swappedColors[8]] = [swappedColors[8], swappedColors[6]];
  const swappedPath = path.join(root, 'swapped.png'), swappedOriginal = encodeIndexed(2, 1, Buffer.from([5, 6]), swappedColors); fs.writeFileSync(swappedPath, swappedOriginal);
  const swappedSource = workspace.sourceFromFile(swappedPath, { sourceIdentity: 'reviewed-color-swapped-source' }), swappedRow = { ...row, sourceId: swappedSource.id, source: swappedSource }, swappedPlan = { ready: [swappedRow], rows: [swappedRow] };
  const swappedScan = workflow.scan({ masterColors: master, masterFingerprint: paletteFingerprint(master), masterVersion: 'test-master', alphaPolicy: 'exact-alpha', conversionProfile: 'sff-creator-indexed-exact-v1', sources: [{ id: swappedSource.id, label: swappedSource.name, sourceHash: swappedSource.byteHash.toLowerCase(), bytes: swappedOriginal, order: 0, plannedIdentity: '0,0' }] });
  const swappedIssue = swappedScan.issues.find(item => item.sourceRgba.join(',') === '99,1,2,255'), swappedRetained = { binding: { scan: swappedScan, evidence: { master: { colors: master, fingerprint: paletteFingerprint(master), version: 'test-master' } } }, resolved: { [swappedIssue.issueId]: { ...decision, includedOccurrenceIndexes: [0] } } };
  const swappedPackage = path.join(root, 'swapped-package'); fs.mkdirSync(swappedPackage);
  assert.throws(() => workspace.prepareReviewedPaletteDecisionSources(swappedPackage, swappedPlan, swappedRetained), /untouched pixel .* differs from the reviewed master/i);
  assert.strictEqual(fs.existsSync(path.join(swappedPackage, 'prepared-sources')), false, 'fail-closed validation creates no private prepared output');
  console.log('SFF Creator materializes only reviewed palette decisions into private prepared sources');
} finally { Module._load = originalLoad; fs.rmSync(root, { recursive: true, force: true }); }
