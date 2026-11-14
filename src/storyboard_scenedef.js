'use strict';

const crypto = require('crypto');
const def = require('./def_model');

const DEFAULTS = Object.freeze({
  'key.skip': 's',
  'key.cancel': 'a, b, c, x, y, z, m',
  stopmusic: '1',
  disablecancel: '0',
  waitforloading: '0',
  startscene: '0',
  snd: ''
});
const FIELDS = new Set(Object.keys(DEFAULTS));
const MAX_TEXT_BYTES = 8 * 1024 * 1024;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function splitSource(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_TEXT_BYTES) throw new Error('The storyboard source must be UTF-8 text under 8 MiB.');
  const bom = text.startsWith('\uFEFF') ? '\uFEFF' : '';
  return { bom, body: bom ? text.slice(1) : text };
}
function sceneDef(document) {
  const matches = def.sections(document, 'SceneDef');
  if (matches.length !== 1) throw new Error(matches.length ? 'The storyboard has multiple [SceneDef] sections; review them in text.' : 'The storyboard has no [SceneDef] section.');
  return matches[0];
}
function sceneCount(document) {
  return document.sections.filter(section => /^scene(?:\s+.+)?$/i.test(section.name)).length;
}
function currentValues(section) {
  const values = { ...DEFAULTS }, fonts = {};
  const seen=new Set();
  for (const entry of section.entries) {
    if(seen.has(entry.normalized))continue;seen.add(entry.normalized);
    if (FIELDS.has(entry.normalized)) values[entry.normalized] = def.unquote(entry.value);
    else if (/^font\d+$/.test(entry.normalized)) fonts[entry.normalized] = def.unquote(entry.value);
  }
  return { ...values, fonts };
}
function readSceneDef(text) {
  const { body } = splitSource(text), document = def.parseDef(body), section = sceneDef(document);
  return Object.freeze({ sectionLine: section.line, sceneCount: sceneCount(document), ...currentValues(section) });
}
function fieldValue(key, value, scenes) {
  if (key === 'startscene') {
    const index = Number(value);
    if (!Number.isSafeInteger(index) || index < 0 || index >= scenes) throw new Error(`Start scene must be an index from 0 to ${Math.max(0, scenes - 1)} in file order.`);
    return String(index);
  }
  if (key === 'stopmusic' || key === 'disablecancel' || key === 'waitforloading') {
    if (value === true || value === 1 || value === '1') return '1';
    if (value === false || value === 0 || value === '0') return '0';
    throw new Error(`${key} must be enabled or disabled.`);
  }
  if (key === 'key.skip' || key === 'key.cancel') {
    const result = Array.isArray(value) ? value.join(', ') : String(value ?? '').trim();
    if (!result || result.length > 256 || /[\r\n;#]/.test(result)) throw new Error(`${key} needs a comma-separated key list on one line.`);
    return result;
  }
  if (key === 'snd' || /^font\d+$/.test(key)) {
    const result = String(value ?? '').trim();
    if (result.length > 1024 || /[\r\n;#]/.test(result)) throw new Error(`${key} must be one resource path on one line.`);
    if (/^font\d+$/.test(key) && !result) throw new Error('A font slot needs a resource path.');
    return result;
  }
  throw new Error(`The SceneDef field ${key} is unsupported.`);
}
function setAt(text, sectionLine, key, value) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n', pad = sectionLine === 0 ? eol : '';
  const next = def.setSectionEntry(def.parseDef(pad + text), sectionLine + (pad ? 1 : 0), key, value);
  return pad ? next.slice(eol.length) : next;
}
function planSceneDefEdit(text, changes) {
  const { bom, body } = splitSource(text);
  if (!changes || typeof changes !== 'object' || Array.isArray(changes) || Object.keys(changes).length === 0) throw new Error('Choose at least one SceneDef field to update.');
  const original = def.parseDef(body), section = sceneDef(original), scenes = sceneCount(original);
  const edits = Object.entries(changes).map(([rawKey, input]) => {
    const key = rawKey.toLowerCase();
    if (!FIELDS.has(key) && !/^font(?:0|[1-9]\d*)$/.test(key)) throw new Error(`The SceneDef field ${rawKey} is unsupported.`);
    if (section.entries.filter(entry => entry.normalized === key).length > 1) throw new Error(`The SceneDef field ${key} appears more than once; review it in text.`);
    return [key, fieldValue(key, input, scenes)];
  });
  let next = body;
  for (const [key, value] of edits) {
    const current = def.value(def.sections(def.parseDef(next), 'SceneDef')[0], key);
    if (current === value) continue;
    next = setAt(next, section.line, key, value);
  }
  const output = bom + next;
  return Object.freeze({ text: output, changed: output !== text, beforeHash: digest(Buffer.from(text, 'utf8')), afterHash: digest(Buffer.from(output, 'utf8')), sectionLine: section.line, values: Object.freeze(Object.fromEntries(edits)) });
}

module.exports = { DEFAULTS, MAX_TEXT_BYTES, readSceneDef, planSceneDefEdit };
