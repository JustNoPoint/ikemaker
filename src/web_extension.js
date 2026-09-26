'use strict';

// Browser entry point. Keep this file self-contained: VS Code web extension
// hosts provide only the `vscode` require shim and do not expose Node modules.
const vscode = require('vscode');
const PACKAGE_VERSION = '0.78.9';

const FALLBACK_COMMANDS = [
  'air.assignClsn2HitReactionRegion', 'air.batchApplyClsn2', 'air.createNew', 'air.deleteSelectedFromViewer', 'air.generateGuardProximityHelper', 'air.openActionLog', 'air.refreshActionLog', 'air.openAnimationPreview',
  'ikemen.authoringBridge.install', 'ikemen.animationStandards.open', 'ikemen.authoringBridge.openGuide',
  'cns.scaleSelectedSizebox', 'cns.createNew', 'inp.createNew', 'cmd.createNew', 'ikemen.character.createNew', 'ikemen.character.open', 'ikemen.character.close', 'ikemen.stage.close', 'ikemen.context.closeCurrent', 'ikemen.characterDependencies.open', 'ikemen.characterHealth.open', 'ikemen.cnsConverter.open', 'ikemen.cnsConverter.character', 'ikemen.relatedWork.open', 'ikemen.navigation.openDefinition', 'ikemen.viewer.openReference', 'ikemen.viewer.back', 'ikemen.viewer.forward', 'ikemen.launchGame', 'ikemen.launchMirrorCurrent', 'ikemen.launchTrainingConfigured', 'ikemen.launchTrainingCurrent', 'ikemen.mutations.openHistory', 'ikemen.openControls',
  'ikemen.context.show', 'ikemen.context.openRegistry', 'ikemen.context.migrateRegistry', 'ikemen.context.indexMetadata', 'ikemen.projectProfile.create', 'ikemen.projectManager.open', 'ikemen.engineRegistry.open', 'ikemen.engineMigration.review', 'ikemen.engineMigration.installRetained', 'ikemen.chooseOpeningSidebar',
  'ikemen.workspacePreset.save', 'ikemen.workspacePreset.restore', 'ikemen.workspacePreset.delete',
  'ikemen.impact.preview',
  'ikemen.maps.openBrowser', 'ikemen.maps.insert', 'ikemen.maps.configureTextGrammar',
  'ikemen.ownership.auditDef',
  'ikemen.stage.openWorkspace', 'ikemen.stage.createNew', 'ikemen.stage.launchRig',
  'ikemen.def.createNew', 'ikemen.def.openVisualWorkspace', 'ikemen.file.createNew', 'ikemen.lua.createNew', 'ikemen.text.createNew',
  'ikemen.stage.createInteraction',
  'ikemen.ui.openWorkspace', 'ikemen.ui.createNew',
  'ikemen.ui.openLuaModule',
  'ikemen.ui.generateCharacterBridge', 'ikemen.ui.createPreviewProfile',
  'ikemen.commandMovelist.openEditor',
  'ikemen.selectDef.openWorkspace',
  'ikemen.selectDef.openLayoutBuilder',
  'ikemen.menuModes.openPlayer', 'ikemen.menuModes.openCreator',
  'ikemen.storyDialogue.openPlayer', 'ikemen.storyDialogue.openCreator',
  'ikemen.storyboard.create', 'ikemen.storyboard.createOpening', 'ikemen.storyboard.createEnding', 'ikemen.storyboard.open',
  'ikemen.paletteOrganizer.open', 'ikemen.palettePlayer.open', 'ikemen.palettePlayer.organize', 'ikemen.palettePlayer.finishStaged',
  'ikemen.moveConstants.open', 'ikemen.moveLab.open', 'ikemen.hitDef.openEditor', 'ikemen.throwCreator.open', 'ikemen.throwCreator.openGuide', 'ikemen.explodComposer.open', 'ikemen.positionCamera.open', 'ikemen.helperLab.open', 'ikemen.paletteImport.open', 'ikemen.artistIntake.open',
  'ikemen.changeMode', 'ikemen.openHome', 'ikemen.workspaceSetup.change', 'ikemen.workspaceSetup.showAll', 'ikemen.workspaceSetup.pin', 'ikemen.configureAssetWorkspace', 'ikemen.makeBackup', 'ikemen.toggleAutoSave',
  'ikemen.productionWorkflow.open', 'ikemen.productionWorkflow.editProfile', 'ikemen.productionWorkflow.openGuide',
  'ikemen.testSessions.open',
  'ikemen.release.captureDefaults', 'ikemen.release.openProfile', 'ikemen.release.audit', 'ikemen.release.complete',
  'ikemen.codeStructure.openWorkspace', 'ikemen.docs.updateOffline',
  'ikemen.openPaletteFolder', 'ikemen.setDefaultTrainingCharacter', 'ikemen.setDefaultTrainingStage',
  'ikemen.workbench.addCurrentFile', 'ikemen.workbench.create', 'ikemen.workbench.open', 'ikemen.workbench.openAllCode',
  'ikemen.workbench.refresh', 'ikemen.workbench.remove', 'sff.addCharacterRequirement', 'sff.auditCharacterRequirements',
  'sff.applyProjectIndexing', 'sff.buildApprovedManifest', 'sff.cropArchive', 'sff.chooseImageEditor', 'sff.createMissingAxisCopies', 'sff.createNew', 'sff.createProjectBuildProfile', 'sff.generateBuildFiles', 'sff.openGroupLog', 'sff.refreshGroupLog',
  'sff.deleteSelectedFromViewer', 'sff.importLayerFolder', 'sff.openAliasRegistry', 'sff.openAssembly', 'sff.openProjectBuildProfile', 'sff.openRequirementsProfile', 'sff.openSprMakerText', 'sff.openViewer',
  'sff.reviewDismissedLayerWarnings', 'sff.reviewLayerParts', 'sff.reviewRedundantLayers', 'sff.reviewUnassignedSprites',
  'snd.chooseAudioEditor', 'snd.createNew', 'snd.deleteSelectedFromViewer', 'snd.openMakerText', 'snd.openViewer', 'zss.audit.currentFile', 'zss.audit.workspace', 'zss.openControllers',
  'zss.createNew', 'zss.openPalFxEditor', 'zss.openProjectData', 'zss.updates.checkDefNow', 'zss.updates.checkNow',
  'zss.updates.showLastReport', 'zss.wrap.ignoreHitPause', 'zss.wrap.ignoreHitPausePersistent', 'zss.wrap.persistent',
  'zssControllers.clearFilter', 'zssControllers.insert', 'zssControllers.openDocs', 'zssControllers.search',
  'zssNavigator.refresh', 'zssNavigator.reveal', 'zssRegistry.refresh'
];

