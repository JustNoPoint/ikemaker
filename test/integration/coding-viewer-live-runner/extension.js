'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vscode = require('vscode');

const targetFile = process.env.IKEMAKER_CODING_TEST_FILE || '';
const requestedMode = process.env.IKEMAKER_CODING_TEST_MODE;
const restoreMarker = process.env.IKEMAKER_CODING_RESTORE_MARKER || '';
const mode = ['native', 'restore', 'close'].includes(requestedMode) ? requestedMode : 'integrated';
const reportName = mode === 'native'
  ? 'coding-viewer-native-live-report.json'
  : mode === 'restore'
    ? 'coding-viewer-restore-live-report.json'
    : mode === 'close'
      ? 'coding-viewer-close-live-report.json'
    : 'coding-viewer-live-report.json';
const reportFile = path.resolve(__dirname, '..', reportName);

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function installedModule(extensionPath, relativePath) {
  const filename = path.resolve(extensionPath, relativePath);
  const canonical = filename.toLowerCase();
  const active = Object.values(require.cache).find((entry) => path.resolve(entry.filename).toLowerCase() === canonical);
  // Reuse the activated product module on Windows. Requiring an equivalent
  // path with different drive-letter casing can create a second module
  // instance whose injected VS Code API has not been configured.
  return active ? active.exports : require(filename);
}

function groupSnapshot() {
  return vscode.window.tabGroups.all.map((group, index) => ({
    index,
    viewColumn: group.viewColumn,
    active: group.isActive,
    tabs: group.tabs.map((tab) => ({ label: tab.label, active: tab.isActive, dirty: tab.isDirty }))
  }));
}

function findTab(groups, pattern) {
  for (const group of groups) {
    const tab = group.tabs.find((candidate) => pattern.test(candidate.label));
    if (tab) return { group, tab };
  }
  return null;
}

async function waitForDiagnostic(uri, code, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const diagnostics = vscode.languages.getDiagnostics(uri);
    const found = diagnostics.find((diagnostic) => (typeof diagnostic.code === 'object' ? diagnostic.code?.value : diagnostic.code) === code);
    if (found) return found;
    await wait(100);
  }
  return null;
}

async function exerciseNativeLanguageService(report) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-code-language-live-'));
  const def = path.join(root, 'Test.def');
  const command = path.join(root, 'Test.cmd');
  const state = path.join(root, 'state.zss');
  fs.writeFileSync(def, '[Info]\nname = "Language fixture"\n[Files]\ncmd = Test.cmd\nst = state.zss\n', 'utf8');
  fs.writeFileSync(command, '[Command]\nname = "known"\ncommand = x\n', 'utf8');
  fs.writeFileSync(state, 'if command = "definitely_missing" {}\n', 'utf8');
  try {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(state));
    await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.One, preview: false });
    report.checks.nativeLanguageId = document.languageId;
    const missing = await waitForDiagnostic(document.uri, 'missing-command');
    report.checks.missingCommandDiagnostic = Boolean(missing);
    report.checks.missingCommandSeverity = missing?.severity;
    const original = document.getText();
    const edit = new vscode.WorkspaceEdit();
    edit.insert(document.uri, new vscode.Position(0, 0), '# live undo check\n');
    report.checks.nativeEditApplied = await vscode.workspace.applyEdit(edit);
    report.checks.nativeDirtyAfterEdit = document.isDirty;
    await vscode.commands.executeCommand('undo');
    await wait(100);
    report.checks.nativeUndoRestored = document.getText() === original;
    report.checks.nativeCleanAfterUndo = !document.isDirty;
  } finally {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
  }
}

