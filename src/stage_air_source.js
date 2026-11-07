'use strict';

// Embedded AIR is edited as an exact Stage DEF section. No AIR writer receives
// the complete DEF: every operation below works on one bounded Action block.
const crypto = require('node:crypto');
const path = require('node:path');
const air = require('./air_preview_model');

const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const ACTION = /^\s*\[\s*begin\s+action\s+(-?\d+)\s*\]\s*(?:;.*)?$/i;
const SECTION = /^\s*\[[^\]\r\n]+\]\s*(?:;.*)?$/;

function linesOf(source) {
  const rows = []; let start = 0; const endings = /\r\n|\r|\n/g; let match;
  while ((match = endings.exec(source))) {
    rows.push({ start, end: endings.lastIndex, body: source.slice(start, match.index), eol: match[0] });
    start = endings.lastIndex;
  }
  if (start < source.length || !rows.length) rows.push({ start, end: source.length, body: source.slice(start), eol: '' });
  return rows;
}

function scanStageAir(text, version = null, filename = '') {
  const source = String(text), rows = linesOf(source), sections = [], counts = new Map();
  for (let line = 0; line < rows.length; line++) {
    const body = line === 0 ? rows[line].body.replace(/^\uFEFF/, '') : rows[line].body;
    if (!SECTION.test(body)) continue;
    const action = ACTION.exec(body), parsed = action ? Number(action[1]) : null;
    const number = Number.isSafeInteger(parsed) ? parsed : null;
    sections.push({ line, start: rows[line].start + (line === 0 && source.startsWith('\uFEFF') ? 1 : 0), number });
  }
  const blocks = [];
  for (let index = 0; index < sections.length; index++) {
    const section = sections[index];
    if (section.number === null) continue;
    const next = sections[index + 1], limit = next ? next.line : rows.length;
    // A comment immediately before the next section has ambiguous ownership.
    // Leave trailing comments and whitespace in the DEF instead of deleting them.
    let lastOwned = section.line;
    for (let line = section.line + 1; line < limit; line++) {
      const body = rows[line].body.trim();
      if (body && !body.startsWith(';')) lastOwned = line;
    }
    const end = rows[lastOwned].end, ordinal = counts.get(section.number) || 0;
    counts.set(section.number, ordinal + 1);
    const blockText = source.slice(section.start, end);
    blocks.push(Object.freeze({ number: section.number, ordinal, line: section.line + 1, start: section.start, end,
      contentHash: hash(blockText), text: blockText, shadowedDuplicate: ordinal > 0 }));
  }
  const projection = rows.map((row, line) => {
    const owned = blocks.some(block => row.end > block.start && row.start < block.end);
    return (owned ? row.body : '') + row.eol;
  }).join('');
  return Object.freeze({ source, version, filename: filename ? path.resolve(filename) : '', fingerprint: hash(source), blocks: Object.freeze(blocks), projection });
}

function blockIdentity(block) {
  return Object.freeze({ number: block.number, ordinal: block.ordinal, line: block.line, contentHash: block.contentHash });
}

function exactBlock(snapshot, identity) {
  if (!identity || !Number.isInteger(identity.number) || !Number.isInteger(identity.ordinal) || !Number.isInteger(identity.line) || typeof identity.contentHash !== 'string') throw new Error('Select an exact embedded Stage AIR Action again.');
  const block = snapshot.blocks.find(item => item.number === identity.number && item.ordinal === identity.ordinal && item.line === identity.line && item.contentHash === identity.contentHash);
  if (!block) throw new Error('The selected Stage AIR Action changed. Refresh the editor before editing.');
  if (block.shadowedDuplicate) throw new Error(`Action ${block.number} is shadowed by an earlier duplicate. Resolve duplicate Action numbers in Stage source before visual editing.`);
  return block;
}

function assertCurrent(snapshot, document) {
  const expected = snapshot.filename ? path.resolve(snapshot.filename).toLowerCase() : '';
  if (!document || typeof document.getText !== 'function' || (expected && (!document.fileName || path.resolve(document.fileName).toLowerCase() !== expected)) || (snapshot.version !== null && document.version !== snapshot.version) || hash(document.getText()) !== snapshot.fingerprint) throw new Error('The exact Stage DEF changed after this animation edit was prepared. Refresh and review it again.');
}

