'use strict';

const path = require('path');
const { sha256, baseSession, validateJournal, replaySession, reviewAction, extractIndexedRectangle } = require('./sff_sheet_intake');
const { transactionalWrite, transactionalWriteSet, hash } = require('./mutation_safety');

function safeId(value) {
  const id = String(value || '');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(id)) throw new Error('Sprite-sheet session ID contains unsupported characters.');
  return id;
}
function paths(projectRoot, sessionId) {
  const root = path.join(path.resolve(projectRoot), '.ikemen-tools', 'drafts', 'sff-sheet', safeId(sessionId));
  return Object.freeze({ root, source: path.join(root, 'source-sheet.png'), document: path.join(root, 'session.json'), lock: path.join(root, 'session.lock') });
}
function processAlive(pid, check = value => process.kill(value, 0)) { try { check(pid); return true; } catch (error) { if (error?.code === 'ESRCH') return false; return true; } }
function acquire(fs, filename, identity, options = {}) {
  let descriptor;
  try { descriptor = fs.openSync(filename, 'wx'); }
  catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    let owner = null; try { owner = JSON.parse(fs.readFileSync(filename, 'utf8')); } catch (_) {}
    if (Number.isSafeInteger(owner?.pid) && !processAlive(owner.pid, options.isProcessAlive)) { fs.unlinkSync(filename); descriptor = fs.openSync(filename, 'wx'); }
    else throw new Error('This sprite-sheet session is already open for editing. Open it read-only or close the other editor first.');
  }
  fs.writeSync(descriptor, `${JSON.stringify({ identity, pid: process.pid, openedAt: new Date().toISOString() })}\n`);
  let released = false;
  return Object.freeze({ filename, release() { if (released) return; released = true; try { fs.closeSync(descriptor); } finally { try { if (fs.existsSync(filename)) fs.unlinkSync(filename); } catch (_) {} } } });
}
function verifySnapshot(fs, location, expectedHash) {
  if (!fs.existsSync(location) || !fs.statSync(location).isFile()) throw new Error('The immutable sprite-sheet snapshot is missing. Recovery stopped without rebinding another file.');
  const observed = sha256(fs.readFileSync(location));
  if (observed !== expectedHash) throw new Error('The immutable sprite-sheet snapshot failed its hash check. Start a new revision from the changed source.');
  return observed;
}
function outputRecords(extractedFrames, frames) {
  if (!Array.isArray(extractedFrames) || !extractedFrames.length) return [];
  const expected = new Set(frames.map(frame => frame.frameId));
  if (extractedFrames.length !== expected.size) throw new Error('Every proposed sprite-sheet frame requires one extracted snapshot.');
  return extractedFrames.map(frame => {
    if (!expected.delete(frame.frameId) || !Buffer.isBuffer(frame.buffer)) throw new Error('Extracted sprite-sheet snapshots do not match the reviewed frame proposal.');
    const byteHash = sha256(frame.buffer);
    if (frame.byteHash && frame.byteHash !== byteHash) throw new Error(`Extracted frame ${frame.frameId} failed its byte-hash check.`);
    return { frameId: frame.frameId, relativePath: path.join('frames', `${frame.frameId}.png`).replace(/\\/g, '/'), byteHash, decodedHash: String(frame.decodedHash || ''), paletteHash: String(frame.paletteHash || ''), buffer: frame.buffer };
  });
}
function createStoredSession(fs, projectRoot, sourceBuffer, proposal, options = {}) {
  if (!Buffer.isBuffer(sourceBuffer)) throw new Error('The sprite-sheet source snapshot must be bytes.');
  const sourceHash = sha256(sourceBuffer);
  if (proposal.sourceHash !== sourceHash) throw new Error('The reviewed grid does not belong to these sprite-sheet bytes.');
  const base = baseSession({ sessionId: options.sessionId || `sheet-${sourceHash.slice(0, 16)}`, revision: options.revision || 1, sourceHash, sourceName: options.sourceName, width: proposal.width, height: proposal.height, firstNumericGroup: options.firstNumericGroup || 0, intakeEvidence: options.intakeEvidence, frames: proposal.frames });
  const outputs = outputRecords(options.extractedFrames, base.frames), session = Object.freeze({ ...base, outputs: Object.freeze(outputs.map(({ buffer, ...record }) => Object.freeze(record))) });
  const location = paths(projectRoot, session.sessionId);
  fs.mkdirSync(location.root, { recursive: true });
  if (fs.existsSync(location.source) || fs.existsSync(location.document)) throw new Error('That sprite-sheet session already exists. Resume it or choose a new revision.');
  const writes = [[location.source, sourceBuffer], [location.document, `${JSON.stringify(session, null, 2)}\n`], ...outputs.map(output => [path.join(location.root, ...output.relativePath.split('/')), output.buffer])];
  transactionalWriteSet(fs, writes, { label: 'create-sff-sheet-session', allowExisting: false, backup: false, journal: false });
  const lock = acquire(fs, location.lock, session.sessionId);
  return Object.freeze({ session, state: replaySession(session), location, lock });
}
function openStoredSession(fs, projectRoot, sessionId, options = {}) {
  const location = paths(projectRoot, sessionId);
  if (!fs.existsSync(location.document)) throw new Error('The sprite-sheet session document is missing.');
  const session = JSON.parse(fs.readFileSync(location.document, 'utf8'));
  if (session.sessionId !== safeId(sessionId)) throw new Error('The sprite-sheet session identity does not match its folder.');
  validateJournal(session); verifySnapshot(fs, location.source, session.source.sha256);
  for (const output of session.outputs || []) {
    const filename = path.resolve(location.root, ...String(output.relativePath || '').split('/'));
    if (!filename.startsWith(`${location.root}${path.sep}`) || !fs.existsSync(filename) || sha256(fs.readFileSync(filename)) !== output.byteHash) throw new Error(`Extracted frame ${output.frameId || '?'} is missing or changed. Recovery stopped.`);
  }
  const lock = options.readOnly ? null : acquire(fs, location.lock, session.sessionId, options);
  return Object.freeze({ session, state: replaySession(session), location, lock, readOnly: Boolean(options.readOnly) });
}
function storedExtractedFrames(fs, stored) {
  return (stored.session.outputs || []).map(output => ({ ...output, filename: path.join(stored.location.root, ...output.relativePath.split('/')), buffer: fs.readFileSync(path.join(stored.location.root, ...output.relativePath.split('/'))) }));
}
function listStoredSessions(fs, projectRoot, options = {}) {
  const parent = path.join(path.resolve(projectRoot), '.ikemen-tools', 'drafts', 'sff-sheet');
  if (!fs.existsSync(parent)) return [];
  const results = [];
  for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      const location = paths(projectRoot, entry.name);
      if (!fs.existsSync(location.document)) continue;
      const session = JSON.parse(fs.readFileSync(location.document, 'utf8'));
      if (options.sourceHash && session.source?.sha256 !== options.sourceHash) continue;
      validateJournal(session); verifySnapshot(fs, location.source, session.source.sha256);
      const state = replaySession(session), stat = fs.statSync(location.document);
      results.push(Object.freeze({ sessionId: session.sessionId, source: session.source, revision: session.revision, frameCount: session.frames.length, state, updatedAt: stat.mtime.toISOString(), location }));
    } catch (error) {
      results.push(Object.freeze({ sessionId: entry.name, invalid: true, error: error.message }));
    }
  }
  return results.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}
