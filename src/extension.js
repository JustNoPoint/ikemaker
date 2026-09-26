'use strict';

const vscode = require('vscode');
const { preferredViewerColumn, trackViewerPanel } = require('./viewer_group');
const path = require('path');
const fs = require('fs');
const { parseZss, displayName } = require('./parser');
const controllerCatalog = require('../data/sctrl.json');
const { controllerAuthoringPlan, controllerAuthoringText, cnsControllerAuthoringText } = require('./controller_authoring');
const { leadingWhitespace, wrapText } = require('./wrappers');
const {
  parseNumberSet,
  parseSelectedClsn2,
  batchApplyClsn2,
  generateGuardProximity,
  updateGuardHelperZss
} = require('./air');
const { analyzeZss } = require('./analyzer');
const { createUpdateMonitor } = require('./updater');
const { registerExtensionUpdater } = require('./extension_updater');
const engineRuntime = require('./engine_runtime');
const { auditFirstActiveElements } = require('./frame_sync');
const { selectedClsn2, updateStateRegionAssignments } = require('./region_assign');
const { parseSizeboxLine, readCharacterScale, scaleSizebox, formatScaledLine } = require('./sizebox');
const { registerSffCommands } = require('./sff_commands');
const { registerSffViewer } = require('./sff_viewer');
const { registerAirViewer } = require('./air_viewer');
const { registerSndViewer } = require('./snd_viewer');
const { registerDirectAssetOpening } = require('./direct_asset_opening');
const { registerAssetGroupLogs } = require('./asset_group_logs');
const { registerCharacterWorkbenches } = require('./character_workbenches');
const { registerCharacterDependencyWorkspace } = require('./character_dependency_workspace');
const { registerCharacterHealthWorkspace } = require('./character_health_workspace');
const { registerCnsConverter } = require('./cns_converter_workspace');
const { registerProjectContext } = require('./project_context_ui');
const { registerProjectManagerWorkspace } = require('./project_manager_workspace');
const { registerEngineMigration } = require('./engine_migration_ui');
const { registerWorkspacePresets } = require('./workspace_presets');
const { registerImpactPreview } = require('./impact_preview');
const { registerOwnershipAudit } = require('./ownership_audit_workspace');
const { registerStageWorkspace } = require('./stage_workspace');
const { registerScreenpackWorkspace } = require('./screenpack_workspace');
const { registerCommandMovelistWorkspace } = require('./command_movelist_workspace');
const { registerCodeStructureWorkspace } = require('./code_structure_workspace');
const { registerSelectDefWorkspace } = require('./select_def_workspace');
const { registerMenuModesWorkspace } = require('./menu_modes_workspace');
const { registerStoryDialogueWorkspace } = require('./story_dialogue_workspace');
const { registerStoryboardWorkspace } = require('./storyboard_workspace');
const { registerPaletteIndexOrganizer } = require('./palette_index_organizer_workspace');
const { registerMoveConstantsWorkspace } = require('./move_constants_workspace');
const { registerMoveLab } = require('./move_lab_workspace');
const { registerHitDefWorkspace } = require('./hitdef_workspace');
const { registerThrowCreator } = require('./throw_creator_workspace');
const { registerSpatialComposer } = require('./spatial_composer_workspace');
const { registerHelperLab } = require('./helper_workspace');
const { registerPaletteImportWorkspace } = require('./palette_import_workspace');
const { registerArtistIntake } = require('./artist_intake_workspace');
const { registerSffAssembly } = require('./sff_assembly_workspace');
const { registerProductionWorkflow } = require('./production_workflow_workspace');
const { registerReleaseBuilder } = require('./release_builder');
const { registerTestSessionWorkspace } = require('./test_session_workspace');
const { registerRelatedWork } = require('./related_work');
const { registerOfflineDocs } = require('./offline_docs');
const { registerHelpWorkspace } = require('./help_workspace');
const { registerAssetCreation } = require('./asset_creation');
const { registerExperience } = require('./experience');
const { registerLanguageProviders } = require('./language_providers');
const { registerDefSemanticHighlighting } = require('./def_semantics');
const { registerNavigationProviders } = require('./navigation_providers');
const { registerMutationHistory } = require('./mutation_history');
const { registerDiagnosticExplanations } = require('./diagnostic_explanations');
const { registerAnimationStandardDiagnostics } = require('./animation_standard_diagnostics');
const { registerAuthoringBridge } = require('./authoring_bridge');
const { openPalFxPresetEditor } = require('./palfx_editor');
const { detectCapabilities, capabilitySummary } = require('./platform_capabilities');
const { toolchainStatus } = require('./bundled_tools');
const { registerLuaSupport } = require('./lua_support');
const validationLevels = require('./validation_levels');
const metadataRegistry = require('./metadata_registry');
const { SignatureCache } = require('./signature_cache');
const { ZssRegistryProvider } = require('./zss_registry_provider');

const diagnosticCollection = vscode.languages.createDiagnosticCollection('ikemen-zss');
const validationCache = new SignatureCache(16);

function configuredPrefixes(config, pluralKey, legacyKey) {
  const inspected = config.inspect(pluralKey) || {};
  const configured = [
    inspected.workspaceFolderLanguageValue,
    inspected.workspaceFolderValue,
    inspected.workspaceLanguageValue,
    inspected.workspaceValue,
    inspected.globalLanguageValue,
    inspected.globalValue
  ].find((value) => Array.isArray(value));
  if (configured) return configured;
  const legacy = config.get(legacyKey, '');
  return legacy ? [legacy] : [];
}

function analyzerOptions(resource) {
  const config = vscode.workspace.getConfiguration('ikemenZss', resource);
  return {
    mapPrefixes: configuredPrefixes(config, 'mapPrefixes', 'mapPrefix'),
    functionPrefixes: configuredPrefixes(config, 'functionPrefixes', 'functionPrefix')
  };
}

function generatedSymbolPrefix(resource, specificKey) {
  const config = vscode.workspace.getConfiguration('ikemenZss', resource);
  return config.get(specificKey, '') || config.get('generatedSymbolPrefix', 'IkZss_');
}

function vscodeSeverity(severity) {
  return {
    error: vscode.DiagnosticSeverity.Error,
    warning: vscode.DiagnosticSeverity.Warning,
    convention: vscode.DiagnosticSeverity.Information,
    suggestion: vscode.DiagnosticSeverity.Hint,
    information: vscode.DiagnosticSeverity.Information,
    hint: vscode.DiagnosticSeverity.Hint
  }[severity] || vscode.DiagnosticSeverity.Warning;
}

function validationLevel(entry) {
  if (['map-prefix', 'function-prefix'].includes(String(entry.code))) return 'convention';
  return validationLevels.normalizeLevel(entry.severity);
}
function validationSettings(resource) {
  const config = vscode.workspace.getConfiguration('ikemenZss', resource), fallback = { enabledLevels: config.get('validation.enabledLevels', validationLevels.LEVELS), disabledConventionRules: config.get('validation.disabledConventionRules', []) };
  try {
    const filename = metadataRegistry.find(resource?.fsPath); if (!filename) return fallback;
    const stat = fs.statSync(filename), cached = validationCache.get(filename, stat); if (cached) return cached;
    const loaded = metadataRegistry.read(filename), settings = { ...fallback, ...(loaded.registry.validation || {}) }; return validationCache.set(filename, stat, settings);
  } catch (_) { return fallback; }
}

