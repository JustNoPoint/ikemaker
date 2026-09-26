'use strict';

const { parseDef, normalize } = require('./def_model');

function eolOf(text) { return String(text).includes('\r\n') ? '\r\n' : '\n'; }
function cleanName(value, fallback = 'New Element') { return String(value || fallback).replace(/[\[\]\r\n]/g, ' ').trim() || fallback; }
function sectionEnd(document, line) {
  const next = document.sections.find((item) => item.line > line);
  return next ? next.line : document.lines.length;
}
function assertUniqueSection(document, name) {
  if (document.sections.some((item) => item.normalized === normalize(name))) throw new Error(`[${name}] already exists.`);
}
function appendSection(text, name, entries = {}) {
  const document = parseDef(text); name = cleanName(name); assertUniqueSection(document, name);
  const eol = eolOf(text), prefix = String(text).endsWith('\n') ? '' : eol;
  const lines = [`[${name}]`, ...Object.entries(entries).filter(([, value]) => value !== undefined && value !== null && String(value) !== '').map(([key, value]) => `${key} = ${value}`), ''];
  return `${text}${prefix}${lines.join(eol)}`;
}
function duplicateSection(text, sectionLine, newName) {
  const document = parseDef(text), source = document.sections.find((item) => item.line === Number(sectionLine));
  if (!source || !source.name) throw new Error('The selected section no longer exists.');
  newName = cleanName(newName, `${source.name} Copy`); assertUniqueSection(document, newName);
  const lines = document.lines.slice(source.line, sectionEnd(document, source.line));
  lines[0] = `[${newName}]`;
  return appendRaw(text, lines);
}
function deleteSection(text, sectionLine) {
  const document = parseDef(text), source = document.sections.find((item) => item.line === Number(sectionLine));
  if (!source || !source.name) throw new Error('The selected section no longer exists.');
  const lines = [...document.lines], end = sectionEnd(document, source.line);
  lines.splice(source.line, end - source.line);
  while (source.line < lines.length && !lines[source.line].trim() && source.line > 0 && !lines[source.line - 1].trim()) lines.splice(source.line, 1);
  return lines.join(eolOf(text));
}
function appendRaw(text, lines) { const eol = eolOf(text), prefix = String(text).endsWith('\n') ? '' : eol; return `${text}${prefix}${lines.join(eol)}${eol}`; }
function appendStageBackground(text, options = {}) {
  const name = cleanName(options.name, 'New Background'), type = String(options.type || 'normal').toLowerCase();
  const entries = { type };
  if (type === 'anim') entries.actionno = Number(options.action) || 0;
  else entries.spriteno = options.sprite || '0,0';
  entries.start = options.start || '0,0'; entries.delta = options.delta || '1,1'; entries.layerno = Number(options.layer) || 0;
  if (type === 'parallax') entries.width = options.width || '320,320';
  return appendSection(text, `BG ${name}`, entries);
}
function elementEntries(base, options = {}) {
  base = String(base || '').trim(); const key = (suffix) => base ? `${base}.${suffix}` : suffix;
  const out = { [key('pos')]: options.pos || '160,120' };
  if (options.kind === 'anim') out[key('anim')] = Number(options.reference) || 0;
  else if (options.kind === 'text') out[key('font')] = options.reference || '0,0,0';
  else out[key('spr')] = options.reference || '0,0';
  out[key('layerno')] = Number(options.layer) || 0;
  return out;
}
function appendUiElement(text, sectionLine, base, options = {}) {
  const document = parseDef(text), section = document.sections.find((item) => item.line === Number(sectionLine));
  if (!section) throw new Error('The selected UI section no longer exists.');
  const entries = elementEntries(base, options), existing = new Set(section.entries.map((item) => item.normalized));
  for (const key of Object.keys(entries)) if (existing.has(normalize(key))) throw new Error(`${key} already exists in [${section.name}].`);
  const lines = [...document.lines], at = sectionEnd(document, section.line);
  lines.splice(at, 0, ...Object.entries(entries).map(([key, value]) => `${key} = ${value}`), '');
  return lines.join(eolOf(text));
}

module.exports = { appendSection, duplicateSection, deleteSection, appendStageBackground, appendUiElement, elementEntries };