function userAgent() { try { return String(globalThis.navigator && globalThis.navigator.userAgent || ''); } catch (_) { return ''; } }
function mobileHost() { const value = userAgent().toLowerCase(); return /iphone|ipad|ipod/.test(value) ? 'iPhone/iPad browser host' : /android/.test(value) ? 'Android browser host' : 'VS Code browser host'; }
function unavailable(feature) { return vscode.window.showInformationMessage(`${feature} is not available in the ${mobileHost()}. Portable browser support is being enabled feature-by-feature; no native executable will be represented as working here.`); }

async function openBundled(context, name) {
  const uri = vscode.Uri.joinPath(context.extensionUri, 'data', name);
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document, { preview: false });
}

async function showCapabilities() {
  const text = [
    '# IKEMaker — Browser Host', '', `Host: ${mobileHost()}`, '',
    '## Available now', '- Language grammars and snippets', '- Normal VS Code text editing', '- Portable state-controller catalog and reviewed insertion', '- Portable ZSS/CNS/Lua structure outline', '- Lightweight current-file ZSS review', '- This platform report and mobile compatibility documentation', '',
    '## Not yet implemented in this browser build', '- AIR visual editing', '- SFF archive parsing/workspace', '- SND archive parsing/workspace', '- complete desktop project audits and generated metadata', '',
    '## Unavailable by design', '- Native SprMaker2/SndMaker execution', '- desktop image/audio editors', '- IKEMEN process launch', '',
    'Unavailable commands display an explanation rather than attempting a desktop executable.'
  ].join('\n');
  const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: text });
  await vscode.window.showTextDocument(document, { preview: false });
}

