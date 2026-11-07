'use strict';

const ACTION_HEADER = /^\s*\[\s*begin\s+action\s+(-?\d+)\s*\]\s*$/i;
const COPY_ACTION = /^\s*copy\s+action\s+(-?\d+)\s*$/i;
const CLSN_HEADER = /^\s*Clsn([12])(Default)?\s*:\s*(\d+)\s*$/i;
const CLSN_BOX = /^\s*Clsn([12])(?:\s*\[\s*([^\]]*)\s*\])?\s*=\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*$/i;
const MAX_PARSED_COLLISION_BOXES = 4096;

function copyBoxes(boxes) { return boxes ? boxes.map((box) => [...box]) : []; }
function copyCollisionRecords(records) { return records ? records.map((record) => ({ ...record, rect: [...record.rect], ...(Array.isArray(record.rawRect) ? { rawRect: [...record.rawRect] } : {}), line: record.line || null })) : []; }
function cleanNumber(value) { const number = Number(value); if (!Number.isFinite(number)) throw new Error('Collision coordinates must be finite numbers.'); return number; }
function collisionRecords(boxes, records) {
  const source = Array.isArray(records) ? records : (boxes || []).map((rect, index) => ({ index, rect }));
  const used = new Set();
  return source.map((record, position) => {
    const index = Number(record && record.index);
    if (!Number.isInteger(index) || index < 0) throw new Error(`Collision index ${position + 1} must be a non-negative whole number.`);
    if (used.has(index)) throw new Error(`Collision index ${index} is authored more than once in the same block.`);
    used.add(index);
    const rect = Array.isArray(record) ? record : record && record.rect;
    if (!Array.isArray(rect) || rect.length !== 4) throw new Error('Each collision box requires x1, y1, x2, y2.');
    return { index, rect: rect.map(cleanNumber) };
  });
}
function blockLines(kind, boxes, indent = '', records = null) {
  const name = kind === 'clsn1' ? 'Clsn1' : 'Clsn2', safe = collisionRecords(boxes, records);
  if (safe.some(record => record.index >= safe.length)) throw new Error(`Collision indexes must be between 0 and ${Math.max(0, safe.length - 1)} for a ${safe.length}-box authored block.`);
  return [`${indent}${name}: ${safe.length}`, ...safe.map((record) => `${indent}${name}[${record.index}] = ${record.rect.join(', ')}`)];
}

function normalizedRect(values) {
  const [x1, y1, x2, y2] = values.map(Number);
  return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
}

function parseCollisionBlock(lines, headerLine, kind, isDefault, count) {
  const declaredText = String(count), parsedCount = Number(declaredText), safeCount = Number.isSafeInteger(parsedCount) && parsedCount >= 0, unsafePositive = /^\d+$/.test(declaredText) && !/^0+$/.test(declaredText) && !safeCount;
  const declared = safeCount ? parsedCount : null, boundedCount = unsafePositive ? MAX_PARSED_COLLISION_BOXES : Math.min(declared || 0, MAX_PARSED_COLLISION_BOXES), authoredRecords = [], diagnostics = [], effectiveRecords = Array.from({ length: boundedCount }, (_, index) => ({ index, rect: [0, 0, 0, 0], line: null, authoredIndex: null, allocation: 'missing' })), stableRecords = Array.from({ length: boundedCount }, (_, index) => ({ index, rect: [0, 0, 0, 0], line: null, authoredIndex: null, allocation: 'allocated-unfilled' }));
  if (unsafePositive || declared > boundedCount) diagnostics.push({ kind: 'collision-count-limit', group: kind, line: headerLine + 1, message: `${kind}${isDefault ? 'Default' : ''} declares ${declaredText} boxes; the responsive preview is limited to ${boundedCount}. Edit this malformed block in Source.` });
  const occupied = new Set(); let cursor = headerLine + 1, assignments = 0, malformed = false, evidenceEndLine = headerLine + 1;
  while (cursor < lines.length && assignments < boundedCount) {
    const raw = lines[cursor], clean = raw.replace(/;.*/, '').trim();
    if (!clean) { cursor += 1; continue; }
    if (!/^clsn/i.test(clean)) break;
    const match = CLSN_BOX.exec(clean);
    if (!match) {
      malformed = true;
      evidenceEndLine = cursor + 1;
      diagnostics.push({ kind: 'malformed-collision-assignment', group: kind, line: cursor + 1, message: `${kind} assignment is malformed; the indexed target projection stops here and the block is compiler-invalid.` });
      break;
    }
    assignments += 1;
    const authoredIndexText = String(match[2] ?? '').trim(), authoredIndex = /^\d+$/.test(authoredIndexText) ? Number(authoredIndexText) : null;
    const rawRect = match.slice(3, 7).map(Number), rect = normalizedRect(rawRect), firstFree = effectiveRecords.findIndex((_, index) => !occupied.has(index));
    const exact = Number.isInteger(authoredIndex) && authoredIndex >= 0 && authoredIndex < boundedCount && !occupied.has(authoredIndex);
    const effectiveIndex = exact ? authoredIndex : firstFree;
    const allocation = exact ? 'authored' : authoredIndex === null ? 'absent-index-fallback' : authoredIndex >= 0 && authoredIndex < boundedCount ? 'duplicate-fallback' : 'invalid-index-fallback';
    const stableSlot = assignments - 1;
    authoredRecords.push({ index: authoredIndex, indexText: authoredIndexText, rawRect: [...rawRect], rect: [...rect], line: cursor + 1, stableSlot, indexedSlot: effectiveIndex, effectiveIndex, allocation, authoredKind: `clsn${match[1]}`, authoredGroupToken: (clean.match(/^\s*(Clsn[12])/i) || [null, `Clsn${match[1]}`])[1] });
    evidenceEndLine = cursor + 1;
    if (stableSlot >= 0 && stableSlot < stableRecords.length) stableRecords[stableSlot] = { index: stableSlot, rect: [...rect], line: cursor + 1, authoredIndex, allocation: 'source-order' };
    if (effectiveIndex >= 0) {
      occupied.add(effectiveIndex);
      effectiveRecords[effectiveIndex] = { index: effectiveIndex, rect: [...rect], line: cursor + 1, authoredIndex, allocation };
      if (!exact) diagnostics.push({ kind: 'collision-index-fallback', group: kind, line: cursor + 1, message: `${kind} authored index ${authoredIndexText || '(missing)'} was allocated to effective index ${effectiveIndex}.` });
    }
    cursor += 1;
  }
  if (assignments < boundedCount) diagnostics.push({ kind: 'collision-count-mismatch', group: kind, line: headerLine + 1, message: `${kind}${isDefault ? 'Default' : ''} declares ${declared} box(es) but only ${assignments} valid assignment line(s) were found; Stable retains allocated zero slots while the indexed target rejects this block.` });
  return { boxes: effectiveRecords.map(record => [...record.rect]), records: effectiveRecords, indexedRecords: effectiveRecords, stableRecords, authoredRecords, diagnostics, compilerInvalid: malformed || assignments < boundedCount || unsafePositive || declared > boundedCount, evidenceEndLine, line: headerLine + 1, headerLine: headerLine + 1, isDefault, declared, declaredText, boundedCount, endLine: cursor - 1 };
}

