'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseCodeStructure, flatten } = require('./code_structure_model');

const STORE_KEY = 'ikemaker.personalExamples.v1';
const key = value => path.resolve(String(value || '')).replace(/\\/g, '/').toLowerCase();
const fingerprint = value => crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
const language = filename => /\.lua$/i.test(filename) ? 'lua' : /\.cns$/i.test(filename) ? 'cns' : 'zss';

function normalizedLines(text) { return String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/); }
function blockText(lines, startLine, endLine) { return lines.slice(startLine, endLine + 1).join('\n'); }
function meaningfulNode(node) { return !['assignment', 'require', 'statement'].includes(node.kind); }

function blockAt(text, line, filename = '') {
  const lines = normalizedLines(text), selected = Math.max(0, Math.min(lines.length - 1, Number(line) || 0));
  const nodes = flatten(parseCodeStructure(text, language(filename), filename))
    .filter(node => meaningfulNode(node) && node.startLine <= selected && node.endLine >= selected)
    .sort((a, b) => (a.endLine - a.startLine) - (b.endLine - b.startLine) || b.depth - a.depth);
  const found = nodes[0];
  if (found) {
    const source = blockText(lines, found.startLine, found.endLine);
    return { kind: found.kind, title: found.title || found.signature || `Lines ${found.startLine + 1}-${found.endLine + 1}`, signature: String(found.signature || found.title || '').trim(), startLine: found.startLine, endLine: found.endLine, text: source, fingerprint: fingerprint(source) };
  }
  let startLine = selected, endLine = selected;
  while (startLine > 0 && lines[startLine - 1].trim()) startLine--;
  while (endLine + 1 < lines.length && lines[endLine + 1].trim()) endLine++;
  const source = blockText(lines, startLine, endLine);
  return { kind: 'excerpt', title: `Lines ${startLine + 1}-${endLine + 1}`, signature: '', startLine, endLine, text: source, fingerprint: fingerprint(source) };
}

function isShared(owner, filename) {
  const relative = path.relative(path.dirname(path.resolve(owner)), path.resolve(filename));
  return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
}

function createPin({ owner, filename, text, line, label }) {
  const block = blockAt(text, line, filename), ownerKey = key(owner), fileKey = key(filename);
  const id = fingerprint(`${ownerKey}\n${fileKey}\n${block.kind}\n${block.startLine}\n${block.fingerprint}`).slice(0, 24);
  return { id, owner: path.resolve(owner), filename: path.resolve(filename), label: String(label || block.title || path.basename(filename)).trim(), scope: isShared(owner, filename) ? 'shared' : 'character', kind: block.kind, signature: block.signature, startLine: block.startLine, endLine: block.endLine, text: block.text, fingerprint: block.fingerprint, createdAt: new Date().toISOString() };
}

function normalizePin(pin) {
  if (!pin || typeof pin.id !== 'string' || typeof pin.owner !== 'string' || typeof pin.filename !== 'string' || !path.isAbsolute(pin.owner) || !path.isAbsolute(pin.filename) || typeof pin.text !== 'string' || typeof pin.fingerprint !== 'string') return null;
  return { ...pin, label: String(pin.label || pin.signature || path.basename(pin.filename)), scope: pin.scope === 'shared' ? 'shared' : 'character', startLine: Math.max(0, Number(pin.startLine) || 0), endLine: Math.max(Math.max(0, Number(pin.startLine) || 0), Number(pin.endLine) || 0) };
}
function normalizeStore(value) {
  const output = { version: 1, byOwner: {} }, source = value && typeof value === 'object' ? value.byOwner : null;
  if (!source || typeof source !== 'object') return output;
  for (const [owner, pins] of Object.entries(source)) {
    if (!Array.isArray(pins)) continue;
    output.byOwner[owner] = pins.map(normalizePin).filter(Boolean);
  }
  return output;
}
function pinsFor(store, owner) { return normalizeStore(store).byOwner[key(owner)] || []; }
function putPin(store, pin) {
  const next = normalizeStore(store), ownerKey = key(pin.owner), pins = next.byOwner[ownerKey] || [], duplicate = pins.findIndex(item => key(item.filename) === key(pin.filename) && item.startLine === pin.startLine && item.fingerprint === pin.fingerprint);
  if (duplicate >= 0) pins[duplicate] = { ...pins[duplicate], ...pin, id: pins[duplicate].id };
  else pins.push(pin);
  next.byOwner[ownerKey] = pins;
  return next;
}
function renamePin(store, owner, id, label) {
  const next = normalizeStore(store), pins = next.byOwner[key(owner)] || [], pin = pins.find(item => item.id === id);
  if (pin) pin.label = String(label || '').trim() || pin.label;
  return next;
}
function removePin(store, owner, id) {
  const next = normalizeStore(store), ownerKey = key(owner);
  next.byOwner[ownerKey] = (next.byOwner[ownerKey] || []).filter(item => item.id !== id);
  return next;
}
function replacePin(store, owner, id, replacement) {
  const next = normalizeStore(store), ownerKey = key(owner), pins = next.byOwner[ownerKey] || [], index = pins.findIndex(item => item.id === id);
  if (index >= 0) pins[index] = { ...replacement, id, createdAt: pins[index].createdAt || replacement.createdAt };
  next.byOwner[ownerKey] = pins;
  return next;
}

