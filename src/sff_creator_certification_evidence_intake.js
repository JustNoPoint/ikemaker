'use strict';

const fs = require('fs');
const path = require('path');
const { requireSffBackend } = require('./sff_backend_registry');
const { validateCertificationEvidence } = require('./sff_runtime_certification');

const MAX_JSON_BYTES = 16 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 256 * 1024 * 1024;
const MAX_ARTIFACT_COUNT = 4096;

function fail(message) { throw new Error(`SFF Creator certification evidence intake: ${message}`); }
function plain(value) { return value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function inside(root, candidate) { const relative = path.relative(root, candidate); return relative === '' || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); }
function exactStat(boundFs, method, filename) { return boundFs[method](filename, { bigint: true }); }
function sameIdentity(left, right) { return left && right && String(left.dev) === String(right.dev) && String(left.ino) === String(right.ino); }
function sameModifiedTime(left, right) { return String(left?.mtimeNs ?? left?.mtimeMs) === String(right?.mtimeNs ?? right?.mtimeMs); }
function readRegular(boundFs, filename, limit, label, overflowMessage = '') {
  const resolved = path.resolve(filename), linked = exactStat(boundFs, 'lstatSync', resolved), real = path.resolve(boundFs.realpathSync.native(resolved)), before = exactStat(boundFs, 'statSync', real), byteLength = Number(before.size);
  if (!linked.isFile() || linked.isSymbolicLink() || !before.isFile()) fail(`${label} must be a direct regular file.`);
  if (!sameIdentity(linked, before)) fail(`${label} changed before it was read.`);
  if (!Number.isSafeInteger(byteLength) || byteLength < 1 || byteLength > limit) fail(overflowMessage || `${label} exceeds its ${limit}-byte intake limit.`);
  const bytes = boundFs.readFileSync(real);
  const afterLinked = exactStat(boundFs, 'lstatSync', resolved), afterReal = path.resolve(boundFs.realpathSync.native(resolved)), after = exactStat(boundFs, 'statSync', afterReal);
  if (!afterLinked.isFile() || afterLinked.isSymbolicLink() || !after.isFile() || afterReal !== real || !sameIdentity(afterLinked, before) || !sameIdentity(after, before) || bytes.length !== byteLength || String(after.size) !== String(before.size) || !sameModifiedTime(after, before)) fail(`${label} changed while it was read.`);
  return { bytes, real };
}
function parseJson(bytes, label) { try { const value = JSON.parse(bytes.toString('utf8')); if (!plain(value)) fail(`${label} must contain one JSON object.`); return value; } catch (error) { if (String(error?.message || '').startsWith('SFF Creator certification evidence intake:')) throw error; fail(`${label} is not valid JSON.`); } }

