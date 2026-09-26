'use strict';

const path = require('path');

const FEATURE_BLOCKS = new Map([
  ['overrideclsn', ['OverrideClsn', 'geometry']],
  ['transformclsn', ['TransformClsn', 'geometry']],
  ['playerpush', ['PlayerPush', 'rule']],
  ['width', ['Width', 'geometry']],
  ['height', ['Height', 'geometry']],
  ['depth', ['Depth', 'geometry']],
  ['hitdef', ['HitDef', 'contact']],
  ['helper', ['Helper', 'ownership']],
  ['projectile', ['Projectile', 'projectile']],
  ['assertspecial', ['AssertSpecial', 'rule']]
]);

function withoutComment(line) {
  const hash = line.indexOf('#');
  return (hash >= 0 ? line.slice(0, hash) : line).trim();
}

function uniqueNumbers(text, pattern) {
  const values = new Set();
  let match;
  while ((match = pattern.exec(text))) values.add(Number(match[1]));
  return [...values].filter(Number.isFinite).sort((a, b) => a - b);
}

function readBraceBlock(lines, startLine, openColumn) {
  let depth = 0;
  let seen = false;
  for (let line = startLine; line < lines.length; line += 1) {
    const text = withoutComment(lines[line]);
    const begin = line === startLine ? openColumn : 0;
    for (let column = begin; column < text.length; column += 1) {
      if (text[column] === '{') { depth += 1; seen = true; }
      else if (text[column] === '}') depth -= 1;
      if (seen && depth === 0) return line;
    }
  }
  return startLine;
}

function declarationRanges(lines) {
  const ranges = [];
  for (let line = 0; line < lines.length; line += 1) {
    const match = /^\s*\[\s*(StateDef|Function)\b\s*([^;\]\s(]*)/i.exec(withoutComment(lines[line]));
    if (!match) continue;
    ranges.push({
      kind: match[1].toLowerCase() === 'statedef' ? 'state' : 'function',
      id: match[2] || '', startLine: line, endLine: lines.length - 1
    });
  }
  for (let index = 0; index < ranges.length - 1; index += 1) ranges[index].endLine = ranges[index + 1].startLine - 1;
  return ranges;
}

function containingRange(ranges, line) {
  return ranges.find((range) => line >= range.startLine && line <= range.endLine) || { kind: 'file', id: '', startLine: 0, endLine: line };
}

function field(body, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`\\b${escaped}\\s*:\\s*([^;\\n}]+)`, 'i').exec(body);
  return match ? match[1].trim() : null;
}

function flags(body) {
  const values = [];
  const pattern = /\bflag\d*\s*:\s*([^;\n}]+)/gi;
  let match;
  while ((match = pattern.exec(body))) values.push(match[1].trim());
  return values;
}

function featureDetails(controller, body) {
  const lower = controller.toLowerCase(), details = [];
  if (lower === 'overrideclsn') {
    for (const name of ['group', 'index', 'rect']) { const value = field(body, name); if (value !== null) details.push(`${name}: ${value}`); }
  } else if (lower === 'transformclsn') {
    for (const name of ['scale', 'angle']) { const value = field(body, name); if (value !== null) details.push(`${name}: ${value}`); }
  } else if (lower === 'playerpush') {
    for (const name of ['value', 'priority', 'affectteam']) { const value = field(body, name); if (value !== null) details.push(`${name}: ${value}`); }
  } else if (['width', 'height', 'depth'].includes(lower)) {
    for (const name of ['edge', 'player', 'value']) { const value = field(body, name); if (value !== null) details.push(`${name}: ${value}`); }
  } else if (lower === 'hitdef') {
    for (const name of ['p2clsncheck', 'p2clsnrequire', 'guard.dist', 'attack.depth']) { const value = field(body, name); if (value !== null) details.push(`${name}: ${value}`); }
    if (!details.length) details.push('collision rule: no p2clsn override authored');
  } else if (lower === 'helper') {
    for (const name of ['clsnproxy', 'ownclsnscale']) { const value = field(body, name); if (value !== null) details.push(`${name}: ${value}`); }
  } else if (lower === 'projectile') {
    for (const name of ['projclsnscale', 'projclsnangle']) { const value = field(body, name); if (value !== null) details.push(`${name}: ${value}`); }
  } else if (lower === 'assertspecial') {
    const relevant = flags(body).filter((value) => /^(sizepushonly|projtypecollision)$/i.test(value));
    relevant.forEach((value) => details.push(`flag: ${value}`));
  }
  return details;
}