function lineOfOffset(text, offset) { return String(text).slice(0, offset).split(/\r?\n/).length - 1; }
function exactMatches(text, source) {
  const output = []; let offset = 0;
  while (source && (offset = text.indexOf(source, offset)) >= 0) { const before=offset===0||text[offset-1]==='\n',after=offset+source.length===text.length||text[offset+source.length]==='\n';if(before&&after)output.push({ startLine: lineOfOffset(text, offset), endLine: lineOfOffset(text, offset + source.length) }); offset += Math.max(1, source.length); }
  return output;
}
function resolvePin(pin, options = {}) {
  const allowed = options.allowedFiles && new Set([...options.allowedFiles].map(key));
  if (allowed && !allowed.has(key(pin.filename))) return { ...pin, status: 'unlinked', detail: 'Source is no longer assigned to this character or an explicitly linked shared source.' };
  if (!fs.existsSync(pin.filename)) return { ...pin, status: 'missing', detail: 'Source file is missing.' };
  const text = options.readText ? options.readText(pin.filename) : fs.readFileSync(pin.filename, 'utf8'), lines = normalizedLines(text), original = blockText(lines, pin.startLine, pin.endLine);
  if (fingerprint(original) === pin.fingerprint && original === pin.text) return { ...pin, status: 'current', resolvedStartLine: pin.startLine, resolvedEndLine: pin.endLine, detail: 'Original source block is unchanged.' };
  const exact = exactMatches(String(text).replace(/\r\n/g, '\n'), String(pin.text).replace(/\r\n/g, '\n'));
  if (exact.length === 1) return { ...pin, status: 'moved', resolvedStartLine: exact[0].startLine, resolvedEndLine: exact[0].endLine, detail: 'Source block moved; the unique content match was found.' };
  if (exact.length > 1) return { ...pin, status: 'ambiguous', detail: 'Several exact copies exist; choose the intended block before relinking.' };
  const candidates = pin.signature ? flatten(parseCodeStructure(text, language(pin.filename), pin.filename)).filter(node => meaningfulNode(node) && node.kind === pin.kind && String(node.signature || node.title || '').trim() === pin.signature) : [];
  if (candidates.length === 1) return { ...pin, status: 'changed', resolvedStartLine: candidates[0].startLine, resolvedEndLine: candidates[0].endLine, detail: 'The uniquely identified block changed. Review it before relinking.' };
  if (candidates.length > 1) return { ...pin, status: 'ambiguous', detail: 'The block identity now matches several locations; review and relink manually.' };
  return { ...pin, status: 'changed', resolvedStartLine: Math.min(pin.startLine, Math.max(0, lines.length - 1)), resolvedEndLine: Math.min(pin.endLine, Math.max(0, lines.length - 1)), detail: 'Original content changed or could not be identified uniquely.' };
}
function excerpt(pin, resolved, maxLines = 8) {
  const lines = String(pin.text || '').split(/\r?\n/), preview = lines.slice(0, maxLines).join('\n');
  return preview + (lines.length > maxLines ? '\n…' : '');
}

module.exports = { STORE_KEY, key, fingerprint, blockAt, isShared, createPin, normalizeStore, pinsFor, putPin, renamePin, removePin, replacePin, resolvePin, excerpt };
