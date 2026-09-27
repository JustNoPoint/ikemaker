'use strict';

const { parseNumberSet } = require('./air');
const { hash } = require('./mutation_safety');

const ACTION = /^\s*\[\s*Begin\s+Action\s+(-?\d+)\s*\]/i;
const FRAME = /^\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+/;
const CLSN2_HEADER = /^\s*Clsn2(Default)?\s*:\s*(\d+)/i;
const CLSN2_BOX = /^\s*Clsn2\s*\[\s*\d+\s*\]\s*=\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i;
const CLSN1_HEADER = /^\s*Clsn1(Default)?\s*:\s*(\d+)/i;
const CLSN1_BOX = /^\s*Clsn1\s*\[\s*\d+\s*\]/i;
const ROLES = new Set(['all', 'stand', 'crouch', 'air', 'grounded-start', 'custom', 'unknown', 'excluded']);

function normalizedBoxes(boxes) {
  return (boxes || []).map((box, index) => {
    if (!Array.isArray(box) || box.length !== 4 || box.some((value) => !Number.isFinite(Number(value)))) {
      throw new Error(`Clsn2 box ${index + 1} must contain four finite coordinates.`);
    }
    let [x1, y1, x2, y2] = box.map(Number);
    if (x1 > x2) [x1, x2] = [x2, x1];
    if (y1 > y2) [y1, y2] = [y2, y1];
    return [x1, y1, x2, y2];
  });
}

function sameBoxes(left, right) { return JSON.stringify(left || []) === JSON.stringify(right || []); }
function cleanHeading(line) { const match = /^\s*;\s?(.*)$/.exec(line); return match && match[1].trim(); }

function actionsIn(text) {
  const lines = String(text || '').split(/\r?\n/), starts = [];
  for (let line = 0; line < lines.length; line += 1) {
    const match = ACTION.exec(lines[line]);
    if (!match) continue;
    const heading = [];
    for (let before = line - 1; before >= 0; before -= 1) {
      const comment = cleanHeading(lines[before]);
      if (comment === false || comment === null) break;
      heading.unshift(comment);
    }
    starts.push({ number: Number(match[1]), start: line, end: lines.length, heading: heading.join(' ').trim(), frames: [], blocks: [] });
  }
  starts.forEach((action, index) => { if (starts[index + 1]) action.end = starts[index + 1].start; });
  for (const action of starts) {
    let defaultBlock = null, pending = null;
    for (let line = action.start + 1; line < action.end; line += 1) {
      const header = CLSN2_HEADER.exec(lines[line]);
      if (header) {
        const count = Number(header[2]), boxes = [];
        for (let offset = 1; offset <= count; offset += 1) {
          const box = CLSN2_BOX.exec(lines[line + offset] || '');
          if (!box) throw new Error(`Action ${action.number} has an incomplete Clsn2 block near line ${line + 1}.`);
          boxes.push(box.slice(1, 5).map(Number));
        }
        const block = { start: line, end: line + count + 1, isDefault: Boolean(header[1]), boxes: normalizedBoxes(boxes), attachedFrame: null };
        action.blocks.push(block);
        if (block.isDefault) defaultBlock = block;
        else {
          if (pending) throw new Error(`Action ${action.number} has more than one per-element Clsn2 block before the next frame.`);
          pending = block;
        }
        line += count;
        continue;
      }
      const clsn1 = CLSN1_HEADER.exec(lines[line]);
      if (clsn1) {
        const count = Number(clsn1[2]);
        for (let offset = 1; offset <= count; offset += 1) {
          if (!CLSN1_BOX.test(lines[line + offset] || '')) throw new Error(`Action ${action.number} has an incomplete Clsn1 block near line ${line + 1}.`);
        }
        line += count;
        continue;
      }
      if (!FRAME.test(lines[line])) continue;
      const frame = {
        index: action.frames.length,
        element: action.frames.length + 1,
        line,
        explicit: pending,
        defaultBlock,
        effective: normalizedBoxes((pending || defaultBlock || { boxes: [] }).boxes),
        source: pending ? 'element' : defaultBlock ? 'default' : 'none'
      };
      if (pending) pending.attachedFrame = frame.index;
      action.frames.push(frame);
      pending = null;
    }
    if (pending) throw new Error(`Action ${action.number} ends with a Clsn2 block that is not attached to an animation element.`);
  }
  return { lines, actions: starts };
}