async function showVersion() {
  const action = await vscode.window.showInformationMessage(`IKEMaker ${PACKAGE_VERSION} is installed.`, 'Open IKEMaker', 'Copy Version');
  if (action === 'Open IKEMaker') await vscode.commands.executeCommand('ikemen.openTools');
  if (action === 'Copy Version') await vscode.env.clipboard.writeText(PACKAGE_VERSION);
}

async function configureExperience() {
  const domains = ['zss', 'lua', 'cns', 'assets', 'stageUi'];
  const picked = await vscode.window.showQuickPick([
    { label: 'CNS Veteran / Learning ZSS and Lua', values: ['learning', 'learning', 'advanced', 'advanced', 'learning'] },
    { label: 'Learning All Areas', values: domains.map(() => 'learning') },
    { label: 'Advanced All Areas', values: domains.map(() => 'advanced') },
    { label: 'Customize Each Area…', custom: true }
  ], { title: 'Configure IKEMEN authoring experience' });
  if (!picked) return;
  if (picked.custom) {
    picked.values = [];
    for (const domain of domains) {
      const choice = await vscode.window.showQuickPick([
        { label: 'Learning', value: 'learning', description: 'Expanded explanations and teaching.' },
        { label: 'Advanced', value: 'advanced', description: 'Compact presentation with help retained.' }
      ], { title: `${domain} experience` });
      if (!choice) return;
      picked.values.push(choice.value);
    }
  }
  const config = vscode.workspace.getConfiguration('ikemenZss');
  for (let index = 0; index < domains.length; index += 1) await config.update(`experience.${domains[index]}`, picked.values[index], vscode.ConfigurationTarget.Workspace);
  vscode.window.showInformationMessage(`IKEMEN experience updated: ${picked.label}`);
}

function decode(bytes) { return new TextDecoder('utf-8').decode(bytes); }
async function readCatalog(context, name = 'sctrl.json') {
  try { return JSON.parse(decode(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(context.extensionUri, 'data', name)))); }
  catch (_) { return []; }
}
function controllerName(value) { const name = String(value || '').replace(/BG/g, 'Bg').replace(/FX/g, 'Fx').replace(/ID/g, 'Id'); return name.charAt(0).toLowerCase() + name.slice(1); }
function cleanValue(value) { return String(value == null ? '' : value).replace(/[\r\n]+/g, ' ').trim().replace(/;+\s*$/, ''); }
function snippetValue(value) { return String(value || 'value').replace(/[\\$}]/g, '\\$&').replace(/[\r\n]+/g, ' '); }
function controllerSnippet(controller, learning = true) {
  const required = (controller.params || []).filter((item) => item.required), lines = [`${controllerName(controller.name)}{`];
  required.forEach((item, index) => lines.push(`\t${item.name}: \${${index + 1}:${snippetValue(item.placeholder)}};`));
  if (learning && required.length) lines.push('\t# Add optional options with editor completion or the controller wizard.');
  lines.push('}'); return lines.join('\n');
}
function signatureSnippet(entry) {
  const signature = String(entry.signature || entry.name || ''), open = signature.indexOf('('), close = signature.lastIndexOf(')');
  if (open < 0 || close < open) return entry.name;
  const args = signature.slice(open + 1, close).split(',').map((item) => item.trim()).filter(Boolean);
  return `${entry.name}(${args.map((item, index) => `\${${index + 1}:${snippetValue(item.replace(/\*$/, ''))}}`).join(', ')})`;
}
function catalogHover(entry, kind) {
  const value = new vscode.MarkdownString(undefined, true); value.isTrusted = false;
  value.appendMarkdown(`### ${entry.signature || entry.name}\n\n${entry.description || `IKEMEN 1.0 ${kind}.`}\n\nBundled IKEMEN 1.0 documentation.`);
  return value;
}
async function chooseController(catalog, title = 'Choose IKEMEN 1.0 state controller') {
  const picked = await vscode.window.showQuickPick(catalog.map((controller) => ({ label: controller.name, description: controller.description, controller })), { title });
  return picked && picked.controller;
}
async function insertController(catalog, supplied) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'zss') return vscode.window.showWarningMessage('Open a ZSS file before inserting a state controller.');
  const controller = supplied && supplied.name ? supplied : await chooseController(catalog);
  if (!controller) return;
  const required = (controller.params || []).filter((item) => item.required), optional = (controller.params || []).filter((item) => !item.required);
  const selected = optional.length ? await vscode.window.showQuickPick(optional.map((parameter) => ({ label: parameter.name, description: `Optional · ${parameter.placeholder || 'value'}`, parameter })), { title: `${controller.name} options`, placeHolder: `Required: ${required.map((item) => item.name).join(', ') || 'none'}`, canPickMany: true }) : [];
  if (selected === undefined) return;
  const parameters = [...required, ...selected.map((item) => item.parameter)], values = {};
  for (const parameter of parameters) {
    const value = await vscode.window.showInputBox({ title: `${controller.name}.${parameter.name}`, placeHolder: parameter.placeholder || 'value', validateInput: (text) => text.trim() ? undefined : 'Enter a reviewed value.' });
    if (value === undefined) return;
    values[parameter.name] = cleanValue(value);
  }
  const experience = vscode.workspace.getConfiguration('ikemenZss', editor.document.uri).get('experience.zss', 'learning');
  const lines = [];
  if (experience === 'learning') lines.push(`# ${controller.name} — ${String(controller.description || 'IKEMEN 1.0 state controller').replace(/[\r\n]+/g, ' ')}`);
  lines.push(`${controllerName(controller.name)}{`);
  for (const parameter of parameters) lines.push(`\t${parameter.name}: ${values[parameter.name]};`);
  lines.push('}');
  await editor.edit((builder) => builder.insert(editor.selection.active, `${lines.join('\n')}\n`));
}