function analyzeDocument(document) {
  if (!document || document.languageId !== 'zss') return { issues: [], records: {} };
  const result = analyzeZss(document.getText(), analyzerOptions(document.uri));
  const settings = validationSettings(document.uri), diagnostics = result.issues.filter((entry) => validationLevels.enabled({ ...entry, level: validationLevel(entry) }, settings)).map((entry) => {
    const line = Math.min(entry.line, document.lineCount - 1);
    const max = document.lineAt(line).text.length;
    const range = new vscode.Range(line, Math.min(entry.start, max), line, Math.min(entry.start + entry.length, max));
    const diagnostic = new vscode.Diagnostic(range, entry.message, vscodeSeverity(validationLevel(entry)));
    diagnostic.code = entry.code;
    diagnostic.source = 'IKEMEN ZSS';
    if (entry.help) diagnostic.relatedInformation = [new vscode.DiagnosticRelatedInformation(
      new vscode.Location(document.uri, range), entry.help
    )];
    return diagnostic;
  });
  const retained = (diagnosticCollection.get(document.uri) || [])
    .filter((diagnostic) =>
      diagnostic.code === 'first-active-element-mismatch' ||
      diagnostic.code === 'idle-element-mismatch');
  diagnosticCollection.set(document.uri, [...diagnostics, ...retained]);
  return result;
}

async function auditFirstActiveElementConstants() {
  const limit = vscode.workspace.getConfiguration('ikemenZss').get('maxAuditFiles', 1000);
  const uris = await vscode.workspace.findFiles(
    '**/*.{zss,cns,air}',
    '**/{.git,node_modules}/**',
    limit
  );
  const files = [];
  const documents = new Map();
  for (const uri of uris) {
    const document = await vscode.workspace.openTextDocument(uri);
    files.push({ path: uri.fsPath, text: document.getText() });
    documents.set(uri.fsPath.toLowerCase(), document);
  }

  const issuesByFile = new Map();
  for (const issue of auditFirstActiveElements(files)) {
    const key = issue.filePath.toLowerCase();
    if (!issuesByFile.has(key)) issuesByFile.set(key, []);
    issuesByFile.get(key).push(issue);
  }

  for (const [key, document] of documents) {
    if (!/\.(?:cns|zss)$/i.test(document.fileName)) continue;
    const retained = (diagnosticCollection.get(document.uri) || [])
      .filter((diagnostic) =>
        diagnostic.code !== 'first-active-element-mismatch' &&
        diagnostic.code !== 'idle-element-mismatch');
    const additions = (issuesByFile.get(key) || []).map((issue) => {
      const line = Math.min(issue.line, document.lineCount - 1);
      const max = document.lineAt(line).text.length;
      const range = new vscode.Range(
        line,
        Math.min(issue.start, max),
        line,
        Math.min(issue.start + issue.length, max)
      );
      const diagnostic = new vscode.Diagnostic(
        range,
        issue.message,
        vscode.DiagnosticSeverity.Warning
      );
      diagnostic.code = issue.code;
      diagnostic.source = 'IKEMEN AIR/ZSS Sync';
      const airDocument = documents.get(issue.airPath.toLowerCase());
      if (airDocument) {
        diagnostic.relatedInformation = [new vscode.DiagnosticRelatedInformation(
          new vscode.Location(airDocument.uri, new vscode.Position(0, 0)),
          `Action ${issue.action} is defined in ${path.basename(issue.airPath)}.`
        )];
      }
      return diagnostic;
    });
    diagnosticCollection.set(document.uri, [...retained, ...additions]);
  }
  return [...issuesByFile.values()].reduce((sum, entries) => sum + entries.length, 0);
}

function rangeFor(document, symbol) {
  const endLine = Math.min(symbol.endLine, document.lineCount - 1);
  return new vscode.Range(
    symbol.startLine,
    0,
    endLine,
    document.lineAt(endLine).text.length
  );
}

function selectionFor(document, symbol) {
  const text = document.lineAt(symbol.startLine).text;
  return new vscode.Range(symbol.startLine, 0, symbol.startLine, text.length);
}

class ZssDocumentSymbolProvider {
  provideDocumentSymbols(document) {
    return parseZss(document.getText()).map((symbol) => {
      const kind = symbol.type === 'state'
        ? vscode.SymbolKind.Class
        : vscode.SymbolKind.Function;
      const detail = symbol.type === 'state'
        ? (symbol.heading || 'StateDef')
        : (symbol.heading || 'Function');
      return new vscode.DocumentSymbol(
        displayName(symbol),
        detail,
        kind,
        rangeFor(document, symbol),
        selectionFor(document, symbol)
      );
    });
  }
}

class ZssFoldingProvider {
  provideFoldingRanges(document) {
    return parseZss(document.getText())
      .filter((symbol) => symbol.endLine > symbol.startLine)
      .map((symbol) => new vscode.FoldingRange(
        symbol.startLine,
        symbol.endLine,
        symbol.type === 'state'
          ? vscode.FoldingRangeKind.Region
          : vscode.FoldingRangeKind.Region
      ));
  }
}

class NavigatorItem extends vscode.TreeItem {
  constructor(label, collapsibleState, data = {}) {
    super(label, collapsibleState);
    Object.assign(this, data);
  }
}

class ZssNavigator {
  constructor(context) {
    this.context = context;
    this.changeEmitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.changeEmitter.event;
  }

  refresh() {
    this.changeEmitter.fire(undefined);
  }

  activeZssDocument() {
    const editor = vscode.window.activeTextEditor;
    return editor && editor.document.languageId === 'zss' ? editor.document : undefined;
  }

  async getChildren(element) {
    if (!element) {
      const roots = [];
      const active = this.activeZssDocument();
      if (active) {
        const current = new NavigatorItem(
          `Current: ${path.basename(active.fileName)}`,
          vscode.TreeItemCollapsibleState.Expanded,
          { nodeType: 'document', uri: active.uri, contextValue: 'zssCurrentFile' }
        );
        current.iconPath = new vscode.ThemeIcon('symbol-file');
        roots.push(current);
      }

      const config = vscode.workspace.getConfiguration('zssNavigator');
      if (config.get('showWorkspaceFiles', true) && vscode.workspace.workspaceFolders) {
        const workspace = new NavigatorItem(
          'Workspace ZSS Files',
          vscode.TreeItemCollapsibleState.Collapsed,
          { nodeType: 'workspace', contextValue: 'zssWorkspace' }
        );
        workspace.iconPath = new vscode.ThemeIcon('files');
        roots.push(workspace);
      }
      return roots;
    }

    if (element.nodeType === 'workspace') {
      const limit = vscode.workspace.getConfiguration('zssNavigator').get('maxWorkspaceFiles', 500);
      const uris = await vscode.workspace.findFiles('**/*.zss', '**/{.git,node_modules}/**', limit);
      return uris
        .sort((a, b) => a.fsPath.localeCompare(b.fsPath))
        .map((uri) => {
          const relative = vscode.workspace.asRelativePath(uri, false);
          const item = new NavigatorItem(relative, vscode.TreeItemCollapsibleState.Collapsed, {
            nodeType: 'document', uri, contextValue: 'zssFile'
          });
          item.iconPath = new vscode.ThemeIcon('file-code');
          item.tooltip = uri.fsPath;
          return item;
        });
    }

    if (element.nodeType === 'document') {
      const document = await vscode.workspace.openTextDocument(element.uri);
      return parseZss(document.getText()).map((symbol) => {
        const item = new NavigatorItem(displayName(symbol), vscode.TreeItemCollapsibleState.None, {
          nodeType: 'symbol', uri: document.uri, line: symbol.startLine,
          contextValue: symbol.type === 'state' ? 'zssState' : 'zssFunction'
        });
        item.description = symbol.type === 'state' ? symbol.id : 'function';
        item.iconPath = new vscode.ThemeIcon(
          symbol.type === 'state' ? 'symbol-class' : 'symbol-function'
        );
        item.command = {
          command: 'zssNavigator.reveal',
          title: 'Reveal ZSS Symbol',
          arguments: [item]
        };
        return item;
      });
    }

    return [];
  }

