'use strict';

const AUDIT_GLOBS = Object.freeze(['**/*.zss', '**/*.cns', '**/*.cmd', '**/*.st']);

async function collectWorkspaceAuditUris(vscode, limit) {
  const maximum = Math.max(1, Number(limit) || 1);
  // Each query is independently bounded by the final cap. Fetching up to 4x
  // the cap lets unused extension quotas backfill without an unbounded scan.
  const groups = await Promise.all(AUDIT_GLOBS.map(glob => vscode.workspace.findFiles(glob, '**/{.git,node_modules}/**', maximum)));
  const output = [], seen = new Set();
  for (let row = 0; output.length < maximum; row += 1) {
    let found = false;
    for (const group of groups) {
      const uri = group[row]; if (!uri) continue; found = true;
      const key = uri.toString(); if (seen.has(key)) continue;
      seen.add(key); output.push(uri); if (output.length >= maximum) break;
    }
    if (!found) break;
  }
  return output;
}

async function visitWorkspaceAuditDocuments(vscode, limit, visitor, options = {}) {
  const uris = await collectWorkspaceAuditUris(vscode, limit);
  let visited = 0;
  for (let index = 0; index < uris.length; index += 1) {
    if (options.cancelled?.()) break;
    const document = await vscode.workspace.openTextDocument(uris[index]);
    await visitor(document, uris[index], index, uris.length); visited += 1;
  }
  return { uris, visited };
}

module.exports = { AUDIT_GLOBS, collectWorkspaceAuditUris, visitWorkspaceAuditDocuments };
