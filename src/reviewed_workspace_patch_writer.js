'use strict';

const crypto = require('crypto');
const path = require('path');
const { types: utilTypes } = require('util');

const SCHEMA = 'ikemaker.reviewed-workspace-patch';
const MAX_SOURCE_BYTES = 16 * 1024 * 1024;
const MAX_PATCH_BYTES = 1024 * 1024;
const MAX_PATH_BYTES = 32768;
const HASH = /^[A-F0-9]{64}$/;
const KEYS = ['afterHash', 'before', 'beforeHash', 'documentVersion', 'end', 'policy', 'replacement', 'schema', 'sourcePath', 'sourceWasDirty', 'sourceWasOpen', 'start', 'version'];
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);

function hash(value) { return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').toUpperCase(); }
function exactKeys(value, keys) { return Boolean(value) && Object.keys(value).sort().join(',') === keys.slice().sort().join(','); }
function plain(value, stack = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || utilTypes.isProxy(value) || stack.has(value)) return false;
  stack.add(value); const keys = Object.keys(value), own = Reflect.ownKeys(value), prototype = Object.getPrototypeOf(value);
  const descriptor = key => { const item = Object.getOwnPropertyDescriptor(value, key); return Boolean(item && Object.prototype.hasOwnProperty.call(item, 'value') && plain(item.value, stack)); };
  const valid = !Array.isArray(value) && (prototype === Object.prototype || prototype === null) && own.length === keys.length && keys.every(key => !FORBIDDEN.has(key) && descriptor(key));
  stack.delete(value); return valid;
}
function deeplyFrozen(value, seen = new WeakSet()) { if (!value || typeof value !== 'object') return true; if (seen.has(value)) return true; if (!Object.isFrozen(value)) return false; seen.add(value); return Object.values(value).every(item => deeplyFrozen(item, seen)); }
function absoluteNormalized(value) { return typeof value === 'string' && value.length > 0 && Buffer.byteLength(value, 'utf8') <= MAX_PATH_BYTES && !value.includes('\0') && path.isAbsolute(value) && path.normalize(value) === value; }
function samePath(left, right) { const a = path.resolve(left), b = path.resolve(right); return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b; }
function fail(code, message) { const error = new Error(message); error.code = `reviewed-workspace-patch:${code}`; throw error; }

function validateOperation(operation) {
  if (!plain(operation) || !deeplyFrozen(operation) || !exactKeys(operation, KEYS) || operation.schema !== SCHEMA || operation.version !== 1) fail('invalid-operation', 'The reviewed workspace patch descriptor is not exact, plain, and deeply frozen.');
  if (!absoluteNormalized(operation.sourcePath) || !HASH.test(operation.beforeHash) || !HASH.test(operation.afterHash) || typeof operation.sourceWasOpen !== 'boolean' || typeof operation.sourceWasDirty !== 'boolean') fail('invalid-operation', 'The reviewed workspace patch identity is invalid.');
  if (operation.sourceWasOpen ? !Number.isSafeInteger(operation.documentVersion) || operation.documentVersion < 0 : operation.documentVersion !== null || operation.sourceWasDirty !== false) fail('invalid-operation', 'The reviewed workspace patch document state is invalid.');
  if (!Number.isSafeInteger(operation.start) || !Number.isSafeInteger(operation.end) || operation.start < 0 || operation.end < operation.start || operation.end > MAX_SOURCE_BYTES || typeof operation.before !== 'string' || typeof operation.replacement !== 'string' || operation.before.length !== operation.end - operation.start) fail('invalid-operation', 'The reviewed workspace patch range is invalid.');
  if (Buffer.byteLength(operation.before, 'utf8') > MAX_PATCH_BYTES || Buffer.byteLength(operation.replacement, 'utf8') > MAX_PATCH_BYTES) fail('invalid-operation', 'The reviewed workspace patch exceeds its byte limit.');
  if (operation.policy === 'insert') { if (operation.start !== operation.end || operation.before !== '' || operation.replacement === '') fail('invalid-operation', 'The reviewed insertion policy requires one nonempty zero-width insertion.'); }
  else if (operation.policy === 'replace') { if (operation.end <= operation.start || operation.before === '' || operation.replacement === '') fail('invalid-operation', 'The reviewed replacement policy requires one nonempty narrow replacement.'); }
  else if (operation.policy === 'remove') { if (operation.end <= operation.start || operation.before === '' || operation.replacement !== '') fail('invalid-operation', 'The reviewed removal policy requires one nonempty narrow source range.'); }
  else fail('invalid-operation', 'The reviewed workspace patch policy is unsupported.');
  return operation;
}

