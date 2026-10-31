'use strict';

const { deepFreeze } = require('./viewer_toolbar_contract');
const MODES = Object.freeze(['visual', 'source', 'split']);
const PANES = Object.freeze(['visual', 'source']);
const VERSION = 2;
const MAX_DOCUMENT_STATES = 512;
const MAX_CONTEXT_STATES = 512;
const MAX_OFFSET = 4 * 1024 * 1024;
const MAX_SCROLL = 10000000;

function key(contextId, surfaceId) { return `${String(contextId)}\0${String(surfaceId)}`; }
function ratio(value) { const number = Number(value); return Number.isFinite(number) ? Math.max(0.2, Math.min(0.8, number)) : 0.5; }
function boundedInteger(value, maximum) { return Number.isSafeInteger(value) ? Math.max(0, Math.min(maximum, value)) : 0; }
function token(value) { const text = typeof value === 'string' ? value : ''; return Buffer.byteLength(text, 'utf8') <= 4096 ? text : ''; }
function documentView(value = {}, sourceLength = MAX_OFFSET) {
  const maximum = Math.max(0, Math.min(MAX_OFFSET, Number.isSafeInteger(sourceLength) ? sourceLength : MAX_OFFSET));
  const start = boundedInteger(value.selectionStart, maximum), end = Math.max(start, boundedInteger(value.selectionEnd, maximum));
  return deepFreeze({ selectionStart:start, selectionEnd:end, selectionDirection:['forward','backward','none'].includes(value.selectionDirection) ? value.selectionDirection : 'none', scrollTop:boundedInteger(value.scrollTop, MAX_SCROLL), scrollLeft:boundedInteger(value.scrollLeft, MAX_SCROLL) });
}
function documentViews(value) {
  const result = {};
  for (const [identity, state] of Object.entries(value && typeof value === 'object' && !Array.isArray(value) ? value : {}).slice(0, MAX_DOCUMENT_STATES)) {
    if (typeof identity !== 'string' || !identity || Buffer.byteLength(identity, 'utf8') > 8192) continue;
    result[identity] = documentView(state);
  }
  return result;
}
function normalized(input = {}) {
  const mode = MODES.includes(input.mode) ? input.mode : 'visual';
  return deepFreeze({
    mode,
    splitRatio: ratio(input.splitRatio),
    focusedPane: PANES.includes(input.focusedPane) ? input.focusedPane : (mode === 'source' ? 'source' : 'visual'),
    panes: {
      visual: { scrollToken: token(input.panes?.visual?.scrollToken), selectionToken: token(input.panes?.visual?.selectionToken) },
      source: { scrollToken: token(input.panes?.source?.scrollToken), selectionToken: token(input.panes?.source?.selectionToken) }
    },
    documents: documentViews(input.documents)
  });
}

class AuthoringViewState {
  constructor(serialized) { this.states = new Map(); if (serialized) this.restore(serialized); }
  has(contextId, surfaceId) { return this.states.has(key(contextId, surfaceId)); }
  get(contextId, surfaceId) { return this.states.get(key(contextId, surfaceId)) || normalized(); }
  set(contextId, surfaceId, patch) {
    if (!contextId || !surfaceId) throw new Error('View state requires contextId and surfaceId.');
    if (Buffer.byteLength(String(contextId), 'utf8') > 4096 || Buffer.byteLength(String(surfaceId), 'utf8') > 256) throw new Error('View state identity exceeds the supported limit.');
    const previous = this.get(contextId, surfaceId), next = normalized({ ...previous, ...patch, panes: { visual: { ...previous.panes.visual, ...patch?.panes?.visual }, source: { ...previous.panes.source, ...patch?.panes?.source } }, documents:Object.prototype.hasOwnProperty.call(patch || {}, 'documents') ? patch.documents : previous.documents });
    this.states.delete(key(contextId, surfaceId)); this.states.set(key(contextId, surfaceId), next);
    while (this.states.size > MAX_CONTEXT_STATES) this.states.delete(this.states.keys().next().value);
    return next;
  }
  document(contextId, surfaceId, documentId, sourceLength = MAX_OFFSET) { return documentView(this.get(contextId, surfaceId).documents?.[String(documentId)], sourceLength); }
  setDocument(contextId, surfaceId, documentId, value) {
    if (typeof documentId !== 'string' || !documentId || Buffer.byteLength(documentId, 'utf8') > 8192) throw new Error('Document view state requires a bounded identity.');
    const previous = this.get(contextId, surfaceId), entries = Object.entries(previous.documents || {}).filter(([identity]) => identity !== documentId);
    entries.push([documentId, documentView(value)]);
    return this.set(contextId, surfaceId, { documents:Object.fromEntries(entries.slice(-MAX_DOCUMENT_STATES)) });
  }
  presentation(contextId, surfaceId, preference) {
    if (!['native', 'integrated'].includes(preference)) throw new Error('Authoring presentation preference must resolve to native or integrated first.');
    return preference === 'native' ? deepFreeze({ integrated: false, mode: 'native', saved: this.get(contextId, surfaceId) }) : deepFreeze({ integrated: true, ...this.get(contextId, surfaceId) });
  }
  serialize() {
    return deepFreeze({ version: VERSION, entries: [...this.states.entries()].map(([identity, state]) => ({ identity, state })).sort((a, b) => a.identity.localeCompare(b.identity)) });
  }
  restore(value) {
    if (![1, VERSION].includes(value?.version) || !Array.isArray(value.entries)) return false;
    const restored = new Map();
    for (const entry of value.entries.slice(-MAX_CONTEXT_STATES)) if (typeof entry?.identity === 'string' && entry.identity.includes('\0') && Buffer.byteLength(entry.identity, 'utf8') <= 4353) restored.set(entry.identity, normalized(entry.state));
    this.states = restored; return true;
  }
}

module.exports = { MODES, PANES, VERSION, MAX_DOCUMENT_STATES, MAX_CONTEXT_STATES, MAX_OFFSET, MAX_SCROLL, documentView, normalized, AuthoringViewState };
