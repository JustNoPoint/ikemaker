'use strict';

const { createHash } = require('node:crypto');
const { TextDecoder } = require('node:util');
const { relativePath } = require('./ikemeter_findings');
const { parseUniqueJson, readBoundedJsonFile } = require('./ikemeter_telemetry_model');

const SCHEMA = 'ikemeter.watch-log';
const LIMITS = Object.freeze({ bytes: 8 * 1024 * 1024, records: 16384, hints: 16, string: 256, path: 1024 });
const INT_MAX = 2147483647;
const INT_MIN = -2147483648;
const VARIABLE_KINDS = ['var', 'fvar', 'sysvar', 'sysfvar'];
const EFFECT_KINDS = ['helper', 'explod', 'projectile'];
const KINDS = Object.freeze([...VARIABLE_KINDS, 'map', ...EFFECT_KINDS]);
const EVENTS = ['baseline', 'change', 'first', 'last', 'count', 'gap'];
const COVERAGE = ['complete', 'partial', 'unknown'];
const TOP = ['schema', 'version', 'engineBuild', 'projectId', 'sessionId', 'epoch', 'records'];
const OPTIONAL_TOP = ['retentionSeconds', 'dropped', 'truncated'];
const ROW = ['seq', 'tick', 'receiptMs', 'kind', 'ownerId', 'parentId', 'rootId', 'entityId', 'authoredId',
  'ordinal', 'generation', 'field', 'key', 'mapIndex', 'before', 'after', 'event', 'coverage', 'sourceHints'];
const HINT = ['role', 'grade', 'path', 'sha256', 'line', 'column', 'endLine', 'endColumn'];
const STATE_CONTEXT = ['current', 'previous', 'runStateTarget', 'executingEntityId'];
const STATE_ENDPOINT = ['tick', 'entityId', 'stateNo', 'stateOwnerSlot'];

function check(condition, subject) {
  if (!condition) throw new Error(`Invalid IKeMeter watch log ${subject}.`);
}

function exactFields(value, required, optional, subject) {
  check(value && typeof value === 'object' && !Array.isArray(value) &&
    required.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => required.includes(key) || optional.includes(key)), subject);
}

function integer(value, low = 0, high = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= low && value <= high;
}

function boundedString(value, bytes = LIMITS.string) {
  return typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= bytes;
}

function label(value) {
  return boundedString(value) && value.trim().length > 0;
}

function scalar(value) {
  return value === null || typeof value === 'boolean' || Number.isFinite(value) || boundedString(value);
}

function sourceHint(value) {
  exactFields(value, HINT, [], 'source hint fields');
  check(['write', 'read', 'spawn'].includes(value.role) && ['candidate', 'proven'].includes(value.grade), 'source hint role or grade');
  check(boundedString(value.path, LIMITS.path) && typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.sha256), 'source hint path or SHA-256');
  const filename = relativePath(value.path);
  check(boundedString(filename, LIMITS.path), 'source hint path');
  const { line, column, endLine, endColumn } = value;
  check([line, column, endLine, endColumn].every(point => integer(point, 1)) &&
    (endLine > line || endLine === line && endColumn > column), 'source hint range');
  // The schema records source locations. It supplies no execution proof.
  return { role: value.role, grade: 'candidate', path: filename, sha256: value.sha256, line, column, endLine, endColumn };
}

function stateContext(value, row) {
  exactFields(value, STATE_CONTEXT, [], 'state context fields');
  check(value.runStateTarget === null && value.executingEntityId === null, 'state context execution witness');
  check(row.event !== 'gap' || value.current === null && value.previous === null, 'gap state context');
  check(row.event !== 'last' || value.current === null, 'departure current state context');
  const sampledEntityId = row.kind === 'helper' && row.field === 'presence' ? row.entityId : row.ownerId;
  for (const [name, tick] of [['current', row.tick], ['previous', row.tick - 1]]) {
    const endpoint = value[name];
    if (endpoint === null) continue;
    exactFields(endpoint, STATE_ENDPOINT, [], 'state endpoint fields');
    check(integer(endpoint.tick, INT_MIN, INT_MAX) && endpoint.tick === tick, 'state endpoint tick');
    check(integer(endpoint.entityId, 0, INT_MAX) && endpoint.entityId === sampledEntityId, 'state endpoint entity');
    check(integer(endpoint.stateNo, INT_MIN, INT_MAX), 'sampled state number');
    check(endpoint.stateOwnerSlot === null || integer(endpoint.stateOwnerSlot, 1, 12), 'state owner slot');
  }
}

