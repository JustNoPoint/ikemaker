'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const soundBuild = require('./sound_build');
const intake = require('./snd_intake_model');
const drop = require('./desktop_drop_intake_contract');
const hostDrop = require('./desktop_drop_host_evidence');
const { wavInfo } = require('./snd_reader');
const { transactionalWriteSet } = require('./mutation_safety');

let generation = 0;

function digest(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
function nonce() { return crypto.randomBytes(18).toString('hex'); }
function cleanBasename(filename) {
  const stem = path.basename(filename, path.extname(filename)).normalize('NFC').replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return `${stem || 'sound'}.wav`;
}
function validateSndMakerWavBytes(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 12 || bytes.readUInt32LE(4) + 8 !== bytes.length) return { valid: false, reason: 'wav-structure-invalid' };
  const info = wavInfo(bytes);
  if (!info.valid || info.dataOffset === null || info.dataSize < 1) return { valid: false, reason: 'wav-structure-invalid' };
  const expectedBlockAlign = info.channels * info.bitsPerSample / 8;
  if (info.format !== 1 || ![8, 16].includes(info.bitsPerSample) || ![1, 2].includes(info.channels) || !Number.isSafeInteger(info.sampleRate) || info.sampleRate < 1 || info.blockAlign !== expectedBlockAlign || info.byteRate !== info.sampleRate * info.blockAlign || info.dataSize % info.blockAlign !== 0 || info.dataOffset + info.dataSize > bytes.length) return { valid: false, reason: 'wav-format-not-supported-by-sndmaker' };
  return { valid: true, format: info.format, channels: info.channels, sampleRate: info.sampleRate, bitsPerSample: info.bitsPerSample, dataSize: info.dataSize };
}
function inspectSndMakerWav(filename, format, io = fs) {
  if (String(format).toLowerCase() !== 'wav') return { valid: false, reason: 'unsupported-format-for-surface' };
  return validateSndMakerWavBytes(io.readFileSync(filename));
}
function wavEvidence(filename, ordinal, session, io = fs, remainingBytes = session.limits.maxAggregateBytes) {
  const requested = path.resolve(filename).normalize('NFC'), canonical = (io.realpathSync.native ? io.realpathSync.native(requested) : io.realpathSync(requested)).normalize('NFC'), stat = io.statSync(canonical);
  if (!stat.isFile()) return { kind: 'file', path: canonical, canonicalPathEvidence: canonical, byteLength: 0, byteHash: '', headerBytes: Buffer.alloc(0) };
  if (path.extname(canonical).toLowerCase() !== '.wav' || stat.size > session.limits.maxFileBytes || stat.size > remainingBytes) return { kind: 'file', path: canonical, canonicalPathEvidence: canonical, byteLength: stat.size, byteHash: '', headerBytes: Buffer.alloc(0) };
  const bytes = io.readFileSync(canonical);
  return { kind: 'file', path: canonical, canonicalPathEvidence: canonical, byteLength: bytes.length, byteHash: digest(bytes), headerBytes: bytes.subarray(0, session.limits.maxHeaderBytes), soundEvidence: validateSndMakerWavBytes(bytes), sourceOrdinal: ordinal };
}
function admitWavPaths(paths, options = {}) {
  const currentSession = options.session || drop.createDropSession({ surface: drop.SURFACES.SND, generation: options.generation ?? ++generation, sessionNonce: options.sessionNonce || nonce(), limits: options.limits });
  let remaining = currentSession.limits.maxAggregateBytes;
  const items = (paths || []).slice(0, currentSession.limits.maxItems + 1).map((filename, ordinal) => {
    if (ordinal >= currentSession.limits.maxItems) return { kind: 'file', path: String(filename), canonicalPathEvidence: String(filename), byteLength: 0, byteHash: '', headerBytes: Buffer.alloc(0) };
    const item = wavEvidence(filename, ordinal, currentSession, options.fs || fs, remaining);
    if (/^[a-f0-9]{64}$/.test(item.byteHash)) remaining -= item.byteLength;
    return item;
  });
  const admission = drop.admitDesktopDrop({ session: currentSession, currentSession, items });
  return { session: currentSession, admission };
}
function stageBatch({ manifestPath, paths, destinationHint, session, generation: requestedGeneration, sessionNonce, limits, fs: io = fs } = {}) {
  const absoluteManifest = path.resolve(manifestPath || '');
  if (path.extname(absoluteManifest).toLowerCase() === '.snd') throw new Error('A SndMaker text manifest is required; batch intake never writes an SND archive.');
  const manifestBytes = io.readFileSync(absoluteManifest), manifest = soundBuild.parse(manifestBytes.toString('utf8'));
  const admitted = admitWavPaths(paths, { session, generation: requestedGeneration, sessionNonce, limits, fs: io });
  if (!admitted.admission.candidate) throw new Error('No supported WAV source passed intake validation.');
  const draft = intake.createDraft({ manifest, manifestPath: absoluteManifest, candidate: admitted.admission.candidate, targetFingerprint: intake.manifestFingerprint(manifest), destinationHint });
  return Object.freeze({ manifestPath: absoluteManifest, manifestBytes, manifestHash: digest(manifestBytes), manifest, session: admitted.session, admission: admitted.admission, candidate: admitted.admission.candidate, draft });
}
function stageAdmittedBatch({ manifestPath, session, admission, destinationHint, fs: io = fs } = {}) {
  const absoluteManifest = path.resolve(manifestPath || '');
  if (path.extname(absoluteManifest).toLowerCase() === '.snd') throw new Error('A SndMaker text manifest is required; batch intake never writes an SND archive.');
  if (!admission?.candidate) throw new Error('No supported WAV source passed intake validation.');
  drop.assertCurrentDropCandidate(admission.candidate, session);
  const manifestBytes = io.readFileSync(absoluteManifest), manifest = soundBuild.parse(manifestBytes.toString('utf8'));
  const draft = intake.createDraft({ manifest, manifestPath: absoluteManifest, candidate: admission.candidate, targetFingerprint: intake.manifestFingerprint(manifest), destinationHint });
  return Object.freeze({ manifestPath: absoluteManifest, manifestBytes, manifestHash: digest(manifestBytes), manifest, session, admission, candidate: admission.candidate, draft });
}
function retainedTarget(manifestPath, operation) {
  const leaf = cleanBasename(operation.sourcePath), extension = path.extname(leaf), stem = path.basename(leaf, extension);
  return path.join(path.dirname(manifestPath), 'wav', 'imported', `${stem}-${operation.sourceHash.slice(0, 12)}${extension}`);
}
function verifyPlanSources(plan, io = fs) {
  for (const operation of plan.operations) {
    if (operation.action === 'skip') continue;
    const bytes = io.readFileSync(operation.sourcePath);
    if (bytes.length !== operation.sourceBytes || digest(bytes) !== operation.sourceHash) throw new Error(`WAV source changed after review: ${operation.sourcePath}`);
    if (drop.detectedHeaderFormat(bytes.subarray(0, 64)) !== 'wav') throw new Error(`WAV source format changed after review: ${operation.sourcePath}`);
  }
}
function buildWriteSet(state, draft, options = {}) {
  const io = options.fs || fs;
  if (!drop.assertCurrentDropCandidate(state.candidate, options.currentSession || state.session)) throw new Error('The WAV intake candidate is stale.');
  const currentBytes = io.readFileSync(state.manifestPath), currentManifest = soundBuild.parse(currentBytes.toString('utf8'));
  if (digest(currentBytes) !== state.manifestHash || intake.manifestFingerprint(currentManifest) !== draft.manifestFingerprint) throw new Error('The SndMaker manifest changed after intake review began.');
  const plan = intake.planDraft(draft, currentManifest, state.candidate.candidateId);
  verifyPlanSources(plan, io);
  const writes = [], retained = new Map(), plannedTargets = new Set();
  for (const operation of plan.operations) {
    if (operation.action === 'skip') continue;
    const target = retainedTarget(state.manifestPath, operation), bytes = io.readFileSync(operation.sourcePath);
    if (io.existsSync(target)) {
      if (digest(io.readFileSync(target)) !== operation.sourceHash) throw new Error(`A different retained WAV already uses ${target}.`);
    } else if (!plannedTargets.has(path.resolve(target).toLowerCase())) { writes.push([target, bytes]); plannedTargets.add(path.resolve(target).toLowerCase()); }
    retained.set(operation.rowId, path.relative(path.dirname(state.manifestPath), target).replace(/\\/g, '/'));
  }
  const nextManifest = intake.materializeManifest(plan, currentManifest, operation => retained.get(operation.rowId));
  writes.push([state.manifestPath, soundBuild.stringify(nextManifest)]);
  return { plan, nextManifest, writes };
}
function applyReviewedBatch(state, draft, options = {}) {
  const io = options.fs || fs, prepared = buildWriteSet(state, draft, options);
  const expectedHashes = { [path.resolve(state.manifestPath)]: state.manifestHash };
  (options.writeSet || transactionalWriteSet)(io, prepared.writes, { label: 'sound-batch-intake', journal: true, aggregateJournal: true, journalRoot: path.dirname(state.manifestPath), expectedHashes, allowExisting: filename => path.resolve(filename) === path.resolve(state.manifestPath) });
  return prepared;
}

