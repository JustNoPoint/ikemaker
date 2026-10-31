'use strict';

const { parseDef } = require('./def_model');

const SCHEMA_VERSION = 1;
const MAX_SCENE_LINES = 4096;
const MAX_SCENE_BYTES = 1024 * 1024;
const MAX_SCENE_NUMBER = 999999;

function eolOf(text) { return String(text).includes('\r\n') ? '\r\n' : '\n'; }
function sectionEnd(document, line) {
  const next = document.sections.find(section => section.line > line);
  return next ? next.line : document.lines.length;
}
function sceneAt(document, line) {
  const section = document.sections.find(item => item.line === Number(line));
  const match = section && /^scene\s+(\d+)$/i.exec(section.name);
  if (!section || !match) throw new Error('The selected storyboard scene no longer exists.');
  const number = Number(match[1]);
  if (!Number.isSafeInteger(number) || number < 0 || number > MAX_SCENE_NUMBER) throw new Error('The selected scene number is outside the supported range.');
  return { section, number };
}
function validateLines(lines) {
  if (!Array.isArray(lines) || !lines.length || lines.length > MAX_SCENE_LINES || lines.some(line => typeof line !== 'string')) throw new Error('The copied scene is malformed or too large.');
  const bytes = Buffer.byteLength(lines.join('\n'), 'utf8');
  if (bytes > MAX_SCENE_BYTES) throw new Error('The copied scene is larger than 1 MiB.');
}
function captureScene(text, line) {
  const document = parseDef(text), found = sceneAt(document, line), lines = document.lines.slice(found.section.line, sectionEnd(document, found.section.line));
  validateLines(lines);
  return Object.freeze({ schemaVersion: SCHEMA_VERSION, kind: 'storyboard-scene', sourceNumber: found.number, lines: Object.freeze([...lines]) });
}
function normalizeClipboard(raw) {
  if (!raw || Object.getPrototypeOf(raw) !== Object.prototype || Object.keys(raw).sort().join('\0') !== ['kind','lines','schemaVersion','sourceNumber'].sort().join('\0') || raw.schemaVersion !== SCHEMA_VERSION || raw.kind !== 'storyboard-scene' || !Number.isSafeInteger(raw.sourceNumber) || raw.sourceNumber < 0 || raw.sourceNumber > MAX_SCENE_NUMBER) throw new Error('The copied scene is invalid. Copy it again.');
  validateLines(raw.lines);
  const header = /^\s*\[\s*scene\s+(\d+)\s*\]/i.exec(raw.lines[0]);
  if (!header || Number(header[1]) !== raw.sourceNumber) throw new Error('The copied scene header is invalid. Copy it again.');
  return { schemaVersion: SCHEMA_VERSION, kind: 'storyboard-scene', sourceNumber: raw.sourceNumber, lines: [...raw.lines] };
}
function nextSceneNumber(document) {
  const used = new Set(document.sections.map(section => /^scene\s+(\d+)$/i.exec(section.name)).filter(Boolean).map(match => Number(match[1])).filter(number => Number.isSafeInteger(number) && number >= 0 && number <= MAX_SCENE_NUMBER));
  const maximum = used.size ? Math.max(...used) : -1;
  if (maximum < MAX_SCENE_NUMBER) return maximum + 1;
  for (let number = 0; number <= MAX_SCENE_NUMBER; number += 1) if (!used.has(number)) return number;
  throw new Error('No free storyboard scene number remains in the supported range.');
}
function pasteScene(text, rawClipboard) {
  const clipboard = normalizeClipboard(rawClipboard), document = parseDef(text), number = nextSceneNumber(document), lines = [...clipboard.lines];
  lines[0] = lines[0].replace(/^(\s*)\[[^\]]+\](.*)$/, `$1[Scene ${number}]$2`);
  const eol = eolOf(text), prefix = String(text).endsWith('\n') ? '' : eol;
  return { text: `${text}${prefix}${lines.join(eol)}${eol}`, number };
}

module.exports = { SCHEMA_VERSION, MAX_SCENE_LINES, MAX_SCENE_BYTES, MAX_SCENE_NUMBER, captureScene, normalizeClipboard, nextSceneNumber, pasteScene };
