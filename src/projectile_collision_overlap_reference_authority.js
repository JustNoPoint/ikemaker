'use strict';

const { maskSource } = require('./state_transfer_model');
const {
  argumentSpans,
  completeExpressionSegments,
  declarationBefore,
  matchingParenthesis,
  redirectedBefore
} = require('./collision_query_reference_authority');

const TARGET_GROUPS = new Set(['clsn1', 'clsn2', 'size']);

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function lineAt(text, offset) { return text.slice(0, offset).split(/\r?\n/).length - 1; }

function combinedField(key, chunks, source) {
  if (!chunks.length) return freeze({ key, name: key, start: -1, end: -1, expression: '' });
  const start = chunks[0].start, end = chunks.at(-1).end, raw = source.slice(start, end), leading = raw.length - raw.trimStart().length, trailing = raw.length - raw.trimEnd().length;
  return freeze({ key, name: key, start: start + leading, end: end - trailing, expression: raw.trim() });
}

function literalField(key, argument, source) {
  return freeze({ key, name: key, start: argument?.start ?? -1, end: argument?.end ?? -1, expression: argument ? source.slice(argument.start, argument.end) : '' });
}

function expressionSegments(chunks, masked) { return chunks.map(item => masked.slice(item.start, item.end).trim()); }

function parseProjectileCollisionOverlapReferences(text, syntax) {
  const source = String(text || ''), grammar = syntax === 'zss' ? 'zss' : 'cns', masked = maskSource(source, grammar), output = [];
  const pattern = /\bProjClsnOverlap\b\s*\(/gi;
  let match;
  while ((match = pattern.exec(masked))) {
    if (declarationBefore(masked, match.index)) continue;
    const open = masked.indexOf('(', match.index), close = matchingParenthesis(masked, open);
    if (close < 0) continue;
    const chunks = argumentSpans(source, masked, open, close), expressionChunks = chunks.slice(0, -1), target = chunks.at(-1), partitions = [];
    for (let split = 1; split < expressionChunks.length; split += 1) {
      const left = expressionChunks.slice(0, split), right = expressionChunks.slice(split);
      if (completeExpressionSegments(expressionSegments(left, masked)) && completeExpressionSegments(expressionSegments(right, masked))) partitions.push({ left, right });
    }
    const unique = partitions.length === 1 ? partitions[0] : null;
    const projectileField = combinedField('projectile.index', unique?.left || [], source), playerField = combinedField('target.player.id', unique?.right || [], source), targetField = literalField('target.group', target, source);
    const projectileExpression = projectileField.expression, playerExpression = playerField.expression, targetGroup = String(targetField.expression || '').trim().toLowerCase(), outerRedirect = redirectedBefore(masked, match.index);
    const integerLiteral = /^-?(?:0|[1-9]\d*)$/.test(projectileExpression), numericIndex = integerLiteral ? Number(projectileExpression) : null;
    const reason = !unique
      ? partitions.length > 1 ? 'ProjClsnOverlap arguments have more than one valid expression partition.' : `ProjClsnOverlap requires complete projectile-index and target-player expressions followed by a target group; found ${chunks.length} comma-separated segment${chunks.length === 1 ? '' : 's'}.`
      : !TARGET_GROUPS.has(targetGroup)
        ? 'ProjClsnOverlap target group must be the literal Clsn1, Clsn2, or Size; Dummy is not valid.'
        : outerRedirect
          ? 'Redirected ProjClsnOverlap runtime ownership is unresolved.'
          : '';
    output.push(freeze({
      syntax: grammar,
      kind: 'projclsnoverlap',
      label: 'ProjClsnOverlap',
      category: 'collision-inspection',
      callStart: match.index,
      callEnd: close + 1,
      controllerStart: match.index,
      controllerEnd: close + 1,
      controllerLine: lineAt(source, match.index),
      sourceExact: true,
      available: !reason,
      reason,
      redirect: outerRedirect,
      fields: freeze([projectileField, playerField, targetField]),
      projectileExpression,
      playerExpression,
      targetGroup,
      projectileIndexStatic: integerLiteral && numericIndex >= 0,
      projectileIndexNegative: integerLiteral && numericIndex < 0,
      playerIdStatic: /^-?(?:0|[1-9]\d*)$/.test(playerExpression),
      dynamic: true,
      conditional: true,
      effectiveExplanation: 'Returns a runtime boolean for one active directly owned projectile-list entry against a runtime target’s effective world group; it does not identify a projID, AIR Action, collision family/index, authored box, hit eligibility, or predicted overlap.'
    }));
    pattern.lastIndex = close + 1;
  }
  return freeze(output);
}

module.exports = { TARGET_GROUPS, parseProjectileCollisionOverlapReferences };
