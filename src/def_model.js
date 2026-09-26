'use strict';

function uncomment(line) {
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"' && line[index - 1] !== '\\') quoted = !quoted;
    if (line[index] === ';' && !quoted) return line.slice(0, index);
  }
  return line;
}

function normalize(value) { return String(value || '').trim().toLowerCase(); }

function parseDef(text, filename = '') {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  const sections = [];
  let section = { name: '', normalized: '', line: 0, entries: [] };
  sections.push(section);
  lines.forEach((raw, line) => {
    const code = uncomment(raw).trim();
    const match = code.match(/^\[([^\]]+)\]\s*$/);
    if (match) {
      section = { name: match[1].trim(), normalized: normalize(match[1]), line, entries: [] };
      sections.push(section);
      return;
    }
    if (!code) return;
    const equals = code.indexOf('=');
    if (equals < 0) return;
    section.entries.push({
      key: code.slice(0, equals).trim(),
      normalized: normalize(code.slice(0, equals)),
      value: code.slice(equals + 1).trim(),
      line,
      raw
    });
  });
  return { filename, text: String(text || ''), lines, sections };
}

function sections(document, name) {
  const wanted = normalize(name);
  return document.sections.filter((section) => section.normalized === wanted);
}

function entry(section, key) {
  const wanted = normalize(key);
  return [...(section && section.entries || [])].reverse().find((item) => item.normalized === wanted) || null;
}

function value(section, key, fallback = '') {
  const found = entry(section, key);
  return found ? found.value : fallback;
}

function number(value, fallback = 0) {
  const parsed = Number.parseFloat(String(value || '').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function tuple(input, length = 2, fallback = 0) {
  const parts = String(input || '').split(',').map((item) => number(item, fallback));
  while (parts.length < length) parts.push(fallback);
  return parts.slice(0, length);
}

function integerTuple(input, length = 2, fallback = 0) {
  return tuple(input, length, fallback).map((item) => Math.trunc(item));
}

function unquote(input) {
  const text = String(input || '').trim();
  return text.length >= 2 && text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text;
}

function sectionMap(section) {
  const result = {};
  for (const item of section && section.entries || []) result[item.normalized] = item.value;
  return result;
}

function kind(document) {
  const names = new Set(document.sections.map((section) => section.normalized));
  if (names.has('stageinfo') || names.has('camera') && names.has('bgdef')) return 'stage';
  if (names.has('files') && ([...names].some((name) => /(?:^|\s)(?:title|select|versus|option|menu)\s+info$/.test(name)) || names.has('title info'))) return 'screenpack';
  if (names.has('files') && (names.has('lifebar') || names.has('round') || names.has('powerbar'))) return 'lifebar';
  return 'unknown';
}

function setSectionEntry(document, sectionLine, key, nextValue) {
  const target = document.sections.find((section) => section.line === sectionLine);
  if (!target) throw new Error(`Section at line ${sectionLine + 1} was not found.`);
  const existing = entry(target, key);
  const lines = [...document.lines];
  if (existing) {
    const raw = lines[existing.line];
    let quoted = false, commentAt = -1;
    for (let index = 0; index < raw.length; index += 1) {
      if (raw[index] === '"' && raw[index - 1] !== '\\') quoted = !quoted;
      if (raw[index] === ';' && !quoted) { commentAt = index; break; }
    }
    const code = commentAt >= 0 ? raw.slice(0, commentAt) : raw;
    const comment = commentAt >= 0 ? raw.slice(commentAt) : '';
    const equals = code.indexOf('=');
    const prefix = equals >= 0 ? code.slice(0, equals + 1) : `${key} =`;
    const spacing = /\s$/.test(prefix) ? '' : ' ';
    lines[existing.line] = `${prefix}${spacing}${nextValue}${comment ? ` ${comment.trimStart()}` : ''}`;
  } else {
    const laterSection = document.sections.find((section) => section.line > target.line);
    const insertAt = laterSection ? laterSection.line : lines.length;
    lines.splice(insertAt, 0, `${key} = ${nextValue}`);
  }
  return lines.join(document.text.includes('\r\n') ? '\r\n' : '\n');
}

module.exports = { parseDef, sections, entry, value, number, tuple, integerTuple, unquote, sectionMap, kind, uncomment, normalize, setSectionEntry };
