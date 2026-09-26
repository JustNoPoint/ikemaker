'use strict';

const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

const gameRoot = process.env.IKEMAKER_TEST_GAME_ROOT;
const characterRoot = gameRoot ? path.join(gameRoot, 'chars', 'Ryu') : '';
const reportFile = path.resolve(__dirname, '..', 'ikemaker-wave2-live-report.json');
const surfaces = gameRoot ? [
  ['ikemen.projectManager.open', path.join(gameRoot, 'chars', 'template'), /Project & Team Manager/],
  ['air.openAnimationPreview', path.join(characterRoot, 'Anim.air'), /AIR:/],
  ['sff.openViewer', path.join(characterRoot, 'Ryu_Development.sff'), /SFF:/],
  ['snd.openViewer', path.join(characterRoot, 'Sound.snd'), /SND:/],
  ['ikemen.stage.openWorkspace', path.join(gameRoot, 'stages', 'kfm.def'), /Stage/],
  ['ikemen.ui.openWorkspace', path.join(gameRoot, 'data', 'ikemen1', 'system.def'), /^UI:/],
  ['ikemen.selectDef.openWorkspace', path.join(gameRoot, 'data', 'select.def'), /Roster Manager/],
  ['ikemen.codeStructure.openWorkspace', path.join(gameRoot, 'chars', 'template', 'commonoptions.zss'), /Visual Structure/]
] : [];

function wait(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
function tabs() { return vscode.window.tabGroups.all.flatMap((group) => group.tabs).map((tab) => tab.label); }

async function activate() {
  const report = { startedAt: new Date().toISOString(), passed: false, checks: {}, surfaces: [] };
  try {
    if (!gameRoot) throw new Error('Set IKEMAKER_TEST_GAME_ROOT to the IKEMEN game root used by this optional live test.');
    await wait(1200);
    const extension = vscode.extensions.getExtension('justnopoint.ikemen-zss-tools');
    report.checks.extensionDiscovered = Boolean(extension);
    if (!extension) throw new Error('The installed IKEMaker extension was not discovered.');
    await extension.activate();
    report.checks.extensionActive = extension.isActive;
    report.checks.version = extension.packageJSON.version;
    report.checks.displayName = extension.packageJSON.displayName;
    const available = new Set(await vscode.commands.getCommands(true));
    const declared = (extension.packageJSON.contributes?.commands || []).map((item) => item.command);
    report.checks.commandCount = declared.length;
    report.checks.missingCommands = declared.filter((command) => !available.has(command));
    for (const [command, filename, expectedTab] of surfaces) {
      const item = { command, filename, exists: fs.existsSync(filename), invoked: false, tabMatched: false };
      report.surfaces.push(item);
      if (!item.exists) continue;
      await vscode.commands.executeCommand(command, vscode.Uri.file(filename));
      item.invoked = true;
      await wait(1800);
      item.openTabs = tabs();
      item.tabMatched = item.openTabs.some((label) => expectedTab.test(label));
    }
    report.checks.finalTabs = tabs();
    report.passed = report.checks.extensionActive && report.checks.version === '0.70.0' && report.checks.displayName === 'IKEMaker' && report.checks.missingCommands.length === 0 && report.surfaces.every((item) => item.exists && item.invoked && item.tabMatched);
    if (!report.passed) throw new Error('One or more installed-extension checks failed.');
  } catch (error) {
    report.error = error?.stack || error?.message || String(error);
  } finally {
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await wait(500);
    await vscode.commands.executeCommand('workbench.action.closeWindow');
  }
}

module.exports = { activate, deactivate() {} };