async function inspectInstalledBrowserChrome(report, extensionPath, authoring, descriptor, connectedFiles) {
  const navigation = await vscode.commands.executeCommand('ikemen.textToolbar.openCompanion', {
    files: connectedFiles,
    viewColumn: vscode.window.activeTextEditor?.viewColumn,
    context: descriptor.context
  });
  const assistance = await authoring.openAuthoringBrowser({
    ...descriptor.context,
    files: connectedFiles,
    connectedFiles,
    activeSurfaceId: 'code.authoring-browser'
  }, null, navigation?.viewColumn);
  await wait(250);
  const navigationHtml = String(navigation?.webview?.html || '');
  const assistanceHtml = String(assistance?.webview?.html || '');
  report.checks.navigationToolbarSlots = (navigationHtml.match(/data-universal-slot=/g) || []).length;
  report.checks.navigationSlider = navigationHtml.includes('id="tab-scroll-slider"');
  report.checks.navigationArrows = (navigationHtml.match(/data-scroll-tabs="-1"/g) || []).length === 2 && (navigationHtml.match(/data-scroll-tabs="1"/g) || []).length === 2;
  report.checks.navigationModes = ['tabs', 'cards', 'list'].every((value) => navigationHtml.includes(`data-mode="${value}"`));
  report.checks.navigationFilesListed = connectedFiles.every((filename) => navigationHtml.includes(path.basename(filename)));
  report.checks.assistanceToolbarSlots = (assistanceHtml.match(/data-universal-slot=/g) || []).length;
  report.checks.assistanceSections = ['Code Navigator', 'Project Data Map', 'Recipe Discovery', 'Similar Code', 'Controllers', 'Problems'].every((label) => assistanceHtml.includes(label));
  report.checks.engineProfileVisible = assistanceHtml.includes('Active engine capability profile') && assistanceHtml.includes('Engine Targets');
  report.checks.nightlyStringStatus = assistanceHtml.includes('Nightly string tools enabled') ? 'enabled' : assistanceHtml.includes('Nightly string tools hidden') ? 'hidden' : '';
  const { renderAuthoringBrowserHtml } = installedModule(extensionPath, path.join('src', 'authoring_browser_workspace.js'));
  const stableHtml = renderAuthoringBrowserHtml({ capability: { nightlyStringsEnabled:false, target:{ version:'IKEMEN GO 1.0', channel:'stable' } } });
  const nightlyHtml = renderAuthoringBrowserHtml({ capability: { nightlyStringsEnabled:true, target:{ version:'Nightly acceptance fixture', channel:'nightly', commit:'abcdef1234567890' } } });
  report.checks.stableProfileHidesNightlyStrings = stableHtml.includes('IKEMEN GO 1.0') && stableHtml.includes('Nightly string tools hidden') && !stableHtml.includes('Nightly string tools enabled');
  report.checks.verifiedNightlyEnablesStrings = nightlyHtml.includes('Nightly string tools enabled') && nightlyHtml.includes('abcdef123456');
}

