'use strict';

const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { chooseCharacterDef } = require('./character_picker');
const { parseDef, sections, setSectionEntry } = require('./def_model');
const { transactionalWriteSet, optionsFromConfig } = require('./mutation_safety');

function nextStateFileKey(files) {
  const used = new Set((files?.entries || []).map((entry) => entry.normalized));
  if (!used.has('st')) return 'st';
  for (let number = 0; number < 1000; number += 1) if (!used.has(`st${number}`)) return `st${number}`;
  throw new Error('No free state-file entry was found in the character DEF.');
}

function installPlan(defText, defPath, moduleText) {
  const document = parseDef(defText, defPath);
  const files = sections(document, 'Files')[0];
  if (!files) throw new Error('The selected character DEF has no [Files] section.');
  const characterFolder = path.dirname(defPath);
  const target = path.join(characterFolder, 'tools', 'ikemen-tools', 'ikemen_tools_authoring_bridge.zss');
  const relative = path.relative(characterFolder, target).replace(/\\/g, '/');
  const existing = (files.entries || []).find((entry) => entry.value.replace(/\\/g, '/').toLowerCase() === relative.toLowerCase());
  const key = existing?.key || nextStateFileKey(files);
  const nextDef = existing ? defText : setSectionEntry(document, files.line, key, relative);
  return { target, relative, key, nextDef, moduleText, alreadyLinked: Boolean(existing) };
}

async function installAuthoringBridge(context, seed) {
  try {
    const defPath = await chooseCharacterDef(seed, { title: 'Install IKEMaker Authoring Bridge' });
    if (!defPath) return;
    const source = vscode.Uri.joinPath(context.extensionUri, 'data', 'authoring-bridge', 'ikemen_tools_authoring_bridge.zss').fsPath;
    const moduleText = fs.readFileSync(source, 'utf8');
    const defText = fs.readFileSync(defPath, 'utf8');
    const plan = installPlan(defText, defPath, moduleText);
    const action = await vscode.window.showWarningMessage(
      `Install the neutral authoring bridge into ${path.basename(path.dirname(defPath))}?`,
      { modal: true, detail: `Copies ${plan.relative} and ${plan.alreadyLinked ? 'refreshes the module already linked by' : `adds ${plan.key} to`} ${path.basename(defPath)}. It is inert by default and restricted to training mode.` },
      'Install Bridge'
    );
    if (action !== 'Install Bridge') return;
    const writes = [[plan.target, plan.moduleText]];
    if (!plan.alreadyLinked) writes.push([defPath, plan.nextDef]);
    transactionalWriteSet(fs, writes, optionsFromConfig(vscode, defPath, 'install-authoring-bridge', {
      journalRoot: path.dirname(defPath), aggregateJournal: true
    }));
    await vscode.window.showTextDocument(vscode.Uri.file(plan.target), { preview: false });
    vscode.window.showInformationMessage(`Authoring bridge installed and linked as ${plan.key}. Normal matches remain unchanged.`);
  } catch (error) {
    vscode.window.showErrorMessage(`Authoring bridge installation failed: ${error.message}`);
  }
}

async function openAnimationStandards(context) {
  const uri = vscode.Uri.joinPath(context.extensionUri, 'data', 'animation-standards.json');
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri), { preview: false });
}

async function openAuthoringBridgeGuide(context) {
  const uri = vscode.Uri.joinPath(context.extensionUri, 'data', 'authoring-bridge', 'README.md');
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri), { preview: false });
}

function registerAuthoringBridge(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('ikemen.authoringBridge.install', (uri) => installAuthoringBridge(context, uri)),
    vscode.commands.registerCommand('ikemen.animationStandards.open', () => openAnimationStandards(context)),
    vscode.commands.registerCommand('ikemen.authoringBridge.openGuide', () => openAuthoringBridgeGuide(context))
  );
}

module.exports = { nextStateFileKey, installPlan, registerAuthoringBridge };