  getTreeItem(element) {
    return element;
  }
}

class ZssControllerProvider {
  constructor(catalog = controllerCatalog) {
    this.catalog = catalog;
    this.filter = '';
    this.changeEmitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.changeEmitter.event;
  }

  refresh() {
    this.changeEmitter.fire(undefined);
  }

  setCatalog(catalog) {
    this.catalog = Array.isArray(catalog) ? catalog : controllerCatalog;
    this.refresh();
  }

  setFilter(value) {
    this.filter = String(value || '').trim().toLowerCase();
    this.refresh();
  }

  matches(controller) {
    if (!this.filter) return true;
    return [
      controller.name,
      controller.status,
      controller.description,
      ...controller.params.map((parameter) => parameter.name)
    ].join(' ').toLowerCase().includes(this.filter);
  }

  filteredCatalog(status) {
    return this.catalog.filter((controller) =>
      controller.status === status && this.matches(controller)
    );
  }

  getChildren(element) {
    if (!element) {
      const groups = [
        ['new', 'IKEMEN New'],
        ['changed', 'Changed / Expanded'],
        ['old', 'MUGEN Compatible']
      ];
      return groups.map(([status, label]) => {
        const count = this.filteredCatalog(status).length;
        const item = new NavigatorItem(
          `${label} (${count})`,
          this.filter
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed,
          { nodeType: 'controllerGroup', status, contextValue: 'zssControllerGroup' }
        );
        item.iconPath = new vscode.ThemeIcon(
          status === 'new' ? 'sparkle' : status === 'changed' ? 'diff-modified' : 'archive'
        );
        return item;
      }).filter((item) => !this.filter || this.filteredCatalog(item.status).length);
    }

    if (element.nodeType === 'controllerGroup') {
      return this.filteredCatalog(element.status).map((controller) => {
        const item = new NavigatorItem(
          controller.name,
          vscode.TreeItemCollapsibleState.None,
          { nodeType: 'controller', controller, contextValue: 'zssController' }
        );
        item.description = `${controller.params.length} options`;
        item.iconPath = new vscode.ThemeIcon('symbol-method');
        const tooltip = new vscode.MarkdownString();
        tooltip.appendMarkdown(`**${controller.name}** · ${controller.status}\n\n`);
        tooltip.appendText(controller.description || 'State controller');
        tooltip.appendMarkdown(`\n\n[Open merged documentation](${controller.url})`);
        item.tooltip = tooltip;
        item.command = {
          command: 'zssControllers.insert',
          title: 'Insert ZSS State Controller',
          arguments: [controller]
        };
        return item;
      });
    }

    return [];
  }

  getTreeItem(element) {
    return element;
  }
}

async function insertController(controller, catalog = controllerCatalog) {
  const editor = vscode.window.activeTextEditor;
  const language = editor && editor.document.languageId;
  if (!editor || (language !== 'zss' && language !== 'ikemen-cns')) {
    vscode.window.showWarningMessage('Open a ZSS or CNS file before inserting a state controller.');
    return;
  }
  if (!controller || !controller.name) {
    const picked = await vscode.window.showQuickPick((catalog || []).map((item) => ({ label: item.name, description: item.description, controller: item })), {
      title: 'Insert IKEMEN 1.0 state controller',
      placeHolder: 'Choose a native controller. Required options will always be reviewed.'
    });
    if (!picked) return;
    controller = picked.controller;
  }
  const required = (controller.params || []).filter((parameter) => parameter.required);
  const optional = (controller.params || []).filter((parameter) => !parameter.required);
  const pickedOptional = optional.length ? await vscode.window.showQuickPick(optional.map((parameter) => ({
    label: parameter.name,
    description: `Optional · ${parameter.placeholder || 'value'}`,
    parameter
  })), {
    title: `${controller.name} options`,
    placeHolder: `Required: ${required.map((parameter) => parameter.name).join(', ') || 'none'}. Select only optional fields needed by this use.`,
    canPickMany: true
  }) : [];
  if (pickedOptional === undefined) return;
  const plan = controllerAuthoringPlan(controller, pickedOptional.map((item) => item.parameter.name));
  const values = {};
  for (const parameter of plan.parameters) {
    const value = await vscode.window.showInputBox({
      title: `${controller.name}.${parameter.name}`,
      prompt: `${parameter.required ? 'Required' : 'Selected optional'} IKEMEN 1.0 option`,
      placeHolder: parameter.placeholder || 'value',
      validateInput: (input) => input.trim() ? undefined : `Enter a reviewed value for ${parameter.name}.`
    });
    if (value === undefined) return;
    values[parameter.name] = value;
  }
  const experienceKey = language === 'ikemen-cns' ? 'experience.cns' : 'experience.zss';
  const experience = vscode.workspace.getConfiguration('ikemenZss', editor.document.uri).get(experienceKey, 'learning');
  const text = language === 'ikemen-cns'
    ? cnsControllerAuthoringText(plan, values, experience)
    : controllerAuthoringText(plan, values, experience);
  await editor.edit((builder) => builder.insert(editor.selection.active, text));
}

async function goToLine() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'zss') return vscode.window.showWarningMessage('Open a ZSS file first.');
  const value = await vscode.window.showInputBox({
    title: 'Go to ZSS line',
    prompt: `Enter a line number from 1 to ${editor.document.lineCount}`,
    validateInput: (text) => !/^\d+$/.test(text) || Number(text) < 1 || Number(text) > editor.document.lineCount ? 'Enter a line number in this file.' : undefined
  });
  if (!value) return;
  const position = new vscode.Position(Number(value) - 1, 0);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
}

async function focusIkemenView(viewId) {
  await vscode.commands.executeCommand('workbench.view.extension.ikemen');
  await vscode.commands.executeCommand(`${viewId}.focus`);
}