function relevantFeature(controller, details) {
  const lower = controller.toLowerCase();
  if (lower === 'hitdef') return true;
  if (lower === 'helper') return details.some((item) => /^(clsnproxy|ownclsnscale)/i.test(item));
  if (lower === 'projectile') return details.some((item) => /^projclsn/i.test(item));
  if (lower === 'assertspecial') return details.length > 0;
  return true;
}

function scopeFor(lines, blockStart, blockEnd, declaration) {
  let depth = 0;
  const afterDepth = new Map();
  for (let line = declaration.startLine; line < blockStart; line += 1) {
    const clean = withoutComment(lines[line]);
    depth += (clean.match(/{/g) || []).length - (clean.match(/}/g) || []).length;
    afterDepth.set(line, depth);
  }
  const targetDepth = depth;
  let contextStart = Math.max(declaration.startLine, blockStart - 40);
  for (let line = blockStart - 1; line >= contextStart; line -= 1) {
    const lineDepth = afterDepth.get(line) || 0, clean = withoutComment(lines[line]);
    if (targetDepth === 0 && lineDepth === 0 && clean.includes('}')) { contextStart = line + 1; break; }
    if (lineDepth < targetDepth) { contextStart = line + 1; break; }
  }
  const context = lines.slice(contextStart, blockEnd + 1).map(withoutComment).join('\n');
  const conditionActions = uniqueNumbers(context, /\banim\s*=\s*(-?\d+)\b/gi);
  let declarationEnd = declaration.startLine;
  while (declarationEnd < Math.min(lines.length - 1, declaration.startLine + 32) && !lines[declarationEnd].includes(']')) declarationEnd += 1;
  const declarationText = lines.slice(declaration.startLine, declarationEnd + 1).map(withoutComment).join('\n');
  const headerActions = declaration.kind === 'state' ? uniqueNumbers(declarationText, /\banim\s*:\s*(-?\d+)\b/gi) : [];
  const actions = [...new Set([...conditionActions, ...headerActions])].sort((a, b) => a - b);
  const elements = uniqueNumbers(context, /\banimElemNo\s*\(\s*0\s*\)\s*=\s*(\d+)\b/gi);
  if (actions.length === 1) return { actions, elements, confidence: elements.length <= 1 ? 'explicit' : 'ambiguous', reason: conditionActions.length ? 'explicit anim condition' : 'StateDef anim assignment' };
  if (actions.length > 1) return { actions, elements, confidence: 'ambiguous', reason: 'multiple nearby anim conditions' };
  const state = declaration.kind === 'state' && /^-?\d+$/.test(declaration.id) ? Number(declaration.id) : null;
  if (state !== null && state >= 0) return { actions: [state], elements: [], confidence: 'inferred', reason: `StateDef ${state} convention` };
  return { actions: [], elements: [], confidence: 'shared', reason: declaration.kind === 'function' ? 'shared function; caller decides scope' : 'shared/global state; triggers decide scope' };
}

