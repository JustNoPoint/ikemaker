'use strict';

const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

const characterDef = process.env.IKEMAKER_TEST_CHARACTER_DEF;
const reportFile = path.resolve(__dirname, '..', 'spatial-composer-live-report.json');
const requiredCommands = [
  'ikemen.moveLab.open', 'ikemen.moveLab.inspectCurrent', 'ikemen.hitDef.openEditor',
  'ikemen.throwCreator.open', 'ikemen.explodComposer.open', 'ikemen.positionCamera.open', 'ikemen.spatialComposer.inspectCurrent', 'air.openAnimationPreview', 'sff.openViewer', 'snd.openViewer',
  'ikemen.helperLab.open', 'ikemen.helperLab.inspectCurrent',
  'ikemen.paletteImport.open', 'zss.openPalFxEditor', 'ikemen.codeStructure.openWorkspace',
  'zss.openControllers', 'zssControllers.insert', 'ikemen.characterDependencies.open',
  'ikemen.testSessions.open', 'ikemen.characterHealth.open', 'ikemen.mutations.openHistory'
];

function wait(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
async function activate() {
  const report = { startedAt: new Date().toISOString(), characterDef, passed: false, checks: {} };
  try {
    if (!characterDef) throw new Error('Set IKEMAKER_TEST_CHARACTER_DEF to the character DEF used by this optional live test.');
    await wait(1200);
    const ikemaker = vscode.extensions.getExtension('justnopoint.ikemen-zss-tools');
    report.checks.extensionDiscovered = Boolean(ikemaker);
    if (!ikemaker) throw new Error('The isolated profile did not discover IKEMaker.');
    await ikemaker.activate();
    report.checks.extensionActive = ikemaker.isActive;
    const commands = new Set(await vscode.commands.getCommands(true));
    report.checks.requiredCommands = requiredCommands.map((command) => ({ command, present: commands.has(command) }));
    if (report.checks.requiredCommands.some((item) => !item.present)) throw new Error('One or more required Move Lab bridge commands are missing.');
    if (!fs.existsSync(characterDef)) throw new Error(`Ryu DEF was not found: ${characterDef}`);
    await vscode.commands.executeCommand('ikemen.moveLab.open', vscode.Uri.file(characterDef));
    await wait(2500);
    report.inspection = await vscode.commands.executeCommand('ikemen.moveLab.inspectCurrent');
    report.checks.moveLabTab = vscode.window.tabGroups.all.flatMap((group) => group.tabs).some((tab) => tab.label === 'Move Lab');
    report.checks.character = report.inspection?.context?.character;
    report.checks.visualReady = report.inspection?.visualState === 'ready';
    report.checks.requiredAssets = ['DEF', 'AIR', 'SFF', 'SND'].map((kind) => ({ kind, ready: report.inspection?.files?.some((item) => item.kind === kind && item.exists) || false }));
    report.checks.modeCount = report.inspection?.modes?.length || 0;
    await vscode.commands.executeCommand('ikemen.explodComposer.open', vscode.Uri.file(characterDef));
    await wait(2500);
    report.spatialInspection = await vscode.commands.executeCommand('ikemen.spatialComposer.inspectCurrent');
    report.checks.spatialTab = vscode.window.tabGroups.all.flatMap((group) => group.tabs).some((tab) => /Spatial Composer/.test(tab.label));
    report.checks.spatialContext = report.spatialInspection?.context;
    report.checks.spatialVisualReady = report.spatialInspection?.visualState === 'ready';
    report.checks.spatialGeneratedCode = /explod\{/.test(report.spatialInspection?.code || '');
    await vscode.commands.executeCommand('ikemen.helperLab.open', vscode.Uri.file(characterDef));
    await wait(2500);
    report.helperInspection = await vscode.commands.executeCommand('ikemen.helperLab.inspectCurrent');
    report.checks.helperTab = vscode.window.tabGroups.all.flatMap((group) => group.tabs).some((tab) => /Helper Lab/.test(tab.label));
    report.checks.helperContext = report.helperInspection?.context;
    report.checks.helperSources = report.helperInspection?.sources?.length || 0;
    report.checks.helperGeneratedValid = report.helperInspection?.generatedValid === true;
    report.passed = Boolean(report.checks.moveLabTab && report.checks.visualReady && report.checks.modeCount === 9 && report.checks.requiredAssets.every((item) => item.ready) && report.checks.spatialTab && report.checks.spatialVisualReady && report.checks.spatialGeneratedCode && report.checks.helperTab && report.checks.helperSources > 0 && report.checks.helperGeneratedValid);
    if (!report.passed) throw new Error('The Move Lab opened but one or more runtime checks failed.');
  } catch (error) {
    report.error = error && (error.stack || error.message) || String(error);
  } finally {
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await wait(500);
    await vscode.commands.executeCommand('workbench.action.closeWindow');
  }
}

module.exports = { activate, deactivate() {} };
