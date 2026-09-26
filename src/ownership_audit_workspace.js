'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const contextModel = require('./project_context_model');
const registryModel = require('./project_registry');
const metadata = require('./metadata_registry');
const ownership = require('./ownership_audit');
const { chooseFileOrFolder } = require('./open_target_picker');

async function audit(uri) {
  let filename = uri?.fsPath || vscode.window.activeTextEditor?.document?.fileName;
  if (!filename || path.extname(filename).toLowerCase() !== '.def') filename = await chooseFileOrFolder({ title: 'Choose a DEF to Audit Ownership', filters: { 'IKEMEN definitions': ['def'] }, extensions: ['def'], maxDepth: 4, emptyMessage: 'No DEF files were found in that folder.' });
  if (!filename) return;
  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filename)), root = folder?.uri.fsPath || path.dirname(filename), registryFile = metadata.find(filename);
  let registry = registryModel.createDefault(); try { if (registryFile) registry = metadata.read(registryFile).registry; } catch (_) {}
  const source = contextModel.contextFor(filename, root, registry), refs = ownership.defReferences(fs.readFileSync(filename, 'utf8'), filename), targets = refs.map((item) => ({ ...item, exists: fs.existsSync(item.filename), context: contextModel.contextFor(item.filename, root, registry) })), results = ownership.auditEdges(source, targets);
  const lines = ['# Ownership dependency audit', '', `Source: ${contextModel.label(source)} (${source.ownership})`, `Registry: ${registryFile || 'built-in defaults'}`, '', '| Level | DEF key | Target | Ownership | Finding |', '|---|---|---|---|---|'];
  for (const item of results) lines.push(`| ${!item.exists ? 'ERROR' : item.allowed ? 'OK' : item.level.toUpperCase()} | ${item.key} | ${path.relative(root, item.filename).replace(/\\/g, '/')} | ${item.context.ownership} | ${!item.exists ? 'Referenced file is missing.' : item.allowed ? 'Allowed ownership direction.' : item.reasons.join(' ')} |`);
  const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: lines.join('\n') }); await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.Beside });
}
function registerOwnershipAudit(context) { context.subscriptions.push(vscode.commands.registerCommand('ikemen.ownership.auditDef', audit)); }

module.exports = { registerOwnershipAudit, audit };