function roleOverride(value) {
  const role = String(value || '').trim().toLowerCase();
  if (!ROLES.has(role) || role === 'all') throw new Error(`Unknown AIR action role: ${value}`);
  return role;
}

function hintRole(heading) {
  const value = String(heading || '').toLowerCase().replace(/[_-]+/g, ' ');
  if (/stand(?:ing)?\s+to\s+crouch|stand\s*>\s*crouch/.test(value)) return 'crouch';
  if (/crouch(?:ing)?\s+to\s+stand|crouch\s*>\s*stand/.test(value)) return 'stand';
  if (/jump\s*(?:start|begin|startup)/.test(value)) return 'grounded-start';
  if (/\b(crouch|crouching|duck|ducking)\b/.test(value)) return 'crouch';
  if (/\b(air|aerial|jump|fall|flying)\b/.test(value)) return 'air';
  if (/\b(stand|standing|idle|walk|run)\b/.test(value)) return 'stand';
  return 'unknown';
}

function classification(action, options = {}) {
  const number = Number(action.number), exclusions = new Set((options.exclusions || []).map(Number));
  if (exclusions.has(number)) return { role: 'excluded', source: 'explicit exclusion' };
  const overrides = options.overrides || {}, saved = options.savedMappings || {};
  if (Object.prototype.hasOwnProperty.call(overrides, number)) return { role: roleOverride(overrides[number]), source: 'this review' };
  if (Object.prototype.hasOwnProperty.call(saved, number)) return { role: roleOverride(saved[number]), source: 'remembered owner mapping' };
  if (number === 10) return { role: 'transition-crouch', source: 'standard Action 10 suggestion', transitionAt: 0 };
  if (number === 12) return { role: 'transition-stand', source: 'standard Action 12 suggestion', transitionAt: 0 };
  if (number === 40) return { role: 'grounded-start', source: 'standard Action 40 suggestion' };
  return { role: hintRole(action.heading), source: action.heading ? 'name suggestion' : 'unclassified' };
}

function frameRole(actionRole, frameIndex) {
  if (actionRole.role === 'transition-crouch') return frameIndex >= actionRole.transitionAt ? 'crouch' : 'stand';
  if (actionRole.role === 'transition-stand') return frameIndex >= actionRole.transitionAt ? 'stand' : 'crouch';
  return actionRole.role;
}

function formatBlock(boxes, isDefault, indent = '') {
  const name = `Clsn2${isDefault ? 'Default' : ''}`;
  return [`${indent}${name}: ${boxes.length}`, ...boxes.map((box, index) => `${indent}  Clsn2[${index}] = ${box.join(', ')}`)];
}

function applyLineEdits(lines, edits) {
  for (const edit of edits.slice().sort((a, b) => b.start - a.start || b.end - a.end)) lines.splice(edit.start, edit.end - edit.start, ...edit.lines);
}

function selectedActions(actions, selector) {
  const match = typeof selector === 'function' ? selector : parseNumberSet(selector || 'all');
  const selected = actions.filter((action) => match(action.number));
  const duplicates = [...new Set(selected.map((action) => action.number).filter((number, index, values) => values.indexOf(number) !== index))];
  if (duplicates.length) throw new Error(`Duplicate AIR action ID${duplicates.length === 1 ? '' : 's'} ${duplicates.join(', ')} make this batch ambiguous. Resolve the duplicate definitions first.`);
  return selected;
}