function openPalFxEditor(context, uri, options) {
  return openPalFxPresetEditor(context, uri, options);
  const panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenPalFxEditor', 'PalFX Editor', preferredViewerColumn(vscode.ViewColumn.Active), { enableScripts: true, retainContextWhenHidden: true }));
  const nonce = String(Date.now());
  panel.webview.html = `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"><style>
    body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:16px}.grid{display:grid;grid-template-columns:110px repeat(3,90px);gap:8px;align-items:center}input{width:72px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);padding:5px}.preview{height:150px;margin:16px 0;border:1px solid var(--vscode-panel-border);display:grid;place-items:center}.swatch{width:96px;height:96px;border:1px solid #888}button{margin-right:8px;padding:7px 12px}code{white-space:pre-wrap}
  </style></head><body><h2>PalFX Editor</h2><p>Adjust the values, preview the resulting color, then insert the generated block at the cursor.</p><div class="grid"><b></b><b>Red</b><b>Green</b><b>Blue</b><label>Add</label><input id="ar" type="number" value="0"><input id="ag" type="number" value="0"><input id="ab" type="number" value="0"><label>Multiply</label><input id="mr" type="number" value="256"><input id="mg" type="number" value="256"><input id="mb" type="number" value="256"><label>Sin amplitude</label><input id="sr" type="number" value="0"><input id="sg" type="number" value="0"><input id="sb" type="number" value="0"><label>Period</label><input id="period" type="number" value="1"><label>Time</label><input id="time" type="number" value="1"></div><div class="preview"><div id="swatch" class="swatch"></div></div><p><button id="insert">Insert in ZSS</button><button id="copy">Copy</button></p><code id="output"></code><script nonce="${nonce}">const vscode=acquireVsCodeApi();const ids=['ar','ag','ab','mr','mg','mb','sr','sg','sb','period','time'];function n(id){return Number(document.getElementById(id).value)||0}function text(){return 'palFX {\\n  time: '+n('time')+';\\n  add: '+n('ar')+', '+n('ag')+', '+n('ab')+';\\n  mul: '+n('mr')+', '+n('mg')+', '+n('mb')+';\\n  sinAdd: '+n('sr')+', '+n('sg')+', '+n('sb')+', '+n('period')+';\\n}'}function update(){const rgb=['r','g','b'].map(c=>Math.max(0,Math.min(255,128*n('m'+c)/256+n('a'+c))));document.getElementById('swatch').style.background='rgb('+rgb.join(',')+')';document.getElementById('output').textContent=text()}ids.forEach(id=>document.getElementById(id).addEventListener('input',update));document.getElementById('insert').onclick=()=>vscode.postMessage({type:'insert',text:text()});document.getElementById('copy').onclick=()=>vscode.postMessage({type:'copy',text:text()});update();</script></body></html>`;
  panel.webview.onDidReceiveMessage(async (message) => {
    if (message.type === 'copy') return vscode.env.clipboard.writeText(message.text);
    if (message.type !== 'insert') return;
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'zss') return vscode.window.showWarningMessage('Focus a ZSS editor, then press Insert again.');
    await editor.edit((builder) => builder.insert(editor.selection.active, message.text));
  }, undefined, context.subscriptions);
}

async function filterControllers(provider) {
  const value = await vscode.window.showInputBox({
    title: 'Filter ZSS State Controllers',
    prompt: 'Search controller names, descriptions, classifications, or option names',
    value: provider.filter
  });
  if (value !== undefined) provider.setFilter(value);
}

async function openControllerDocs(item) {
  const controller = item && item.controller ? item.controller : item;
  if (controller && controller.url) {
    await vscode.env.openExternal(vscode.Uri.parse(controller.url));
  }
}

function fullLineSelection(document, selection) {
  if (selection.isEmpty) return selection;
  const startLine = selection.start.line;
  let endLine = selection.end.line;
  if (selection.end.character === 0 && endLine > startLine) endLine -= 1;
  return new vscode.Selection(
    new vscode.Position(startLine, 0),
    new vscode.Position(endLine, document.lineAt(endLine).text.length)
  );
}

function editorIndentUnit(editor) {
  const options = editor.options;
  if (options.insertSpaces) {
    const size = Number(options.tabSize) || 4;
    return ' '.repeat(size);
  }
  return '\t';
}

async function persistentInterval() {
  return vscode.window.showInputBox({
    title: 'ZSS persistent interval',
    prompt: 'Enter the execution interval (0 runs only on the first eligible tick)',
    value: '1',
    validateInput: (value) => /^\d+$/.test(value.trim())
      ? undefined
      : 'Enter a non-negative whole number.'
  });
}

async function wrapEditorSelection(wrapper) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'zss') {
    vscode.window.showWarningMessage('Open a ZSS file before using a ZSS wrapper.');
    return;
  }

  const document = editor.document;
  const range = fullLineSelection(document, editor.selection);
  const original = document.getText(range);
  const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
  const currentIndent = range.isEmpty
    ? leadingWhitespace(document.lineAt(range.start.line).text)
    : undefined;
  const wrapped = wrapText(original, wrapper, {
    eol,
    indent: currentIndent,
    indentUnit: editorIndentUnit(editor)
  });

  await editor.edit((builder) => builder.replace(range, wrapped.text));
  const startOffset = document.offsetAt(range.start);
  const start = document.positionAt(startOffset);
  const end = document.positionAt(startOffset + wrapped.text.length);

  if (wrapped.cursorOffset !== null) {
    const cursor = document.positionAt(startOffset + wrapped.cursorOffset);
    editor.selection = new vscode.Selection(cursor, cursor);
  } else {
    editor.selection = new vscode.Selection(start, end);
  }
}

async function wrapPersistent(combined) {
  const interval = await persistentInterval();
  if (interval === undefined) return;
  const wrapper = combined
    ? `ignoreHitPause persistent(${interval.trim()})`
    : `persistent(${interval.trim()})`;
  await wrapEditorSelection(wrapper);
}

async function scaleSelectedSizebox() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || path.extname(editor.document.fileName).toLowerCase() !== '.cns') {
    vscode.window.showWarningMessage('Open a CNS constants file before scaling a sizebox.');
    return;
  }

  const document = editor.document;
  const lineNumber = editor.selection.active.line;
  const line = document.lineAt(lineNumber);
  try {
    const parsed = parseSizeboxLine(line.text);
    const characterScale = readCharacterScale(document.getText());
    const config = vscode.workspace.getConfiguration('ikemenZss');
    const configuredReference = [
      Number(config.get('sizeboxReferenceXscale', 1.185)),
      Number(config.get('sizeboxReferenceYscale', 1.185))
    ];
    const referenceScale = parsed.referenceScale || configuredReference;
    const scaled = scaleSizebox(parsed.source, referenceScale, characterScale);
    const replacement = formatScaledLine(parsed, scaled, referenceScale);
    const choice = await vscode.window.showInformationMessage(
      `${parsed.name}.sizebox: ${parsed.displayed.join(', ')} -> ${scaled.join(', ')} (character scale ${characterScale.join(', ')})`,
      { modal: true },
      'Apply'
    );
    if (choice !== 'Apply') return;
    await editor.edit((builder) => builder.replace(line.range, replacement));
  } catch (error) {
    vscode.window.showWarningMessage(error.message);
  }
}

async function validatedRangeInput(options) {
  return vscode.window.showInputBox({
    ...options,
    validateInput: (value) => {
      try {
        parseNumberSet(value);
        return undefined;
      } catch (error) {
        return error.message;
      }
    }
  });
}