function createCreatorCertificationEvidenceLoader(dependencies = {}) {
  const boundFs = dependencies.fs || fs, backendFor = dependencies.requireBackend || requireSffBackend, validate = dependencies.validate || validateCertificationEvidence;
  if (typeof backendFor !== 'function' || typeof validate !== 'function') fail('backend and validation dependencies must be functions.');
  return function load(input = {}) {
    if (!['sff-v2.0', 'sff-v2.1'].includes(input.targetId)) fail('only built-in SFF v2.0 and v2.1 certification evidence is accepted.');
    const backend = backendFor(input.backendId);
    if (!backend || backend.id !== input.backendId) fail('selected certification backend is unavailable.');
    const manifestFile = readRegular(boundFs, input.manifestPath, MAX_JSON_BYTES, 'certification manifest');
    const ledgerFile = readRegular(boundFs, input.ledgerPath, MAX_JSON_BYTES, 'certification ledger');
    const ledger = parseJson(ledgerFile.bytes, 'certification ledger');
    const artifactRoot = path.resolve(input.evidenceRoot), rootLinked = exactStat(boundFs, 'lstatSync', artifactRoot), rootReal = path.resolve(boundFs.realpathSync.native(artifactRoot)), rootBefore = exactStat(boundFs, 'statSync', rootReal);
    if (!rootLinked.isDirectory() || rootLinked.isSymbolicLink() || !rootBefore.isDirectory() || !sameIdentity(rootLinked, rootBefore)) fail('evidence root must be a stable direct directory.');
    const ids = [];
    for (const platform of Array.isArray(ledger.platforms) ? ledger.platforms : []) for (const fixture of Array.isArray(platform?.fixtures) ? platform.fixtures : []) for (const evidence of Object.values(plain(fixture?.checkEvidence) ? fixture.checkEvidence : {})) for (const row of Array.isArray(evidence) ? evidence : []) {
      const id = String(row?.id || '');
      if (!id || id.includes('\0') || path.isAbsolute(id)) fail('ledger contains an unsafe evidence artifact ID.');
      ids.push(id);
    }
    const unique = [...new Set(ids)];
    if (unique.length !== ids.length) fail('ledger reuses an evidence artifact ID.');
    if (!unique.length || unique.length > MAX_ARTIFACT_COUNT) fail('ledger evidence artifact count is empty or exceeds the intake limit.');
    let total = 0;
    const evidenceArtifacts = {};
    for (const id of unique.sort()) {
      const requested = path.resolve(rootReal, id);
      if (!inside(rootReal, requested)) fail(`evidence artifact ${id} escapes the selected root.`);
      const remaining = MAX_ARTIFACT_BYTES - total;
      if (!Number.isSafeInteger(remaining) || remaining < 1) fail('aggregate certification evidence exceeds the intake limit.');
      const item = readRegular(boundFs, requested, remaining, `evidence artifact ${id}`, 'aggregate certification evidence exceeds the intake limit.');
      if (!inside(rootReal, item.real)) fail(`evidence artifact ${id} resolves outside the selected root.`);
      total += item.bytes.length;
      if (!Number.isSafeInteger(total) || total > MAX_ARTIFACT_BYTES) fail('aggregate certification evidence exceeds the intake limit.');
      evidenceArtifacts[id] = item.bytes.toString('base64');
    }
    const rootAfterLinked = exactStat(boundFs, 'lstatSync', artifactRoot), rootAfterReal = path.resolve(boundFs.realpathSync.native(artifactRoot)), rootAfter = exactStat(boundFs, 'statSync', rootAfterReal);
    if (!rootAfterLinked.isDirectory() || rootAfterLinked.isSymbolicLink() || !rootAfter.isDirectory() || rootAfterReal !== rootReal || !sameIdentity(rootAfterLinked, rootBefore) || !sameIdentity(rootAfter, rootBefore) || !sameModifiedTime(rootAfter, rootBefore)) fail('evidence root changed while evidence was read.');
    const certification = { manifestText: manifestFile.bytes.toString('utf8'), ledgerText: ledgerFile.bytes.toString('utf8'), evidenceArtifacts };
    const checked = validate(backend, input.targetId, certification);
    if (!checked?.valid || checked?.validation?.physicalGateSatisfied !== true) fail(checked?.error || 'physical certification evidence is incomplete.');
    return freeze({ status: 'certification-evidence-ready', targetId: input.targetId, backendId: input.backendId, manifestPath: manifestFile.real, ledgerPath: ledgerFile.real, evidenceRoot: rootReal, evidenceArtifactCount: unique.length, evidenceByteLength: total, freshCapabilityRequest: { evidence: { certification } } });
  };
}

const loadCreatorCertificationEvidence = createCreatorCertificationEvidenceLoader();

async function pickCreatorCertificationEvidence(vscode, route, load = loadCreatorCertificationEvidence) {
  if (!vscode?.window || typeof vscode.window.showOpenDialog !== 'function') fail('VS Code file picker is unavailable.');
  if (!route?.targetId || !route?.backendId) fail('an exact target/backend route is required.');
  const targetId = String(route.targetId), backendId = String(route.backendId);
  const manifest = await vscode.window.showOpenDialog({ title: `Choose ${targetId} runtime certification manifest`, openLabel: 'Use Exact Manifest', canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { 'JSON manifest': ['json'] } });
  if (!manifest?.[0]) return null;
  const ledger = await vscode.window.showOpenDialog({ title: `Choose ${targetId} completed certification ledger`, openLabel: 'Use Completed Ledger', canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { 'JSON ledger': ['json'] } });
  if (!ledger?.[0]) return null;
  const evidence = await vscode.window.showOpenDialog({ title: 'Choose the root folder containing every hashed evidence artifact', openLabel: 'Use Evidence Folder', canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
  if (!evidence?.[0]) return null;
  return load({ targetId, backendId, manifestPath: manifest[0].fsPath, ledgerPath: ledger[0].fsPath, evidenceRoot: evidence[0].fsPath });
}

module.exports = { MAX_ARTIFACT_BYTES, MAX_ARTIFACT_COUNT, MAX_JSON_BYTES, createCreatorCertificationEvidenceLoader, loadCreatorCertificationEvidence, pickCreatorCertificationEvidence };