function persistReviewAction(fs, stored, action, payload = {}) {
  if (!stored?.lock) throw new Error('This sprite-sheet session is read-only or no longer locked for editing.');
  const diskBytes = fs.readFileSync(stored.location.document), disk = JSON.parse(diskBytes.toString('utf8'));
  validateJournal(disk); verifySnapshot(fs, stored.location.source, disk.source.sha256);
  const expectedHead = replaySession(stored.session).journalHead, diskHead = replaySession(disk).journalHead;
  if (expectedHead !== diskHead) throw new Error('The sprite-sheet session changed after it was loaded. Reload before adding another review action.');
  const session = reviewAction(disk, action, payload);
  transactionalWrite(fs, stored.location.document, `${JSON.stringify(session, null, 2)}\n`, { label: 'advance-sff-sheet-session', expectedHash: hash(diskBytes), allowExisting: true, backup: false, journal: false });
  return Object.freeze({ ...stored, session, state: replaySession(session) });
}

function persistFrameRecut(fs, stored, action, payload, label) {
  if (!stored?.lock) throw new Error('This sprite-sheet session is read-only or no longer locked for editing.');
  const diskBytes = fs.readFileSync(stored.location.document), disk = JSON.parse(diskBytes.toString('utf8'));
  validateJournal(disk); verifySnapshot(fs, stored.location.source, disk.source.sha256);
  const expectedHead = replaySession(stored.session).journalHead, diskState = replaySession(disk);
  if (expectedHead !== diskState.journalHead) throw new Error('The sprite-sheet session changed after it was loaded. Reload before correcting a frame.');
  if (!diskState.currentFrame) throw new Error('There is no current sprite-sheet frame to correct.');
  const sessionWithEvent = reviewAction(disk, action, payload), nextState = replaySession(sessionWithEvent), frameId = diskState.currentFrame.frameId;
  const outputIndex = (disk.outputs || []).findIndex(output => output.frameId === frameId);
  if (outputIndex < 0) throw new Error(`The cached snapshot for ${frameId} is missing.`);
  const sourceBuffer = fs.readFileSync(stored.location.source), corrected = extractIndexedRectangle(sourceBuffer, { frameId, sourceRectangle: nextState.frameRectangles[frameId] }, disk.source.sha256), prior = disk.outputs[outputIndex];
  const outputPath = path.resolve(stored.location.root, ...String(prior.relativePath).split('/'));
  if (!outputPath.startsWith(`${stored.location.root}${path.sep}`)) throw new Error('The cached frame path is outside the sprite-sheet session.');
  const outputs = disk.outputs.map((output, index) => index === outputIndex ? Object.freeze({ ...output, byteHash: corrected.byteHash, decodedHash: corrected.decodedHash, paletteHash: corrected.paletteHash }) : output);
  const session = Object.freeze({ ...sessionWithEvent, outputs: Object.freeze(outputs) });
  transactionalWriteSet(fs, [[outputPath, corrected.buffer], [stored.location.document, `${JSON.stringify(session, null, 2)}\n`]], { label, expectedHashes: { [outputPath]: hash(fs.readFileSync(outputPath)), [path.resolve(stored.location.document)]: hash(diskBytes) }, allowExisting: true, backup: false, journal: false });
  return Object.freeze({ ...stored, session, state: replaySession(session) });
}

function persistRectangleAdjustment(fs, stored, rectangle) { return persistFrameRecut(fs, stored, 'adjust-rectangle', rectangle, 'adjust-sff-sheet-frame-rectangle'); }
function persistComponentAttachment(fs, stored, componentIds, ownership, note = '') { return persistFrameRecut(fs, stored, 'attach-components', { componentIds, ownership, note }, 'attach-sff-sheet-floating-components'); }
function persistComponentDetachment(fs, stored, componentIds, note = '') { return persistFrameRecut(fs, stored, 'detach-components', { componentIds, note }, 'detach-sff-sheet-floating-components'); }

module.exports = { paths, createStoredSession, openStoredSession, persistReviewAction, persistRectangleAdjustment, persistComponentAttachment, persistComponentDetachment, storedExtractedFrames, listStoredSessions, verifySnapshot };