async function batchEditClsn2() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || path.extname(editor.document.fileName).toLowerCase() !== '.air') {
    vscode.window.showWarningMessage('Open an AIR file before applying Clsn2 data.');
    return;
  }

  const selectedClsn2 = editor.document.getText(editor.selection);

  const actions = await validatedRangeInput({
    title: 'AIR Clsn2 — Target actions',
    prompt: 'Examples: 0-19, 40-49, 100, 105 or 0-999 !200-299',
    value: '0'
  });
  if (actions === undefined) return;

  const actionScopes = [
    { label: 'All matching actions', description: 'Do not filter by the AIR action heading', headingFilter: '' },
    { label: 'Crouch actions only', description: 'Only headings containing the word crouch', headingFilter: 'crouch' },
    { label: 'Jump actions only', description: 'Only headings containing the word jump', headingFilter: 'jump' }
  ];
  const selectedScope = await vscode.window.showQuickPick(actionScopes, {
    title: 'AIR Clsn2 — Action heading filter',
    placeHolder: 'Choose which named actions may be changed'
  });
  if (!selectedScope) return;

  const modes = [
    { label: 'Replace per-element Clsn2', description: 'Replace boxes on selected animation elements', mode: 'replace' },
    { label: 'Append per-element Clsn2', description: 'Keep existing boxes and append new boxes', mode: 'append' },
    { label: 'Clear per-element Clsn2', description: 'Remove boxes from selected animation elements', mode: 'clear' },
    { label: 'Replace with Clsn2Default', description: 'Clear all Clsn2 in each action and add one default block', mode: 'default' },
    { label: 'Clear all Clsn2 in actions', description: 'Remove default and per-element Clsn2 blocks', mode: 'clearAll' }
  ];
  const selectedMode = await vscode.window.showQuickPick(modes, {
    title: 'AIR Clsn2 — Operation',
    placeHolder: 'Choose how existing Clsn2 data should be handled'
  });
  if (!selectedMode) return;

  let elements = 'all';
  if (!['default', 'clearAll'].includes(selectedMode.mode)) {
    elements = await validatedRangeInput({
      title: 'AIR Clsn2 — Target animation elements',
      prompt: 'Element numbers are 1-based. Examples: all, 1, 1-3, 1-10 !4',
      value: 'all'
    });
    if (elements === undefined) return;
  }

  let boxes = [];
  if (!['clear', 'clearAll'].includes(selectedMode.mode)) {
    try {
      boxes = parseSelectedClsn2(selectedClsn2, false);
    } catch (error) {
      vscode.window.showErrorMessage(`AIR Clsn2 selection: ${error.message}`);
      return;
    }
  }

  const document = editor.document;
  const result = batchApplyClsn2(document.getText(), {
    actions,
    elements,
    boxes,
    headingFilter: selectedScope.headingFilter,
    mode: selectedMode.mode
  });

  if (!result.changedActions.length || result.text === document.getText()) {
    vscode.window.showInformationMessage('No matching AIR collision data was changed.');
    return;
  }

  const preview = await vscode.workspace.openTextDocument({
    content: result.text,
    language: document.languageId
  });
  await vscode.commands.executeCommand(
    'vscode.diff',
    document.uri,
    preview.uri,
    `Clsn2 Preview — ${path.basename(document.fileName)}`,
    { preview: true }
  );

  const choice = await vscode.window.showInformationMessage(
    `Apply Clsn2 changes to ${result.changedActions.length} action(s)?`,
    { modal: true, detail: `Affected animation elements: ${result.changedElements}. Existing Clsn1 data is preserved.` },
    'Apply Changes'
  );
  if (choice !== 'Apply Changes') return;

  const lastLine = document.lineCount - 1;
  const fullRange = new vscode.Range(0, 0, lastLine, document.lineAt(lastLine).text.length);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, fullRange, result.text);
  await vscode.workspace.applyEdit(edit);
  await vscode.window.showTextDocument(document, { preview: false });
}

async function readOptionalText(uri) {
  try {
    return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
  } catch (error) {
    if (error && (error.code === 'FileNotFound' || /not found/i.test(error.message || ''))) return '';
    throw error;
  }
}

function airActionNumberAtCursor(editor) {
  const line = editor.document.lineAt(editor.selection.active.line).text;
  const match = /^\s*\[\s*Begin\s+Action\s+(\d+)\s*\]/i.exec(line);
  return match ? Number(match[1]) : undefined;
}

async function generateGuardProximityHelper() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || path.extname(editor.document.fileName).toLowerCase() !== '.air') {
    vscode.window.showWarningMessage('Open the source AIR file before generating a guard-proximity helper.');
    return;
  }

  let sourceAction = airActionNumberAtCursor(editor);
  if (sourceAction === undefined) {
    const actionInput = await vscode.window.showInputBox({
      title: 'AIR Guard Proximity — Source action',
      prompt: 'Right-click a [Begin Action ...] header to fill this automatically, or enter the attack animation group here.',
      value: '200',
      validateInput: (value) => /^\d+$/.test(value.trim()) ? undefined : 'Enter a non-negative integer action number.'
    });
    if (actionInput === undefined) return;
    sourceAction = Number(actionInput.trim());
  }

  let generated;
  try {
    generated = generateGuardProximity(editor.document.getText(), sourceAction);
  } catch (error) {
    vscode.window.showErrorMessage(`Guard-proximity generation failed: ${error.message}`);
    return;
  }

  const constantName = await vscode.window.showInputBox({
    title: 'AIR Guard Proximity — First active element constant',
    prompt: `Action ${sourceAction}'s first effective Clsn1 is element ${generated.firstActiveElement}. Enter the matching custom constant name.`,
    value: sourceAction === 200 ? 'normal.slp.guardElementhelper' : '',
    validateInput: (value) => /^[A-Za-z_][A-Za-z0-9_.]*$/.test(value.trim())
      ? undefined
      : 'Enter a custom constant name without const(...), spaces, or brackets.'
  });
  if (constantName === undefined) return;

  const output = await vscode.window.showQuickPick([
    {
      label: 'Dedicated normal_helpers.zss file (Recommended)',
      description: 'Create or update managed helper blocks in a reusable helper file',
      mode: 'dedicated'
    },
    {
      label: 'Choose an existing ZSS file',
      description: 'Add or update managed blocks in a selected ZSS file',
      mode: 'existing'
    },
    {
      label: 'AIR only; copy ZSS code to clipboard',
      description: 'Generate the AIR action and copy the helper integration code for manual placement',
      mode: 'clipboard'
    }
  ], {
    title: 'AIR Guard Proximity — Helper code destination'
  });
  if (!output) return;

  let helperUri;
  if (output.mode === 'dedicated') {
    helperUri = await vscode.window.showSaveDialog({
      title: 'Choose the managed guard-helper ZSS file',
      defaultUri: vscode.Uri.file(path.join(path.dirname(editor.document.fileName), 'normal_helpers.zss')),
      filters: { 'IKEMEN ZSS': ['zss'] },
      saveLabel: 'Use Helper File'
    });
    if (!helperUri) return;
  } else if (output.mode === 'existing') {
    const files = await vscode.workspace.findFiles('**/*.zss', '**/{.git,node_modules}/**', 1000);
    const picks = files.map((uri) => ({
      label: vscode.workspace.asRelativePath(uri),
      description: uri.fsPath,
      uri
    }));
    const selected = await vscode.window.showQuickPick(picks, {
      title: 'Choose a ZSS file for managed helper code',
      matchOnDescription: true
    });
    if (!selected) return;
    helperUri = selected.uri;
  }

  const helperCurrent = helperUri ? await readOptionalText(helperUri) : '';
  let helperGenerated;
  try {
    helperGenerated = updateGuardHelperZss(
      helperCurrent,
      generated.sourceAction,
      generated.targetAction,
      constantName.trim(),
      generatedSymbolPrefix(editor.document.uri, 'guardHelperSymbolPrefix')
    );
  } catch (error) {
    vscode.window.showErrorMessage(`Guard-helper ZSS generation failed: ${error.message}`);
    return;
  }

  const preview = await vscode.workspace.openTextDocument({
    content: generated.text,
    language: editor.document.languageId
  });
  await vscode.commands.executeCommand(
    'vscode.diff',
    editor.document.uri,
    preview.uri,
    `Guard Proximity Preview — Action ${sourceAction} → ${generated.targetAction}`,
    { preview: true }
  );

  const choice = await vscode.window.showInformationMessage(
    `Generate guard-proximity Action ${generated.targetAction} from Action ${sourceAction}?`,
    {
      modal: true,
      detail: `Copied ${generated.boxes.length} Clsn1 box(es) from element ${generated.firstActiveElement}. The proxy lasts one tick.`
    },
    'Generate'
  );
  if (choice !== 'Generate') return;

  const document = editor.document;
  const lastLine = document.lineCount - 1;
  const fullRange = new vscode.Range(0, 0, lastLine, document.lineAt(lastLine).text.length);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, fullRange, generated.text);
  await vscode.workspace.applyEdit(edit);

  if (helperUri) {
    await vscode.workspace.fs.writeFile(helperUri, Buffer.from(helperGenerated.text, 'utf8'));
    await vscode.env.clipboard.writeText(helperGenerated.call);
  } else {
    await vscode.env.clipboard.writeText(
      `${helperGenerated.text}\n\n# Add this call to the attack wrapper:\n${helperGenerated.call}\n`
    );
  }

  const destination = helperUri ? vscode.workspace.asRelativePath(helperUri) : 'the clipboard';
  vscode.window.showInformationMessage(
    `Generated Action ${generated.targetAction} and helper code in ${destination}. ${helperUri ? `Integration call copied: ${helperGenerated.call}` : 'The clipboard includes the integration call.'}`
  );
}

