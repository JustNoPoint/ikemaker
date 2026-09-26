'use strict';

const ACTION = /^\s*\[\s*Begin\s+Action\s+(-?\d+)\s*\]/i;
const FRAME = /^\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+/;
const CLSN2_HEADER = /^\s*Clsn2(Default)?\s*:\s*(\d+)/i;
const CLSN2_BOX = /^\s*Clsn2\s*\[\s*\d+\s*\]\s*=\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i;
const CLSN1_HEADER = /^\s*Clsn1(Default)?\s*:\s*(\d+)/i;
const CLSN1_BOX = /^\s*Clsn1\s*\[\s*\d+\s*\]\s*=\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i;
const GUARD_AIR_BEGIN = '; IKEMEN ZSS Tools: Guard Proximity BEGIN';
const GUARD_AIR_END = '; IKEMEN ZSS Tools: Guard Proximity END';

function parseNumberSet(input) {
  const text = String(input || '').trim();
  if (!text || /^all$/i.test(text)) return () => true;
  const include = [];
  const exclude = [];
  for (const rawToken of text.split(/[\s,]+/).filter(Boolean)) {
    const isExclude = rawToken.startsWith('!');
    const token = isExclude ? rawToken.slice(1) : rawToken;
    const match = /^(-?\d+)(?:-(-?\d+))?$/.exec(token);
    if (!match) throw new Error(`Invalid range token: ${rawToken}`);
    let start = Number(match[1]);
    let end = match[2] === undefined ? start : Number(match[2]);
    if (start > end) [start, end] = [end, start];
    (isExclude ? exclude : include).push([start, end]);
  }
  const inRanges = (value, ranges) => ranges.some(([start, end]) => value >= start && value <= end);
  return (value) => (include.length === 0 || inRanges(value, include)) && !inRanges(value, exclude);
}

function parseBoxes(input, normalize = true) {
  const text = String(input || '').trim();
  if (!text) return [];
  return text.split(/\s*;\s*/).filter(Boolean).map((entry, index) => {
    const values = entry.split(/\s*,\s*/).map(Number);
    if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
      throw new Error(`Box ${index + 1} must contain four numeric coordinates.`);
    }
    let [x1, y1, x2, y2] = values;
    if (normalize) {
      if (x1 > x2) [x1, x2] = [x2, x1];
      if (y1 > y2) [y1, y2] = [y2, y1];
    }
    return [x1, y1, x2, y2];
  });
}

function parseSelectedClsn2(input, normalize = false) {
  const text = String(input || '').trim();
  if (!text) throw new Error('Select a Clsn2 block before running this command.');

  let declaredCount;
  const boxes = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';')) continue;

    const header = CLSN2_HEADER.exec(line);
    if (header) {
      if (declaredCount !== undefined) {
        throw new Error('Select exactly one Clsn2 or Clsn2Default block.');
      }
      declaredCount = Number(header[2]);
      continue;
    }

    const box = CLSN2_BOX.exec(line);
    if (!box) throw new Error(`The selection contains non-Clsn2 data: ${line}`);
    let values = box.slice(1, 5).map(Number);
    if (normalize) {
      let [x1, y1, x2, y2] = values;
      if (x1 > x2) [x1, x2] = [x2, x1];
      if (y1 > y2) [y1, y2] = [y2, y1];
      values = [x1, y1, x2, y2];
    }
    boxes.push(values);
  }

  if (!boxes.length) throw new Error('The selection does not contain any Clsn2[index] rectangles.');
  if (declaredCount !== undefined && declaredCount !== boxes.length) {
    throw new Error(`Clsn2 declares ${declaredCount} box(es), but the selection contains ${boxes.length}.`);
  }
  return boxes;
}

function findActions(lines) {
  const actions = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = ACTION.exec(lines[i]);
    if (match) {
      const heading = [];
      for (let cursor = i - 1; cursor >= 0; cursor -= 1) {
        const comment = /^\s*;\s?(.*)$/.exec(lines[cursor]);
        if (!comment) break;
        heading.unshift(comment[1]);
      }
      actions.push({
        number: Number(match[1]),
        start: i,
        end: lines.length,
        heading: heading.join(' ').trim()
      });
    }
  }
  for (let i = 0; i < actions.length - 1; i += 1) actions[i].end = actions[i + 1].start;
  return actions;
}

function clsnBlocks(lines, start, end) {
  const blocks = [];
  for (let i = start; i < end; i += 1) {
    const header = CLSN2_HEADER.exec(lines[i]);
    if (!header) continue;
    const count = Number(header[2]);
    let blockEnd = i + 1;
    const boxes = [];
    while (blockEnd < end && boxes.length < count) {
      const box = CLSN2_BOX.exec(lines[blockEnd]);
      if (!box) break;
      boxes.push(box.slice(1, 5).map(Number));
      blockEnd += 1;
    }
    blocks.push({ start: i, end: blockEnd, isDefault: Boolean(header[1]), boxes });
    i = blockEnd - 1;
  }
  return blocks;
}

