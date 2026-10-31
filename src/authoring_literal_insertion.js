'use strict';

const fs = require('fs');
const path = require('path');

function normalized(filename) { return path.resolve(String(filename || '')).toLowerCase(); }
function guardedSourceText(vscode, filename) {
  const document = (vscode.workspace.textDocuments || []).find(item => normalized(item.fileName) === normalized(filename));
  return document ? document.getText() : fs.readFileSync(filename, 'utf8');
}
function destinationUnchanged(vscode, guard) {
  const editor = vscode.window.activeTextEditor, document = editor?.document;
  return Boolean(editor && document && editor.selection?.isEmpty && document.uri.toString() === guard?.uri && document.version === guard.version && document.getText() === guard.text && document.offsetAt(editor.selection.active) === guard.offset);
}
function sourcesUnchanged(vscode, guards) {
  try { return Array.isArray(guards) && guards.length > 0 && guards.every(guard => typeof guard?.filename === 'string' && typeof guard?.text === 'string' && guardedSourceText(vscode, guard.filename) === guard.text); }
  catch { return false; }
}
function scopeUnchanged(entry) { try { return typeof entry?.sourceScopeValid === 'function' && entry.sourceScopeValid() === true; } catch { return false; } }

async function insertReviewedLiteral(vscode, entry) {
  const text = typeof entry?.literalText === 'string' ? entry.literalText : '', destination = entry?.destinationGuard, sources = entry?.sourceGuards;
  if (!text || !destinationUnchanged(vscode, destination) || !sourcesUnchanged(vscode, sources) || !scopeUnchanged(entry)) { await vscode.window.showInformationMessage('The example source, assignment, destination, or cursor changed. Review the adaptation again; nothing was inserted.'); return false; }
  const dependency=typeof entry?.dependencySummary==='string'&&Buffer.byteLength(entry.dependencySummary,'utf8')<=4096?entry.dependencySummary:'Dependency summary unavailable; review the adapted source directly.';
  const provenance=[entry?.sourceScope==='shared'?'Explicitly linked shared source':'Current character source',typeof entry?.sourceLabel==='string'?entry.sourceLabel:'',typeof entry?.sourceLanguage==='string'?entry.sourceLanguage.toUpperCase():''].filter(Boolean).join(' · ');
  const answer = await vscode.window.showInformationMessage(`Preview adapted example: ${entry.label || 'Personal Example'}`, { modal: true, detail: `${text}\n\nSource: ${provenance||'Pinned personal example'}\nObserved literal dependencies: ${dependency}\n\nOnly the explicitly marked values differ from the pinned example. Dependencies and project infrastructure are shown for review but are not imported automatically.` }, 'Insert Adapted Example');
  if (answer !== 'Insert Adapted Example') return false;
  if (!destinationUnchanged(vscode, destination) || !sourcesUnchanged(vscode, sources) || !scopeUnchanged(entry)) { await vscode.window.showInformationMessage('The example source, assignment, destination, or cursor changed after preview. Nothing was inserted.'); return false; }
  const editor = vscode.window.activeTextEditor, edit = new vscode.WorkspaceEdit();
  edit.insert(editor.document.uri, editor.document.positionAt(destination.offset), text);
  if (!await vscode.workspace.applyEdit(edit)) throw new Error('VS Code did not insert the adapted example. Nothing was saved.');
  await vscode.window.showInformationMessage('Adapted personal example inserted into the open document—not saved to disk yet. Use Undo to reverse it.');return true;
}

module.exports = { normalized, guardedSourceText, destinationUnchanged, sourcesUnchanged, scopeUnchanged, insertReviewedLiteral };