async function assignClsn2HitReactionRegion() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || path.extname(editor.document.fileName).toLowerCase() !== '.air') {
    vscode.window.showWarningMessage('Open an AIR file and right-click a Clsn2[index] coordinate line.');
    return;
  }

  let selected;
  try {
    selected = selectedClsn2(editor.document.getText(), editor.selection.active.line);
  } catch (error) {
    vscode.window.showErrorMessage(`Hit-region assignment failed: ${error.message}`);
    return;
  }

  const choice = await vscode.window.showQuickPick([
    { label: 'Forced High', description: 'Force the standing high get-hit reaction', region: 1 },
    { label: 'Forced Low', description: 'Force the standing low get-hit reaction', region: 2 },
    { label: 'Default reaction', description: 'Explicitly bypass game-default High/Low indices', region: 3 },
    { label: 'Remove assignment', description: 'Return this index to game-default classification', region: null }
  ], {
    title: `Action ${selected.action} — Clsn2[${selected.index}] hit reaction`,
    placeHolder: 'Choose the reaction when this defender box is hit'
  });
  if (!choice) return;

  // Hurtbox-region meanings belong to the character, not to a potentially
  // shared normal StateDef. Keep them beside that character's AIR file.
  const targetUri = vscode.Uri.file(
    path.join(path.dirname(editor.document.uri.fsPath), 'normals_extras.zss')
  );
  let created = false;
  try {
    await vscode.workspace.fs.stat(targetUri);
  } catch {
    const scaffold = [
      '#===============================================================================',
      '# Character-specific normal attack extensions',
      '#===============================================================================',
      '',
      '[StateDef -4]',
      ''
    ].join('\n');
    await vscode.workspace.fs.writeFile(targetUri, Buffer.from(scaffold, 'utf8'));
    created = true;
  }
  const targetDocument = await vscode.workspace.openTextDocument(targetUri);

  let generated;
  try {
    generated = updateStateRegionAssignments(
      targetDocument.getText(),
      selected.action,
      selected.index,
      choice.region,
      generatedSymbolPrefix(editor.document.uri, 'hitReactionSymbolPrefix')
    );
  } catch (error) {
    vscode.window.showErrorMessage(`Hit-region assignment failed: ${error.message}`);
    return;
  }

  const fullRange = new vscode.Range(
    targetDocument.positionAt(0),
    targetDocument.positionAt(targetDocument.getText().length)
  );
  const edit = new vscode.WorkspaceEdit();
  edit.replace(targetUri, fullRange, generated.text);
  if (!await vscode.workspace.applyEdit(edit)) {
    vscode.window.showErrorMessage('VS Code could not apply the hit-region assignment.');
    return;
  }
  await targetDocument.save();
  const destination = await vscode.workspace.openTextDocument(targetUri);
  const destinationEditor = await vscode.window.showTextDocument(destination, { preview: false });
  const revealLine = Number.isInteger(generated.blockLine)
    ? generated.blockLine
    : Math.max(0, destination.getText().split(/\r?\n/)
      .findIndex((line) => /^\s*\[StateDef\s+-4\b/i.test(line)));
  const revealPosition = new vscode.Position(revealLine, 0);
  destinationEditor.selection = new vscode.Selection(revealPosition, revealPosition);
  destinationEditor.revealRange(
    new vscode.Range(revealPosition, revealPosition),
    vscode.TextEditorRevealType.AtTop
  );
  const resultLabel = choice.region === null ? 'assignment removed' : choice.label;
  vscode.window.showInformationMessage(
    `Clsn2[${selected.index}] ${resultLabel} for State ${selected.action} in normals_extras.zss${created ? ' (created)' : ''}.`
  );
}

async function revealSymbol(item) {
  if (!item || !item.uri) return;
  const document = await vscode.workspace.openTextDocument(item.uri);
  const editor = await vscode.window.showTextDocument(document, { preview: false });
  const line = Math.max(0, Math.min(item.line || 0, document.lineCount - 1));
  const position = new vscode.Position(line, 0);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(
    new vscode.Range(position, position),
    vscode.TextEditorRevealType.AtTop
  );
}