function formatBlock(boxes, isDefault, indent = '') {
  const lines = [`${indent}Clsn2${isDefault ? 'Default' : ''}: ${boxes.length}`];
  boxes.forEach((box, index) => lines.push(`${indent}  Clsn2[${index}] = ${box.join(', ')}`));
  return lines;
}

function applyEdits(lines, edits) {
  const sorted = edits.slice().sort((a, b) => b.start - a.start || b.end - a.end);
  for (const edit of sorted) lines.splice(edit.start, edit.end - edit.start, ...edit.lines);
}

function batchApplyClsn2(text, options) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const trailingEol = /\r?\n$/.test(text);
  const lines = text.split(/\r?\n/);
  if (trailingEol) lines.pop();
  const actionMatch = parseNumberSet(options.actions);
  const headingFilter = String(options.headingFilter || '').trim().toLowerCase();
  const elementMatch = parseNumberSet(options.elements || 'all');
  const boxes = options.boxes || [];
  const actions = findActions(lines);
  const edits = [];
  const changedActions = [];
  let changedElements = 0;

  for (const action of actions) {
    if (!actionMatch(action.number)) continue;
    if (headingFilter && !action.heading.toLowerCase().includes(headingFilter)) continue;
    const blocks = clsnBlocks(lines, action.start + 1, action.end);
    const frames = [];
    for (let line = action.start + 1; line < action.end; line += 1) {
      if (FRAME.test(lines[line])) frames.push(line);
    }
    let actionChanged = false;

    if (options.mode === 'default') {
      blocks.forEach((block) => edits.push({ start: block.start, end: block.end, lines: [] }));
      edits.push({ start: action.start + 1, end: action.start + 1, lines: formatBlock(boxes, true) });
      changedElements += frames.length;
      actionChanged = true;
    } else if (options.mode === 'clearAll') {
      blocks.forEach((block) => edits.push({ start: block.start, end: block.end, lines: [] }));
      changedElements += frames.length;
      actionChanged = blocks.length > 0;
    } else {
      frames.forEach((frameLine, frameIndex) => {
        const element = frameIndex + 1;
        if (!elementMatch(element)) return;
        const existing = blocks.find((block) => !block.isDefault && block.end === frameLine);
        let elementChanged = false;
        if (options.mode === 'clear') {
          if (existing) {
            edits.push({ start: existing.start, end: existing.end, lines: [] });
            actionChanged = true;
            elementChanged = true;
          }
        } else {
          const nextBoxes = options.mode === 'append' && existing
            ? existing.boxes.concat(boxes)
            : boxes;
          const indent = /^\s*/.exec(lines[frameLine])[0];
          edits.push({
            start: existing ? existing.start : frameLine,
            end: existing ? existing.end : frameLine,
            lines: formatBlock(nextBoxes, false, indent)
          });
          actionChanged = true;
          elementChanged = true;
        }
        if (elementChanged) changedElements += 1;
      });
    }
    if (actionChanged) changedActions.push(action.number);
  }

  applyEdits(lines, edits);
  return {
    text: lines.join(eol) + (trailingEol ? eol : ''),
    changedActions,
    changedElements,
    availableActions: actions.map((action) => action.number)
  };
}

function firstEffectiveClsn1(lines, action) {
  let defaultBoxes = [];
  let pendingBoxes = null;
  let element = 0;

  for (let line = action.start + 1; line < action.end; line += 1) {
    const header = CLSN1_HEADER.exec(lines[line]);
    if (header) {
      const count = Number(header[2]);
      const boxes = [];
      let cursor = line + 1;
      while (cursor < action.end && boxes.length < count) {
        const box = CLSN1_BOX.exec(lines[cursor]);
        if (!box) break;
        boxes.push(box.slice(1, 5).map(Number));
        cursor += 1;
      }
      if (boxes.length !== count) {
        throw new Error(`Action ${action.number} has an incomplete Clsn1 block near line ${line + 1}.`);
      }
      if (header[1]) defaultBoxes = boxes;
      else pendingBoxes = boxes;
      line = cursor - 1;
      continue;
    }

    if (!FRAME.test(lines[line])) continue;
    element += 1;
    const boxes = pendingBoxes === null ? defaultBoxes : pendingBoxes;
    pendingBoxes = null;
    if (boxes.length) return { element, boxes, frame: lines[line].trim() };
  }
  return null;
}

function oneTickFrame(frame) {
  const parts = String(frame).split(',');
  if (parts.length < 5) throw new Error('The source AIR frame could not be parsed.');
  parts[4] = ' 1';
  return parts.join(',').trim();
}

function replaceManagedBlock(text, beginMarker, endMarker, block) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const start = text.indexOf(beginMarker);
  const end = start >= 0 ? text.indexOf(endMarker, start) : -1;
  if ((start >= 0) !== (end >= 0)) throw new Error(`Incomplete generated block: ${beginMarker}`);
  if (start >= 0) {
    const after = end + endMarker.length;
    return text.slice(0, start) + block + text.slice(after);
  }
  if (!text) return block + eol;
  const separator = text && !text.endsWith(eol) ? eol + eol : eol;
  return text + separator + block + eol;
}

