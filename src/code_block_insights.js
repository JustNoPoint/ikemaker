'use strict';

const { analyzeZss } = require('./analyzer');
const { flatten } = require('./code_structure_model');

function normalizeFinding(finding) {
  return {
    line: finding.line,
    severity: finding.severity || 'information',
    code: finding.code || 'review',
    message: finding.message,
    help: finding.help || ''
  };
}

function literalReachability(node, lines, language) {
  const source = lines.slice(node.startLine, node.endLine + 1).join('\n');
  const findings = [];
  if (language === 'zss' && node.kind === 'condition') {
    const signature = String(node.signature || '').replace(/^\s*(?:ignoreHitPause\s+)?(?:persistent\([^)]*\)\s+)?(?:else\s+)?if\s+/i, '').replace(/\s*\{\s*$/, '').trim();
    if (/^(?:0|false)$/i.test(signature)) findings.push({
      line: node.startLine,
      severity: 'warning',
      code: 'literal-false-condition',
      message: 'This branch has a literal false condition, so its body cannot run as written.',
      help: 'Replace the literal only if this is not an intentional disabled block.'
    });
  }
  if (language === 'cns') {
    const disabled = /^\s*triggerall\s*=\s*0\s*(?:;.*)?$/im.exec(source);
    if (disabled) findings.push({
      line: node.startLine + source.slice(0, disabled.index).split(/\r?\n/).length - 1,
      severity: 'warning',
      code: 'literal-false-triggerall',
      message: '`triggerall = 0` prevents this controller from running.',
      help: 'Remove or change it only if this controller is not intentionally disabled.'
    });
  }
  if ((node.kind === 'state' || node.kind === 'function') && !(node.children || []).length) findings.push({
    line: node.startLine,
    severity: 'information',
    code: 'empty-structure',
    message: `No recognized executable blocks were found inside this ${node.kind}.`,
    help: 'This may be intentional, or the body may be incomplete or use syntax the structure viewer does not recognize.'
  });
  return findings;
}

function attachCodeBlockInsights(root, text, language, options = {}) {
  const lines = String(text || '').split(/\r?\n/);
  const nodes = flatten(root);
  const diagnostics = language === 'zss' ? analyzeZss(text, options).issues.map(normalizeFinding) : [];
  for (const node of nodes) {
    const local = diagnostics.filter((finding) => finding.line >= node.startLine && finding.line <= node.endLine);
    const literal = literalReachability(node, lines, language);
    const unique = new Map([...literal, ...local].map((finding) => [`${finding.code}:${finding.line}:${finding.message}`, finding]));
    node.insights = [...unique.values()].sort((a, b) => a.line - b.line || a.code.localeCompare(b.code));
    node.insightSummary = node.insights.length
      ? `${node.insights.length} static review ${node.insights.length === 1 ? 'item' : 'items'}`
      : 'No local static blocker found';
  }
  return root;
}

module.exports = { attachCodeBlockInsights, literalReachability };