async function auditWorkspace(registry) {
  const limit = vscode.workspace.getConfiguration('ikemenZss').get('maxAuditFiles', 1000);
  const uris = await vscode.workspace.findFiles('**/*.zss', '**/{.git,node_modules}/**', limit);
  let issueCount = 0;
  let warningCount = 0;
  const scanned = [];
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Auditing IKEMEN ZSS entity and frame safety',
    cancellable: true
  }, async (progress, token) => {
    for (let index = 0; index < uris.length && !token.isCancellationRequested; index += 1) {
      const document = await vscode.workspace.openTextDocument(uris[index]);
      const result = analyzeDocument(document);
      scanned.push({ document, result });
      issueCount += result.issues.length;
      warningCount += result.issues.filter((entry) => ['error', 'warning'].includes(entry.severity)).length;
      progress.report({ increment: 100 / Math.max(1, uris.length), message: vscode.workspace.asRelativePath(uris[index], false) });
    }
  });

  // Project-owned prefixed missing calls are actionable;
  // other missing calls may be supplied by IKEMEN's globally loaded data files.
  const declarations = new Map();
  for (const entry of scanned) {
    for (const declaration of entry.result.records.functions) {
      if (!declarations.has(declaration.name)) declarations.set(declaration.name, []);
      declarations.get(declaration.name).push({ ...declaration, document: entry.document });
    }
  }
  for (const entry of scanned) {
    const ownedFunctionPrefixes = analyzerOptions(entry.document.uri).functionPrefixes;
    const additions = [];
    const lineRange = (record) => {
      const line = Math.min(record.line, entry.document.lineCount - 1);
      const max = entry.document.lineAt(line).text.length;
      return new vscode.Range(line, Math.min(record.start, max), line, Math.min(record.start + record.name.length, max));
    };
    for (const call of entry.result.records.calls) {
      const candidates = declarations.get(call.name) || [];
      if (!candidates.length && ownedFunctionPrefixes.some((prefix) => call.name.startsWith(prefix))) {
        const diagnostic = new vscode.Diagnostic(lineRange(call), `Owned function ${call.name} is called but was not found in the indexed workspace.`, vscode.DiagnosticSeverity.Warning);
        diagnostic.source = 'IKEMEN ZSS'; diagnostic.code = 'missing-function'; additions.push(diagnostic);
      } else if (candidates.length && !candidates.some((item) => item.arity === call.arity)) {
        const expected = [...new Set(candidates.map((item) => item.arity))].join(' or ');
        const diagnostic = new vscode.Diagnostic(lineRange(call), `${call.name} is called with ${call.arity} argument(s); indexed declaration expects ${expected}.`, vscode.DiagnosticSeverity.Error);
        diagnostic.source = 'IKEMEN ZSS'; diagnostic.code = 'function-arity'; additions.push(diagnostic);
      }
      const sameFileLater = candidates.find((item) => item.document.uri.toString() === entry.document.uri.toString() && item.line > call.line);
      if (sameFileLater) {
        const diagnostic = new vscode.Diagnostic(lineRange(call), `${call.name} is declared later in this file; ZSS functions may only call predefined functions.`, vscode.DiagnosticSeverity.Warning);
        diagnostic.source = 'IKEMEN ZSS'; diagnostic.code = 'function-order'; additions.push(diagnostic);
      }
    }
    for (const declaration of entry.result.records.functions) {
      const sameFile = (declarations.get(declaration.name) || []).filter((item) => item.document.uri.toString() === entry.document.uri.toString());
      if (sameFile.length > 1) {
        const diagnostic = new vscode.Diagnostic(lineRange(declaration), `Function ${declaration.name} is declared ${sameFile.length} times in this file.`, vscode.DiagnosticSeverity.Error);
        diagnostic.source = 'IKEMEN ZSS'; diagnostic.code = 'duplicate-function'; additions.push(diagnostic);
      }
    }
    if (additions.length) {
      diagnosticCollection.set(entry.document.uri, [...(diagnosticCollection.get(entry.document.uri) || []), ...additions]);
      issueCount += additions.length;
      warningCount += additions.length;
    }
  }
  registry.refresh();
  if (issueCount) {
    const action = await vscode.window.showWarningMessage(
      `ZSS audit found ${warningCount} warning/error item(s) and ${issueCount - warningCount} advisory item(s) in ${uris.length} file(s).`,
      'Show Problems'
    );
    if (action === 'Show Problems') await vscode.commands.executeCommand('workbench.actions.view.problems');
  } else {
    vscode.window.showInformationMessage(`ZSS audit found no issues in ${uris.length} file(s).`);
  }
}