function createProposal(text, options = {}) {
  const original = String(text || ''), eol = original.includes('\r\n') ? '\r\n' : '\n', trailing = /\r?\n$/.test(original);
  const parsed = actionsIn(original), lines = parsed.lines.slice();
  if (trailing && lines.at(-1) === '') lines.pop();
  const actionMatch = selectedActions(parsed.actions, options.actions), elementMatch = parseNumberSet(options.elements || 'all');
  const role = String(options.role || 'all').toLowerCase();
  if (!ROLES.has(role)) throw new Error(`Unknown target role: ${options.role}`);
  const operation = options.operation || options.mode || 'replace';
  const boxes = normalizedBoxes(options.boxes || []);
  if (!['clearEffective', 'removeOverride', 'clearAll'].includes(operation) && !boxes.length && options.allowEmpty !== true) throw new Error('The source Clsn2 is empty. Choose an explicit clear operation instead of replacing targets accidentally.');
  const edits = [], changed = [], unchanged = [], skipped = [], assignments = [];

  for (const action of actionMatch) {
    const assigned = classification(action, options), actionTargets = [];
    assignments.push({ action: action.number, heading: action.heading, ...assigned });
    if (assigned.role === 'excluded') { skipped.push({ action: action.number, reason: assigned.source }); continue; }
    if (operation === 'default' || operation === 'clearAll') {
      const eligible = action.frames.filter((frame) => elementMatch(frame.element) && (role === 'all' || frameRole(assigned, frame.index) === role));
      if (!eligible.length) { skipped.push({ action: action.number, reason: `no ${role === 'all' ? 'selected' : role} elements in range` }); continue; }
      if (operation === 'clearAll' && !action.blocks.length) { unchanged.push({ action: action.number, reason: 'action already has no Clsn2 blocks' }); continue; }
      if (operation === 'default' && action.blocks.length === 1 && action.blocks[0].isDefault && sameBoxes(action.blocks[0].boxes, boxes)) { unchanged.push({ action: action.number, reason: 'action default already matches' }); continue; }
      for (const block of action.blocks) edits.push({ start: block.start, end: block.end, lines: [] });
      if (operation === 'default') {
        const indent = /^\s*/.exec(lines[action.frames[0]?.line] || '')[0];
        edits.push({ start: action.start + 1, end: action.start + 1, lines: formatBlock(boxes, true, indent) });
      }
      changed.push({ action: action.number, elements: action.frames.map((frame) => frame.element), operation });
      continue;
    }

    for (const frame of action.frames) {
      const actualRole = frameRole(assigned, frame.index);
      if (!elementMatch(frame.element) || (role !== 'all' && actualRole !== role)) continue;
      let nextBoxes = boxes, remove = false;
      if (operation === 'append') nextBoxes = normalizedBoxes(frame.effective.concat(boxes));
      else if (operation === 'clearEffective') { nextBoxes = []; remove = !frame.defaultBlock; }
      else if (operation === 'removeOverride') { if (!frame.explicit) { unchanged.push({ action: action.number, element: frame.element, reason: 'no per-element override' }); continue; } remove = true; nextBoxes = frame.defaultBlock ? frame.defaultBlock.boxes : []; }
      else if (operation !== 'replace') throw new Error(`Unsupported Clsn2 operation: ${operation}`);
      if (sameBoxes(frame.effective, nextBoxes) && operation !== 'removeOverride') { unchanged.push({ action: action.number, element: frame.element, reason: 'effective boxes already match' }); continue; }
      const indent = /^\s*/.exec(lines[frame.line] || '')[0];
      if (frame.explicit) edits.push({ start: frame.explicit.start, end: frame.explicit.end, lines: remove ? [] : formatBlock(nextBoxes, false, indent) });
      else if (!remove) edits.push({ start: frame.line, end: frame.line, lines: formatBlock(nextBoxes, false, indent) });
      else { unchanged.push({ action: action.number, element: frame.element, reason: 'already effectively empty' }); continue; }
      actionTargets.push(frame.element);
    }
    if (actionTargets.length) changed.push({ action: action.number, elements: actionTargets, operation });
    else skipped.push({ action: action.number, reason: `no changed ${role === 'all' ? 'selected' : role} elements in range` });
  }
  applyLineEdits(lines, edits);
  const proposedText = lines.join(eol) + (trailing ? eol : '');
  return {
    baseHash: hash(original), proposedHash: hash(proposedText), text: proposedText,
    boxes, operation, role, assignments, changed, unchanged, skipped,
    changedActions: changed.map((item) => item.action),
    changedElements: changed.reduce((sum, item) => sum + item.elements.length, 0),
    availableActions: parsed.actions.map((action) => action.number)
  };
}

function parseAssignmentInput(value) {
  const overrides = {}, exclusions = [];
  for (const token of String(value || '').split(/[\s,]+/).filter(Boolean)) {
    if (/^!-?\d+$/.test(token)) { exclusions.push(Number(token.slice(1))); continue; }
    const match = /^(-?\d+)=(stand|crouch|air|grounded-start|custom|unknown|excluded)$/i.exec(token);
    if (!match) throw new Error(`Invalid role assignment "${token}". Use 10=crouch or !40.`);
    if (match[2].toLowerCase() === 'excluded') exclusions.push(Number(match[1]));
    else overrides[Number(match[1])] = match[2].toLowerCase();
  }
  return { overrides, exclusions };
}

module.exports = { actionsIn, normalizedBoxes, classification, frameRole, createProposal, parseAssignmentInput };
