'use strict';

const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { TextDecoder } = require('node:util');

const MAX_BYTES = 64 * 1024 * 1024;
const MAX_TEXT_TOKEN = 4096 * 6;
const MAX_DEPTH = 12;
const MAX_STRUCTURAL_TOKENS = 6000000;
const MAX_INT = 2147483647;
const PINNED_ENGINE_SHA256 = '73bcd922ec7e3b471a0bfc16c9d00a756e9d8abc7e0f11819a6b1bac4d63f27f';
const REASONS = ['unsupported', 'disabled', 'failed-read', 'failed-redirect', 'inactive', 'budget', 'unavailable'];
const FIELDS = [
  ['posX', 'Position X', 'Raw units, camera-relative'], ['posY', 'Position Y', 'Raw units, positive down'],
  ['posZ', 'Position Z', 'Raw units, depth toward stage bottom'],
  ['velX', 'Velocity X', 'Units/tick, facing-relative'], ['velY', 'Velocity Y', 'Units/tick'],
  ['velZ', 'Velocity Z', 'Units/tick'], ['configuredYAccel', 'Configured Y acceleration', 'Loaded units/tick²'],
  ['effectiveGravity', 'Effective gravity', 'Units/tick²'], ['stateNo', 'StateNo'], ['prevStateNo', 'PrevStateNo'],
  ['anim', 'Animation'], ['ctrl', 'Control'], ['moveType', 'MoveType'], ['stateType', 'StateType'],
  ['physics', 'Physics'], ['stateTime', 'StateTime', 'Ticks'], ['hitPauseTime', 'HitPauseTime', 'Ticks'],
  ['pauseTime', 'PauseTime', 'Ticks'], ['facing', 'Facing'], ['cameraPosX', 'Camera X', 'Raw units'],
  ['localCoordX', 'Local coordinate X'], ['localCoordY', 'Local coordinate Y'],
  ['stateOwnerSlot', 'Observed state owner slot'], ['animOwnerSlot', 'Observed AIR owner slot'],
  ['spriteOwnerSlot', 'Observed sprite owner slot'], ['runOrder', 'Run order'], ['spriteGroup', 'Resolved sprite group'],
  ['spriteImage', 'Resolved sprite image'], ['drawPalGroup', 'Draw palette group'],
  ['drawPalIndex', 'Draw palette index'], ['palNo', 'Selected palette']
];
const KEYS = FIELDS.map(([key]) => key);
const EVENTS = ['seq', 'receivedMs', 'source', 'origin', 'severity', 'text', 'truncated', 'originalBytes',
  'tickDomain', 'tick', 'entityId', 'stateNo', 'provenance'];
const RETENTION = ['seconds', 'exportedAtMs', 'byteLimit', 'retainedBytes', 'indexBytes', 'evictedFrames',
  'evictedEvents', 'droppedEvents', 'truncatedEvents', 'duplicateCallbacks', 'evictedThroughSeq',
  'upstreamLossUnknown', 'evictedBy'];
const EVICTION_REASONS = ['age', 'bytes', 'index', 'eventQuota'];

function check(condition, subject) {
  if (!condition) throw new Error('Invalid player telemetry ' + subject + '.');
}

function object(value, keys, subject) {
  check(value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), subject);
}

function integer(value, low = 0, high = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= low && value <= high;
}

function signed(value) { return integer(value, -MAX_INT - 1, MAX_INT); }
function tick(value) { return integer(value, 0, MAX_INT); }
function digest(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function label(value, max) {
  return typeof value === 'string' && value.trim() && value.length <= max &&
    !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value);
}

function records(value, max, subject) {
  check(Array.isArray(value) && value.length <= max, subject);
}