async function chooseDestination(api, defaultGroup = 0, defaultIndex = 0) {
  const value = await api.window.showInputBox({ title: 'Batch WAV destination', prompt: 'Enter group,start index. Existing identities stop for collision review.', value: `${defaultGroup},${defaultIndex}`, validateInput: text => /^\d+\s*,\s*\d+$/.test(text) ? undefined : 'Enter group,start index.' });
  if (!value) return null;
  const [group, index] = value.split(',').map(Number);
  return { kind: 'replace-or-insert', group, index };
}
async function resolveCollisions(state, api) {
  let draft = state.draft;
  for (const row of draft.rows.filter(item => item.state === 'collision')) {
    const choice = await api.window.showQuickPick([
      { label: `Replace ${row.group},${row.index}`, action: 'replace', description: 'Replace only this manifest row after final review.' },
      { label: 'Use next free index', action: 'next-free', description: 'Keep existing rows and choose the next open index.' },
      { label: 'Choose another identity…', action: 'manual', description: 'Enter an exact group,index destination.' },
      { label: 'Skip this WAV', action: 'skip', description: 'Leave it out of this batch.' }
    ], { title: `Collision for ${path.basename(row.sourcePath)}`, placeHolder: `${row.group},${row.index} already exists. Nothing has changed yet.` });
    if (!choice) return null;
    let resolution = { action: choice.action };
    if (choice.action === 'manual') {
      const value = await api.window.showInputBox({ title: 'Manual sound identity', prompt: 'Enter group,index', validateInput: text => /^\d+\s*,\s*\d+$/.test(text) ? undefined : 'Enter group,index.' });
      if (!value) return null;
      const [group, index] = value.split(',').map(Number); resolution = { action: 'manual', group, index };
    }
    draft = intake.resolveRow(draft, row.rowId, resolution, state.manifest);
  }
  return draft;
}
async function open(options = {}, api = vscode) {
  let manifestPath = options.manifestPath;
  if (!manifestPath) {
    const manifest = await api.window.showOpenDialog({ title: 'Choose the authoritative SndMaker build manifest', canSelectMany: false, filters: { 'SndMaker text': ['txt'] } });
    manifestPath = manifest?.[0]?.fsPath;
  }
  if (!manifestPath) return null;
  let paths = options.paths;
  if (!paths?.length) {
    const picked = await api.window.showOpenDialog({ title: 'Add WAV sources to reviewed SndMaker plan', canSelectMany: true, filters: { WAV: ['wav'] } });
    paths = (picked || []).map(item => item.fsPath);
  }
  if (!paths.length) return null;
  const hint = options.destinationHint || await chooseDestination(api, options.defaultGroup ?? 0, options.defaultIndex ?? 0);
  if (!hint) return null;
  const prepare = (progress = { report() {} }, token = { isCancellationRequested: false }) => {
    let prior = 0;
    return hostDrop.prepareDesktopDropAsync({ surface: drop.SURFACES.SND, generation: ++generation, sessionNonce: nonce(), paths, inspectSound: inspectSndMakerWav, isCancelled: () => token.isCancellationRequested, onProgress: state => { const percent = state.total ? Math.floor(state.completed / state.total * 100) : 0; progress.report({ increment: Math.max(0, percent - prior), message: state.path ? path.basename(state.path) : 'Validated' }); prior = percent; } });
  };
  const prepared = typeof api.window.withProgress === 'function' ? await api.window.withProgress({ location: vscode.ProgressLocation?.Notification, title: `Reviewing ${paths.length} WAV source${paths.length === 1 ? '' : 's'}`, cancellable: true }, prepare) : await prepare();
  if (prepared.admission.status === 'cancelled') { await api.window.showInformationMessage('WAV batch intake cancelled. The manifest and SND archive were not changed.'); return null; }
  const state = stageAdmittedBatch({ manifestPath, session: prepared.session, admission: prepared.admission, destinationHint: hint });
  if (state.admission.rejected.length) await api.window.showWarningMessage(`${state.admission.rejected.length} dropped or selected item(s) were rejected. Only ${state.candidate.records.length} validated WAV source(s) remain in this review.`);
  const draft = await resolveCollisions(state, api);
  if (!draft) return null;
  const plan = intake.planDraft(draft, state.manifest, state.candidate.candidateId), applied = plan.operations.filter(item => item.action !== 'skip');
  if (!applied.length) { await api.window.showInformationMessage('Every WAV was skipped. The SndMaker manifest and SND archive were not changed.'); return null; }
  const result = applyReviewedBatch(state, draft);
  const build = options.buildSndManifest || require('./snd_builder').buildSndManifest;
  const built = await build(manifestPath, { api, confirm: false });
  if (built?.built) return { ...result, build: built };
  await api.window.showInformationMessage(`The reviewed WAV sources were retained in ${manifestPath}, but the current SND could not be updated.`);
  return { ...result, build: built };
}
function register(context) { context.subscriptions.push(vscode.commands.registerCommand('snd.openBatchIntake', (manifestPath, options = {}) => open({ ...options, manifestPath: manifestPath?.fsPath || manifestPath }))); }

module.exports = { cleanBasename, validateSndMakerWavBytes, inspectSndMakerWav, wavEvidence, admitWavPaths, stageBatch, stageAdmittedBatch, retainedTarget, verifyPlanSources, buildWriteSet, applyReviewedBatch, chooseDestination, resolveCollisions, open, register };
