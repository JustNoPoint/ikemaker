'use strict';

const path = require('path');
const { validateDependency } = require('./ownership_dependency');

const FILE_KEYS = /^(sprite|anim|sound|cmd|cns|st\d*|fx)\s*=\s*(.+?)\s*$/i;
function clean(value) { return String(value || '').replace(/\s*[;#].*$/, '').trim().replace(/^['"]|['"]$/g, ''); }
function defReferences(text, filename) {
  const folder = path.dirname(filename), result = [];
  String(text || '').split(/\r?\n/).forEach((line, index) => { const match = FILE_KEYS.exec(line); if (!match) return; const value = clean(match[2]); if (value) result.push({ key: match[1].toLowerCase(), value, filename: path.resolve(folder, value.replace(/[\\/]/g, path.sep)), line: index + 1 }); });
  return result;
}
function auditEdges(sourceContext, targets = []) {
  return targets.map((target) => { const result = validateDependency({ ownership: sourceContext.ownership, projectId: sourceContext.project?.id, characterId: sourceContext.character?.id }, { ownership: target.context.ownership, projectId: target.context.project?.id, characterId: target.context.character?.id }); return { ...target, ...result }; });
}

module.exports = { defReferences, auditEdges };
