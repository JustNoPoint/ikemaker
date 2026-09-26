'use strict';

const { parseZss } = require('./parser');
const { findActions } = require('./air');

const CLSN2_INDEX = /^\s*Clsn2\s*\[\s*(\d+)\s*\]\s*=/i;

const ASSIGNMENT =
  /call\s+[A-Za-z_][A-Za-z0-9_]*SetHitReactionRegion\s*\(\s*(\d+)\s*,\s*([123])\s*\)\s*;/gi;

function selectedClsn2(text, lineNumber) {
  const lines = String(text).split(/\r?\n/);
  const line = lines[lineNumber] || '';
  const match = CLSN2_INDEX.exec(line);
  if (!match) throw new Error('Right-click a Clsn2[index] coordinate line.');
  const action = findActions(lines).find((candidate) =>
    lineNumber > candidate.start && lineNumber < candidate.end);
  if (!action) throw new Error('The selected Clsn2 line is not inside an AIR action.');
  return { action: action.number, index: Number(match[1]) };
}

function markers(stateNumber) {
  return {
    begin: `# IKEMEN ZSS Tools: Hit Reaction Regions State ${stateNumber} BEGIN`,
    end: `# IKEMEN ZSS Tools: Hit Reaction Regions State ${stateNumber} END`
  };
}

function renderBlock(stateNumber, assignments, symbolPrefix) {
  const { begin, end } = markers(stateNumber);
  const labels = { 1: 'Forced High', 2: 'Forced Low', 3: 'Default reaction' };
  const lines = [
    begin,
    `# Character-specific defender Clsn2 reactions for State ${stateNumber}.`,
    `ignoreHitPause if stateNo = ${stateNumber}`,
    `\t\t&& map(${symbolPrefix}hit_reaction_region_owner_state) != stateNo {`,
    `\tcall ${symbolPrefix}ClearHitReactionRegions();`
  ];
  for (const [index, region] of [...assignments.entries()].sort((a, b) => a[0] - b[0])) {
    lines.push(
      `\tcall ${symbolPrefix}SetHitReactionRegion(${index}, ${region}); # Clsn2[${index}]: ${labels[region]}`
    );
  }
  lines.push('}', end);
  return lines;
}

function updateStateRegionAssignments(text, stateNumber, clsn2Index, region, symbolPrefix = 'IkZss_') {
  if (!Number.isInteger(stateNumber) || stateNumber < 0) throw new Error('State number must be non-negative.');
  if (!Number.isInteger(clsn2Index) || clsn2Index < 0 || clsn2Index > 7) {
    throw new Error('Move-local reaction regions currently support Clsn2 indices 0 through 7.');
  }
  if (region !== null && ![1, 2, 3].includes(region)) throw new Error('Unknown reaction-region value.');

  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const trailingEol = /\r?\n$/.test(text);
  const lines = text.split(/\r?\n/);
  if (trailingEol) lines.pop();
  const { begin, end } = markers(stateNumber);
  const beginLine = lines.findIndex((line) => line.trim() === begin);
  const endLine = lines.findIndex((line, index) => index > beginLine && line.trim() === end);
  if ((beginLine >= 0) !== (endLine >= 0)) throw new Error(`State ${stateNumber}'s managed region block is incomplete.`);

  const assignments = new Map();
  if (beginLine >= 0) {
    const block = lines.slice(beginLine, endLine + 1).join('\n');
    ASSIGNMENT.lastIndex = 0;
    let match;
    while ((match = ASSIGNMENT.exec(block)) !== null) {
      assignments.set(Number(match[1]), Number(match[2]));
    }
  }
  if (region === null) assignments.delete(clsn2Index);
  else assignments.set(clsn2Index, region);

  if (beginLine >= 0) {
    lines.splice(beginLine, endLine - beginLine + 1,
      ...(assignments.size ? renderBlock(stateNumber, assignments, symbolPrefix) : []));
  } else {
    if (!assignments.size) return { text, assignments };
    let state = parseZss(lines.join('\n')).find((symbol) =>
      symbol.type === 'state' && Number(symbol.id) === -4);
    if (!state) {
      let insertAt = 0;
      while (insertAt < lines.length &&
          (lines[insertAt].trim() === '' || lines[insertAt].trim().startsWith('#'))) {
        insertAt += 1;
      }
      lines.splice(insertAt, 0, '[StateDef -4]', '');
      state = parseZss(lines.join('\n')).find((symbol) =>
        symbol.type === 'state' && Number(symbol.id) === -4);
    }
    if (!state) throw new Error('StateDef -4 could not be created in normals_extras.zss.');
    let headerEnd = state.startLine;
    while (headerEnd <= state.endLine && !lines[headerEnd].includes(']')) headerEnd += 1;
    if (headerEnd > state.endLine) throw new Error('StateDef -4 has an incomplete header.');
    lines.splice(headerEnd + 1, 0, '', ...renderBlock(stateNumber, assignments, symbolPrefix), '');
  }

  const updatedText = lines.join(eol) + (trailingEol ? eol : '');
  const updatedLines = updatedText.split(/\r?\n/);
  return {
    text: updatedText,
    assignments,
    blockLine: Math.max(0, updatedLines.findIndex((line) => line.trim() === begin))
  };
}

module.exports = { selectedClsn2, updateStateRegionAssignments };
