'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {isDeepStrictEqual} = require('node:util');
const {pngDimensions,matchingRootCustomStates} = require('./snapshot_capture');

const maxSidecarBytes = 256 * 1024;
const maxImageBytes = 64 * 1024 * 1024;
const captureId = /^tick-[0-9]+-[a-f0-9]{12}$/;
const pairId = /^pair-tick-[0-9]+-[a-f0-9]{12}$/;
const sha256 = /^[a-f0-9]{64}$/;
const entityKinds = new Set(['player', 'helper', 'projectile']);

function validHash(value) {
  return typeof value === 'string' && sha256.test(value);
}

function readBoundedFile(filename, maxBytes) {
  const info = fs.lstatSync(filename);
  if (!info.isFile() || fs.realpathSync(filename) !== filename) throw Error('Snapshot evidence must be an ordinary local file');
  const fd = fs.openSync(filename, 'r');
  try {
    const file = fs.fstatSync(fd);
    if (!file.isFile() || file.size < 1 || file.size > maxBytes || info.ino !== file.ino || info.dev !== file.dev) {
      throw Error('Snapshot evidence changed or exceeds the verification limit');
    }
    const bytes = Buffer.alloc(file.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (count === 0) throw Error('Snapshot evidence changed during verification');
      offset += count;
    }
    const end = fs.fstatSync(fd);
    if (end.size !== file.size || end.mtimeMs !== file.mtimeMs) throw Error('Snapshot evidence changed during verification');
    return bytes;
  } finally {
    fs.closeSync(fd);
  }
}

function readCandidate(directory, verdict, link) {
  if (!link || typeof link.id !== 'string' || !captureId.test(link.id) ||
      !link.id.startsWith(`tick-${verdict.tick}-`) ||
      link.metadata !== `${link.id}.json` || link.image !== `${link.id}.png` || !validHash(link.sha256)) {
    throw Error('Snapshot verdict contains an invalid candidate reference');
  }
  const candidate = JSON.parse(readBoundedFile(path.join(directory, link.metadata), maxSidecarBytes));
  if (!candidate || candidate.version !== 1 || candidate.method !== 'stock-engine-paused-full-composite-candidate' ||
      candidate.classification !== 'candidate-awaiting-duplicate-verification' ||
      candidate.id !== link.id || candidate.sessionId !== verdict.sessionId || candidate.epoch !== verdict.epoch ||
      candidate.tick !== verdict.tick || candidate.paused !== true ||
      candidate.frame?.tick !== verdict.tick || candidate.frame.paused !== true ||
      candidate.sha256 !== link.sha256 || candidate.image !== link.image ||
      candidate.width !== link.width || candidate.height !== link.height ||
      !Array.isArray(candidate.frame.entities) || candidate.frame.entities.length > 32 ||
      candidate.engine?.executable !== 'Ikemen_GO.exe' || !validHash(candidate.engine.sha256)) {
    throw Error('Snapshot candidate does not match the verdict and captured authority');
  }
  const pixels = readBoundedFile(path.join(directory, link.image), maxImageBytes);
  if (createHash('sha256').update(pixels).digest('hex') !== link.sha256) throw Error('Retained PNG hash does not match the Snapshot verdict');
  const {width,height} = pngDimensions(pixels);
  if (width !== link.width || height !== link.height) throw Error('Retained PNG dimensions do not match the Snapshot verdict');
  return candidate;
}

function loadSnapshotReviewEvidence(filename) {
  const absolute = path.resolve(filename);
  const directory = fs.realpathSync(path.dirname(absolute));
  const name = path.basename(absolute);
  if (!name.endsWith('.json') || !pairId.test(name.slice(0, -5))) throw Error('Choose an IKeMeter Snapshot pair verdict');
  const verdict = JSON.parse(readBoundedFile(path.join(directory, name), maxSidecarBytes));
  if (!verdict || verdict.version !== 1 || verdict.method !== 'duplicate-paused-engine-capture' ||
      verdict.classification !== 'verified-identical-paused-composite' || verdict.stable !== true ||
      typeof verdict.id !== 'string' || !pairId.test(verdict.id) || name !== `${verdict.id}.json` ||
      typeof verdict.sessionId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(verdict.sessionId) ||
      !Number.isSafeInteger(verdict.epoch) || verdict.epoch < 1 ||
      !Number.isSafeInteger(verdict.tick) || verdict.tick < 0 || !verdict.id.startsWith(`pair-tick-${verdict.tick}-`) ||
      !Array.isArray(verdict.captures) || verdict.captures.length !== 2) {
    throw Error('Choose an identical, paused IKeMeter Snapshot pair verdict');
  }
  const [first, second] = verdict.captures.map(link => readCandidate(directory, verdict, link));
  if (first.id === second.id || first.sha256 !== second.sha256 || first.width !== second.width ||
      first.height !== second.height || !isDeepStrictEqual(first.engine, second.engine)) {
    throw Error('The retained Snapshot candidates do not agree');
  }
  if (Object.hasOwn(verdict,'rootCustomStates') && !isDeepStrictEqual(verdict.rootCustomStates,
    matchingRootCustomStates(first.frame.entities,second.frame.entities))) {
    throw Error('Custom-state observations disagree with the frozen capture pair');
  }
  return {verdict, first, second};
}

function entityId(entity) {
  if (!entityKinds.has(entity?.kind)) return undefined;
  return entity.kind === 'projectile' ? entity.observationId : entity.runtimeId;
}

function reviewedEntity(evidence, kind, id) {
  if (!entityKinds.has(kind) || !Number.isSafeInteger(id) || id < 0) throw Error('Select a captured entity by its kind and ID');
  const matches = candidate => candidate.frame.entities.filter(entity => entity?.kind === kind && entityId(entity) === id);
  const first = matches(evidence.first), second = matches(evidence.second);
  if (first.length !== 1 || second.length !== 1 || !isDeepStrictEqual(first[0], second[0])) {
    throw Error('Captured entity is missing, ambiguous, or disagrees between the paused sidecars');
  }
  return first[0];
}

module.exports = {loadSnapshotReviewEvidence, entityId, reviewedEntity, readBoundedFile};