async function applyReviewedWorkspacePatch(document, operation, services = {}) {
  validateOperation(operation);
  const workspace = services.workspace, WorkspaceEdit = services.WorkspaceEdit, Range = services.Range;
  if (!document || !workspace || typeof workspace.applyEdit !== 'function' || typeof WorkspaceEdit !== 'function' || (operation.policy !== 'insert' && typeof Range !== 'function') || typeof document.getText !== 'function' || typeof document.positionAt !== 'function' || typeof document.offsetAt !== 'function') fail('invalid-host', 'The reviewed workspace patch requires one exact open editor document and edit host.');
  if (!samePath(document.fileName, operation.sourcePath) || document.isClosed === true || typeof document.isDirty !== 'boolean' || !Number.isSafeInteger(document.version) || document.version < 0) fail('stale-document', 'The reviewed workspace patch document identity is stale.');
  if (operation.sourceWasOpen) {
    if (document.version !== operation.documentVersion || document.isDirty !== operation.sourceWasDirty) fail('stale-document', 'The reviewed open document version or dirty state changed.');
  } else if (document.isDirty !== false) fail('stale-document', 'The reviewed closed source did not open as a clean editor document.');
  const beforeText = document.getText();
  if (beforeText.length > MAX_SOURCE_BYTES || Buffer.byteLength(beforeText, 'utf8') > MAX_SOURCE_BYTES || hash(beforeText) !== operation.beforeHash || operation.end > beforeText.length || (beforeText.length > 0 && operation.start === 0 && operation.end === beforeText.length) || beforeText.slice(operation.start, operation.end) !== operation.before) fail('stale-document', 'The reviewed source text or narrow patch boundary changed.');
  const afterText = beforeText.slice(0, operation.start) + operation.replacement + beforeText.slice(operation.end);
  if (afterText === beforeText || hash(afterText) !== operation.afterHash) fail('invalid-operation', 'The reviewed after-text hash is inconsistent.');
  const start = document.positionAt(operation.start), end = document.positionAt(operation.end);
  if (!start || !end || document.offsetAt(start) !== operation.start || document.offsetAt(end) !== operation.end) fail('offset-mismatch', 'The reviewed workspace patch no longer maps to exact editor positions.');
  const edit = new WorkspaceEdit();
  if (operation.policy === 'insert') edit.insert(document.uri, start, operation.replacement);
  else edit.replace(document.uri, new Range(start, end), operation.replacement);
  const appliedPromise = workspace.applyEdit(edit);
  const applied = await appliedPromise;
  if (applied !== true) fail('apply-rejected', 'VS Code rejected the reviewed workspace patch.');
  const actual = document.getText();
  if (actual !== afterText || hash(actual) !== operation.afterHash) fail('postcondition', 'The editor result differs from the reviewed workspace patch.');
  return Object.freeze({ applied: true, beforeVersion: operation.sourceWasOpen ? operation.documentVersion : null, afterVersion: document.version, beforeHash: operation.beforeHash, afterHash: operation.afterHash });
}

module.exports = { SCHEMA, MAX_SOURCE_BYTES, MAX_PATCH_BYTES, MAX_PATH_BYTES, hash, validateOperation, applyReviewedWorkspacePatch };
