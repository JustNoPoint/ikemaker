'use strict';

const ACTION_HEADER = /^\s*\[\s*begin\s+action\s+(-?\d+)\s*\]\s*$/i;
const CLSN_HEADER = /^\s*Clsn([12])(Default)?\s*:\s*(\d+)\s*$/i;
const CLSN_BOX = /^\s*Clsn([12])\s*\[\s*\d+\s*\]\s*=\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i;

function copyBoxes(boxes) { return boxes ? boxes.map((box) => [...box]) : []; }
function cleanNumber(value) { const number = Number(value); if (!Number.isFinite(number)) throw new Error('Collision coordinates must be finite numbers.'); return number; }
function blockLines(kind, boxes, indent = '') {
  const name = kind === 'clsn1' ? 'Clsn1' : 'Clsn2', safe = boxes.map((box) => {
    if (!Array.isArray(box) || box.length !== 4) throw new Error('Each collision box requires x1, y1, x2, y2.');
    return box.map(cleanNumber);
  });
  return [`${indent}${name}: ${safe.length}`, ...safe.map((box, index) => `${indent}${name}[${index}] = ${box.join(', ')}`)];
}

function parseAir(text) {
  const lines = String(text || '').split(/\r?\n/), actions = [];
  let action = null;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const clean = lines[lineIndex].replace(/;.*/, '').trim(), heading = ACTION_HEADER.exec(clean);
    if (heading) {
      action = { number: Number(heading[1]), line: lineIndex + 1, frames: [], loopStart: 0, defaults: { clsn1: null, clsn2: null } };
      actions.push(action); continue;
    }
    if (!action || !clean) continue;
    if (/^loopstart$/i.test(clean)) { action.loopStart = action.frames.length; continue; }
    const interpolation = /^interpolate\s+(offset|scale|angle|blend)$/i.exec(clean);
    if (interpolation) { action.pendingInterpolation = [...new Set([...(action.pendingInterpolation || []), interpolation[1].toLowerCase()])]; continue; }
    const collision = CLSN_HEADER.exec(clean);
    if (collision) {
      const kind = `clsn${collision[1]}`, isDefault = Boolean(collision[2]), count = Number(collision[3]), boxes = [];
      for (let offset = 1; offset <= count && lineIndex + offset < lines.length; offset += 1) {
        const box = CLSN_BOX.exec(lines[lineIndex + offset].replace(/;.*/, '').trim());
        if (!box || `clsn${box[1]}` !== kind) break;
        boxes.push(box.slice(2, 6).map(Number));
      }
      const block = { boxes, line: lineIndex + 1, isDefault, declared: count };
      if (isDefault) action.defaults[kind] = block; else action.pending = { ...(action.pending || {}), [kind]: block };
      lineIndex += boxes.length; continue;
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
      clsn1Source: pending.clsn1 ? 'element' : action.defaults.clsn1 ? 'default' : 'none',
      clsn2Source: pending.clsn2 ? 'element' : action.defaults.clsn2 ? 'default' : 'none',
      clsn1Line: (pending.clsn1 || action.defaults.clsn1 || {}).line || null,
      clsn2Line: (pending.clsn2 || action.defaults.clsn2 || {}).line || null,
      clsn1Default: copyBoxes((action.defaults.clsn1 || {}).boxes), clsn2Default: copyBoxes((action.defaults.clsn2 || {}).boxes),
      clsn1DefaultLine: (action.defaults.clsn1 || {}).line || null, clsn2DefaultLine: (action.defaults.clsn2 || {}).line || null
    };
    action.frames.push(frame); action.pending = {}; action.pendingInterpolation = [];
  }
  return actions.filter((item) => item.frames.length).map((item) => ({ ...item, defaults: undefined, pending: undefined, pendingInterpolation: undefined }));
}

function frameTarget(text, actionNumber, frameIndex) {
  const action = parseAir(text).find((item) => item.number === Number(actionNumber));
  const frame = action && action.frames[Number(frameIndex)];
  if (!action || !frame) throw new Error(`Action ${actionNumber}, element ${Number(frameIndex) + 1} could not be located.`);
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

function insertFrameElement(text, options) {
  const { frame } = frameTarget(text, options.action, options.frameIndex), lines = String(text).split(/\r?\n/), eol = /\r\n/.test(text) ? '\r\n' : '\n';
  const original = lines[frame.line - 1], inserted = options.copy === false
    ? frameLine({ group: frame.group, index: frame.index, x: 0, y: 0, time: 1, flags: '', blend: '', scaleX: 1, scaleY: 1, angle: 0 }, (/^\s*/.exec(original) || [''])[0])
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
  const eol = actionEol(source), prefix = !source ? '' : /(?:\r\n|\r|\n)$/.test(source) ? eol : eol + eol;
  return { start: source.length, end: source.length, text: `${prefix}[Begin Action ${action}]${eol}${group}, ${index}, ${x}, ${y}, ${time}`, action };
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
  let count = 1;
  while (headerIndex + count < lines.length) {
    const box = CLSN_BOX.exec(lines[headerIndex + count].replace(/;.*/, '').trim());
    if (!box || `clsn${box[1]}` !== kind) break; count += 1;
  }
  return count;
}

function updateCollisionBlock(text, options) {
  const actionNumber = Number(options.action), frameIndex = Number(options.frameIndex), kind = String(options.kind || '').toLowerCase(), scope = options.scope === 'default' ? 'default' : 'element';
  if (!['clsn1', 'clsn2'].includes(kind)) throw new Error('Collision kind must be Clsn1 or Clsn2.');
  const actions = parseAir(text), action = actions.find((item) => item.number === actionNumber), frame = action && action.frames[frameIndex];
  if (!action || !frame) throw new Error(`Action ${actionNumber}, element ${frameIndex + 1} could not be located.`);
  const lines = String(text).split(/\r?\n/), eol = /\r\n/.test(text) ? '\r\n' : '\n';
  const source = scope === 'default' ? frame[`${kind}DefaultLine`] : frame[`${kind}Source`] === 'element' ? frame[`${kind}Line`] : null;
  const referenceLine = source || (scope === 'default' ? action.line + 1 : frame.line), referenceText = lines[Math.max(0, referenceLine - 1)] || '';
  const indent = /^\s*/.exec(referenceText)[0], replacement = blockLines(kind, options.boxes || [], indent);
  if (scope === 'default') replacement[0] = replacement[0].replace(':', 'Default:');
  if (source) lines.splice(source - 1, blockExtent(lines, source, kind), ...replacement);
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

module.exports = { parseAir, updateCollisionBlock, updateCollisionBlocks, updateFrameElement, insertFrameElement, deleteFrameElement, actionSourceRanges, createActionPatch, duplicateActionPatch, deleteActionPatches, applyActionPatches, requireActionMutationBaseline, deleteActions, actionAtLine, selectionAtLine };
