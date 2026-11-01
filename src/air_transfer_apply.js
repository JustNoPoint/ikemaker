'use strict';

const crypto = require('crypto');

function sha(value) { return crypto.createHash('sha256').update(String(value)).digest('hex').toUpperCase(); }
function assertPlan(plan) {
  if (!plan || Object.getPrototypeOf(plan) !== Object.prototype || plan.schema !== 'ikemaker.air-transfer-resolution' || plan.version !== 1) throw new TypeError('AIR Transfer resolution authority is invalid.');
  if (plan.status !== 'ready' || !Array.isArray(plan.outcomes) || !Array.isArray(plan.patches)) throw new Error('Only a ready AIR Transfer resolution can be applied.');
  if (plan.effects?.destinationMutation !== false || plan.effects?.autosave !== false) throw new Error('The reviewed AIR Transfer resolution has an invalid mutation contract.');
  if (sha(plan.outputText) !== plan.outputFingerprint) throw new Error('The reviewed AIR Transfer output fingerprint is invalid.');
  return plan;
}

function validateAirTransferApply({ plan, sourceText, destinationText }) {
  assertPlan(plan);
  if (sha(sourceText) !== plan.sourceFingerprint) throw new Error('The AIR Transfer source changed before Apply. Nothing was written.');
  if (sha(destinationText) !== plan.destinationFingerprint) throw new Error('The AIR Transfer destination changed before Apply. Nothing was written.');
  return Object.freeze({ outputText: plan.outputText, outputFingerprint: plan.outputFingerprint, outcomes: plan.outcomes, autosave: false, oneUndoStep: true });
}

async function applyAirTransferPlan(vscode, { plan, sourceText, document }) {
  if (!vscode?.WorkspaceEdit || !vscode?.Range || !vscode?.workspace?.applyEdit || !document?.uri || typeof document.getText !== 'function') throw new TypeError('AIR Transfer Apply requires an open VS Code text document.');
  const current = document.getText(), validated = validateAirTransferApply({ plan, sourceText, destinationText: current });
  const lastLine = Math.max(0, document.lineCount - 1), last = document.lineAt(lastLine), edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, new vscode.Range(0, 0, lastLine, last.text.length), validated.outputText);
  if (!await vscode.workspace.applyEdit(edit)) throw new Error('VS Code rejected the reviewed AIR Transfer edit. Nothing was saved automatically.');
  return Object.freeze({ status: 'applied-in-editor', outputFingerprint: validated.outputFingerprint, outcomes: validated.outcomes, autosaved: false, undoSteps: 1 });
}

module.exports = { validateAirTransferApply, applyAirTransferPlan };
