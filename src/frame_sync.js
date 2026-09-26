'use strict';

const path = require('path');
const { parseZss } = require('./parser');
const { findActions, firstEffectiveClsn1 } = require('./air');

const FRAME_DECLARATION =
  /^\s*([A-Za-z_][A-Za-z0-9_.]*\.(firstActiveElement|idleElement))\s*=\s*(-?\d+)\b/i;
const FRAME = /^\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+/;
const CLSN1_HEADER = /^\s*Clsn1(Default)?\s*:\s*(\d+)/i;
const CLSN1_BOX = /^\s*Clsn1\s*\[\s*\d+\s*\]\s*=/i;
const CONST_REFERENCE = /\bconst\s*\(\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\)/gi;
const FUNCTION_CALL = /\bcall\s+([A-Za-z_][A-Za-z0-9_.]*)\s*\(/gi;

function references(pattern, text) {
  const found = new Set();
  pattern.lastIndex = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) found.add(match[1]);
  return found;
}

function sourceNodes(files) {
  const functions = new Map();
  const states = [];

  for (const file of files.filter((entry) => /\.zss$/i.test(entry.path))) {
    const lines = file.text.split(/\r?\n/);
    for (const symbol of parseZss(file.text)) {
      const body = lines.slice(symbol.startLine, symbol.endLine + 1).join('\n');
      const node = {
        type: symbol.type,
        name: symbol.id,
        constants: references(CONST_REFERENCE, body),
        calls: references(FUNCTION_CALL, body)
      };
      if (symbol.type === 'function') {
        if (!functions.has(symbol.id)) functions.set(symbol.id, []);
        functions.get(symbol.id).push(node);
      } else if (/^-?\d+$/.test(symbol.id)) {
        states.push({ ...node, number: Number(symbol.id) });
      }
    }
  }
  return { functions, states };
}

function nodeUsesConstant(node, constantName, functions, visited = new Set()) {
  if (node.constants.has(constantName)) return true;
  for (const call of node.calls) {
    if (visited.has(call)) continue;
    const nextVisited = new Set(visited);
    nextVisited.add(call);
    for (const candidate of functions.get(call) || []) {
      if (nodeUsesConstant(candidate, constantName, functions, nextVisited)) return true;
    }
  }
  return false;
}

function constantDeclarations(files) {
  const declarations = [];
  for (const file of files.filter((entry) => /\.(?:cns|zss)$/i.test(entry.path))) {
    const lines = file.text.split(/\r?\n/);
    lines.forEach((lineText, line) => {
      const match = FRAME_DECLARATION.exec(lineText);
      if (!match) return;
      declarations.push({
        file,
        line,
        start: lineText.indexOf(match[1]),
        length: match[1].length,
        name: match[1],
        kind: match[2].toLowerCase(),
        value: Number(match[3])
      });
    });
  }
  return declarations;
}

function airActions(files) {
  return files.filter((entry) => /\.air$/i.test(entry.path)).map((file) => {
    const lines = file.text.split(/\r?\n/);
    return { file, lines, actions: findActions(lines) };
  });
}

function nearestAir(declaration, actionNumber, airFiles) {
  const sameDirectory = airFiles.filter((entry) =>
    path.dirname(entry.file.path).toLowerCase() ===
      path.dirname(declaration.file.path).toLowerCase() &&
    entry.actions.some((action) => action.number === actionNumber)
  );
  if (sameDirectory.length === 1) return sameDirectory[0];

  const candidates = airFiles.filter((entry) =>
    entry.actions.some((action) => action.number === actionNumber)
  );
  return candidates.length === 1 ? candidates[0] : null;
}

function lastEffectiveClsn1Element(lines, action) {
  let defaultCount = 0;
  let pendingCount = null;
  let element = 0;
  let lastActive = 0;

  for (let line = action.start + 1; line < action.end; line += 1) {
    const header = CLSN1_HEADER.exec(lines[line]);
    if (header) {
      const count = Number(header[2]);
      let cursor = line + 1;
      let boxes = 0;
      while (cursor < action.end && boxes < count && CLSN1_BOX.test(lines[cursor])) {
        boxes += 1;
        cursor += 1;
      }
      if (boxes !== count) {
        throw new Error(`Action ${action.number} has an incomplete Clsn1 block near line ${line + 1}.`);
      }
      if (header[1]) defaultCount = count;
      else pendingCount = count;
      line = cursor - 1;
      continue;
    }

    if (!FRAME.test(lines[line])) continue;
    element += 1;
    const count = pendingCount === null ? defaultCount : pendingCount;
    pendingCount = null;
    if (count > 0) lastActive = element;
  }
  return lastActive || null;
}

function auditFirstActiveElements(files) {
  const { functions, states } = sourceNodes(files);
  const airs = airActions(files);
  const issues = [];

  for (const declaration of constantDeclarations(files)) {
    const actionNumbers = [...new Set(
      states
        .filter((state) => state.number >= 0 &&
          nodeUsesConstant(state, declaration.name, functions))
        .map((state) => state.number)
    )];
    if (actionNumbers.length !== 1) continue;

    const actionNumber = actionNumbers[0];
    const air = nearestAir(declaration, actionNumber, airs);
    if (!air) continue;
    // IKEMEN keeps the first duplicate action key, so mirror that behavior.
    const action = air.actions.find((candidate) => candidate.number === actionNumber);
    if (!action) continue;

    let expected;
    try {
      if (declaration.kind === 'firstactiveelement') {
        expected = firstEffectiveClsn1(air.lines, action)?.element;
      } else {
        const lastActive = lastEffectiveClsn1Element(air.lines, action);
        expected = lastActive === null ? null : lastActive + 1;
      }
    } catch {
      continue;
    }
    if (expected === null || expected === undefined || expected === declaration.value) continue;

    const isFirstActive = declaration.kind === 'firstactiveelement';
    const code = isFirstActive
      ? 'first-active-element-mismatch'
      : 'idle-element-mismatch';
    const detail = isFirstActive
      ? `first effective Clsn1 is animation element ${expected}`
      : `final effective Clsn1 is animation element ${expected - 1}, so recovery begins at element ${expected}`;

    issues.push({
      filePath: declaration.file.path,
      line: declaration.line,
      start: Math.max(0, declaration.start),
      length: declaration.length,
      constant: declaration.name,
      action: actionNumber,
      actual: declaration.value,
      expected,
      airPath: air.file.path,
      code,
      message: `${declaration.name} is ${declaration.value}, but Action ${actionNumber}'s ${detail}.`
    });
  }
  return issues;
}

module.exports = { auditFirstActiveElements };