function inspectZssText(text, filename = '') {
  const lines = String(text || '').split(/\r?\n/), ranges = declarationRanges(lines), findings = [];
  for (let line = 0; line < lines.length; line += 1) {
    const clean = withoutComment(lines[line]);
    const match = /\b(OverrideClsn|TransformClsn|PlayerPush|Width|Height|Depth|HitDef|Helper|Projectile|AssertSpecial)\s*\{/i.exec(clean);
    if (!match) continue;
    const controller = match[1], endLine = readBraceBlock(lines, line, clean.indexOf('{'));
    const body = lines.slice(line, endLine + 1).map(withoutComment).join('\n'), details = featureDetails(controller, body);
    if (!relevantFeature(controller, details)) { line = endLine; continue; }
    const declaration = containingRange(ranges, line), scope = scopeFor(lines, line, endLine, declaration), catalog = FEATURE_BLOCKS.get(controller.toLowerCase());
    findings.push({
      controller: catalog[0], category: catalog[1], details,
      filename: path.resolve(filename || '.'), displayFile: path.basename(filename || 'source'), line: line + 1,
      declaration: declaration.kind === 'state' ? `StateDef ${declaration.id}` : declaration.kind === 'function' ? `Function ${declaration.id}` : 'File scope',
      declarationKind: declaration.kind, declarationId: declaration.id, ...scope
    });
    line = endLine;
  }
  return findings;
}

function inspectSources(sources) {
  const records = (sources || []).map((source) => {
    const lines = String(source.text || '').split(/\r?\n/);
    return { ...source, filename: path.resolve(source.filename), lines, ranges: declarationRanges(lines) };
  });
  const base = records.flatMap((source) => inspectZssText(source.text, source.filename));
  const functions = new Map();
  for (const record of records) {
    for (const range of record.ranges.filter((item) => item.kind === 'function')) {
      const calls = [];
      for (let line = range.startLine; line <= range.endLine; line += 1) {
        const pattern = /\bcall\s+([A-Za-z_][A-Za-z0-9_.]*)\s*\(/gi;
        let match;
        while ((match = pattern.exec(withoutComment(record.lines[line])))) calls.push({ name: match[1], line });
      }
      functions.set(range.id.toLowerCase(), { record, range, calls });
    }
  }
  const derived = [], derivedKeys = new Set();
  for (const record of records) {
    for (const state of record.ranges.filter((item) => item.kind === 'state')) {
      for (let line = state.startLine; line <= state.endLine; line += 1) {
        const pattern = /\bcall\s+([A-Za-z_][A-Za-z0-9_.]*)\s*\(/gi;
        let match;
        while ((match = pattern.exec(withoutComment(record.lines[line])))) {
          const rootScope = scopeFor(record.lines, line, line, state);
          const visit = (name, chain, seen, ambiguous = false) => {
            const key = name.toLowerCase(), target = functions.get(key);
            if (!target || seen.has(key)) return;
            const nextSeen = new Set(seen); nextSeen.add(key);
            const nextChain = [...chain, target.range.id];
            for (const finding of base.filter((item) => item.declarationKind === 'function' && item.declarationId.toLowerCase() === key)) {
              const identity = [finding.filename, finding.line, record.filename, line, rootScope.actions.join(','), rootScope.elements.join(',')].join(':');
              if (derivedKeys.has(identity)) continue;
              derivedKeys.add(identity);
              derived.push({
                ...finding, actions: rootScope.actions, elements: finding.elements.length ? finding.elements : rootScope.elements,
                confidence: ambiguous ? 'ambiguous' : rootScope.confidence, reason: rootScope.reason + ' via ' + nextChain.join(' → ') + (ambiguous ? ' (shared function has multiple call paths)' : ''),
                invocation: { filename: record.filename, displayFile: path.basename(record.filename), line: line + 1, declaration: 'StateDef ' + state.id, chain: nextChain }
              });
            }
            for (const call of target.calls) visit(call.name, nextChain, nextSeen, ambiguous || target.calls.length > 1);
          };
          visit(match[1], [], new Set());
        }
      }
    }
  }
  return [...base, ...derived];
}

function findingsForFrame(findings, action, element, includeShared = true) {
  return (findings || []).filter((finding) => {
    if (!finding.actions.length) return includeShared;
    if (!finding.actions.includes(Number(action))) return false;
    return !finding.elements.length || finding.elements.includes(Number(element));
  });
}

module.exports = { inspectZssText, inspectSources, findingsForFrame, featureDetails };