function parseUniqueJson(input, options = {}) {
  const { assert = check, maxDepth = MAX_DEPTH, maxTokens = MAX_STRUCTURAL_TOKENS,
    maxStringToken = MAX_TEXT_TOKEN, maxEntries = 32768 } = options;
  // Walk strings and delimiters before allocating the parsed tree.
  const stack = [];
  assert(input.trimStart().startsWith('{'), 'envelope');
  let elements = 0;
  for (let i = 0; i < input.length; i++) {
    const character = input[i];
    if (character === '{' || character === '[') {
      stack.push({ keys: character === '{' ? new Set() : null, commas: 0 });
      assert(stack.length <= maxDepth, 'nesting depth');
      assert(++elements <= maxTokens, 'structure. Export a smaller clip');
    } else if (character === '}' || character === ']') {
      assert(stack.length, 'JSON');
      stack.pop();
    } else if (character === ',') {
      const container = stack.at(-1);
      assert(container && ++container.commas < maxEntries, 'container entries');
      assert(++elements <= maxTokens, 'structure. Export a smaller clip');
    } else if (character === '"') {
      const start = i++;
      while (i < input.length && input[i] !== '"') {
        if (input[i] === '\\') i++;
        i++;
        assert(i - start <= maxStringToken + 1, 'string length');
      }
      assert(i < input.length, 'JSON string');
      let next = i + 1;
      while (next < input.length && ' \t\r\n'.includes(input[next])) next++;
      if (input[next] === ':') {
        const names = stack.at(-1)?.keys, key = JSON.parse(input.slice(start, i + 1));
        assert(names && names.size < 32 && !names.has(key), 'duplicate or oversized object keys');
        names.add(key);
      }
    }
  }
  assert(stack.length === 0, 'JSON');
  return JSON.parse(input);
}

function validateRoot(root, session, slots, ids) {
  object(root, ['slot', 'teamSide', 'id', 'generation', 'validMask', 'values', 'reasons'], 'root keys');
  check(session.rootSlots.includes(root.slot) && !slots.has(root.slot) && tick(root.id) && !ids.has(root.id) &&
    (root.teamSide === null || root.teamSide === 1 || root.teamSide === 2) &&
    integer(root.generation, 1) && integer(root.validMask, 0, MAX_INT), 'root identity');
  slots.add(root.slot);
  ids.add(root.id);
  object(root.values, KEYS, 'root value keys');
  const missing = KEYS.filter(key => root.values[key] === null);
  object(root.reasons, missing, 'root absence keys');
  for (const [index, key] of KEYS.entries()) {
    const value = root.values[key], valid = !!(root.validMask & 2 ** index);
    check(valid === (value !== null), 'value mask');
    if (!valid) {
      check(REASONS.includes(root.reasons[key]), 'absence reason');
      continue;
    }
    check(session.capabilities[key] === 'stock', 'value capability');
    let matches;
    if (index < 8 || (index >= 19 && index <= 21)) matches = Number.isFinite(value);
    else if (key === 'ctrl') matches = typeof value === 'boolean';
    else if (key === 'moveType') matches = ['I', 'A', 'H'].includes(value);
    else if (key === 'stateType' || key === 'physics') matches = ['S', 'C', 'A', 'L', 'N'].includes(value);
    else if (key === 'facing') matches = value === -1 || value === 1;
    else matches = signed(value);
    check(matches, key + ' value');
  }
}

function validateEvent(event, session, retention) {
  object(event, EVENTS, 'diagnostic keys');
  const { source, origin, severity, text, truncated, originalBytes, tickDomain, tick: observedTick,
    entityId, stateNo, provenance } = event;
  check(integer(event.seq, 1) && ['stdout', 'stderr', 'meter'].includes(source) &&
    ['unknown', 'meter', 'engine', 'authored'].includes(origin) &&
    ['unknown', 'info', 'warning', 'error'].includes(severity) && typeof text === 'string' &&
    !/[\uD800-\uDFFF]/u.test(text) && Buffer.byteLength(text) <= 4096 && typeof truncated === 'boolean' &&
    (originalBytes === null || integer(originalBytes)), 'diagnostic data');
  // originalBytes counts the source bytes, which may decode to replacement characters.
  check([null, 'gameTime', 'tickCount'].includes(tickDomain) &&
    (tickDomain === null ? observedTick === null : integer(observedTick, 0, tickDomain === 'gameTime' ? MAX_INT : Number.MAX_SAFE_INTEGER)) &&
    (entityId === null || tick(entityId)) && (stateNo === null || signed(stateNo)), 'diagnostic scope');
  check(typeof provenance === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(provenance), 'diagnostic provenance');
  if (source === 'meter' || origin === 'meter' || provenance === 'meter-diagnostic') {
    check(source === 'meter' && origin === 'meter' && provenance === 'meter-diagnostic', 'Meter diagnostic origin');
  } else {
    check(session.diagnostics[source] === 'owned-stream', 'diagnostic stream capability');
    if (provenance === 'owned-stream') check(origin === 'unknown' && severity === 'unknown' && tickDomain === null &&
      entityId === null && stateNo === null, 'unparsed diagnostic scope');
  }
  check(event.receivedMs <= retention.exportedAtMs, 'diagnostic receipt');
}