class WebControllerProvider {
  constructor(catalog) { this.catalog = catalog; this.filter = ''; this.emitter = new vscode.EventEmitter(); this.onDidChangeTreeData = this.emitter.event; }
  getTreeItem(item) { return item; }
  getChildren() {
    const query = this.filter.toLowerCase();
    return this.catalog.filter((item) => !query || `${item.name} ${item.description} ${(item.params || []).map((p) => p.name).join(' ')}`.toLowerCase().includes(query)).map((controller) => {
      const item = new WebItem(controller.name, 'zssControllers.insert', `${(controller.params || []).filter((p) => p.required).length} required · ${(controller.params || []).length} total`);
      item.command.arguments = [controller]; item.tooltip = controller.description; item.iconPath = new vscode.ThemeIcon('symbol-method'); return item;
    });
  }
  setFilter(value) { this.filter = String(value || ''); this.emitter.fire(undefined); }
}

function portableStructure(document) {
  const lines = document.getText().split(/\r?\n/), rows = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index], zss = /^\s*\[\s*(StateDef|Function)\s+([^;\]]+)/i.exec(line), cns = /^\s*\[\s*(StateDef|State)\s+([^\]]+)/i.exec(line), lua = /^\s*(?:local\s+)?function\s+([\w.:]+)/.exec(line), controller = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\{/.exec(line);
    if (zss) rows.push([index + 1, zss[1], zss[2].trim()]);
    else if (cns) rows.push([index + 1, cns[1], cns[2].trim()]);
    else if (lua) rows.push([index + 1, 'function', lua[1]]);
    else if (controller && !/^(?:if|else|for|while|switch)$/i.test(controller[1])) rows.push([index + 1, 'controller', controller[1]]);
  }
  return [`# ${document.fileName.split(/[\\/]/).pop()} — Portable Structure`, '', 'Browser-safe text outline. Open the source file to edit; this report does not modify it.', '', ...rows.map(([line, kind, name]) => `- Line ${line} · ${kind}: ${name}`), ...(rows.length ? [] : ['- No supported structure blocks were recognized.'])].join('\n');
}
async function openPortableStructure() {
  const source = vscode.window.activeTextEditor && vscode.window.activeTextEditor.document;
  if (!source) return vscode.window.showWarningMessage('Open a ZSS, CNS, or Lua file first.');
  const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: portableStructure(source) });
  await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.Beside });
}
function portableCode(line) {
  let quote = false, result = '';
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index - 1] !== '\\') { quote = !quote; result += ' '; continue; }
    if (character === '#' && !quote) return result;
    result += quote ? ' ' : character;
  }
  return result;
}
function portableAudit(document, options = {}) {
  const text = document.getText(), findings = [], braces = (text.match(/\{/g) || []).length - (text.match(/\}/g) || []).length;
  if (braces) findings.push(`Brace balance differs by ${braces}.`);
  text.split(/\r?\n/).forEach((line, index) => {
    const code = portableCode(line);
    if (/\btime\s*=\s*0\b/i.test(code)) findings.push(`Line ${index + 1}: review time = 0 ownership, especially in negative StateDefs.`);
    if (options.authorName && options.opponentAvailability !== 'off' && /\bp2\s*,/i.test(code)) findings.push(`Line ${index + 1}: author-rule heuristic — review this P2 redirect's persistent selected-opponent contract; it is not simply enemyNear or inherently wrong in Simul.`);
  });
  return [`# Portable ZSS Review`, '', 'This browser-safe review is deliberately smaller than the desktop analyzer. It does not modify the file.', '', ...(findings.length ? findings.map((item) => `- ${item}`) : ['- No portable-review findings. Use the desktop analyzer for the complete safety audit.'])].join('\n');
}
async function auditCurrentFile() {
  const source = vscode.window.activeTextEditor && vscode.window.activeTextEditor.document;
  if (!source || source.languageId !== 'zss') return vscode.window.showWarningMessage('Open a ZSS file first.');
  const config = vscode.workspace.getConfiguration('ikemenZss', source.uri), authorName = String(config.get('authorName', '') || '').trim();
  const opponentAvailability = authorName ? config.get('authorRules.opponentAvailability', 'off') : 'off';
  const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: portableAudit(source, { opponentAvailability, authorName }) });
  await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.Beside });
}