function activate(context) {
  const modeExistingKeys=context.globalState.keys?.()||[];
  require('./interface_mode').register(vscode,context);
  require('./workspace_setup').register(vscode,context);
  require('./asset_workspace').configure(vscode);
  require('./asset_workspace').register(context);
  require('./save_controls').register(context);
  const capabilities = detectCapabilities({
    uiKind: vscode.env.uiKind === vscode.UIKind.Web ? 'web' : 'desktop',
    platform: process.platform,
    environment: process.env
  });
  const summary = capabilitySummary(capabilities);
  for (const [name, value] of Object.entries({
    web: capabilities.web,
    android: capabilities.android,
    ios: capabilities.ios,
    nativeBuilders: capabilities.nativeBuilders,
    externalEditors: capabilities.externalEditors,
    ikemenLaunch: capabilities.ikemenLaunch
  })) vscode.commands.executeCommand('setContext', `ikemen.capability.${name}`, value);
  context.subscriptions.push(vscode.commands.registerCommand('ikemen.showPlatformCapabilities', async () => {
    const content = [`# IKEMaker Platform Capabilities`, '', `Host: ${summary.platform}`, '', '## Available', ...summary.available.map((item) => `- ${item}`), '', '## Unavailable', ...summary.unavailable.map((item) => `- ${item}`)].join('\n');
    const document = await vscode.workspace.openTextDocument({ language: 'markdown', content });
    await vscode.window.showTextDocument(document, { preview: false });
  }), vscode.commands.registerCommand('ikemen.showBundledToolchain', async () => {
    const tools = toolchainStatus();
    const available = tools.filter((item) => item.available).length;
    const content = [
      '# IKEMEN Creator Tools — Bundled Toolchain', '',
      `Extension version: ${context.extension.packageJSON.version}`, '',
      `Status: ${available === tools.length ? 'Ready for offline SFF and SND builds.' : 'One or more packaged builders are unavailable on this platform.'}`, '',
      ...tools.map((item) => `- ${item.available ? 'Ready' : 'Unavailable'} — ${item.filename}${item.location ? ` — ${item.location}` : ' (Windows x64 only)'}`), '',
      'Project-local builder copies and explicitly configured absolute paths take priority over these packaged defaults.', '',
      'MUGEN.exe, IKEMEN GO, and game content are not included.'
    ].join('\n');
    const document = await vscode.workspace.openTextDocument({ language: 'markdown', content });
    await vscode.window.showTextDocument(document, { preview: false });
  }), vscode.commands.registerCommand('ikemen.openMobileFeatureMatrix', async () => {
    const uri = vscode.Uri.joinPath(context.extensionUri, 'data', 'mobile-platform-feature-matrix.md');
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri), { preview: false });
  }), vscode.commands.registerCommand('ikemen.openStageScreenpackSpec', async () => {
    const uri = vscode.Uri.joinPath(context.extensionUri, 'data', 'stage-screenpack-workspace-spec.md');
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri), { preview: false });
  }));
  const selector = { language: 'zss', scheme: 'file' };
  engineRuntime.initialize(context);
  const navigator = new ZssNavigator(context);
  const savedControllerCatalog = context.globalState.get('ikemenZss.controllerCatalog.v1', controllerCatalog);
  const controllers = new ZssControllerProvider(savedControllerCatalog);
  registerLanguageProviders(vscode, context, () => controllers.catalog);
  registerLuaSupport(context);
  registerDefSemanticHighlighting(vscode, context);
  registerNavigationProviders(vscode, context);
  registerMutationHistory(context);
  registerDiagnosticExplanations(vscode, context);
  registerAnimationStandardDiagnostics(vscode, context);
  const registry = new ZssRegistryProvider();
  require('./map_registry_ui').register(vscode, context);
  const updates = createUpdateMonitor(vscode, context, controllerCatalog, (catalog) => controllers.setCatalog(catalog));
  registerSffCommands(context);
  registerSffViewer(context);
  registerAirViewer(context);
  registerSndViewer(context);
  registerDirectAssetOpening(vscode, context);
  registerAssetGroupLogs(context);
  registerAssetCreation(context);
  registerCharacterWorkbenches(context);
  registerCharacterDependencyWorkspace(context);
  registerCharacterHealthWorkspace(context);
  registerCnsConverter(context);
  registerProjectContext(context);
  registerProjectManagerWorkspace(context);
  registerEngineMigration(context);
  registerWorkspacePresets(context);
  registerImpactPreview(context);
  registerOwnershipAudit(context);
  registerStageWorkspace(context);
  registerScreenpackWorkspace(context);
  registerCommandMovelistWorkspace(context);
  registerCodeStructureWorkspace(vscode, context);
  registerSelectDefWorkspace(context);
  registerMenuModesWorkspace(context);
  registerStoryDialogueWorkspace(context);
  registerStoryboardWorkspace(context);
  registerPaletteIndexOrganizer(context);
  registerMoveConstantsWorkspace(context);
  registerMoveLab(context);
  registerHitDefWorkspace(context);
  registerThrowCreator(context);
  registerSpatialComposer(context);
  registerHelperLab(context);
  registerPaletteImportWorkspace(context);
  registerArtistIntake(context);
  registerSffAssembly(context);
  registerProductionWorkflow(context);
  registerReleaseBuilder(context);
  registerTestSessionWorkspace(context);
  registerRelatedWork(context);
  require('./viewer_navigation').registerViewerNavigation(context);
  require('./viewer_sources').registerSources(context);
  require('./viewer_comparison').registerComparison(context);
  registerOfflineDocs(vscode, context);
  registerHelpWorkspace(context);
  registerExperience(context);
  registerAuthoringBridge(context);
  require('./def_workspace').registerDefWorkspace(context);
  require('./ikemen_hub').registerIkemenHub(context);
  registerExtensionUpdater(vscode, context);
  let analysisTimer;
  let frameSyncTimer;
  const scheduleAnalysis = (document) => {
    clearTimeout(analysisTimer);
    analysisTimer = setTimeout(() => analyzeDocument(document), 250);
  };
  const scheduleFrameSync = () => {
    clearTimeout(frameSyncTimer);
    frameSyncTimer = setTimeout(() => auditFirstActiveElementConstants(), 400);
  };

  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(selector, new ZssDocumentSymbolProvider()),
    vscode.languages.registerFoldingRangeProvider(selector, new ZssFoldingProvider()),
    vscode.window.registerTreeDataProvider('zssNavigator', navigator),
    vscode.window.registerTreeDataProvider('zssStateControllers', controllers),
    vscode.window.registerTreeDataProvider('zssRegistry', registry),
    vscode.commands.registerCommand('zssNavigator.refresh', () => navigator.refresh()),
    vscode.commands.registerCommand('zssNavigator.reveal', revealSymbol),
		vscode.commands.registerCommand('zss.goToLine', goToLine),
		vscode.commands.registerCommand('zss.toggleLineComment', () => vscode.commands.executeCommand('editor.action.commentLine')),
		vscode.commands.registerCommand('zss.openProjectData', () => focusIkemenView('zssRegistry')),
		vscode.commands.registerCommand('zss.openControllers', () => focusIkemenView('zssStateControllers')),
		vscode.commands.registerCommand('zss.openPalFxEditor', (uri, options) => openPalFxEditor(context, uri, options)),
    vscode.commands.registerCommand('zssControllers.search', () => filterControllers(controllers)),
    vscode.commands.registerCommand('zssControllers.clearFilter', () => controllers.setFilter('')),
    vscode.commands.registerCommand('zssControllers.insert', (controller) => insertController(controller, controllers.catalog)),
    vscode.commands.registerCommand('zssControllers.openDocs', openControllerDocs),
    vscode.commands.registerCommand('zss.wrap.ignoreHitPause', () => wrapEditorSelection('ignoreHitPause')),
    vscode.commands.registerCommand('zss.wrap.persistent', () => wrapPersistent(false)),
    vscode.commands.registerCommand('zss.wrap.ignoreHitPausePersistent', () => wrapPersistent(true)),
    vscode.commands.registerCommand('air.batchApplyClsn2', batchEditClsn2),
    vscode.commands.registerCommand('air.generateGuardProximityHelper', generateGuardProximityHelper),
    vscode.commands.registerCommand('air.assignClsn2HitReactionRegion', assignClsn2HitReactionRegion),
    vscode.commands.registerCommand('cns.scaleSelectedSizebox', scaleSelectedSizebox),
    vscode.commands.registerCommand('zss.audit.currentFile', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'zss') return vscode.window.showWarningMessage('Open a ZSS file to audit it.');
      analyzeDocument(editor.document);
      return vscode.commands.executeCommand('workbench.actions.view.problems');
    }),
    vscode.commands.registerCommand('zss.audit.workspace', () => auditWorkspace(registry)),
    vscode.commands.registerCommand('zssRegistry.refresh', () => registry.refresh()),
    vscode.commands.registerCommand('zss.updates.checkNow', () => updates.check({ manual: true })),
    vscode.commands.registerCommand('zss.updates.checkDefNow', async (uri) => {
      const defUri = uri && uri.fsPath
        ? uri
        : vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri;
      if (!defUri || !/\.def$/i.test(defUri.fsPath)) {
        return vscode.window.showWarningMessage('Open or right-click an IKEMEN DEF file to run a scoped IKEMEN 1.0 update check.');
      }
      return updates.check({ manual: true, scopeDef: defUri });
    }),
    vscode.commands.registerCommand('zss.updates.showLastReport', () => updates.showLastReport()),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      navigator.refresh();
      if (editor && editor.document.languageId === 'zss') analyzeDocument(editor.document);
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.languageId === 'zss') {
        navigator.refresh();
        registry.refresh();
        analyzeDocument(document);
      }
      if (/\.(?:zss|cns|air)$/i.test(document.fileName)) scheduleFrameSync();
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId === 'zss') {
        navigator.refresh();
        scheduleAnalysis(event.document);
      }
    }),
    vscode.workspace.onDidCloseTextDocument((document) => diagnosticCollection.delete(document.uri)),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('ikemenZss')) {
        registry.refresh();
        for (const document of vscode.workspace.textDocuments) analyzeDocument(document);
      }
    }),
    diagnosticCollection,
    updates.output
  );

  for (const document of vscode.workspace.textDocuments) analyzeDocument(document);
  auditFirstActiveElementConstants();
  updates.schedule();
  void require('./interface_mode').onboard(modeExistingKeys).catch(error=>vscode.window.showErrorMessage('IKEMaker mode setup: '+error.message));
}

function deactivate() {}

module.exports = { activate, deactivate };