function validateClip(clip) {
  object(clip, ['schema', 'version', 'includeDiagnostics', 'session', 'retention', 'frames', 'events', 'gaps', 'links'], 'envelope');
  check(clip.schema === 'ikemeter.player-telemetry' && clip.version === 1 &&
    typeof clip.includeDiagnostics === 'boolean', 'schema or version');
  const { session, retention, frames, events, gaps, links } = clip;
  object(session, ['id', 'epoch', 'engineSha256', 'phase', 'rootSlots', 'capabilities', 'diagnostics'], 'session keys');
  check(label(session.id, 160) && integer(session.epoch, 1) && digest(session.engineSha256) &&
    session.phase === 'post-action-ui-loop' && Array.isArray(session.rootSlots) &&
    ['1,2', '1,2,3,4'].includes(session.rootSlots.join(',')) &&
    session.rootSlots.every((slot, index) => slot === index + 1), 'session identity');
  object(session.capabilities, KEYS, 'capability keys');
  check(KEYS.every(key => ['stock', 'unavailable', 'disabled'].includes(session.capabilities[key])) &&
    (session.engineSha256 !== PINNED_ENGINE_SHA256 || session.capabilities.effectiveGravity === 'unavailable'), 'capabilities');
  object(session.diagnostics, ['stdout', 'stderr', 'internalConsole'], 'diagnostic capabilities');
  check(['stdout', 'stderr'].every(key => ['owned-stream', 'unavailable'].includes(session.diagnostics[key])) &&
    session.diagnostics.internalConsole === 'unavailable', 'diagnostic capabilities');

  object(retention, RETENTION, 'retention keys');
  object(retention.evictedBy, EVICTION_REASONS, 'eviction keys');
  check(EVICTION_REASONS.every(key => integer(retention.evictedBy[key])) &&
    RETENTION.filter(key => !['evictedThroughSeq', 'upstreamLossUnknown', 'evictedBy'].includes(key))
      .every(key => integer(retention[key])) &&
    retention.upstreamLossUnknown === true &&
    (retention.evictedFrames === 0 ? retention.evictedThroughSeq === null : integer(retention.evictedThroughSeq, 1)) &&
    retention.seconds >= 30 && retention.seconds <= 300 && retention.seconds % 30 === 0 &&
    retention.indexBytes <= retention.retainedBytes && retention.retainedBytes <= retention.byteLimit &&
    retention.byteLimit <= MAX_BYTES, 'retention values');

  records(frames, 32768, 'frame count');
  records(events, 2000, 'diagnostic count');
  records(gaps, 32768, 'gap count');
  records(links, 4096, 'finding link count');
  check(clip.includeDiagnostics || events.length === 0, 'diagnostic export opt-in');
  const receiptValid = (current, previous) => integer(current) && current >= previous &&
    current <= retention.exportedAtMs && retention.exportedAtMs - current < retention.seconds * 1000;
  const frameBySeq = new Map();
  let received = -1, seq = retention.evictedThroughSeq || 0, previousTick = -1;
  for (const frame of frames) {
    object(frame, ['seq', 'receivedMs', 'gameTime', 'paused', 'roots', 'missingSlots'], 'frame keys');
    check(integer(frame.seq, 1) && frame.seq > seq && tick(frame.gameTime) && frame.gameTime > previousTick &&
      receiptValid(frame.receivedMs, received) && (frame.paused === null || typeof frame.paused === 'boolean'), 'frame sequence');
    records(frame.roots, session.rootSlots.length, 'root count');
    records(frame.missingSlots, session.rootSlots.length, 'missing slot count');
    const slots = new Set(), ids = new Set();
    for (const root of frame.roots) validateRoot(root, session, slots, ids);
    for (const missing of frame.missingSlots) {
      object(missing, ['slot', 'reason'], 'missing slot keys');
      check(session.rootSlots.includes(missing.slot) && !slots.has(missing.slot) && REASONS.includes(missing.reason), 'missing slot');
      slots.add(missing.slot);
    }
    check(slots.size === session.rootSlots.length, 'slot coverage');
    check(Buffer.byteLength(JSON.stringify(frame)) <= 32768, 'frame byte budget');
    frameBySeq.set(frame.seq, frame);
    seq = frame.seq;
    previousTick = frame.gameTime;
    received = frame.receivedMs;
  }

  received = -1;
  seq = 0;
  let oldest = 0;
  for (const [index, event] of events.entries()) {
    validateEvent(event, session, retention);
    check(event.seq > seq && receiptValid(event.receivedMs, received), 'diagnostic sequence');
    while (event.receivedMs - events[oldest].receivedMs >= 1000) oldest++;
    check(index - oldest < 100, 'diagnostic rate budget');
    received = event.receivedMs;
    seq = event.seq;
  }
  received = -1;
  for (const gap of gaps) {
    object(gap, ['receivedMs', 'kind', 'fromTick', 'toTick', 'count', 'reason'], 'gap keys');
    check(receiptValid(gap.receivedMs, received) && ['tick-gap', 'discontinuity', 'partial', 'event-loss', 'transport'].includes(gap.kind) &&
      ((gap.fromTick === null && gap.toTick === null) ||
        (tick(gap.fromTick) && tick(gap.toTick) && gap.fromTick <= gap.toTick)) &&
      (gap.count === null || integer(gap.count)) && label(gap.reason, 256), 'gap coverage');
    received = gap.receivedMs;
  }

  const linkKeys = new Set();
  for (const link of links) {
    object(link, ['frameSeq', 'slot', 'entityId', 'generation', 'findingId', 'findingsSha256'], 'finding link keys');
    const frame = frameBySeq.get(link.frameSeq);
    const key = JSON.stringify([link.frameSeq, link.slot, link.findingId, link.findingsSha256]);
    check(frame?.roots.some(root => root.slot === link.slot && root.id === link.entityId && root.generation === link.generation) &&
      label(link.findingId, 160) && digest(link.findingsSha256) && !linkKeys.has(key), 'finding link identity');
    linkKeys.add(key);
  }
  return clip;
}

