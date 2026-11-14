'use strict';

const { maskSource } = require('./state_transfer_model');

// An existing DEF-assigned .txt is compiled as CNS. Refuse obvious ZSS content
// without mistaking CNS comments or quoted examples for live code.
function malformedAssignedCnsText(text) {
  const source = String(text || '');
  const liveCns = maskSource(source, 'cns');
  const unquotedZss = maskSource(source, 'zss');
  return /\b[A-Za-z_]\w*\s*\{/.test(liveCns)
    || /^\s*\[\s*StateDef\s+[+-]?\d+\s*;/im.test(unquotedZss);
}

module.exports = { malformedAssignedCnsText };