class WebItem extends vscode.TreeItem {
  constructor(label, command, description = '') { super(label, vscode.TreeItemCollapsibleState.None); this.description = description; if (command) this.command = { command, title: label }; }
}
class WebToolsProvider {
  getTreeItem(item) { return item; }
  getChildren() { return [
    new WebItem('Configure Learning / Advanced Experience', 'ikemen.experience.configure'),
    new WebItem('Platform Capabilities', 'ikemen.showPlatformCapabilities'),
    new WebItem('Bundled Build Toolchain', 'ikemen.showBundledToolchain'),
    new WebItem('Recommended Lua Authoring Support', 'ikemen.luaSupport.status'),
    new WebItem('Help & Learning Center', 'ikemen.help.open'),
    new WebItem('Offline Documentation Library', 'ikemen.docs.openOffline'),
    new WebItem('Android / iPhone Print Sheet', 'ikemen.openMobileFeatureMatrix'),
    new WebItem('Coder SFF Standard', 'sff.showNamingStandard'),
    new WebItem('Artist Handoff Guide', 'sff.showArtistHandoffGuide')
  ]; }
}
class PendingProvider {
  constructor(label) { this.label = label; }
  getTreeItem(item) { return item; }
  getChildren() { return [new WebItem(this.label, 'ikemen.showPlatformCapabilities', 'browser foundation')]; }
}

function placeholderHtml(kind) {
  return `<!doctype html><html><body style="font-family:system-ui;padding:24px"><h2>${kind} mobile workspace</h2><p>The archive was not modified.</p><p>The browser-safe parser and writer adapter for this workspace is still being migrated. Native desktop tools are intentionally not invoked or emulated.</p><p>Use <b>IKEMEN: Show Platform Capabilities</b> for the verified platform contract.</p></body></html>`;
}