async function activate(context) {
  let reloading = false;
  const report = {
    startedAt: new Date().toISOString(),
    passed: false,
    mode,
    targetFile,
    checks: {}
  };
  try {
    if (!path.isAbsolute(targetFile) || !fs.existsSync(targetFile)) {
      throw new Error('IKEMAKER_CODING_TEST_FILE must identify an existing absolute source file.');
    }
    await wait(1200);
    const extension = vscode.extensions.getExtension('justnopoint.ikemen-zss-tools');
    report.checks.extensionDiscovered = Boolean(extension);
    if (!extension) throw new Error('The installed IKEMaker extension was not discovered.');
    await extension.activate();
    report.checks.extensionActive = extension.isActive;
    report.checks.version = extension.packageJSON.version;
    report.checks.commandAvailable = (await vscode.commands.getCommands(true)).includes('ikemen.authoringWorkspace.open');
    if (!report.checks.commandAvailable) throw new Error('The public Coding Viewer command is unavailable.');
    // VS Code's Electron module loader no longer guarantees extensionless
    // resolution for absolute paths outside this runner extension. Keep these
    // installed-extension probes explicit so a loader detail cannot masquerade
    // as a Coding Viewer restore failure.
    const authoring = installedModule(extension.extensionPath, path.join('src', 'authoring_workspace.js'));
    const workbenches = installedModule(extension.extensionPath, path.join('src', 'character_workbenches.js'));
    const profile = workbenches.profileFromDef(targetFile);
    const connectedFiles = workbenches.groupedCodeFiles(profile, [targetFile, ...(profile.connectedFiles || [])]);
    report.connectedFiles = connectedFiles;
    if (connectedFiles.length < 2) throw new Error('The Character Essentials fixture did not resolve a multi-file coding set.');
    if (mode === 'native') {
      await vscode.workspace.getConfiguration('ikemenZss').update('authoring.presentation', 'native', vscode.ConfigurationTarget.Global);
    }
    const descriptor = {
      origin: 'character-essentials',
      taskId: 'coding-viewer-live-acceptance',
      sessionId: path.resolve(targetFile),
      files: connectedFiles,
      context: {
        type: 'character',
        key: path.dirname(targetFile),
        label: profile.name || path.basename(path.dirname(targetFile)),
        root: path.dirname(targetFile),
        files: connectedFiles
      }
    };
    const restorePhase = mode === 'restore' && restoreMarker && fs.existsSync(restoreMarker) ? 'verify' : 'open';
    if (mode !== 'restore' || restorePhase === 'open') {
      await authoring.openCharacterCodingSet(descriptor, mode === 'native' ? {} : { forceIntegrated: true });
    }
    await wait(2500);
    if (mode === 'restore' && restorePhase === 'open') {
      if (!path.isAbsolute(restoreMarker)) throw new Error('IKEMAKER_CODING_RESTORE_MARKER must be an absolute path.');
      fs.writeFileSync(restoreMarker, 'verify\n', 'utf8');
      reloading = true;
      // A successful reload tears down this extension host and may reject the
      // command promise with CancellationError. Do not route that expected
      // shutdown through the failure cleanup, which would erase the phase
      // marker and create an endless open/reload loop.
      void vscode.commands.executeCommand('workbench.action.reloadWindow').catch(() => {});
      return;
    }
    if (mode !== 'native') await inspectInstalledBrowserChrome(report, extension.extensionPath, authoring, descriptor, connectedFiles);
    if (mode === 'close') {
      const beforeClose = groupSnapshot();
      report.beforeCloseGroups = beforeClose;
      report.checks.beforeCloseNavigation = Boolean(findTab(beforeClose, /^IKEMaker Code Navigation(?:\s|·|$)/i));
      report.checks.beforeCloseAssistance = Boolean(findTab(beforeClose, /^IKEMaker Coding Assistance$/i));
      report.checks.closeCommandAvailable = (await vscode.commands.getCommands(true)).includes('ikemen.character.close');
      let closeError = '';
      void vscode.commands.executeCommand('ikemen.character.close', profile).catch((error) => { closeError = error?.message || String(error); });
      const deadline=Date.now()+12000;
      while(Date.now()<deadline){
        const snapshot=groupSnapshot(),labels=new Set(snapshot.flatMap(group=>group.tabs.map(tab=>tab.label.toLowerCase()))),expected=[...new Set(connectedFiles.map(filename=>path.basename(filename).toLowerCase()))];
        if(!expected.some(label=>labels.has(label))&&!findTab(snapshot,/^IKEMaker Code Navigation(?:\s|·|$)/i)&&!findTab(snapshot,/^IKEMaker Coding Assistance$/i))break;
        await wait(200);
      }
      const afterClose = groupSnapshot();
      report.groups = afterClose;
      const remainingLabels = new Set(afterClose.flatMap((group) => group.tabs.map((tab) => tab.label.toLowerCase())));
      const expectedLabels = [...new Set(connectedFiles.map((filename) => path.basename(filename).toLowerCase()))];
      report.checks.remainingConnectedTabs = expectedLabels.filter((label) => remainingLabels.has(label)).length;
      report.checks.navigationClosed = !findTab(afterClose, /^IKEMaker Code Navigation(?:\s|·|$)/i);
      report.checks.assistanceClosed = !findTab(afterClose, /^IKEMaker Coding Assistance$/i);
      report.checks.closeError = closeError;
      report.passed = report.checks.extensionActive
        && report.checks.version === '0.79.116'
        && report.checks.closeCommandAvailable
        && report.checks.beforeCloseNavigation
        && report.checks.beforeCloseAssistance
        && report.checks.remainingConnectedTabs === 0
        && report.checks.navigationClosed
        && report.checks.assistanceClosed
        && !closeError;
      if (!report.passed) throw new Error('Closing the character context did not close its complete Coding Viewer workspace.');
      return;
    }
    const groups = groupSnapshot();
    report.groups = groups;
    const escapedTargetName = path.basename(targetFile).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const native = findTab(groups, new RegExp(`^${escapedTargetName}$`, 'i'));
    const navigation = findTab(groups, /^IKEMaker Code Navigation(?:\s|·|$)/i);
    const assistance = findTab(groups, /^IKEMaker Coding Assistance$/i);
    const legacy = findTab(groups, /^IKEMaker Code ·/i);
    report.checks.nativeTab = Boolean(native);
    report.checks.navigationTab = Boolean(navigation);
    report.checks.assistanceTab = Boolean(assistance);
    report.checks.companionsShareGroup = Boolean(navigation && assistance && navigation.group.index === assistance.group.index);
    report.checks.nativeUsesSeparateGroup = Boolean(native && navigation && native.group.index !== navigation.group.index);
    const labels = new Set(groups.flatMap((group) => group.tabs.map((tab) => tab.label.toLowerCase())));
    const expectedLabels = [...new Set(connectedFiles.map((filename) => path.basename(filename).toLowerCase()))];
    report.checks.connectedFileCount = connectedFiles.length;
    report.checks.connectedNativeTabs = expectedLabels.filter((label) => labels.has(label)).length;
    report.checks.allConnectedNativeTabs = report.checks.connectedNativeTabs === expectedLabels.length;
    report.checks.noLegacyWebviewEditor = !legacy;
    report.checks.groupCount = groups.length;
    report.checks.noFourColumnLayout = groups.length <= 2;
    if (mode !== 'restore') await exerciseNativeLanguageService(report);
    const commonPassed = report.checks.extensionActive
      && report.checks.version === '0.79.116'
      && report.checks.nativeTab
      && report.checks.allConnectedNativeTabs
      && report.checks.noLegacyWebviewEditor;
    const languagePassed = mode === 'restore' || (report.checks.nativeLanguageId === 'zss'
      && report.checks.missingCommandDiagnostic
      && report.checks.nativeEditApplied
      && report.checks.nativeDirtyAfterEdit
      && report.checks.nativeUndoRestored
      && report.checks.nativeCleanAfterUndo);
    const browserChromePassed = mode === 'native' || (report.checks.navigationToolbarSlots === 26
      && report.checks.navigationSlider
      && report.checks.navigationArrows
      && report.checks.navigationModes
      && report.checks.navigationFilesListed
      && report.checks.assistanceToolbarSlots === 0
      && report.checks.assistanceSections
      && report.checks.engineProfileVisible
      && Boolean(report.checks.nightlyStringStatus)
      && report.checks.stableProfileHidesNightlyStrings
      && report.checks.verifiedNightlyEnablesStrings);
    report.passed = mode === 'native'
      ? commonPassed && languagePassed && !navigation && !assistance && groups.length === 1
      : commonPassed && languagePassed && browserChromePassed
        && report.checks.navigationTab
        && report.checks.assistanceTab
        && report.checks.companionsShareGroup
        && report.checks.nativeUsesSeparateGroup
        && report.checks.noFourColumnLayout;
    if (!report.passed) throw new Error('The live Coding Viewer layout did not satisfy its acceptance contract.');
    if (mode === 'restore' && restoreMarker) { try { fs.rmSync(restoreMarker, { force:true }); } catch (_) {} }
  } catch (error) {
    report.error = error?.stack || error?.message || String(error);
    if (mode === 'restore' && restoreMarker) { try { fs.rmSync(restoreMarker, { force:true }); } catch (_) {} }
  } finally {
    if (reloading) return;
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await wait(500);
    await vscode.commands.executeCommand('workbench.action.closeWindow');
  }
}

module.exports = { activate, deactivate() {} };
