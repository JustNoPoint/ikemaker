'use strict';

const crypto = require('crypto');
const path = require('path');

const VERSION = 1;
const SHA256 = /^[0-9a-f]{64}$/;
const SURFACES = Object.freeze({ SFF: 'sff-creator', SND: 'snd-maker' });
const DEFAULT_LIMITS = Object.freeze({
  maxItems: 512,
  maxFileBytes: 256 * 1024 * 1024,
  maxAggregateBytes: 1024 * 1024 * 1024,
  maxDecodedPixels: 256 * 1024 * 1024,
  maxAggregateDecodedPixels: 512 * 1024 * 1024,
  maxHeaderBytes: 64
});
const IMAGE_FORMATS = Object.freeze({
  '.png': 'png', '.gif': 'gif', '.pcx': 'pcx', '.bmp': 'bmp',
  '.psd': 'psd'
});

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return value;
}

function boundedText(value, label, maximum = 256) {
  const result = String(value ?? '').trim();
  if (!result || result.length > maximum || /[\0-\x1f]/.test(result)) {
    throw new Error(`${label} must be non-empty bounded text.`);
  }
  return result;
}

function boundedInteger(value, label, minimum, maximum) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} through ${maximum}.`);
  }
  return result;
}

function normalizeLimits(value = {}) {
  const limits = {};
  for (const [key, fallback] of Object.entries(DEFAULT_LIMITS)) {
    limits[key] = boundedInteger(value[key] ?? fallback, `limits.${key}`, 1, Number.MAX_SAFE_INTEGER);
  }
  return deepFreeze(limits);
}

function createDropSession({ surface, generation, sessionNonce, limits } = {}) {
  if (!Object.values(SURFACES).includes(surface)) throw new Error('surface must identify the SFF Creator or SndMaker.');
  const normalized = {
    schema: 'ikemaker.desktop-drop-session',
    version: VERSION,
    surface,
    generation: boundedInteger(generation, 'generation', 0, Number.MAX_SAFE_INTEGER),
    sessionNonce: boundedText(sessionNonce, 'sessionNonce', 128),
    limits: normalizeLimits(limits)
  };
  normalized.sessionId = sha256(Buffer.from(JSON.stringify(normalized), 'utf8'));
  return deepFreeze(normalized);
}

function sessionIsCurrent(session, current) {
  return Boolean(
    session && current &&
    session.schema === 'ikemaker.desktop-drop-session' &&
    current.schema === 'ikemaker.desktop-drop-session' &&
    session.surface === current.surface &&
    session.generation === current.generation &&
    session.sessionNonce === current.sessionNonce &&
    session.sessionId === current.sessionId
  );
}

function assertCurrentDropSession(session, current) {
  if (!sessionIsCurrent(session, current)) throw new Error('Desktop-drop session is stale.');
  return true;
}

function canonicalWindowsPath(value) {
  const raw = String(value ?? '');
  if (!raw || raw.length > 32767 || /[\0-\x1f]/.test(raw)) return null;
  if (/^\\\\[?.]\\/.test(raw) || !/^[A-Za-z]:\\/.test(raw) || !path.win32.isAbsolute(raw)) return null;
  const parts = raw.slice(3).split('\\');
  if (parts.some((part) => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /[<>:"|?*]/.test(part))) return null;
  const normalized = path.win32.normalize(raw).normalize('NFC');
  return normalized === raw.normalize('NFC') ? normalized : null;
}

function sameWindowsPath(left, right) {
  return String(left).normalize('NFC').toLowerCase() === String(right).normalize('NFC').toLowerCase();
}

function headerBuffer(value, maximum) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    const result = Buffer.from(value);
    return result.length <= maximum ? result : null;
  }
  if (typeof value === 'string' && value.length <= maximum * 2 && /^[0-9a-f]*$/i.test(value) && value.length % 2 === 0) {
    return Buffer.from(value, 'hex');
  }
  return null;
}

function detectedHeaderFormat(bytes) {
  if (!bytes) return null;
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6))) return 'gif';
  if (bytes.length >= 4 && bytes.toString('ascii', 0, 4) === '8BPS') return 'psd';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE') return 'wav';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 2 && bytes.toString('ascii', 0, 2) === 'BM') return 'bmp';
  if (bytes.length >= 4 && bytes[0] === 0x0a && [0, 2, 3, 4, 5].includes(bytes[1]) && bytes[2] === 1 && [1, 2, 4, 8].includes(bytes[3])) return 'pcx';
  return null;
}

function expectedFormat(surface, canonicalPath, kind) {
  if (kind === 'folder') return surface === SURFACES.SFF ? 'folder' : null;
  const extension = path.win32.extname(canonicalPath).toLowerCase();
  if (surface === SURFACES.SFF) return IMAGE_FORMATS[extension] || null;
  if (surface === SURFACES.SND) return extension === '.wav' ? 'wav' : null;
  return null;
}

function normalizeDecodedPixels(value, limits, reasons) {
  if (!value || typeof value !== 'object') {
    reasons.push('decoded-pixel-evidence-missing');
    return null;
  }
  const width = Number(value.width), height = Number(value.height), frames = Number(value.frames ?? 1);
  if (![width, height, frames].every((number) => Number.isSafeInteger(number) && number >= 1)) {
    reasons.push('decoded-pixel-evidence-invalid');
    return null;
  }
  const calculated = width * height * frames;
  if (!Number.isSafeInteger(calculated) || (value.pixelCount != null && Number(value.pixelCount) !== calculated)) {
    reasons.push('decoded-pixel-evidence-invalid');
    return null;
  }
  if (calculated > limits.maxDecodedPixels) reasons.push('decoded-pixel-limit-exceeded');
  return { width, height, frames, pixelCount: calculated };
}

function rejection(ordinal, originalPath, reasons) {
  return deepFreeze({ status: 'rejected', sourceOrdinal: ordinal, originalPath: String(originalPath ?? ''), reasons: [...new Set(reasons)] });
}

function admitDesktopDrop({ session, currentSession, items, cancelled = false } = {}) {
  if (!session || session.schema !== 'ikemaker.desktop-drop-session') throw new Error('A desktop-drop session is required.');
  assertCurrentDropSession(session, currentSession);
  if (!Array.isArray(items)) throw new Error('items must be an array.');
  if (cancelled) return deepFreeze({ schema: 'ikemaker.desktop-drop-admission', version: VERSION, status: 'cancelled', sessionId: session.sessionId, admitted: [], rejected: [], candidate: null });

  const routes = new Set(items.map((item) => item?.kind === 'folder' ? 'folder' : 'file'));
  const mixed = routes.size > 1;
  const admitted = [], rejected = [];
  let aggregateBytes = 0, aggregateDecodedPixels = 0;
  for (let ordinal = 0; ordinal < items.length; ordinal += 1) {
    const item = items[ordinal] || {}, reasons = [];
    const kind = item.kind === 'folder' ? 'folder' : item.kind === 'file' ? 'file' : null;
    if (!kind) reasons.push('unsupported-drop-kind');
    if (ordinal >= session.limits.maxItems) reasons.push('item-count-limit-exceeded');
    if (mixed) reasons.push('mixed-file-folder-drop');
    const presentedPath = canonicalWindowsPath(item.path);
    if (!presentedPath) reasons.push('noncanonical-local-path');
    const evidencePath = canonicalWindowsPath(item.canonicalPathEvidence);
    if (!evidencePath || !presentedPath || !sameWindowsPath(presentedPath, evidencePath)) reasons.push('canonical-path-evidence-mismatch');
    const canonicalPath = evidencePath || presentedPath;
    const format = canonicalPath && kind ? expectedFormat(session.surface, canonicalPath, kind) : null;
    if (!format) reasons.push('unsupported-format-for-surface');

    let byteLength = 0, byteHash = null, decodedPixels = null;
    if (kind === 'file') {
      if (item.evidenceError) reasons.push(String(item.evidenceError));
      byteLength = Number(item.byteLength);
      if (!Number.isSafeInteger(byteLength) || byteLength < 1) reasons.push('invalid-byte-length');
      else if (byteLength > session.limits.maxFileBytes) reasons.push('per-file-byte-limit-exceeded');
      byteHash = String(item.byteHash ?? '').toLowerCase();
      if (!SHA256.test(byteHash)) reasons.push('invalid-content-sha256');
      const header = headerBuffer(item.headerBytes, session.limits.maxHeaderBytes);
      if (!header) reasons.push('invalid-header-evidence');
      else if (format && detectedHeaderFormat(header) !== format) reasons.push('magic-extension-mismatch');
      if (session.surface === SURFACES.SFF) decodedPixels = normalizeDecodedPixels(item.decodedPixels, session.limits, reasons);
      if (session.surface === SURFACES.SND && (!item.soundEvidence || item.soundEvidence.valid !== true)) reasons.push(item.soundEvidence?.reason || 'wav-structure-invalid');
    } else if (kind === 'folder') {
      if (item.byteLength != null || item.byteHash != null || item.headerBytes != null || item.decodedPixels != null) reasons.push('folder-carries-file-evidence');
    }

    if (!reasons.length && kind === 'file' && aggregateBytes + byteLength > session.limits.maxAggregateBytes) reasons.push('aggregate-byte-limit-exceeded');
    if (!reasons.length && decodedPixels && aggregateDecodedPixels + decodedPixels.pixelCount > session.limits.maxAggregateDecodedPixels) reasons.push('aggregate-decoded-pixel-limit-exceeded');
    if (reasons.length) {
      rejected.push(rejection(ordinal, item.path, reasons));
      continue;
    }
    if (kind === 'file') aggregateBytes += byteLength;
    if (decodedPixels) aggregateDecodedPixels += decodedPixels.pixelCount;
    const core = {
      status: 'admitted', sourceOrdinal: ordinal, surface: session.surface, kind,
      canonicalPath, format, byteLength, byteHash, decodedPixels
    };
    core.identity = sha256(Buffer.from(JSON.stringify({ sessionId: session.sessionId, ...core }), 'utf8'));
    admitted.push(deepFreeze(core));
  }
  const candidateCore = { schema: 'ikemaker.desktop-drop-candidate', version: VERSION, sessionId: session.sessionId, surface: session.surface, records: admitted };
  const candidate = admitted.length ? deepFreeze({ ...candidateCore, candidateId: sha256(Buffer.from(JSON.stringify(candidateCore), 'utf8')) }) : null;
  return deepFreeze({ schema: 'ikemaker.desktop-drop-admission', version: VERSION, status: rejected.length ? admitted.length ? 'partial' : 'rejected' : 'admitted', sessionId: session.sessionId, admitted, rejected, candidate });
}

function assertCurrentDropCandidate(candidate, currentSession) {
  if (!candidate || candidate.schema !== 'ikemaker.desktop-drop-candidate' || candidate.sessionId !== currentSession?.sessionId) {
    throw new Error('Desktop-drop candidate is absent or stale.');
  }
  return true;
}

module.exports = {
  VERSION, SURFACES, DEFAULT_LIMITS, IMAGE_FORMATS,
  createDropSession, sessionIsCurrent, assertCurrentDropSession,
  admitDesktopDrop, assertCurrentDropCandidate, detectedHeaderFormat
};
