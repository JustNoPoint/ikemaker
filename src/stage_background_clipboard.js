'use strict';

const { parseDef } = require('./def_model');
const { uniqueSectionName } = require('./visual_component_model');

const SCHEMA_VERSION = 1;
const MAX_SECTION_CHARS = 1024 * 1024;

function eolOf(text) { return String(text).includes('\r\n') ? '\r\n' : '\n'; }
function lineStarts(text) {
  const starts = [0], pattern = /\r\n|\n|\r/g;
  let match;
  while ((match = pattern.exec(text))) starts.push(pattern.lastIndex);
  return starts;
}
function sectionAt(text, line) {
  const document = parseDef(text), section = document.sections.find(item => item.name && item.line === Number(line));
  if (!section || !/^bg(?:\s|$)/i.test(section.name)) throw new Error('The selected Stage BG section no longer exists.');
  return { document, section };
}
function sectionSpan(text, line) {
  text = String(text);
  const { document, section } = sectionAt(text, line), next = document.sections.find(item => item.line > section.line), starts = lineStarts(text);
  return { section, start: starts[section.line] ?? text.length, end: next ? (starts[next.line] ?? text.length) : text.length };
}
function capture(text, line, metadata = {}) {
  const span = sectionSpan(text, line), source = String(text).slice(span.start, span.end);
  if (!source || source.length > MAX_SECTION_CHARS) throw new Error(`The Stage BG section exceeds the ${MAX_SECTION_CHARS.toLocaleString()} character clipboard limit.`);
  return validate(Object.freeze({ schemaVersion: SCHEMA_VERSION, kind: 'ikemaker-stage-bg', sectionName: span.section.name, source, metadata: Object.freeze({ sourceFile: String(metadata.sourceFile || '').slice(0, 4096) }) }));
}
function validate(payload) {
  const plain = value => value && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  if (!plain(payload) || Object.keys(payload).sort().join('\0') !== ['schemaVersion','kind','sectionName','source','metadata'].sort().join('\0') || payload.schemaVersion !== SCHEMA_VERSION || payload.kind !== 'ikemaker-stage-bg' || typeof payload.sectionName !== 'string' || !payload.sectionName.length || payload.sectionName.length > 512 || !/^bg(?:\s|$)/i.test(payload.sectionName) || typeof payload.source !== 'string' || !payload.source.length || payload.source.length > MAX_SECTION_CHARS || !plain(payload.metadata) || Object.keys(payload.metadata).join('\0') !== 'sourceFile' || typeof payload.metadata.sourceFile !== 'string' || payload.metadata.sourceFile.length > 4096) throw new Error('The in-session IKEMaker BG clipboard is empty or invalid.');
  if (!/^\s*\[\s*bg(?:\s|\])/i.test(payload.source)) throw new Error('The in-session clipboard no longer contains a complete Stage BG section.');
  return payload;
}
function renamedSource(payload, text, desiredName = payload.sectionName) {
  validate(payload);
  const name = uniqueSectionName(parseDef(text), desiredName), firstEnd = payload.source.search(/\r\n|\n|\r/), headerEnd = firstEnd < 0 ? payload.source.length : firstEnd;
  return { name, source: `[${name}]${payload.source.slice(headerEnd)}` };
}
function insert(text, targetLine, payload, placement = 'after', desiredName) {
  if (!['before', 'after'].includes(placement)) throw new Error('Choose whether to paste before or after the selected Stage BG.');
  text = String(text); const target = sectionSpan(text, targetLine), renamed = renamedSource(payload, text, desiredName), eol = eolOf(text);
  const at = placement === 'before' ? target.start : target.end, prefix = at > 0 && !/[\r\n]$/.test(text.slice(0, at)) ? eol : '';
  return { text: text.slice(0, at) + prefix + renamed.source + (renamed.source.endsWith('\n') || renamed.source.endsWith('\r') ? '' : eol) + text.slice(at), identity: renamed.name };
}
function remove(text, line) {
  text = String(text); const span = sectionSpan(text, line);
  return text.slice(0, span.start) + text.slice(span.end);
}
function duplicate(text, line) {
  const payload = capture(text, line), base = `${payload.sectionName} Copy`;
  return insert(text, line, payload, 'after', base);
}
function reorder(text, sourceLines, targetLine, placement = 'before') {
  if (!['before', 'after'].includes(placement)) throw new Error('Choose whether to place the Stage BG sections before or after the target.');
  text = String(text); const unique = [...new Set((sourceLines || []).map(Number))];
  if (!unique.length || unique.length > 512) throw new Error('Select between 1 and 512 Stage BG sections to move.');
  const sources = unique.map(line => sectionSpan(text, line)).sort((a,b)=>a.start-b.start), target = sectionSpan(text, targetLine);
  if (sources.some(span => span.start === target.start)) throw new Error('Drop the selected backgrounds on a different target.');
  const moved = sources.map(span => text.slice(span.start, span.end)).join(''), removedBefore = offset => sources.filter(span => span.end <= offset).reduce((sum,span)=>sum+span.end-span.start,0);
  let retained = '', cursor = 0;
  for (const span of sources) { retained += text.slice(cursor, span.start); cursor = span.end; }
  retained += text.slice(cursor);
  const originalAt = placement === 'before' ? target.start : target.end, at = originalAt - removedBefore(originalAt);
  return retained.slice(0,at) + moved + retained.slice(at);
}

class StageBackgroundClipboard {
  constructor() { this.payload = null; }
  set(payload) { this.payload = validate(payload); return this.payload; }
  get() { return this.payload ? validate(this.payload) : null; }
  clear() { this.payload = null; }
}

module.exports = { SCHEMA_VERSION, MAX_SECTION_CHARS, StageBackgroundClipboard, capture, validate, insert, remove, duplicate, reorder, sectionSpan };