function watchRow(row, prior) {
  exactFields(row, ROW, ['reason', 'droppedCount', 'slot', 'ownerHelperId', 'stateContext'], 'row fields');
  check(integer(row.seq, 1) && (!prior || row.seq > prior.seq), 'sequence order');
  check(integer(row.tick, INT_MIN, INT_MAX) && integer(row.receiptMs) &&
    (!prior || row.receiptMs >= prior.receiptMs), 'tick or receipt order');
  check(KINDS.includes(row.kind) && EVENTS.includes(row.event) && COVERAGE.includes(row.coverage) && label(row.field), 'row kind, event, coverage or field');
  for (const name of ['ownerId', 'parentId', 'rootId', 'entityId', 'authoredId', 'ordinal']) {
    check(row[name] === null || integer(row[name], 0, INT_MAX), name);
  }
  check(row.generation === null || integer(row.generation), 'generation');
  if (Object.hasOwn(row, 'slot')) check(integer(row.slot, 1, 4), 'configured root slot');
  if (Object.hasOwn(row, 'ownerHelperId')) check(row.ownerHelperId === null || integer(row.ownerHelperId, 0, INT_MAX), 'configured helper filter');
  check(row.mapIndex === null || row.kind === 'map' && integer(row.mapIndex, INT_MIN, INT_MAX), 'Map index');
  const unobservedKey = row.key === null && (row.event === 'gap' || row.coverage !== 'complete');
  if (VARIABLE_KINDS.includes(row.kind)) check(unobservedKey || integer(row.key, 0, INT_MAX), 'variable index');
  else if (row.kind === 'map') check(unobservedKey || label(row.key) && row.key === row.key.toLowerCase(), 'Map key');
  else check(row.key === null, 'effect key');
  check(scalar(row.before) && scalar(row.after), 'before or after value');
  check(!['first', 'last'].includes(row.event) || row.coverage === 'complete', 'appearance or departure coverage');
  if (row.event === 'gap') {
    check(row.coverage !== 'complete' && row.before === null && row.after === null && label(row.reason) &&
      Object.hasOwn(row, 'droppedCount'), 'gap evidence');
  }
  if (Object.hasOwn(row, 'reason')) check(label(row.reason), 'coverage reason');
  if (Object.hasOwn(row, 'droppedCount')) check(row.droppedCount === null || integer(row.droppedCount, 1), 'dropped count');
  if (Object.hasOwn(row, 'stateContext')) stateContext(row.stateContext, row);
  check(Array.isArray(row.sourceHints) && row.sourceHints.length <= LIMITS.hints, 'source hint count');
  return { ...row, sourceHints: row.sourceHints.map(sourceHint) };
}

function contextGapKey(row, tick) {
  if (row.slot === undefined) return null;
  const identityScoped = row.ownerHelperId != null || row.kind === 'helper' && row.field === 'presence';
  const entity = row.kind === 'helper' ? row.entityId : row.ownerId;
  if (identityScoped && entity === null) return null;
  return JSON.stringify([tick, row.slot, row.ownerHelperId ?? null, row.kind, row.field, row.key, row.mapIndex, row.authoredId,
    identityScoped ? entity : null]);
}

function validateWatchLog(value) {
  exactFields(value, TOP, OPTIONAL_TOP, 'envelope fields');
  check(value.schema === SCHEMA && value.version === 1, 'schema or version');
  check(typeof value.engineBuild === 'string' && /^[a-f0-9]{40}$/.test(value.engineBuild) &&
    (value.projectId === null || label(value.projectId)) && label(value.sessionId) && integer(value.epoch), 'capture identity');
  if (Object.hasOwn(value, 'retentionSeconds')) check(integer(value.retentionSeconds, 30, 300), 'retention seconds');
  for (const counter of ['dropped', 'truncated']) if (Object.hasOwn(value, counter)) check(integer(value[counter]), counter);
  check(Array.isArray(value.records) && value.records.length <= LIMITS.records, 'record count');
  const records = [], gaps = new Set();
  for (const row of value.records) {
    const record = watchRow(row, records.at(-1));
    if (record.stateContext?.previous) check(!gaps.has(contextGapKey(record, record.stateContext.previous.tick)), 'previous state after a recorded gap');
    if (record.event === 'gap') {
      const key = contextGapKey(record, record.tick);
      if (key !== null) gaps.add(key);
    }
    records.push(record);
  }
  return { ...value, records };
}

function parseWatchLog(bytes) {
  check(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= LIMITS.bytes, 'file size');
  let decoded;
  try { decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('The IKeMeter watch log must be valid UTF-8.'); }
  const parsed = parseUniqueJson(decoded, {
    assert: check, maxDepth: 6, maxTokens: 1000000, maxStringToken: LIMITS.path * 6, maxEntries: LIMITS.records
  });
  return validateWatchLog(parsed);
}

async function openWatchLog(filename) {
  const bytes = await readBoundedJsonFile(filename, LIMITS.bytes, check);
  return { log: parseWatchLog(bytes), sha256: createHash('sha256').update(bytes).digest('hex') };
}

module.exports = { KINDS, LIMITS, SCHEMA, openWatchLog, parseWatchLog, validateWatchLog };
