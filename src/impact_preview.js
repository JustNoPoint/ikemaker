'use strict';

const vscode = require('vscode');
const path = require('path');
const impact = require('./impact_analysis');

async function preview(initialIdentifier, initialReplacement) {
  const identifier = typeof initialIdentifier === 'string' ? initialIdentifier : await vscode.window.showInputBox({ title: 'Preview Change Impact', prompt: 'Sprite, animation, sound, palette, map, state, or symbol identifier to locate.' });
  if (!identifier?.trim()) return;
  const replacement = typeof initialReplacement === 'string' ? initialReplacement : await vscode.window.showInputBox({ title: 'Proposed replacement (optional)', prompt: 'Leave blank for a reference-only audit.' });
  if (replacement === undefined) return;
  const roots = vscode.workspace.workspaceFolders || []; if (!roots.length) return vscode.window.showWarningMessage('Open a workspace folder first.');
  const config = vscode.workspace.getConfiguration('ikemenZss'), maximumFiles = config.get('impactPreview.maxFiles', 1500), maximumBytes = config.get('impactPreview.maxFileBytes', 2097152);
  const uris = await vscode.workspace.findFiles('**/*.{zss,cns,cmd,air,def,lua,json,md,txt}', '**/{.git,node_modules,.ikemen-tools/backups}/**', maximumFiles + 1);
  const result = impact.replacementPreview(impact.scanFiles(uris.map((uri) => uri.fsPath), identifier, { maximumFiles, maximumBytes }), replacement);
  const lines = [`# Change-impact preview`, '', `**Find:** \`${identifier}\``, `**Proposed replacement:** ${replacement ? `\`${replacement}\`` : '_reference audit only_'}`, `**Impact:** ${result.occurrences} reference(s) across ${result.filesAffected} file(s).`, ''];
  if (result.truncated) lines.push('> The configured scan budget was reached. Narrow the workspace or identifier before applying a destructive change.', '');
  let current = '';
  for (const match of result.matches) {
    const relative = roots.map((root) => path.relative(root.uri.fsPath, match.filename)).find((item) => !item.startsWith('..')) || match.filename;
    if (relative !== current) { current = relative; lines.push(`## ${relative.replace(/\\/g, '/')}`, ''); }
    lines.push(`- Line ${match.line}: \`${match.text.replace(/`/g, '\\`')}\``);
  }
  if (!result.matches.length) lines.push('No text references were found. Binary archive contents require their dedicated SFF/SND manifest tools.');
  const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: lines.join('\n') });
  await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.Beside });
}
function registerImpactPreview(context) { context.subscriptions.push(vscode.commands.registerCommand('ikemen.impact.preview', preview)); }

module.exports = { registerImpactPreview, preview };
