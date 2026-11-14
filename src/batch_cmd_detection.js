'use strict';

// IKEMaker associates *.cmd with IKEMEN command files, but Windows batch
// scripts use the same extension. When a .cmd file is clearly a batch script
// (and carries no IKEMEN command/state syntax), hand it back to VS Code's
// built-in Batch language so it keeps batch highlighting and IKEMaker menus
// stay out of it. Empty or ambiguous files are never switched.

const SETTING = 'cmdFiles.detectBatchScripts';
const MAX_SCAN_LINES = 400;
const IKEMEN_SIGNATURE = /^\s*(?:\[\s*(?:command|defaults|remap|statedef|state)\b|command\s*=|name\s*=\s*"|trigger(?:all|\d+)\s*=|type\s*=)/i;
const STRONG_BATCH = /^\s*(?:@\s*echo\s+(?:off|on)\b|echo\s+off\b|@?\s*rem(?:\s|$)|::|@?\s*setlocal\b|@?\s*chcp\b)/i;
const BATCH_LINE = /^\s*@?\s*(?:echo|set|call|goto|if|for|cd|pushd|popd|start|title|cls|exit|pause|del|copy|xcopy|move|mkdir|md|rmdir|rd|endlocal|shift)\b|^\s*:[A-Za-z_]/i;

function looksLikeBatchScript(text) {
  const lines = String(text ?? '').split(/\r\n|\r|\n/, MAX_SCAN_LINES).filter(line => line.trim());
  if (!lines.length) return false;
  if (lines.some(line => IKEMEN_SIGNATURE.test(line))) return false;
  if (STRONG_BATCH.test(lines[0])) return true;
  return lines.filter(line => BATCH_LINE.test(line)).length >= 2;
}

function shouldSwitch(document, enabled = true) {
  return Boolean(enabled && document && !document.isClosed && document.languageId === 'ikemen-cns' && /\.cmd$/i.test(document.fileName || document.uri?.fsPath || '') && looksLikeBatchScript(document.getText()));
}

function registerBatchCmdDetection(vscode, context) {
  const enabled = () => vscode.workspace.getConfiguration('ikemenZss').get(SETTING, true) !== false;
  let batchAvailable;
  const check = async document => {
    if (!shouldSwitch(document, enabled())) return;
    if (batchAvailable === undefined) { try { batchAvailable = (await vscode.languages.getLanguages()).includes('bat'); } catch { batchAvailable = false; } }
    if (!batchAvailable) return;
    try { await vscode.languages.setTextDocumentLanguage(document, 'bat'); } catch { /* the document closed or the language changed meanwhile */ }
  };
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(document => { void check(document); }));
  for (const document of vscode.workspace.textDocuments || []) void check(document);
}

module.exports = { SETTING, looksLikeBatchScript, shouldSwitch, registerBatchCmdDetection };
