'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { types: utilTypes } = require('util');
const { canonicalize, hashCanonical } = require('./sff_capability_report');

const SCHEMA = 'ikemaker.sff-creator-state-root-authority';
const VERSION = 1;
const DIRECTORY_NAME = 'sff-creator-state';
const SEAL_NAME = 'sff-creator-state-root.json';
const UNSUPPORTED_DIRECTORY_SYNC_CODES = new Set(['EACCES', 'EBADF', 'EINVAL', 'EISDIR', 'ENOSYS', 'ENOTSUP', 'EPERM']);

function fail(message, cause) { throw new Error(`SFF Creator state root: ${message}`, cause ? { cause } : undefined); }
function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function key(value) { const normalized = path.resolve(value); return process.platform === 'win32' ? normalized.toLowerCase() : normalized; }
function freeze(value) { if (!value || typeof value !== 'object' || Buffer.isBuffer(value) || ArrayBuffer.isView(value) || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
function closed(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) fail(`${label} must be a plain non-proxy object.`);
  const descriptors = Object.getOwnPropertyDescriptors(value), found = Object.keys(descriptors).sort();
  if (Object.getOwnPropertySymbols(value).length || JSON.stringify(found) !== JSON.stringify([...keys].sort())) fail(`${label} must contain exactly ${[...keys].sort().join(', ')}.`);
  for (const name of found) if (!descriptors[name].enumerable || !Object.prototype.hasOwnProperty.call(descriptors[name], 'value')) fail(`${label}.${name} must be an enumerable data property.`);
  return Object.fromEntries(found.map(name => [name, descriptors[name].value]));
}
function pathArray(value, label) {
  if (!Array.isArray(value) || utilTypes.isProxy(value) || Object.getOwnPropertySymbols(value).length) fail(`${label} must be a non-proxy array.`);
  const descriptors = Object.getOwnPropertyDescriptors(value), names = Object.keys(descriptors).filter(name => name !== 'length');
  if (names.length !== value.length || names.some((name, index) => name !== String(index))) fail(`${label} must be a dense array.`);
  return names.map(name => { const descriptor = descriptors[name], item = descriptor.value; if (!descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || typeof item !== 'string' || !item || item.length > 4096) fail(`${label}[${name}] must be bounded nonempty path text.`); return path.resolve(item); });
}
function identity(stat) { return { device: String(stat.dev), inode: String(stat.ino) }; }
function sameIdentity(left, right) { return String(left.dev) === right.device && String(left.ino) === right.inode; }
function overlaps(left, right) { const a = key(left), b = key(right), relativeAB = path.relative(a, b), relativeBA = path.relative(b, a); return a === b || (!!relativeAB && !relativeAB.startsWith('..') && !path.isAbsolute(relativeAB)) || (!!relativeBA && !relativeBA.startsWith('..') && !path.isAbsolute(relativeBA)); }

function makeSealer(dependencies) {
  const deps = closed(dependencies, ['fault', 'fsApi'], 'state-root dependencies'), io = deps.fsApi;
  if (!io || typeof io !== 'object' || typeof deps.fault !== 'function') fail('state-root dependencies are invalid.');
  for (const name of ['closeSync', 'existsSync', 'fsyncSync', 'lstatSync', 'mkdirSync', 'openSync', 'readFileSync', 'readdirSync', 'realpathSync', 'statSync', 'writeSync']) if (typeof io[name] !== 'function') fail(`filesystem dependency ${name} is unavailable.`);

  function real(filename) { return io.realpathSync.native ? io.realpathSync.native(filename) : io.realpathSync(filename); }
  function directDirectory(filename, label) {
    const lexical = path.resolve(filename), lstat = io.lstatSync(lexical, { bigint: true });
    if (!lstat.isDirectory() || lstat.isSymbolicLink()) fail(`${label} must be a direct non-linked directory.`);
    const canonical = real(lexical), stat = io.statSync(canonical, { bigint: true });
    if (key(canonical) !== key(lexical) || !stat.isDirectory() || !sameIdentity(lstat, identity(stat))) fail(`${label} has an aliased or unstable identity.`);
    return { path: lexical, realpath: canonical, identity: identity(stat) };
  }
  function syncDirectory(filename, statuses) {
    let descriptor = null;
    try {
      descriptor = io.openSync(filename, 'r'); io.fsyncSync(descriptor); statuses.push('completed');
    } catch (error) {
      if (!UNSUPPORTED_DIRECTORY_SYNC_CODES.has(String(error?.code || ''))) throw error;
      statuses.push('unsupported-by-platform');
    } finally { if (descriptor != null) io.closeSync(descriptor); }
  }
  function ensureDirectory(filename, label, syncStatuses) {
    if (io.existsSync(filename)) {
      const sealed = directDirectory(filename, label), parent = directDirectory(path.dirname(filename), `${label} parent`);
      syncDirectory(sealed.realpath, syncStatuses); syncDirectory(parent.realpath, syncStatuses);
      return { ...sealed, created: false };
    }
    const parent = directDirectory(path.dirname(filename), `${label} parent`);
    deps.fault(`before-create:${label}`);
    try { io.mkdirSync(filename, { recursive: false, mode: 0o700 }); } catch (error) { if (!io.existsSync(filename)) throw error; }
    deps.fault(`after-create:${label}`);
    const sealed = directDirectory(filename, label);
    syncDirectory(sealed.realpath, syncStatuses); syncDirectory(parent.realpath, syncStatuses);
    return { ...sealed, created: true };
  }
  function ensureGlobalStorage(filename, syncStatuses) {
    const resolved = path.resolve(filename);
    if (io.existsSync(resolved)) return ensureDirectory(resolved, 'globalStorageUri', syncStatuses);
    const missing = []; let cursor = resolved;
    while (!io.existsSync(cursor)) { missing.push(cursor); const parent = path.dirname(cursor); if (parent === cursor) fail('globalStorageUri has no existing direct ancestor.'); cursor = parent; }
    directDirectory(cursor, 'globalStorageUri existing ancestor');
    let created = false;
    for (const segment of missing.reverse()) { const item = ensureDirectory(segment, 'globalStorageUri', syncStatuses); created = created || item.created; }
    return { ...directDirectory(resolved, 'globalStorageUri'), created };
  }
  function sealBoundary(filename, kind) {
    const lexical = path.resolve(filename);
    if (!io.existsSync(lexical)) {
      let cursor = path.dirname(lexical);
      while (!io.existsSync(cursor)) { const parent = path.dirname(cursor); if (parent === cursor) fail(`${kind} path has no existing direct ancestor.`); cursor = parent; }
      const ancestor = directDirectory(cursor, `${kind} nearest existing ancestor`);
      return { kind, path: lexical, exists: false, nearestExistingAncestor: ancestor.realpath, identity: null };
    }
    const lstat = io.lstatSync(lexical, { bigint: true }); if (lstat.isSymbolicLink()) fail(`${kind} path must not be a link or junction.`);
    const canonical = real(lexical), stat = io.statSync(canonical, { bigint: true });
    if (key(canonical) !== key(lexical) || !sameIdentity(lstat, identity(stat))) fail(`${kind} path has an aliased or unstable identity.`);
    return { kind, path: lexical, exists: true, nearestExistingAncestor: canonical, identity: identity(stat) };
  }
  function retainRootSeal(storage, state, syncStatuses) {
    const sealPath = path.join(storage.realpath, SEAL_NAME), body = {
      schema: 'ikemaker.sff-creator-state-root-seal', version: 1, directoryName: DIRECTORY_NAME,
      globalStorage: { realpath: storage.realpath, identity: storage.identity }, stateRoot: { realpath: state.realpath, identity: state.identity }
    };
    const sealHash = hashCanonical(body), value = { ...body, sealHash }, expectedBytes = Buffer.from(`${JSON.stringify(canonicalize(value, 'SFF Creator state-root seal'))}\n`);
    if (io.existsSync(sealPath)) {
      const lstat = io.lstatSync(sealPath, { bigint: true });
      if (!lstat.isFile() || lstat.isSymbolicLink() || lstat.nlink !== 1n || key(real(sealPath)) !== key(sealPath)) fail('retained state-root seal is linked or unsafe.');
      const retained = io.readFileSync(sealPath); if (!retained.equals(expectedBytes)) fail('retained state-root seal does not match the exact current storage/root identity.');
      return { path: sealPath, sealHash, artifactByteHash: sha(retained), created: false };
    }
    if (io.readdirSync(state.realpath).length) fail('an unsealed pre-existing state root must be empty.');
    deps.fault('before-root-seal-write');
    const descriptor = io.openSync(sealPath, 'wx', 0o600);
    try { io.writeSync(descriptor, expectedBytes, 0, expectedBytes.length, 0); io.fsyncSync(descriptor); }
    finally { io.closeSync(descriptor); }
    deps.fault('after-root-seal-write'); syncDirectory(storage.realpath, syncStatuses);
    const retained = io.readFileSync(sealPath); if (!retained.equals(expectedBytes)) fail('state-root seal failed exact reopen verification.');
    return { path: sealPath, sealHash, artifactByteHash: sha(retained), created: true };
  }

  return function sealCreatorStateRoot(rawInput) {
    const input = closed(rawInput, ['activePaths', 'candidatePaths', 'globalStorageUri', 'historyRoots', 'workspaceRoots'], 'state-root input');
    const uri = closed(input.globalStorageUri, ['fsPath', 'scheme'], 'globalStorageUri');
    if (uri.scheme !== 'file' || typeof uri.fsPath !== 'string' || !uri.fsPath || uri.fsPath.length > 4096 || !path.isAbsolute(uri.fsPath)) fail('globalStorageUri must be an absolute file URI projection.');
    const boundaryGroups = [
      ['workspace', pathArray(input.workspaceRoots, 'workspaceRoots')], ['active', pathArray(input.activePaths, 'activePaths')],
      ['candidate', pathArray(input.candidatePaths, 'candidatePaths')], ['history', pathArray(input.historyRoots, 'historyRoots')]
    ];
    const duplicates = new Set(), boundaries = [];
    for (const [kind, values] of boundaryGroups) for (const filename of values) { const id = `${kind}:${key(filename)}`; if (duplicates.has(id)) fail(`${kind} paths must not contain duplicates.`); duplicates.add(id); boundaries.push(sealBoundary(filename, kind)); }
    boundaries.sort((left, right) => left.kind.localeCompare(right.kind) || key(left.path).localeCompare(key(right.path)));

    const requestedStorage = path.resolve(uri.fsPath), requestedStateRoot = path.join(requestedStorage, DIRECTORY_NAME), requestedSeal = path.join(requestedStorage, SEAL_NAME);
    for (const boundary of boundaries) if (overlaps(requestedStateRoot, boundary.path) || overlaps(requestedSeal, boundary.path)) fail(`state root collides with ${boundary.kind} path ${boundary.path}.`);
    const syncStatuses = [], storage = ensureGlobalStorage(requestedStorage, syncStatuses), desiredStateRoot = path.join(storage.realpath, DIRECTORY_NAME);
    const state = ensureDirectory(desiredStateRoot, 'state root', syncStatuses);
    if (state.identity.device === storage.identity.device && state.identity.inode === storage.identity.inode) fail('state root identity collides with globalStorageUri.');
    for (const boundary of boundaries) if (boundary.identity && boundary.identity.device === state.identity.device && boundary.identity.inode === state.identity.inode) fail(`state root device/inode identity collides with ${boundary.kind} path.`);
    const retainedSeal = retainRootSeal(storage, state, syncStatuses); deps.fault('after-state-root-sealed');

    const directorySyncStatus = syncStatuses.includes('unsupported-by-platform') ? 'unsupported-by-platform' : 'completed';
    const authorityBody = {
      schema: SCHEMA, version: VERSION, directoryName: DIRECTORY_NAME,
      globalStorage: { path: storage.path, realpath: storage.realpath, identity: storage.identity },
      stateRoot: { path: state.path, realpath: state.realpath, identity: state.identity },
      retainedSeal: { path: retainedSeal.path, sealHash: retainedSeal.sealHash, artifactByteHash: retainedSeal.artifactByteHash },
      exclusions: boundaries,
      exclusionHash: hashCanonical(boundaries), directorySyncStatus,
      physicalCertificationClaimed: false, executionAuthorityGranted: false, adoptionAllowed: false
    };
    const authorityHash = hashCanonical(authorityBody), authority = freeze({ ...authorityBody, authorityHash });
    const artifactBytes = Buffer.from(`${JSON.stringify(canonicalize(authority, 'SFF Creator state-root authority'))}\n`);
    return freeze({
      authority, authorityHash, artifactBytes, artifactByteHash: sha(artifactBytes),
      stateRootPath: state.realpath, created: storage.created || state.created || retainedSeal.created,
      effects: { globalStorageCreated: storage.created, stateRootCreated: state.created, rootSealCreated: retainedSeal.created, projectFilesWritten: false, activeArchiveModified: false, candidateModified: false, historyModified: false }
    });
  };
}

const sealCreatorStateRoot = makeSealer({ fsApi: fs, fault() {} });
function createCreatorStateRootSealerForTest(dependencies = {}) { return makeSealer({ fsApi: dependencies.fsApi || fs, fault: dependencies.fault || (() => {}) }); }
function sealCreatorStateRootFromContext(context, boundaries) {
  if (!context || typeof context !== 'object' || !context.globalStorageUri) fail('extension context with globalStorageUri is required.');
  return sealCreatorStateRoot({ ...boundaries, globalStorageUri: { scheme: context.globalStorageUri.scheme, fsPath: context.globalStorageUri.fsPath } });
}

module.exports = { DIRECTORY_NAME, SCHEMA, SEAL_NAME, VERSION, createCreatorStateRootSealerForTest, sealCreatorStateRoot, sealCreatorStateRootFromContext };