function verifyActionReplacement(replacement, expected) {
  const sections = linesOf(replacement).map(row => row.body.replace(/^\uFEFF/, '')).filter(body => SECTION.test(body));
  if (sections.length !== expected.length || sections.some((heading, index) => {
    const match = ACTION.exec(heading);
    return !match || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) !== expected[index];
  })) throw new Error('The Stage AIR edit would introduce an unexpected DEF section or Action. Nothing was written.');
}

function planStageAirEdit(snapshot, identity, operation) {
  if (!snapshot || typeof snapshot.source !== 'string' || !operation || typeof operation.type !== 'string') throw new Error('A current Stage AIR source and edit are required.');
  const block = exactBlock(snapshot, identity), options = { ...operation, action: block.number };
  let replacement, start = block.start, end = block.end;
  switch (operation.type) {
    case 'update-frame': replacement = air.updateFrameElement(block.text, options); break;
    case 'update-directives': replacement = air.updateFrameDirectives(block.text, options); break;
    case 'insert-frame': replacement = air.insertFrameElement(block.text, options); break;
    case 'delete-frame': replacement = air.deleteFrameElement(block.text, options); break;
    case 'move-frame': {
      const patch = air.moveFrameElementPatch(block.text, options);
      replacement = air.applyActionPatches(block.text, [patch]); break;
    }
    case 'update-collision': replacement = air.updateCollisionBlocks(block.text, options); break;
    case 'delete-action': replacement = ''; break;
    case 'duplicate-action': {
      const destination = Number(operation.destination);
      if (!Number.isSafeInteger(destination) || snapshot.blocks.some(item => item.number === destination)) throw new Error('The duplicate Action number must be unique in this Stage DEF.');
      const patch = air.duplicateActionPatch(block.text, block.number, destination);
      replacement = air.applyActionPatches(block.text, [patch]); break;
    }
    default: throw new Error(`Unsupported Stage AIR edit: ${operation.type}.`);
  }
  verifyActionReplacement(replacement, operation.type === 'delete-action' ? [] : operation.type === 'duplicate-action' ? [block.number, Number(operation.destination)] : [block.number]);
  const output = snapshot.source.slice(0, start) + replacement + snapshot.source.slice(end);
  return Object.freeze({ start, end, before: block.text, replacement, output, beforeFingerprint: snapshot.fingerprint,
    afterFingerprint: hash(output), sourceVersion: snapshot.version, action: block.number, operation: operation.type });
}

function planStageAirCreate(snapshot, options) {
  if (!snapshot || typeof snapshot.source !== 'string') throw new Error('A current Stage DEF is required.');
  const action = Number(options?.action);
  if (!Number.isSafeInteger(action) || snapshot.blocks.some(item => item.number === action)) throw new Error('The new Action number must be unique in this Stage DEF.');
  const eol = /\r\n|\r|\n/.exec(snapshot.source)?.[0] || '\n';
  const created = air.createActionPatch('', { ...options, action }).text.replace(/\n/g, eol);
  const prefix = !snapshot.source ? '' : /(?:\r\n|\r|\n)$/.test(snapshot.source) ? eol : eol + eol;
  const replacement = prefix + created + eol;
  verifyActionReplacement(replacement, [action]);
  const start = snapshot.source.length, output = snapshot.source + replacement;
  return Object.freeze({ start, end: start, before: '', replacement, output, beforeFingerprint: snapshot.fingerprint,
    afterFingerprint: hash(output), sourceVersion: snapshot.version, action, operation: 'create-action' });
}

function applyStageAirPlanToDocument(snapshot, document, plan) {
  assertCurrent(snapshot, document);
  if (!plan || plan.beforeFingerprint !== snapshot.fingerprint || snapshot.source.slice(plan.start, plan.end) !== plan.before || plan.output !== snapshot.source.slice(0, plan.start) + plan.replacement + snapshot.source.slice(plan.end)) throw new Error('The reviewed Stage AIR edit is invalid. Nothing was written.');
  return { start: plan.start, end: plan.end, text: plan.replacement };
}

module.exports = { scanStageAir, blockIdentity, exactBlock, assertCurrent, planStageAirEdit, planStageAirCreate, applyStageAirPlanToDocument };