function registerPlaceholderEditor(context, viewType, kind) {
  context.subscriptions.push(vscode.window.registerCustomEditorProvider(viewType, {
    async openCustomDocument(uri) { return { uri, dispose() {} }; },
    async resolveCustomEditor(_document, panel) { panel.webview.options = { enableScripts: false }; panel.webview.html = placeholderHtml(kind); }
  }, { webviewOptions: { retainContextWhenHidden: true }, supportsMultipleEditorsPerDocument: false }));
}

async function activate(context) {
  const controllerCatalog = await readCatalog(context), triggerCatalog = await readCatalog(context, 'triggers.json'), luaCatalog = await readCatalog(context, 'lua-api.json'), controllers = new WebControllerProvider(controllerCatalog);
  if (typeof vscode.window.createStatusBarItem === 'function') {
    const alignment = vscode.StatusBarAlignment ? vscode.StatusBarAlignment.Left : undefined;
    const status = vscode.window.createStatusBarItem(alignment, 100);
    status.name = 'IKEMaker Version'; status.text = `$(tools) IKEMaker ${PACKAGE_VERSION}`; status.tooltip = 'Installed IKEMaker version'; status.command = 'ikemen.showVersion'; status.show();
    context.subscriptions.push(status);
  }
  for (const [key, value] of Object.entries({ web: true, android: /android/i.test(userAgent()), ios: /iphone|ipad|ipod/i.test(userAgent()), nativeBuilders: false, externalEditors: false, ikemenLaunch: false })) vscode.commands.executeCommand('setContext', `ikemen.capability.${key}`, value);
  context.subscriptions.push(
    vscode.commands.registerCommand('ikemen.openTools', () => vscode.commands.executeCommand('workbench.view.extension.ikemen')),
    vscode.commands.registerCommand('ikemen.showVersion', showVersion),
    vscode.commands.registerCommand('ikemen.windowsFileAssociations.configure', () => vscode.window.showInformationMessage('Windows file-opening integration is available in the Windows desktop build of IKEMaker.')),
    vscode.commands.registerCommand('ikemen.openLauncherSettings', () => vscode.commands.executeCommand('workbench.action.openSettings', '@ext:justnopoint.ikemen-zss-tools training')),
    vscode.commands.registerCommand('ikemen.openExtensionSettings', () => vscode.commands.executeCommand('workbench.action.openSettings', '@ext:justnopoint.ikemen-zss-tools')),
    vscode.commands.registerCommand('ikemen.extensionUpdates.check', () => vscode.window.showInformationMessage('IKEMaker package updates are installed through the desktop build. Browser-hosted VS Code cannot install the Windows tester VSIX.')),
    vscode.commands.registerCommand('ikemen.extensionUpdates.settings', () => vscode.commands.executeCommand('workbench.action.openSettings', 'ikemenZss.extensionUpdates')),
    vscode.commands.registerCommand('ikemen.experience.configure', configureExperience),
    vscode.commands.registerCommand('ikemen.showPlatformCapabilities', showCapabilities),
    vscode.commands.registerCommand('ikemen.showBundledToolchain', () => vscode.window.showInformationMessage('SprMaker2 and SndMaker are included in the Windows desktop package. Browser and mobile VS Code cannot execute Windows native builders.')),
    vscode.commands.registerCommand('ikemen.luaSupport.status', () => vscode.window.showInformationMessage('Lua Language Server by sumneko is the recommended general Lua editor. IKEMEN API completion and offline documentation remain available in this browser build.')),
    vscode.commands.registerCommand('ikemen.luaSupport.installDefinitions', () => vscode.window.showInformationMessage('Project LuaLS definition installation requires the desktop extension and a local project folder.')),
    vscode.commands.registerCommand('ikemen.openMobileFeatureMatrix', () => openBundled(context, 'mobile-platform-feature-matrix.md')),
    vscode.commands.registerCommand('ikemen.openStageScreenpackSpec', () => openBundled(context, 'stage-screenpack-workspace-spec.md')),
    vscode.commands.registerCommand('ikemen.animationStandards.open', () => openBundled(context, 'animation-standards.json')),
    vscode.commands.registerCommand('ikemen.authoringBridge.openGuide', () => openBundled(context, 'authoring-bridge/README.md')),
    vscode.commands.registerCommand('ikemen.help.open', () => openBundled(context, 'offline-docs/README.md')),
    vscode.commands.registerCommand('ikemen.docs.openOffline', () => openBundled(context, 'offline-docs/README.md')),
    vscode.commands.registerCommand('sff.showNamingStandard', () => openBundled(context, 'sff-standard.md')),
    vscode.commands.registerCommand('sff.showArtistHandoffGuide', () => openBundled(context, 'sff-artist-guide.md')),
    vscode.commands.registerCommand('zss.goToLine', async () => { const editor = vscode.window.activeTextEditor; if (!editor) return; const value = await vscode.window.showInputBox({ title: 'Go to line', validateInput: (text) => /^\d+$/.test(text) ? undefined : 'Enter a line number.' }); if (!value) return; const line = Math.max(0, Math.min(editor.document.lineCount - 1, Number(value) - 1)); editor.selection = new vscode.Selection(line, 0, line, 0); editor.revealRange(new vscode.Range(line, 0, line, 0)); }),
    vscode.commands.registerCommand('zss.toggleLineComment', () => vscode.commands.executeCommand('editor.action.commentLine')),
    vscode.commands.registerCommand('ikemen.codeStructure.openWorkspace', openPortableStructure),
    vscode.commands.registerCommand('zss.audit.currentFile', auditCurrentFile),
    vscode.commands.registerCommand('zss.openControllers', () => vscode.commands.executeCommand('zssStateControllers.focus')),
    vscode.commands.registerCommand('zssControllers.insert', (controller) => insertController(controllerCatalog, controller)),
    vscode.commands.registerCommand('zssControllers.search', async () => { const value = await vscode.window.showInputBox({ title: 'Filter IKEMEN 1.0 controllers', value: controllers.filter }); if (value !== undefined) controllers.setFilter(value); }),
    vscode.commands.registerCommand('zssControllers.clearFilter', () => controllers.setFilter('')),
    vscode.commands.registerCommand('zssControllers.openDocs', async (controller) => {
      const selected = controller && controller.name ? controller : await chooseController(controllerCatalog, 'Open bundled controller reference');
      if (!selected) return;
      const content = [`# ${selected.name}`, '', selected.description || 'IKEMEN 1.0 state controller.', '', '## Options', '', ...(selected.params || []).map((item) => `- ${item.name} — ${item.required ? 'required' : 'optional'} — ${item.placeholder || 'value'}`)].join('\n');
      const document = await vscode.workspace.openTextDocument({ language: 'markdown', content }); await vscode.window.showTextDocument(document, { preview: false });
    }),
    vscode.window.registerTreeDataProvider('ikemen.tools', new WebToolsProvider()),
    vscode.window.registerTreeDataProvider('ikemen.characterWorkbenches', new PendingProvider('Character workbench migration pending')),
    vscode.window.registerTreeDataProvider('zssNavigator', new PendingProvider('Portable code navigator migration pending')),
    vscode.window.registerTreeDataProvider('zssRegistry', new PendingProvider('Portable project registry migration pending')),
    vscode.window.registerTreeDataProvider('zssStateControllers', controllers)
  );
  context.subscriptions.push(vscode.languages.registerCompletionItemProvider([{ language: 'zss' }, { language: 'ikemen-cns' }, { language: 'lua' }], {
    provideCompletionItems(document, position) {
      const prefix = document.lineAt(position.line).text.slice(0, position.character);
      if (document.languageId === 'lua') {
        if (!/(?:^|[=,(]|\breturn\s+|\bthen\s+|\band\s+|\bor\s+|\bnot\s+|\.)\s*[A-Za-z0-9_.]*$/i.test(prefix)) return [];
        return luaCatalog.filter((entry) => entry.kind !== 'hook').map((entry, index) => { const item = new vscode.CompletionItem(entry.name, vscode.CompletionItemKind.Function); item.detail = `IKEMEN 1.0 Lua · ${entry.category}`; item.documentation = entry.description; item.insertText = new vscode.SnippetString(signatureSnippet(entry)); item.sortText = `2-${String(index).padStart(4, '0')}`; return item; });
      }
      if (document.languageId === 'ikemen-cns') {
        if (!/^\s*type\s*=\s*[A-Za-z0-9_]*$/i.test(prefix)) return [];
        return controllerCatalog.map((controller, index) => { const item = new vscode.CompletionItem(controller.name, vscode.CompletionItemKind.Class); item.detail = 'IKEMEN 1.0 state controller · portable'; item.documentation = controller.description; item.insertText = controller.name; item.sortText = `1-${String(index).padStart(4, '0')}`; return item; });
      }
      const expression = /(?:\b(?:if|else\s+if)\s+|[=:(,]|&&|\|\|)\s*[A-Za-z0-9_.]*$/i.test(prefix);
      if (expression) return triggerCatalog.map((entry, index) => { const item = new vscode.CompletionItem(entry.name, vscode.CompletionItemKind.Function); item.detail = `IKEMEN 1.0 ${entry.kind || 'trigger'} · portable`; item.documentation = entry.description; item.insertText = new vscode.SnippetString(signatureSnippet(entry)); item.sortText = `2-${String(index).padStart(4, '0')}`; return item; });
      if (!/^\s*[A-Za-z0-9_]*$/.test(prefix)) return [];
      const learning = vscode.workspace.getConfiguration('ikemenZss', document.uri).get('experience.zss', 'learning') !== 'advanced';
      return controllerCatalog.map((controller, index) => { const item = new vscode.CompletionItem(controllerName(controller.name), vscode.CompletionItemKind.Class); item.detail = 'IKEMEN 1.0 state controller · portable'; item.documentation = controller.description; item.insertText = new vscode.SnippetString(controllerSnippet(controller, learning)); item.sortText = `1-${String(index).padStart(4, '0')}`; return item; });
    }
  }, ':', '=', '(', ','));
  context.subscriptions.push(vscode.languages.registerHoverProvider([{ language: 'zss' }, { language: 'ikemen-cns' }, { language: 'lua' }], {
    provideHover(document, position) {
      const range = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_.]*/); if (!range) return undefined;
      const word = document.getText(range).toLowerCase();
      const catalog = document.languageId === 'lua' ? luaCatalog : [...controllerCatalog, ...triggerCatalog];
      const entry = catalog.find((item) => String(item.name || '').toLowerCase() === word || controllerName(item.name).toLowerCase() === word);
      return entry ? new vscode.Hover(catalogHover(entry, document.languageId === 'lua' ? 'Lua API' : 'native symbol'), range) : undefined;
    }
  }));
  const registered = new Set(['ikemen.openTools', 'ikemen.showVersion', 'ikemen.windowsFileAssociations.configure', 'ikemen.openLauncherSettings', 'ikemen.openExtensionSettings', 'ikemen.extensionUpdates.check', 'ikemen.extensionUpdates.settings', 'ikemen.experience.configure', 'ikemen.showPlatformCapabilities', 'ikemen.showBundledToolchain', 'ikemen.luaSupport.status', 'ikemen.luaSupport.installDefinitions', 'ikemen.openMobileFeatureMatrix', 'ikemen.openStageScreenpackSpec', 'ikemen.animationStandards.open', 'ikemen.authoringBridge.openGuide', 'ikemen.help.open', 'ikemen.docs.openOffline', 'sff.showNamingStandard', 'sff.showArtistHandoffGuide', 'zss.goToLine', 'zss.toggleLineComment', 'ikemen.codeStructure.openWorkspace', 'zss.audit.currentFile', 'zss.openControllers', 'zssControllers.insert', 'zssControllers.search', 'zssControllers.clearFilter', 'zssControllers.openDocs']);
  for (const command of FALLBACK_COMMANDS) if (!registered.has(command)) context.subscriptions.push(vscode.commands.registerCommand(command, () => unavailable(command)));
  registerPlaceholderEditor(context, 'ikemen.sffWorkspace', 'SFF');
  registerPlaceholderEditor(context, 'ikemen.sndWorkspace', 'SND');
}

function deactivate() {}
module.exports = { activate, deactivate, controllerName, controllerSnippet, signatureSnippet, portableStructure, portableAudit };
