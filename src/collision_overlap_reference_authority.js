'use strict';

const { maskSource } = require('./state_transfer_model');
const {
  completeRedirectToken,
  declarationBefore,
  matchingParenthesis,
  redirectedBefore,
  splitThreePartCollisionCall
} = require('./collision_query_reference_authority');

const OWNER_GROUPS = new Set(['clsn1', 'clsn2', 'size', 'dummy']);
const TARGET_GROUPS = new Set(['clsn1', 'clsn2', 'size']);

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function lineAt(text, offset) {
  return text.slice(0, offset).split(/\r?\n/).length - 1;
}

function field(key, start, end, source) {
  return freeze({ key, name: key, start, end, expression: start >= 0 && end >= start ? source.slice(start, end) : '' });
}

function parseCollisionOverlapReferences(text, syntax) {
  const source = String(text || ''), grammar = syntax === 'zss' ? 'zss' : 'cns', masked = maskSource(source, grammar), output = [];
  const pattern = /\bClsnOverlap\b\s*\(/gi;
  let match;
  while ((match = pattern.exec(masked))) {
    if (declarationBefore(masked, match.index)) continue;
    const open = masked.indexOf('(', match.index), close = matchingParenthesis(masked, open);
    if (close < 0) continue;
    const parts = splitThreePartCollisionCall(source, masked, open, close), chunks = parts.chunks;
    const owner = parts.first, target = parts.last;
    const ownerGroup = String(owner?.expression || '').trim().toLowerCase(), targetGroup = String(target?.expression || '').trim().toLowerCase();
    const playerExpression = String(parts.middle?.expression || '');
    const outerRedirect = redirectedBefore(masked, match.index);
    const reason = !parts.valid
      ? `ClsnOverlap requires owner group, one player-ID expression, and target group; found ${chunks.length} comma-separated segment${chunks.length === 1 ? '' : 's'}.`
      : !OWNER_GROUPS.has(ownerGroup)
        ? 'ClsnOverlap owner group must be the literal Clsn1, Clsn2, Size, or Dummy.'
        : !TARGET_GROUPS.has(targetGroup)
            ? 'ClsnOverlap target group must be the literal Clsn1, Clsn2, or Size; Dummy is not valid in this position.'
            : outerRedirect
              ? 'Redirected ClsnOverlap runtime ownership is unresolved.'
              : '';
    output.push(freeze({
      syntax: grammar,
      kind: 'clsnoverlap',
      label: 'ClsnOverlap',
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
      fields: freeze([
        field('owner.group', owner?.start ?? -1, owner?.end ?? -1, source),
        field('player.id', parts.middle?.start ?? -1, parts.middle?.end ?? -1, source),
        field('target.group', target?.start ?? -1, target?.end ?? -1, source)
      ]),
      ownerGroup,
      targetGroup,
      playerExpression,
      playerIdStatic: /^(?:0|[1-9]\d*)$/.test(playerExpression),
      innerRedirect: parts.redirects.length > 0,
      dynamic: true,
      conditional: true,
      effectiveExplanation: 'Returns a runtime boolean over target-dependent effective world collision groups; it does not identify an authored AIR box or predict an overlap.'
    }));
    pattern.lastIndex = close + 1;
  }
  return freeze(output);
}

module.exports = { OWNER_GROUPS, TARGET_GROUPS, completeRedirectToken, parseCollisionOverlapReferences };
