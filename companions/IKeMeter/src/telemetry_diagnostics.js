'use strict';

// Owned stdout/stderr line diagnostics for ikemeter.player-telemetry v1.
//
// Contract (see test/telemetry_diagnostics.test.js):
// - write(source, buffer) splits each owned stream into LF-terminated lines.
//   A CR immediately before the LF (or at end of stream) is not part of the
//   line. Each stream keeps its own partial line; chunk and UTF-8 sequence
//   splits across writes are joined before decoding.
// - Each completed line becomes one unsequenced event. The collector assigns
//   seq/receivedMs/retention. Text is never parsed: origin and severity stay
//   "unknown", attribution fields stay null and provenance is "owned-stream".
// - At most MAX_EVENT_BYTES of a line are held. Longer lines are cut at a
//   UTF-8 character boundary and the remainder is drained (counted, not held)
//   until the line ends. Invalid UTF-8 becomes U+FFFD and the decoded text is
//   capped again at MAX_EVENT_BYTES. originalBytes is the line's byte length
//   without its terminator, or null if it cannot be counted safely.
// - At most EVENT_QUOTA lines are accepted per rolling QUOTA_WINDOW_MS shared
//   by both streams. now() is read once per write/end call. A line over quota
//   is counted, not decoded. onDrop(count) is called at most once per call,
//   with only those quota drops; nothing else is reported as a known drop.
// - end(source) emits that stream's pending partial line (subject to quota)
//   and ignores later writes to it. close() discards pending partial lines,
//   stops all callbacks and ignores later calls. Both are idempotent.
// - Callbacks run synchronously. If onEvent or onDrop throws, the instance
//   closes itself and the error is rethrown to the write/end caller. Calling
//   write or end from inside a callback throws; close() from inside a
//   callback stops processing of the rest of the current call.
// - No payload is written to disk and nothing is retained after emission.

const { performance } = require('node:perf_hooks');

const MAX_EVENT_BYTES = 4096;
const EVENT_QUOTA = 100;
const QUOTA_WINDOW_MS = 1000;
const SOURCES = Object.freeze(['stdout', 'stderr']);
const LF = 0x0a;
const CR = 0x0d;

const decoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true });

// Largest cut <= length that does not split a multibyte sequence.
function utf8Boundary(bytes, length) {
  if (length <= 0) return 0;
  const stop = Math.max(0, length - 4);
  let lead = length - 1;
  while (lead >= stop && (bytes[lead] & 0xc0) === 0x80) lead--;
  if (lead < stop) return length;
  const byte = bytes[lead];
  const size = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc0 ? 2 : 1;
  return lead + size > length ? lead : length;
}

function capText(text, max) {
  if (Buffer.byteLength(text, 'utf8') <= max) return { text, capped: false };
  let bytes = 0, end = 0;
  for (const character of text) {
    const size = Buffer.byteLength(character, 'utf8');
    if (bytes + size > max) break;
    bytes += size;
    end += character.length;
  }
  return { text: text.slice(0, end), capped: true };
}

function createTelemetryDiagnostics({ onEvent, onDrop, now = () => performance.now() } = {}) {
  if (typeof onEvent !== 'function') throw new TypeError('onEvent must be a function.');
  if (typeof onDrop !== 'function') throw new TypeError('onDrop must be a function.');
  if (typeof now !== 'function') throw new TypeError('now must be a function.');

  const streams = new Map(SOURCES.map(source => [source, {
    kept: Buffer.alloc(MAX_EVENT_BYTES), keptLength: 0, original: 0, lastCR: false, ended: false
  }]));
  const accepted = new Array(EVENT_QUOTA);
  let head = 0, count = 0, lastNow = -Infinity, closed = false, busy = false;

  function streamFor(source) {
    const stream = streams.get(source);
    if (!stream) throw new TypeError('source must be "stdout" or "stderr".');
    return stream;
  }

  function clock() {
    const value = now();
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError('now() must return a finite number.');
    lastNow = Math.max(lastNow, value);
    return lastNow;
  }

  function admit(at) {
    while (count && at - accepted[head] >= QUOTA_WINDOW_MS) { head = (head + 1) % EVENT_QUOTA; count--; }
    if (count >= EVENT_QUOTA) return false;
    accepted[(head + count) % EVENT_QUOTA] = at;
    count++;
    return true;
  }

  function shutdown() {
    closed = true;
    for (const stream of streams.values()) { stream.keptLength = 0; stream.original = 0; stream.lastCR = false; }
  }

  function call(callback, value) {
    try { callback(value); }
    catch (error) { shutdown(); throw error; }
  }

  function append(stream, chunk, start, end) {
    if (end <= start) return;
    const length = end - start;
    const room = MAX_EVENT_BYTES - stream.keptLength;
    if (room > 0) {
      const copied = Math.min(room, length);
      chunk.copy(stream.kept, stream.keptLength, start, start + copied);
      stream.keptLength += copied;
    }
    if (stream.original !== null) {
      stream.original = stream.original + length > Number.MAX_SAFE_INTEGER ? null : stream.original + length;
    }
    stream.lastCR = chunk[end - 1] === CR;
  }

  function complete(source, stream, at, drops) {
    const { kept, keptLength, original, lastCR } = stream;
    stream.keptLength = 0; stream.original = 0; stream.lastCR = false;
    if (!admit(at)) { drops.count++; return; }
    const content = original === null ? null : original - (lastCR ? 1 : 0);
    const cut = content !== null && content <= keptLength;
    const used = cut ? content : utf8Boundary(kept, keptLength);
    const { text, capped } = capText(decoder.decode(kept.subarray(0, used)), MAX_EVENT_BYTES);
    call(onEvent, Object.freeze({
      source, origin: 'unknown', severity: 'unknown', text, truncated: !cut || capped,
      originalBytes: content, tickDomain: null, tick: null, entityId: null, stateNo: null,
      provenance: 'owned-stream'
    }));
  }

  function run(operation) {
    if (busy) throw new Error('Telemetry diagnostics cannot be re-entered from a callback.');
    busy = true;
    try {
      const drops = { count: 0 };
      operation(clock(), drops);
      if (drops.count && !closed) call(onDrop, drops.count);
    } finally {
      busy = false;
    }
  }

  return Object.freeze({
    write(source, chunk) {
      const stream = streamFor(source);
      if (!Buffer.isBuffer(chunk)) throw new TypeError('write() needs a Buffer.');
      if (closed || stream.ended || chunk.length === 0) return;
      run((at, drops) => {
        let position = 0;
        while (position < chunk.length && !closed) {
          const newline = chunk.indexOf(LF, position);
          append(stream, chunk, position, newline === -1 ? chunk.length : newline);
          if (newline === -1) break;
          complete(source, stream, at, drops);
          position = newline + 1;
        }
      });
    },
    end(source) {
      const stream = streamFor(source);
      if (closed || stream.ended) return;
      run((at, drops) => {
        stream.ended = true;
        if (stream.original !== 0) complete(source, stream, at, drops);
      });
    },
    close() {
      if (!closed) shutdown();
    }
  });
}

module.exports = { createTelemetryDiagnostics, MAX_EVENT_BYTES, EVENT_QUOTA, QUOTA_WINDOW_MS, utf8Boundary };
