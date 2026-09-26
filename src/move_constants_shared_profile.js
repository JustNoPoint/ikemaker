'use strict';

const ASSIGNMENT = /^(\s*map\s*\(\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\)\s*:=\s*)([-+]?(?:\d+(?:\.\d*)?|\.\d+))(\s*;?\s*)$/i;
const NUMBER = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/;

function parseDraft(value) {
  const text = String(value ?? '').trim();
  if (!NUMBER.test(text) || !Number.isFinite(Number(text))) return null;
  return { text, value: Number(text) };
}

function codeBeforeComment(lineText) {
  const text = String(lineText || ''); let quote = '', escaped = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index], next = text[index + 1];
    if (escaped) { escaped = false; continue; }
    if (quote && char === '\\') { escaped = true; continue; }
    if (quote) { if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '#' || (char === '/' && next === '/')) return text.slice(0, index);
  }
  return text;
}

function parseAssignmentLine(lineText) {
  const code = codeBeforeComment(lineText), match = ASSIGNMENT.exec(code);
  if (!match) return null;
  const start = match.index + match[1].length;
  return { name: match[2], value: Number(match[3]), text: match[3], start, end: start + match[3].length };
}

function assignmentEdit(lineText, expectedName, expectedValue, draftValue) {
  const assignment = parseAssignmentLine(lineText), draft = parseDraft(draftValue);
  if (!assignment || !draft || assignment.name.toLowerCase() !== String(expectedName || '').toLowerCase() || assignment.value !== Number(expectedValue)) return null;
  return { start: assignment.start, end: assignment.end, text: draft.text, value: draft.value };
}

function normalizeDraft(raw, item) {
  if (raw && typeof raw === 'object') return { value: String(raw.value ?? ''), base: Number(raw.base), sourceHash: String(raw.sourceHash || ''), revision: Math.max(0, Number(raw.revision) || 0) };
  return { value: String(raw ?? ''), base: Number(item?.value), sourceHash: String(item?.sourceHash || ''), revision: 0 };
}
function createDraft(value, item, previous) {
  const prior = previous === undefined ? null : normalizeDraft(previous, item);
  return { value: String(value ?? ''), base: prior ? prior.base : Number(item?.value), sourceHash: prior ? prior.sourceHash : String(item?.sourceHash || ''), revision: (prior?.revision || 0) + 1 };
}
function draftConflict(draft, item) {
  const normalized = normalizeDraft(draft, item);
  return normalized.base !== Number(item?.value) || normalized.sourceHash !== String(item?.sourceHash || '');
}
function rebaseDraft(draft, item) {
  const normalized = normalizeDraft(draft, item);
  return { value: normalized.value, base: Number(item?.value), sourceHash: String(item?.sourceHash || ''), revision: normalized.revision + 1 };
}
function acknowledgeDraft(draft, acknowledgment) {
  if (draft === undefined) return undefined;
  const normalized = normalizeDraft(draft, acknowledgment);
  return normalized.revision === Number(acknowledgment?.draftRevision) && normalized.value === String(acknowledgment?.value ?? '') && normalized.base === Number(acknowledgment?.draftBase) && normalized.sourceHash === String(acknowledgment?.draftSourceHash || '') ? null : normalized;
}
function clientScript() {
  return `const sharedProfile=(()=>{${normalizeDraft.toString()}${createDraft.toString()}${draftConflict.toString()}${rebaseDraft.toString()}${acknowledgeDraft.toString()}return {normalizeDraft,createDraft,draftConflict,rebaseDraft,acknowledgeDraft};})();`;
}

module.exports = { ASSIGNMENT, parseDraft, parseAssignmentLine, assignmentEdit, normalizeDraft, createDraft, draftConflict, rebaseDraft, acknowledgeDraft, clientScript };