function parseClip(bytes) {
  check(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= MAX_BYTES, 'file size');
  const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return validateClip(parseUniqueJson(decoded));
}

async function readBoundedJsonFile(filename, maxBytes, assert = check) {
  const candidate = await fs.promises.stat(filename);
  assert(candidate.isFile() && candidate.size > 0 && candidate.size <= maxBytes, 'file size');
  const handle = await fs.promises.open(filename, 'r');
  try {
    const before = await handle.stat();
    assert(before.isFile() && before.size > 0 && before.size <= maxBytes, 'file size');
    const data = Buffer.allocUnsafe(before.size);
    for (let offset = 0; offset < data.length;) {
      const { bytesRead } = await handle.read(data, offset, data.length - offset, offset);
      assert(bytesRead > 0, 'file changed while reading');
      offset += bytesRead;
    }
    const after = await handle.stat();
    assert(before.size === after.size && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs,
      'file changed while reading');
    return data;
  } finally {
    await handle.close();
  }
}

async function openClip(filename) {
  const data = await readBoundedJsonFile(filename, MAX_BYTES);
  return { clip: parseClip(data), sha256: createHash('sha256').update(data).digest('hex') };
}

module.exports = { MAX_BYTES, PINNED_ENGINE_SHA256, FIELDS, parseClip, validateClip, openClip, parseUniqueJson, readBoundedJsonFile };