function parseAir(text) {
  const lines = String(text || '').split(/\r?\n/), actions = [];
  let action = null;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const clean = lines[lineIndex].replace(/;.*/, '').trim(), heading = ACTION_HEADER.exec(clean);
    if (heading) {
      action = { number: Number(heading[1]), line: lineIndex + 1, frames: [], loopStart: 0, loopMarkers: [], diagnostics: [], defaults: { clsn1: null, clsn2: null } };
      actions.push(action); continue;
    }
    if (!action || !clean) continue;
    if (action.copyStopsParsing) continue;
    const copied = COPY_ACTION.exec(clean);
    if (copied) { action.copyAction = Number(copied[1]); action.copyLine = lineIndex + 1; action.copyStopsParsing = true; continue; }
    if (/^loopstart$/i.test(clean)) { action.loopMarkers.push(action.frames.length); continue; }
    const interpolation = /^interpolate\s+(offset|scale|angle|blend)$/i.exec(clean);
    if (interpolation) { action.pendingInterpolation = [...new Set([...(action.pendingInterpolation || []), interpolation[1].toLowerCase()])]; continue; }
    const collision = CLSN_HEADER.exec(clean);
    if (collision) {
      const kind = `clsn${collision[1]}`, isDefault = Boolean(collision[2]), count = collision[3];
      const block = parseCollisionBlock(lines, lineIndex, kind, isDefault, count);
      action.diagnostics.push(...block.diagnostics);
      if (isDefault) { action.defaults[kind] = block; action.pending = { ...(action.pending || {}), [kind]: block }; } else action.pending = { ...(action.pending || {}), [kind]: block };
      lineIndex = Math.max(lineIndex, block.endLine); continue;
    }
    const parts = clean.split(',').map((part) => part.trim());
    if (parts.length < 5 || parts.slice(0, 5).some((value) => !/^-?\d+$/.test(value))) continue;
    const pending = action.pending || {}, frame = {
      group: Number(parts[0]), index: Number(parts[1]), x: Number(parts[2]), y: Number(parts[3]),
      rawTime: Number(parts[4]), time: Math.max(1, Number(parts[4])), flags: (parts[5] || '').toUpperCase(), line: lineIndex + 1,
      blend: (parts[6] || '').toUpperCase(),
      scaleX: parts[7] !== undefined && parts[7] !== '' && Number.isFinite(Number(parts[7])) ? Number(parts[7]) : 1,
      scaleY: parts[8] !== undefined && parts[8] !== '' && Number.isFinite(Number(parts[8])) ? Number(parts[8]) : 1,
      angle: parts[9] !== undefined && parts[9] !== '' && Number.isFinite(Number(parts[9])) ? Number(parts[9]) : 0,
      fieldCount: parts.length,
      interpolate: action.pendingInterpolation || [],
      clsn1: copyBoxes((pending.clsn1 || action.defaults.clsn1 || {}).boxes),
      clsn2: copyBoxes((pending.clsn2 || action.defaults.clsn2 || {}).boxes),
      clsn1Records: copyCollisionRecords((pending.clsn1 || action.defaults.clsn1 || {}).records),
      clsn2Records: copyCollisionRecords((pending.clsn2 || action.defaults.clsn2 || {}).records),
      clsn1StableRecords: copyCollisionRecords((pending.clsn1 || action.defaults.clsn1 || {}).stableRecords),
      clsn2StableRecords: copyCollisionRecords((pending.clsn2 || action.defaults.clsn2 || {}).stableRecords),
      clsn1IndexedRecords: copyCollisionRecords((pending.clsn1 || action.defaults.clsn1 || {}).indexedRecords),
      clsn2IndexedRecords: copyCollisionRecords((pending.clsn2 || action.defaults.clsn2 || {}).indexedRecords),
      clsn1AuthoredRecords: copyCollisionRecords((pending.clsn1 || action.defaults.clsn1 || {}).authoredRecords),
      clsn2AuthoredRecords: copyCollisionRecords((pending.clsn2 || action.defaults.clsn2 || {}).authoredRecords),
      clsn1Source: pending.clsn1 ? (pending.clsn1.isDefault ? 'default' : 'element') : action.defaults.clsn1 ? 'default' : 'none',
      clsn2Source: pending.clsn2 ? (pending.clsn2.isDefault ? 'default' : 'element') : action.defaults.clsn2 ? 'default' : 'none',
      clsn1Ownership: pending.clsn1 ? (pending.clsn1.isDefault ? 'default-declared-for-this-element' : 'element') : action.defaults.clsn1 ? 'inherited-default' : 'none',
      clsn2Ownership: pending.clsn2 ? (pending.clsn2.isDefault ? 'default-declared-for-this-element' : 'element') : action.defaults.clsn2 ? 'inherited-default' : 'none',
      clsn1CompilerInvalid: Boolean((pending.clsn1 || action.defaults.clsn1 || {}).compilerInvalid),
      clsn2CompilerInvalid: Boolean((pending.clsn2 || action.defaults.clsn2 || {}).compilerInvalid),
      clsn1EvidenceEndLine: (pending.clsn1 || action.defaults.clsn1 || {}).evidenceEndLine || null,
      clsn2EvidenceEndLine: (pending.clsn2 || action.defaults.clsn2 || {}).evidenceEndLine || null,
      clsn1Diagnostics: ((pending.clsn1 || action.defaults.clsn1 || {}).diagnostics || []).map(item => ({ ...item })),
      clsn2Diagnostics: ((pending.clsn2 || action.defaults.clsn2 || {}).diagnostics || []).map(item => ({ ...item })),
      clsn1Line: (pending.clsn1 || action.defaults.clsn1 || {}).line || null,
      clsn2Line: (pending.clsn2 || action.defaults.clsn2 || {}).line || null,
      clsn1Default: copyBoxes((action.defaults.clsn1 || {}).boxes), clsn2Default: copyBoxes((action.defaults.clsn2 || {}).boxes),
      clsn1DefaultRecords: copyCollisionRecords((action.defaults.clsn1 || {}).records), clsn2DefaultRecords: copyCollisionRecords((action.defaults.clsn2 || {}).records),
      clsn1DefaultStableRecords: copyCollisionRecords((action.defaults.clsn1 || {}).stableRecords), clsn2DefaultStableRecords: copyCollisionRecords((action.defaults.clsn2 || {}).stableRecords),
      clsn1DefaultIndexedRecords: copyCollisionRecords((action.defaults.clsn1 || {}).indexedRecords), clsn2DefaultIndexedRecords: copyCollisionRecords((action.defaults.clsn2 || {}).indexedRecords),
      clsn1DefaultAuthoredRecords: copyCollisionRecords((action.defaults.clsn1 || {}).authoredRecords), clsn2DefaultAuthoredRecords: copyCollisionRecords((action.defaults.clsn2 || {}).authoredRecords),
      clsn1DefaultLine: (action.defaults.clsn1 || {}).line || null, clsn2DefaultLine: (action.defaults.clsn2 || {}).line || null
    };
    action.frames.push(frame); action.pending = {}; action.pendingInterpolation = [];
  }
  const authored = actions.map((item) => {
    const validMarkers = (item.loopMarkers || []).filter(index => index < item.frames.length);
    return { ...item, loopStart: validMarkers.length ? validMarkers[validMarkers.length - 1] : 0, defaults: undefined, pending: undefined, pendingInterpolation: undefined, copyStopsParsing: undefined };
  });
  const firstByNumber = new Map();
  for (const item of authored) { if (!firstByNumber.has(item.number)) firstByNumber.set(item.number, item); else { item.shadowedDuplicate = true; item.effective = false; item.diagnostics.push({ kind: 'duplicate-action', line: item.line, message: `Action ${item.number} is shadowed by the first declaration.` }); } }
  const cloneFrame = (frame, alias, authority, chain) => ({
    ...frame,
    clsn1: copyBoxes(frame.clsn1), clsn2: copyBoxes(frame.clsn2),
    clsn1Default: copyBoxes(frame.clsn1Default), clsn2Default: copyBoxes(frame.clsn2Default),
    clsn1Records: copyCollisionRecords(frame.clsn1Records), clsn2Records: copyCollisionRecords(frame.clsn2Records),
    clsn1StableRecords: copyCollisionRecords(frame.clsn1StableRecords), clsn2StableRecords: copyCollisionRecords(frame.clsn2StableRecords),
    clsn1IndexedRecords: copyCollisionRecords(frame.clsn1IndexedRecords), clsn2IndexedRecords: copyCollisionRecords(frame.clsn2IndexedRecords),
    clsn1AuthoredRecords: copyCollisionRecords(frame.clsn1AuthoredRecords), clsn2AuthoredRecords: copyCollisionRecords(frame.clsn2AuthoredRecords),
    clsn1DefaultRecords: copyCollisionRecords(frame.clsn1DefaultRecords), clsn2DefaultRecords: copyCollisionRecords(frame.clsn2DefaultRecords),
    clsn1DefaultStableRecords: copyCollisionRecords(frame.clsn1DefaultStableRecords), clsn2DefaultStableRecords: copyCollisionRecords(frame.clsn2DefaultStableRecords),
    clsn1DefaultIndexedRecords: copyCollisionRecords(frame.clsn1DefaultIndexedRecords), clsn2DefaultIndexedRecords: copyCollisionRecords(frame.clsn2DefaultIndexedRecords),
    clsn1DefaultAuthoredRecords: copyCollisionRecords(frame.clsn1DefaultAuthoredRecords), clsn2DefaultAuthoredRecords: copyCollisionRecords(frame.clsn2DefaultAuthoredRecords),
    clsn1Diagnostics: (frame.clsn1Diagnostics || []).map(item => ({ ...item })), clsn2Diagnostics: (frame.clsn2Diagnostics || []).map(item => ({ ...item })),
    interpolate: [...(frame.interpolate || [])], inherited: true, inheritedByAction: alias.number,
    authorityAction: authority.number, copyChain: [...chain]
  });
  const resolving = new Set();
  function resolve(item, chain = []) {
    if (!Number.isInteger(item.copyAction) || item.copyResolved || item.copyError) return item;
    if (item.copyAction < 0) { item.copyResolution = 'invalid-negative-target'; item.copyError = `Copy Action target ${item.copyAction} is invalid; Action IDs must be non-negative.`; return item; }
    if (chain.length >= 8) { item.copyError = 'Copy Action chain exceeds the engine limit of 8 links.'; return item; }
    if (resolving.has(item.number)) { item.copyError = 'Copy Action cycle detected.'; return item; }
    const target = firstByNumber.get(item.copyAction);
    if (!target) { item.copyResolution = 'unresolved-without-common-context'; item.copyError = `Copy Action ${item.copyAction} could not be resolved in this AIR source; a separate common AIR context was not loaded.`; return item; }
    resolving.add(item.number); const resolved = resolve(target, [...chain, item.number]); resolving.delete(item.number);
    if (resolved.copyError || !resolved.frames.length) { item.copyError = resolved.copyError || `Copy Action ${item.copyAction} has no resolved frames.`; return item; }
    const authority = resolved.copyAuthority || resolved;
    item.frames = resolved.frames.map((frame) => cloneFrame(frame, item, authority, [...chain, item.number, target.number]));
    item.loopStart = resolved.loopStart; item.copyResolved = true; item.copyAuthority = authority;
    item.resolvedFrom = authority.number; item.readOnly = true;
    return item;
  }
  for (const item of authored) resolve(item);
  for (let index = authored.length - 2; index >= 0; index -= 1) {
    const item = authored[index]; if (item.frames.length || Number.isInteger(item.copyAction)) continue;
    const target = authored.slice(index + 1).find(candidate => candidate.frames.length && !candidate.shadowedDuplicate);
    if (!target) continue;
    item.frames = target.frames.map(frame => cloneFrame(frame, item, target.copyAuthority || target, [item.number, target.number]));
    item.loopStart = target.loopStart; item.fallthroughAction = target.number; item.resolvedFrom = (target.copyAuthority || target).number; item.readOnly = true;
  }
  return authored.map((item) => {
    const { copyAuthority, ...publicItem } = item;
    return publicItem;
  });
}

