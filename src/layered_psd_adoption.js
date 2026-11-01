'use strict';

const { parseDef, normalize } = require('./def_model');

function spriteKey(group, number) { return `${Number(group)},${Number(number)}`; }
function expectedSpriteIdentities(layers) {
  if (!Array.isArray(layers) || !layers.length) throw new Error('Select at least one reviewed PSD layer.');
  const seen = new Set();
  return layers.map(layer => {
    const sprite = layer && layer.sprite;
    if (!Array.isArray(sprite) || sprite.length !== 2 || !sprite.every(value => Number.isSafeInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 65535)) throw new Error('A reviewed PSD layer has an invalid sprite identity.');
    const identity = Object.freeze({ id: String(layer.id || ''), name: String(layer.name || ''), group: Number(sprite[0]), number: Number(sprite[1]), key: spriteKey(sprite[0], sprite[1]) });
    if (!identity.id || seen.has(identity.key)) throw new Error(`The reviewed layer plan assigns sprite ${identity.key} more than once.`);
    seen.add(identity.key); return identity;
  });
}

function verifySffIdentities(archive, expected) {
  if (!archive || !Array.isArray(archive.sprites)) throw new Error('The target SFF is not readable.');
  const counts = new Map();
  for (const sprite of archive.sprites) { const key = spriteKey(sprite.group, sprite.number); counts.set(key, (counts.get(key) || 0) + 1); }
  const items = expected.map(identity => Object.freeze({ ...identity, count: counts.get(identity.key) || 0 }));
  const missing = items.filter(item => item.count === 0), ambiguous = items.filter(item => item.count > 1), present = items.filter(item => item.count === 1);
  return Object.freeze({ ok: !missing.length && !ambiguous.length, expected: items.length, present: Object.freeze(present), missing: Object.freeze(missing), ambiguous: Object.freeze(ambiguous) });
}

function appendBlock(text, code) {
  const eol = String(text).includes('\r\n') ? '\r\n' : '\n', source = String(text);
  return `${source}${source.endsWith('\n') ? '' : eol}${eol}${String(code).trim().replace(/\r?\n/g, eol)}${eol}`;
}

function adoptGeneratedSource(text, options = {}) {
  const target = String(options.target || ''), code = String(options.code || '').trim();
  if (!code || code.length > 500000) throw new Error('The reviewed generated source is empty or too large.');
  const document = parseDef(String(text));
  if (target === 'story') {
    const targetName = normalize(options.targetName || '');
    const section = document.sections.find(item => item.normalized === targetName);
    if (!section || !/^scene\s+\d+$/.test(section.normalized)) throw new Error(`The reviewed storyboard scene [${options.targetName}] no longer exists.`);
    const generated = code.split(/\r?\n/), keys = generated.map(line => /^\s*([^;#][^=]*?)\s*=/.exec(line)).filter(Boolean).map(match => normalize(match[1]));
    const existing = new Set(section.entries.map(entry => entry.normalized)), duplicate = keys.find(key => existing.has(key));
    if (duplicate) throw new Error(`${duplicate} already exists in [${section.name}]. Review a new layer range.`);
    const next = document.sections.find(item => item.line > section.line), at = next ? next.line : document.lines.length, lines = [...document.lines];
    lines.splice(at, 0, ...generated, '');
    return lines.join(String(text).includes('\r\n') ? '\r\n' : '\n');
  }
  if (!['stage', 'ui'].includes(target)) throw new Error(`Unsupported layered source target: ${target}.`);
  const generated = parseDef(code).sections.filter(section => section.name);
  if (!generated.length) throw new Error('The generated source contains no adoptable sections.');
  const existing = new Set(document.sections.map(section => section.normalized)), names = new Set();
  for (const section of generated) {
    if (existing.has(section.normalized)) throw new Error(`[${section.name}] already exists. Review a different generated block range.`);
    if (names.has(section.normalized)) throw new Error(`The generated source repeats [${section.name}].`);
    names.add(section.normalized);
  }
  return appendBlock(text, code);
}

module.exports = { spriteKey, expectedSpriteIdentities, verifySffIdentities, adoptGeneratedSource };