function generateGuardProximity(text, sourceActionNumber, targetActionNumber) {
  const source = Number(sourceActionNumber);
  const target = targetActionNumber === undefined ? 900000 + source : Number(targetActionNumber);
  if (!Number.isInteger(source) || source < 0) throw new Error('Source action must be a non-negative integer.');
  if (!Number.isInteger(target) || target < 0) throw new Error('Target action must be a non-negative integer.');
  if (source === target) throw new Error('Source and generated action numbers must differ.');

  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const actions = findActions(lines);
  const sourceAction = actions.find((action) => action.number === source);
  if (!sourceAction) throw new Error(`Action ${source} was not found.`);
  const collision = firstEffectiveClsn1(lines, sourceAction);
  if (!collision) throw new Error(`Action ${source} has no effective Clsn1 boxes.`);

  const existingTarget = actions.find((action) => action.number === target);
  const beginMarker = `${GUARD_AIR_BEGIN} ${target}`;
  const endMarker = `${GUARD_AIR_END} ${target}`;
  if (existingTarget && !text.includes(beginMarker)) {
    throw new Error(`Action ${target} already exists and is not managed by IKEMEN ZSS Tools.`);
  }

  const block = [
    beginMarker,
    `; Generated from Action ${source}, element ${collision.element}. Do not edit manually.`,
    `[Begin Action ${target}]`,
    `Clsn1: ${collision.boxes.length}`,
    ...collision.boxes.map((box, index) => `Clsn1[${index}] = ${box.join(', ')}`),
    oneTickFrame(collision.frame),
    endMarker
  ].join(eol);

  return {
    text: replaceManagedBlock(text, beginMarker, endMarker, block),
    sourceAction: source,
    targetAction: target,
    firstActiveElement: collision.element,
    boxes: collision.boxes
  };
}

function renderGuardHelperZss(sourceAction, targetAction, activeElementConst, symbolPrefix = 'IkZss_') {
  const source = Number(sourceAction);
  const target = Number(targetAction);
  const constName = String(activeElementConst || '').trim();
  if (!constName) throw new Error('Enter the custom constant for the first active element.');
  const functionName = `${symbolPrefix}GuardProximity_${source}`;
  const moveBegin = `# IKEMEN ZSS Tools: Guard Proximity Move BEGIN ${source}`;
  const moveEnd = `# IKEMEN ZSS Tools: Guard Proximity Move END ${source}`;
  const coreBegin = '# IKEMEN ZSS Tools: Guard Proximity Core BEGIN';
  const coreEnd = '# IKEMEN ZSS Tools: Guard Proximity Core END';
  const moveBlock = [
    moveBegin,
    `# Generated for source Action ${source}; proxy Action ${target}.`,
    `[Function ${functionName}()]`,
    `if animElemNo(0) = const(${constName}) - 1`,
    `\t\t&& animElemTime(0) = animElemVar(Time) - const(Default.Normal.GuardProximity.LeadTicks) {`,
    '\thelper{',
    `\t\tname: "Guard Proximity ${source}";`,
    `\t\tid: ${target};`,
    '\t\tstateno: 909000;',
    `\t\tanim: ${target};`,
    '\t\tpostype: P1;',
    '\t\tpos: 0, 0;',
    '\t\tfacing: 1;',
    '\t\townpal: 1;',
    '\t\tclsnproxy: 1;',
    '\t}',
    '}',
    moveEnd
  ].join('\n');
  const coreBlock = [
    coreBegin,
    '# Shared one-tick invisible collision proxy used by generated move functions.',
    '[StateDef 909000;',
    '\ttype: S;',
    '\tmovetype: I;',
    '\tphysics: N;',
    '\tctrl: 0;]',
    'assertSpecial{flag: invisible; flag2: noShadow; flag3: noAutoTurn}',
    'bindToParent{time: 1; pos: 0, 0}',
    'screenBound{value: 0; moveCamera: 0, 0}',
    'if animTime = 0 {',
    '\tdestroySelf{}',
    '}',
    coreEnd
  ].join('\n');
  return { functionName, moveBegin, moveEnd, moveBlock, coreBegin, coreEnd, coreBlock };
}

function updateGuardHelperZss(text, sourceAction, targetAction, activeElementConst, symbolPrefix = 'IkZss_') {
  const rendered = renderGuardHelperZss(sourceAction, targetAction, activeElementConst, symbolPrefix);
  let next = replaceManagedBlock(text, rendered.coreBegin, rendered.coreEnd, rendered.coreBlock);
  next = replaceManagedBlock(next, rendered.moveBegin, rendered.moveEnd, rendered.moveBlock);
  return { text: next, functionName: rendered.functionName, call: `call ${rendered.functionName}();` };
}

module.exports = {
  parseNumberSet,
  parseBoxes,
  parseSelectedClsn2,
  findActions,
  batchApplyClsn2,
  firstEffectiveClsn1,
  generateGuardProximity,
  renderGuardHelperZss,
  updateGuardHelperZss
};