function frameTarget(text, actionNumber, frameIndex) {
  const matches = parseAir(text).filter((item) => item.number === Number(actionNumber));
  if (matches.length > 1) throw new Error(`Action ${actionNumber} is defined more than once. Resolve duplicate IDs in AIR Source before visual frame editing.`);
  const action = matches[0];
  const frame = action && action.frames[Number(frameIndex)];
  if (!action || !frame) throw new Error(`Action ${actionNumber}, element ${Number(frameIndex) + 1} could not be located.`);
  if (action.readOnly) throw new Error(action.fallthroughAction !== undefined ? `Action ${actionNumber} is an empty legacy fallthrough to Action ${action.fallthroughAction}. Edit the authoritative source action instead.` : `Action ${actionNumber} inherits its frames from Copy Action ${action.copyAction}. Edit authoritative Action ${action.resolvedFrom} or materialize the copy first.`);
  return { action, frame };
}

function integerField(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number)) throw new Error(`${label} must be a whole number.`);
  return number;
}

function finiteField(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a number.`);
  return number;
}

function frameLine(values, originalLine = '') {
  const commentAt = originalLine.indexOf(';'), comment = commentAt >= 0 ? originalLine.slice(commentAt).trimEnd() : '';
  const source = commentAt >= 0 ? originalLine.slice(0, commentAt) : originalLine, indent = /^\s*/.exec(source)[0];
  const original = source.trim().split(',').map((part) => part.trim()), tail = original.slice(10);
  const group = integerField(values.group, 'Sprite group'), index = integerField(values.index, 'Sprite index');
  const x = integerField(values.x, 'X offset'), y = integerField(values.y, 'Y offset'), time = integerField(values.time, 'Frame time');
  const flags = String(values.flags || '').trim().toUpperCase(), blend = String(values.blend || '').trim().toUpperCase();
  if (flags && !/^[HV]+$/.test(flags)) throw new Error('Flip flags may contain only H and V.');
  if (blend.includes(',')) throw new Error('Blend cannot contain a comma.');
  const scaleX = finiteField(values.scaleX === '' || values.scaleX === undefined ? 1 : values.scaleX, 'X scale');
  const scaleY = finiteField(values.scaleY === '' || values.scaleY === undefined ? 1 : values.scaleY, 'Y scale');
  const angle = finiteField(values.angle === '' || values.angle === undefined ? 0 : values.angle, 'Angle');
  const fields = [group, index, x, y, time, flags, blend, scaleX, scaleY, angle].map(String);
  let last = 4;
  if (flags) last = 5;
  if (blend) last = 6;
  if (scaleX !== 1 || scaleY !== 1 || angle !== 0 || original.length >= 8) last = 9;
  const rendered = fields.slice(0, last + 1).concat(tail).join(', ');
  return `${indent}${rendered}${comment ? ` ${comment}` : ''}`;
}

function updateFrameElement(text, options) {
  const { frame } = frameTarget(text, options.action, options.frameIndex), lines = String(text).split(/\r?\n/), eol = /\r\n/.test(text) ? '\r\n' : '\n';
  lines[frame.line - 1] = frameLine(options, lines[frame.line - 1]);
  return lines.join(eol);
}

const FRAME_INTERPOLATION_KINDS = ['offset', 'blend', 'scale', 'angle'];

function rewriteFrameDirectiveBlock(blockText, options) {
  const source = String(blockText || ''), fallbackEol = /\r\n/.test(source) ? '\r\n' : /\r/.test(source) ? '\r' : '\n';
  const records = source.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g)?.filter(Boolean) || [];
  const kept = [];
  for (const record of records) {
    const ending = /(\r\n|\r|\n)$/.exec(record)?.[0] || '', body = ending ? record.slice(0, -ending.length) : record;
    const loop = /^(\s*)loopstart\s*(;.*)?$/i.exec(body), interpolation = /^(\s*)interpolate\s+(offset|scale|angle|blend)\s*(;.*)?$/i.exec(body);
    const remove = (options.removeLoop && loop) || (options.removeInterpolation && interpolation);
    if (!remove) { kept.push(record); continue; }
    const match = loop || interpolation, comment = match?.[match.length - 1];
    if (comment) kept.push(`${match[1] || ''}${comment}${ending || fallbackEol}`);
  }
  const additions = (options.additions || []).map((line) => `${line}${fallbackEol}`).join('');
  return additions + kept.join('');
}

function updateFrameDirectives(text, options) {
  const source = String(text || ''), actionNumber = integerField(options.action, 'Action number'), frameIndex = integerField(options.frameIndex, 'Frame index');
  const ownership = frameElementRanges(source, actionNumber), target = ownership.blocks[frameIndex];
  if (!target) throw new Error(`Action ${actionNumber}, element ${frameIndex + 1} could not be located.`);
  if (ownership.action.readOnly) throw new Error(`Action ${actionNumber} is inherited and cannot own visual frame directives.`);
  const requested = [...new Set((options.interpolate || []).map((value) => String(value).toLowerCase()))];
  if (requested.some((value) => !FRAME_INTERPOLATION_KINDS.includes(value))) throw new Error('Interpolation may contain only Offset, Blend, Scale, and Angle.');
  const interpolate = FRAME_INTERPOLATION_KINDS.filter((value) => requested.includes(value));
  const loopStart = Boolean(options.loopStart), patches = [];
  for (const block of ownership.blocks) {
    const selected = block.frameIndex === frameIndex, removeLoop = selected || loopStart;
    if (!removeLoop && !selected) continue;
    const additions = selected ? [...(loopStart ? ['LoopStart'] : []), ...interpolate.map((value) => `Interpolate ${value[0].toUpperCase()}${value.slice(1)}`)] : [];
    const replacement = rewriteFrameDirectiveBlock(block.text, { removeLoop, removeInterpolation: selected, additions });
    if (replacement !== block.text) patches.push({ start: block.start, end: block.end, text: replacement });
  }
  const updated = applyActionPatches(source, patches), next = frameElementRanges(updated, actionNumber);
  const semantic = (frame) => { const value = frameSemantic(frame); delete value.interpolate; return value; };
  if (JSON.stringify(next.action.frames.map(semantic)) !== JSON.stringify(ownership.action.frames.map(semantic))) throw new Error('The directive edit would change frame or collision semantics; nothing was written.');
  if (JSON.stringify(next.action.frames[frameIndex].interpolate) !== JSON.stringify(interpolate)) throw new Error('The requested interpolation directives could not be verified; nothing was written.');
  const marked = next.blocks.flatMap((block) => Array(block.loopStart).fill(block.frameIndex));
  const expectedMarked = loopStart ? [frameIndex] : ownership.blocks.flatMap((block) => block.frameIndex === frameIndex ? [] : Array(block.loopStart).fill(block.frameIndex));
  if (JSON.stringify(marked) !== JSON.stringify(expectedMarked)) throw new Error('LoopStart ownership could not be verified; nothing was written.');
  return updated;
}

function insertFrameElement(text, options) {
  const { frame } = frameTarget(text, options.action, options.frameIndex), lines = String(text).split(/\r?\n/), eol = /\r\n/.test(text) ? '\r\n' : '\n';
  const original = lines[frame.line - 1], inserted = options.copy === false
    ? frameLine({ group: frame.group, index: Math.min(65535, frame.index + 1), x: frame.x, y: frame.y, time: 1, flags: '', blend: '', scaleX: 1, scaleY: 1, angle: 0 }, (/^\s*/.exec(original) || [''])[0])
    : original;
  lines.splice(frame.line, 0, inserted);
  return lines.join(eol);
}

function deleteFrameElement(text, options) {
  const { action, frame } = frameTarget(text, options.action, options.frameIndex);
  if (action.frames.length <= 1) throw new Error('An animation must keep at least one frame. Delete the animation itself if it is no longer needed.');
  const lines = String(text).split(/\r?\n/), eol = /\r\n/.test(text) ? '\r\n' : '\n', remove = new Set([frame.line - 1]);
  for (const kind of ['clsn1', 'clsn2']) {
    if (frame[`${kind}Source`] !== 'element' || !frame[`${kind}Line`]) continue;
    const start = frame[`${kind}Line`] - 1, count = blockExtent(lines, frame[`${kind}Line`], kind);
    for (let at = start; at < start + count; at += 1) remove.add(at);
  }
  const previousLine = Number(options.frameIndex) > 0 ? action.frames[Number(options.frameIndex) - 1].line : action.line;
  for (let at = previousLine; at < frame.line - 1; at += 1) {
    if (/^\s*interpolate\s+(offset|scale|angle|blend)\s*(?:;.*)?$/i.test(lines[at] || '')) remove.add(at);
  }
  return lines.filter((_, index) => !remove.has(index)).join(eol);
}

function rawFrameValues(content) {
  const clean = String(content || '').replace(/;.*/, '').trim(), parts = clean.split(',').map((part) => part.trim());
  if (parts.length < 5 || parts.slice(0, 5).some((value) => !/^-?\d+$/.test(value))) return null;
  return { group: Number(parts[0]), index: Number(parts[1]) };
}

function rawCollisionBlock(lines, lineIndex) {
  const clean = String(lines[lineIndex]?.content || '').replace(/;.*/, '').trim(), header = CLSN_HEADER.exec(clean);
  if (!header) return null;
  const kind = `clsn${header[1]}`, isDefault = Boolean(header[2]), count = Number(header[3]);
  let cursor = lineIndex + 1, assignments = 0;
  while (cursor < lines.length && assignments < count) {
    const value = String(lines[cursor]?.content || '').replace(/;.*/, '').trim();
    if (!value) { cursor += 1; continue; }
    if (!/^clsn/i.test(value)) break;
    if (!CLSN_BOX.test(value)) throw new Error(`Malformed ${isDefault ? `${kind}Default` : kind} block near AIR line ${lineIndex + 1}; reorder it in Source.`);
    assignments += 1; cursor += 1;
  }
  if (assignments < count) throw new Error(`Malformed ${isDefault ? `${kind}Default` : kind} block near AIR line ${lineIndex + 1}; reorder it in Source.`);
  return { kind, isDefault, count, endLineIndex: cursor - 1 };
}

function frameElementRanges(text, actionNumber) {
  const source = String(text || ''), range = uniqueActionRange(source, actionNumber), local = range.text, lines = sourceLines(local), blocks = [];
  let pendingStart = null, pendingLoop = 0, pendingInterpolation = [], boundaryBefore = [];
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex], clean = line.content.replace(/;.*/, '').trim();
    if (!clean) continue;
    const collision = rawCollisionBlock(lines, lineIndex);
    if (collision) {
      if (collision.isDefault) {
        boundaryBefore.push(`${collision.kind}Default changes before element ${blocks.length + 1}`);
        pendingStart = null;
      } else if (pendingStart === null) pendingStart = line.start;
      lineIndex = collision.endLineIndex;
      continue;
    }
    if (/^loopstart$/i.test(clean)) {
      if (pendingStart === null) pendingStart = line.start;
      pendingLoop += 1;
      continue;
    }
    const interpolation = /^interpolate\s+(offset|scale|angle|blend)$/i.exec(clean);
    if (interpolation) {
      if (pendingStart === null) pendingStart = line.start;
      pendingInterpolation.push(interpolation[1].toLowerCase());
      continue;
    }
    const frame = rawFrameValues(line.content);
    if (frame) {
      const localStart = pendingStart === null ? line.start : pendingStart, start = range.start + localStart, end = range.start + line.end;
      blocks.push({ frameIndex: blocks.length, start, end, text: source.slice(start, end), group: frame.group, index: frame.index, loopStart: pendingLoop, interpolation: [...pendingInterpolation], boundaryBefore: [...boundaryBefore] });
      pendingStart = null; pendingLoop = 0; pendingInterpolation = []; boundaryBefore = [];
      continue;
    }
    boundaryBefore.push(`unsupported directive on AIR line ${range.lineIndex + lineIndex + 1}: ${clean}`);
    pendingStart = null; pendingLoop = 0; pendingInterpolation = [];
  }
  const parsed = parseAir(source).filter((item) => item.number === Number(actionNumber));
  if (parsed.length !== 1 || parsed[0].frames.length !== blocks.length) throw new Error(`Action ${actionNumber} has ambiguous frame ownership; reorder it in Source.`);
  return { action: parsed[0], range, blocks };
}

function frameSemantic(frame) {
  return {
    group: frame.group, index: frame.index, x: frame.x, y: frame.y, rawTime: frame.rawTime, flags: frame.flags, blend: frame.blend,
    scaleX: frame.scaleX, scaleY: frame.scaleY, angle: frame.angle, fieldCount: frame.fieldCount, interpolate: frame.interpolate,
    clsn1: frame.clsn1, clsn2: frame.clsn2, clsn1Records: frame.clsn1Records, clsn2Records: frame.clsn2Records,
    clsn1Source: frame.clsn1Source, clsn2Source: frame.clsn2Source,
    clsn1Default: frame.clsn1Default, clsn2Default: frame.clsn2Default,
    clsn1DefaultRecords: frame.clsn1DefaultRecords, clsn2DefaultRecords: frame.clsn2DefaultRecords
  };
}

function moveFrameElementPatch(text, options) {
  const source = String(text || ''), actionNumber = integerField(options.action, 'Action number'), from = integerField(options.frameIndex, 'Frame index');
  const direction = String(options.direction || '').toLowerCase(), delta = direction === 'earlier' ? -1 : direction === 'later' ? 1 : 0;
  if (!delta) throw new Error('Frame direction must be earlier or later.');
  const ownership = frameElementRanges(source, actionNumber), to = from + delta;
  if (!ownership.blocks[from]) throw new Error(`Action ${actionNumber}, element ${from + 1} could not be located.`);
  if (!ownership.blocks[to]) throw new Error(`Element ${from + 1} is already the ${delta < 0 ? 'first' : 'last'} element in Action ${actionNumber}.`);
  const earlier = ownership.blocks[Math.min(from, to)], later = ownership.blocks[Math.max(from, to)];
  const boundaries = [...later.boundaryBefore, ...earlier.boundaryBefore.filter((item) => /^unsupported directive/i.test(item))];
  if (boundaries.length) throw new Error(`This move crosses ${boundaries.join('; ')}. Use AIR Source so persistent or ambiguous directives are reviewed explicitly.`);
  const loopMarkers = ownership.blocks.reduce((sum, block) => sum + block.loopStart, 0);
  if (loopMarkers > 1) throw new Error(`Action ${actionNumber} has more than one LoopStart marker; reorder it in Source.`);
  const splitEnding = (value) => { const match = /(\r\n|\r|\n)$/.exec(value); return match ? { body: value.slice(0, -match[0].length), eol: match[0] } : { body: value, eol: '' }; };
  const earlierParts = splitEnding(earlier.text), laterParts = splitEnding(later.text), anchoredTrivia = source.slice(earlier.end, later.start);
  const patch = { start: earlier.start, end: later.end, text: laterParts.body + earlierParts.eol + anchoredTrivia + earlierParts.body + laterParts.eol }, updated = applyActionPatches(source, [patch]);
  const next = frameElementRanges(updated, actionNumber), expected = ownership.action.frames.map(frameSemantic);
  [expected[from], expected[to]] = [expected[to], expected[from]];
  const actual = next.action.frames.map(frameSemantic);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('The reordered AIR would change frame or collision semantics; nothing was written. Use Source for this action.');
  if (loopMarkers) {
    const marked = ownership.blocks.findIndex((block) => block.loopStart);
    const expectedLoop = marked === from ? to : marked === to ? from : marked;
    if (next.action.loopStart !== expectedLoop) throw new Error('LoopStart ownership could not be preserved safely; reorder this action in Source.');
  }
  const moving = ownership.blocks[from], neighbor = ownership.blocks[to];
  const firstHold = (frames) => frames.findIndex((frame) => frame.rawTime === -1), holdBefore = firstHold(ownership.action.frames), holdAfter = firstHold(next.action.frames);
  return {
    ...patch, action: actionNumber, from, to,
    movingSprite: [moving.group, moving.index], neighborSprite: [neighbor.group, neighbor.index],
    loopStartBefore: loopMarkers ? ownership.action.loopStart : null, loopStartAfter: loopMarkers ? next.action.loopStart : null,
    movingInterpolation: moving.interpolation, neighborInterpolation: neighbor.interpolation,
    holdBefore, holdAfter, reachableBefore: holdBefore < 0 ? ownership.action.frames.length : holdBefore + 1, reachableAfter: holdAfter < 0 ? next.action.frames.length : holdAfter + 1
  };
}

function moveFrameBlockPatch(text, options) {
  const source = String(text || ''), actionNumber = integerField(options.action, 'Action number'), ownership = frameElementRanges(source, actionNumber), blocks = ownership.blocks;
  const indices = options.frameIndices;
  if (!Array.isArray(indices) || !indices.length || indices.some(index => !Number.isSafeInteger(index) || index < 0 || index >= blocks.length) || new Set(indices).size !== indices.length) throw new Error('Choose distinct current AIR elements to move.');
  const chosen = new Set(indices), moving = blocks.map((_, index) => index).filter(index => chosen.has(index)), remaining = blocks.map((_, index) => index).filter(index => !chosen.has(index));
  const position = options.position;
  if (!Number.isSafeInteger(position) || position < 1 || position > remaining.length + 1) throw new Error(`Choose a destination position from 1 to ${remaining.length + 1}.`);
  const order = [...remaining.slice(0, position - 1), ...moving, ...remaining.slice(position - 1)];
  const changedPositions = order.map((index, position) => index === position ? -1 : position).filter(position => position >= 0);
  if (!changedPositions.length) throw new Error('The selected AIR elements are already at that position.');
  const newPosition = new Map(order.map((original, slot) => [original, slot]));
  let highestOriginalBeforeBoundary = -1;
  for (let boundary = 1; boundary < blocks.length; boundary += 1) {
    highestOriginalBeforeBoundary = Math.max(highestOriginalBeforeBoundary, order[boundary - 1]);
    if (!blocks[boundary].boundaryBefore.length) continue;
    if (highestOriginalBeforeBoundary >= boundary) throw new Error(`This move crosses ${blocks[boundary].boundaryBefore.join('; ')}. Use AIR Source to review that boundary.`);
  }
  const first = changedPositions[0], last = changedPositions[changedPositions.length - 1];
  for (let index = first; index < last; index += 1) {
    const gap = source.slice(blocks[index].end, blocks[index + 1].start);
    if (gap.trim()) throw new Error(`An unattached comment or directive lies between AIR elements ${index + 1} and ${index + 2}. Review its ownership in AIR Source before reordering.`);
  }
  const ending = value => { const match = /(\r\n|\r|\n)$/.exec(value); return match ? match[0] : ''; };
  let replacement = '';
  for (let slot = first; slot <= last; slot += 1) {
    const body = blocks[order[slot]].text.replace(/(\r\n|\r|\n)$/, '');
    replacement += body + ending(blocks[slot].text);
    if (slot < last) replacement += source.slice(blocks[slot].end, blocks[slot + 1].start);
  }
  const patch = { start: blocks[first].start, end: blocks[last].end, text: replacement }, updated = applyActionPatches(source, [patch]);
  const next = frameElementRanges(updated, actionNumber), expected = order.map(index => frameSemantic(ownership.action.frames[index])), actual = next.action.frames.map(frameSemantic);
  const comparable = frames => JSON.stringify(frames, (key, value) => key === 'line' ? undefined : value);
  if (comparable(actual) !== comparable(expected)) throw new Error('The moved AIR would change frame or collision semantics. Review this action in AIR Source.');
  const loopMarkers = blocks.reduce((count, block) => count + block.loopStart, 0);
  if (loopMarkers > 1) throw new Error(`Action ${actionNumber} has more than one LoopStart marker; reorder it in AIR Source.`);
  if (loopMarkers) { const owner = blocks.findIndex(block => block.loopStart); if (next.action.loopStart !== newPosition.get(owner)) throw new Error('LoopStart ownership could not be preserved; reorder this action in AIR Source.'); }
  const active = Number.isSafeInteger(options.activeFrameIndex) && chosen.has(options.activeFrameIndex) ? options.activeFrameIndex : moving[0];
  const firstHold = frames => frames.findIndex(frame => frame.rawTime === -1);
  return { ...patch, action: actionNumber, from: active, to: newPosition.get(active), selectedIndices: moving.map(index => newPosition.get(index)), changedPositions, count: moving.length, loopStartBefore: loopMarkers ? ownership.action.loopStart : null, loopStartAfter: loopMarkers ? next.action.loopStart : null, holdBefore: firstHold(ownership.action.frames), holdAfter: firstHold(next.action.frames), interpolationCount: changedPositions.reduce((count, index) => count + blocks[index].interpolation.length, 0) };
}

function sourceLines(text) {
  const source = String(text || ''), records = []; let start = 0, match;
  const eols = /\r\n|\r|\n/g;
  while ((match = eols.exec(source))) {
    records.push({ start, end: match.index + match[0].length, content: source.slice(start, match.index), eol: match[0] });
    start = match.index + match[0].length;
  }
  if (start < source.length || !records.length) records.push({ start, end: source.length, content: source.slice(start), eol: '' });
  return records;
}

function actionSourceRanges(text) {
  const source = String(text || ''), lines = sourceLines(source), headers = [];
  const header = /^([ \t]*\[[ \t]*begin[ \t]+action[ \t]+)(-?\d+)([ \t]*\][ \t]*(?:;.*)?)$/i;
  lines.forEach((line, lineIndex) => {
    const match = header.exec(line.content);
    if (!match) return;
    headers.push({ number: Number(match[2]), lineIndex, start: line.start, headerEnd: line.end, numberStart: line.start + match[1].length, numberEnd: line.start + match[1].length + match[2].length });
  });
  return headers.map((item, index) => {
    const nextLine = index + 1 < headers.length ? headers[index + 1].lineIndex : lines.length, nextStart = index + 1 < headers.length ? headers[index + 1].start : source.length;
    let ownedEnd = index + 1 < headers.length ? item.headerEnd : source.length;
    for (let lineIndex = item.lineIndex + 1; lineIndex < nextLine; lineIndex += 1) {
      const clean = lines[lineIndex].content.trim();
      if (clean && !clean.startsWith(';')) ownedEnd = Math.max(ownedEnd, lines[lineIndex].end);
    }
    return { ...item, end: ownedEnd, nextStart, text: source.slice(item.start, ownedEnd) };
  });
}

function uniqueActionRange(text, actionNumber) {
  const number = integerField(actionNumber, 'Action number'), matches = actionSourceRanges(text).filter((item) => item.number === number);
  if (!matches.length) throw new Error(`Action ${number} could not be located.`);
  if (matches.length > 1) throw new Error(`Action ${number} is defined more than once. Resolve the duplicate IDs in Source before using visual action editing.`);
  return matches[0];
}

function actionEol(text) {
  return (/\r\n|\r|\n/.exec(String(text || '')) || ['\n'])[0];
}

function createActionPatch(text, options) {
  const source = String(text || ''), action = integerField(options.action, 'Action number');
  if (actionSourceRanges(source).some((item) => item.number === action)) throw new Error(`Action ${action} already exists.`);
  const group = integerField(options.group, 'Sprite group'), index = integerField(options.index, 'Sprite index');
  const x = integerField(options.x ?? 0, 'X offset'), y = integerField(options.y ?? 0, 'Y offset'), time = integerField(options.time ?? 1, 'Frame time');
  if (time < -1) throw new Error('Frame time must be -1 (hold) or zero or greater.');
  const comment = String(options.comment || '').trim(), flags = String(options.flags || '').trim();
  if (/\r|\n/.test(comment)) throw new Error('Action comments must stay on one line.');
  if (/[,\r\n]/.test(flags)) throw new Error('Starter frame flags must be one AIR flags field.');
  const eol = actionEol(source), prefix = !source ? '' : /(?:\r\n|\r|\n)$/.test(source) ? eol : eol + eol;
  const heading = `${comment ? `; ${comment}${eol}` : ''}[Begin Action ${action}]${eol}`, loop = options.loopStart ? `LoopStart${eol}` : '', frame = `${group}, ${index}, ${x}, ${y}, ${time}${flags ? `, ${flags}` : ''}`;
  return { start: source.length, end: source.length, text: prefix + heading + loop + frame, action };
}

function duplicateActionPatch(text, sourceAction, destinationAction) {
  const source = String(text || ''), from = uniqueActionRange(source, sourceAction), destination = integerField(destinationAction, 'Destination action number');
  if (actionSourceRanges(source).some((item) => item.number === destination)) throw new Error(`Action ${destination} already exists.`);
  const relativeStart = from.numberStart - from.start, relativeEnd = from.numberEnd - from.start;
  const copy = from.text.slice(0, relativeStart) + destination + from.text.slice(relativeEnd), eol = actionEol(source);
  const prefix = /(?:\r\n|\r|\n)$/.test(from.text) ? eol : eol + eol;
  return { start: from.end, end: from.end, text: prefix + copy, action: destination, sourceAction: from.number };
}

function deleteActionPatches(text, actionNumbers) {
  const wanted = [...new Set((actionNumbers || []).map(Number).filter(Number.isInteger))];
  if (!wanted.length) throw new Error('Select at least one AIR animation to delete.');
  const ranges = actionSourceRanges(text), patches = [];
  for (const number of wanted) {
    const matches = ranges.filter((item) => item.number === number);
    if (!matches.length) throw new Error(`Action ${number} could not be located.`);
    if (matches.length > 1) throw new Error(`Action ${number} is defined more than once. Resolve duplicate IDs in Source before deleting it visually.`);
    patches.push({ start: matches[0].start, end: matches[0].end, text: '', action: number });
  }
  return patches.sort((a, b) => b.start - a.start);
}

function applyActionPatches(text, patches) {
  let output = String(text || '');
  for (const patch of [...(patches || [])].sort((a, b) => b.start - a.start)) output = output.slice(0, patch.start) + String(patch.text || '') + output.slice(patch.end);
  return output;
}

function requireActionMutationBaseline(baseline, current) {
  if (!baseline || !current || Number(current.version) !== Number(baseline.version) || String(current.text) !== String(baseline.text)) throw new Error('The AIR source changed while the action edit was being reviewed. Nothing was written; review the current source and try again.');
  return true;
}

function blockExtent(lines, lineNumber, kind) {
  const headerIndex = lineNumber - 1, header = CLSN_HEADER.exec((lines[headerIndex] || '').replace(/;.*/, '').trim());
  if (!header || `clsn${header[1]}` !== kind) throw new Error(`The ${kind} source block could not be located.`);
  const declared = Number(header[3]); let cursor = headerIndex + 1, assignments = 0;
  while (cursor < lines.length && assignments < declared) {
    const clean = String(lines[cursor] || '').replace(/;.*/, '').trim();
    if (!clean) { cursor += 1; continue; }
    if (!/^clsn/i.test(clean)) break;
    assignments += 1; cursor += 1;
  }
  return Math.max(1, cursor - headerIndex);
}

function collisionSourceLayout(lines, lineNumber, kind) {
  const headerIndex = lineNumber - 1, header = CLSN_HEADER.exec((lines[headerIndex] || '').replace(/;.*/, '').trim());
  if (!header || `clsn${header[1]}` !== kind) throw new Error(`The ${kind} source block could not be located.`);
  const declared = Number(header[3]), assignments = [], trivia = []; let cursor = headerIndex + 1;
  while (cursor < lines.length && assignments.length < declared) {
    const clean = String(lines[cursor] || '').replace(/;.*/, '').trim();
    if (!clean) { trivia.push(cursor); cursor += 1; continue; }
    if (!/^clsn/i.test(clean)) break;
    if (!CLSN_BOX.test(clean)) throw new Error(`The ${kind} block contains a malformed assignment. Edit it in AIR Source so its raw text is preserved.`);
    assignments.push(cursor); cursor += 1;
  }
  return { headerIndex, declared, assignments, trivia, endExclusive: cursor };
}

function retainInlineComment(original, replacement) {
  const at = String(original || '').indexOf(';');
  return at < 0 ? replacement : `${replacement} ${String(original).slice(at).trimEnd()}`;
}

function updateCollisionBlock(text, options) {
  const actionNumber = Number(options.action), frameIndex = Number(options.frameIndex), kind = String(options.kind || '').toLowerCase(), scope = options.scope === 'default' ? 'default' : 'element';
  if (!['clsn1', 'clsn2'].includes(kind)) throw new Error('Collision kind must be Clsn1 or Clsn2.');
  const actions = parseAir(text), matches = actions.filter((item) => item.number === actionNumber), action = matches[0], frame = action && action.frames[frameIndex];
  if (matches.length > 1) throw new Error(`Action ${actionNumber} is defined more than once. Resolve duplicate IDs in AIR Source before visual collision editing.`);
  if (!action || !frame) throw new Error(`Action ${actionNumber}, element ${frameIndex + 1} could not be located.`);
  if (action.readOnly) throw new Error(action.fallthroughAction !== undefined ? `Action ${actionNumber} is an empty legacy fallthrough to Action ${action.fallthroughAction}. Edit the authoritative source action instead.` : `Action ${actionNumber} inherits collision from Copy Action ${action.copyAction}. Edit authoritative Action ${action.resolvedFrom} instead.`);
  const lines = String(text).split(/\r?\n/), eol = /\r\n/.test(text) ? '\r\n' : '\n';
  const source = scope === 'default' ? frame[`${kind}DefaultLine`] : frame[`${kind}Source`] === 'element' ? frame[`${kind}Line`] : null;
  const referenceLine = source || (scope === 'default' ? action.line + 1 : frame.line), referenceText = lines[Math.max(0, referenceLine - 1)] || '';
  const indent = /^\s*/.exec(referenceText)[0], recordField = scope === 'default' ? `${kind}DefaultRecords` : `${kind}Records`;
  const suppliedRecords = Array.isArray(options.records) ? options.records : null;
  const existingRecords = source && Array.isArray(frame[recordField]) ? frame[recordField] : [];
  const preservedRecords = suppliedRecords || ((options.boxes || []).length === existingRecords.length
    ? (options.boxes || []).map((rect, index) => ({ index: existingRecords[index].index, rect }))
    : null);
  const replacement = blockLines(kind, options.boxes || [], indent, preservedRecords);
  if (scope === 'default') replacement[0] = replacement[0].replace(':', 'Default:');
  if (source) {
    const layout = collisionSourceLayout(lines, source, kind);
    if (layout.trivia.length) {
      if (layout.assignments.length !== layout.declared || replacement.length - 1 !== layout.assignments.length) throw new Error(`The ${kind} block contains comments or blank lines and its box count would change. Edit it in AIR Source so that trivia is not discarded.`);
      lines[layout.headerIndex] = retainInlineComment(lines[layout.headerIndex], replacement[0]);
      layout.assignments.forEach((lineIndex, index) => { lines[lineIndex] = retainInlineComment(lines[lineIndex], replacement[index + 1]); });
    } else lines.splice(source - 1, blockExtent(lines, source, kind), ...replacement);
  }
  else lines.splice(scope === 'default' ? action.line : frame.line - 1, 0, ...replacement);
  return lines.join(eol);
}

function updateCollisionBlocks(text, options) {
  const actionNumber = Number(options.action), action = parseAir(text).find((item) => item.number === actionNumber);
  if (!action) throw new Error(`Action ${actionNumber} could not be located.`);
  if (options.scope === 'default' || options.scope === 'element') return updateCollisionBlock(text, options);
  let indices;
  if (options.scope === 'action') indices = action.frames.map((_, index) => index);
  else if (options.scope === 'selected') indices = [...new Set((options.frameIndices || []).map(Number))].filter((index) => Number.isInteger(index) && index >= 0 && index < action.frames.length);
  else throw new Error('Collision scope must be element, selected, action, or default.');
  if (!indices.length) throw new Error('Select at least one animation element for this collision edit.');
  let output = text;
  for (const frameIndex of indices.sort((a, b) => b - a)) output = updateCollisionBlock(output, { ...options, scope: 'element', frameIndex });
  return output;
}

function deleteActions(text, actionNumbers) {
  const wanted = [...new Set((actionNumbers || []).map(Number).filter(Number.isInteger))], patches = deleteActionPatches(text, wanted);
  return { text: applyActionPatches(text, patches), deleted: wanted.sort((a, b) => a - b), missing: [] };
}

function actionAtLine(text, lineZeroBased) {
  const lines = String(text || '').split(/\r?\n/);
  const target = Math.max(0, Math.min(lines.length - 1, Number(lineZeroBased) || 0));
  let action = null;
  for (let line = 0; line <= target; line += 1) {
    const match = /^\s*\[\s*begin\s+action\s+(-?\d+)\s*\]\s*$/i.exec(lines[line]);
    if (match) action = Number(match[1]);
  }
  return action;
}

function selectionAtLine(text, lineZeroBased) {
  const targetLine = Math.max(1, (Number(lineZeroBased) || 0) + 1), actions = parseAir(text);
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const action = actions[index];
    if (targetLine < action.line) continue;
    const next = actions[index + 1];
    if (next && targetLine >= next.line) continue;
    let frameIndex = action.frames.findIndex((frame) => frame.line >= targetLine);
    if (frameIndex < 0) frameIndex = Math.max(0, action.frames.length - 1);
    return { action: action.number, frameIndex };
  }
  return null;
}

module.exports = { parseAir, updateCollisionBlock, updateCollisionBlocks, updateFrameElement, updateFrameDirectives, insertFrameElement, deleteFrameElement, frameElementRanges, moveFrameElementPatch, moveFrameBlockPatch, actionSourceRanges, createActionPatch, duplicateActionPatch, deleteActionPatches, applyActionPatches, requireActionMutationBaseline, deleteActions, actionAtLine, selectionAtLine };
