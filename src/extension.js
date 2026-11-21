'use strict';

const vscode = require('vscode');
const { preferredViewerColumn, trackViewerPanel } = require('./viewer_group');
const path = require('path');
const fs = require('fs');
const { parseZss, displayName } = require('./parser');
const codeNavigatorModel = require('./code_navigator_model');
const codeNavigatorAssignments = require('./code_navigator_assignments');
const { documentOutline } = require('./zss_document_outline');
const controllerCatalog = require('../data/sctrl.json');
const stageDefCatalog = require('../data/stage-def-catalog.json');
const luaApiCatalog = require('../data/lua-api.json');
const { luaAuthoringInsert } = require('./language_intelligence');
const { parseLuaFunctions } = require('./lua_function_catalog');
const { controllerAuthoringPlan, controllerAuthoringText, cnsControllerAuthoringText } = require('./controller_authoring');
const { leadingWhitespace, wrapText } = require('./wrappers');
const zssStructures = require('./zss_structures');
const authoringLibrary = require('./authoring_library');
const { generateGuardProximity, updateGuardHelperZss } = require('./air');
const { createAirClsn2BatchService } = require('./air_clsn2_batch_service');
const { analyzeZss, analyzeCommandReferences, defMapCapabilityIssues, defMapValueIssues, typedConstantIssues } = require('./analyzer');
const { missingFileIssues } = require('./def_file_diagnostics');
const { basicSyntaxIssues, cnsCatalogCapabilityIssues } = require('./basic_syntax_diagnostics');
const { registerNativeDocumentOutlines } = require('./native_document_outlines');
const { resolveCommandCatalog, sameFile } = require('./command_reference_model');
const { createUpdateMonitor, ENGINE_CATALOG_KEY, BUILT_IN_ENGINE_CATALOG, readEngineCatalog } = require('./updater');
const { registerExtensionUpdater } = require('./extension_updater');
const { registerUpdateCenter } = require('./update_center');
const engineRuntime = require('./engine_runtime');
const engineCapabilityPolicy = require('./engine_capability_policy');
const { entryAvailable, filterAvailable } = require('./catalog_capability_filter');
const controllerChangeMarkers = require('./controller_change_markers');
const { ControllerChangeReviewStore } = require('./controller_change_review_store');
const { ControllerChangeReviewAuthority } = require('./controller_change_review_authority');
const { auditFirstActiveElements } = require('./frame_sync');
const { selectedClsn2, updateStateRegionAssignments } = require('./region_assign');
const { parseSizeboxLine, readCharacterScale, scaleSizebox, formatScaledLine } = require('./sizebox');
const { registerSffCommands } = require('./sff_commands');
const { registerSffViewer } = require('./sff_viewer');
const { registerSffTransferHost } = require('./sff_transfer_host');
const { registerSndTransferHost } = require('./snd_transfer_host');
const { registerAirTransferHost } = require('./air_transfer_host');
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
const { registerProjectBible } = require('./project_bible_workspace');
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
const { registerTrajectoryWorkspace } = require('./trajectory_workspace');
const { registerHelperLab } = require('./helper_workspace');
const { registerPaletteImportWorkspace } = require('./palette_import_workspace');
const { registerPlayerPaletteWorkspace } = require('./player_palette_workspace');
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
const { WorkspaceZssIndex, registerNavigationProviders } = require('./navigation_providers');
const { registerMutationHistory } = require('./mutation_history');
const { registerDiagnosticExplanations } = require('./diagnostic_explanations');
const { registerCommentAssistance } = require('./comment_assistance');
const { registerTriggerExpressionPicker } = require('./trigger_expression_picker');
const { registerFunctionCallPicker } = require('./function_call_picker');
const { registerZssAssetDiagnostics } = require('./zss_asset_diagnostics');
const { registerZssFunctionDiagnostics } = require('./zss_function_diagnostics');
const { registerStateTransferDiagnostics } = require('./state_transfer_diagnostics');
const { registerAnimationStandardDiagnostics } = require('./animation_standard_diagnostics');
const { registerCharacterScaleReview } = require('./character_scale_review_service');
const { registerAuthoringBridge } = require('./authoring_bridge');
const { openPalFxPresetEditor } = require('./palfx_editor');
const { detectCapabilities, capabilitySummary } = require('./platform_capabilities');
const { toolchainStatus } = require('./bundled_tools');
const { registerLuaSupport } = require('./lua_support');
const validationLevels = require('./validation_levels');
const metadataRegistry = require('./metadata_registry');
const { SignatureCache } = require('./signature_cache');
const { ZssRegistryProvider } = require('./zss_registry_provider');
const textEditorToolbar = require('./text_editor_toolbar');
const companionSwitch = require('./companion_switch');
const { registerAuthoringWorkspace } = require('./authoring_workspace');
const { commandDocumentTargetDiagnostics } = require('./command_movelist_model');

const diagnosticCollection = vscode.languages.createDiagnosticCollection('ikemen-zss');
const validationCache = new SignatureCache(16);
let activeCapabilityResolver = () => ({});

async function readOnlyTreeSnapshot(provider) {
  let count = 0;
  const visit = async (parent, depth, trail) => {
    const children = await Promise.resolve(provider?.getChildren?.(parent));
    const result = [];
    for (let index = 0; index < (children || []).length && count < 500; index += 1) {
      const item = children[index]; count += 1;
      const filename = item.uri?.fsPath || item.resourceUri?.fsPath || '';
      const record = { id: String(item.id || item.contextValue || `${trail}-${index}`), label: String(typeof item.label === 'string' ? item.label : item.label?.label || item.description || `Item ${index + 1}`), description: String(item.description || ''), detail: String(item.tooltip?.value || item.tooltip || '') };
      if (typeof provider?.decorateReadOnlyTreeRecord === 'function') Object.assign(record, provider.decorateReadOnlyTreeRecord(item, record) || {});
      if (filename) record.source = { filename, ...(Number.isInteger(item.line) ? { line: item.line } : {}) };
      if (depth < 2) { const nested = await visit(item, depth + 1, `${trail}-${index}`); if (nested.length) record.children = nested; }
      result.push(record);
    }
    return result;
  };
  return { items: await visit(undefined, 0, 'root') };
}

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
  const authorName = String(config.get('authorName', '') || '').trim();
  const commandCatalog = resource?.fsPath ? resolveCommandCatalog(resource.fsPath, { openDocuments: vscode.workspace.textDocuments }) : null;
  const ownerHasUnsavedAssignment = commandCatalog?.owners?.some(owner => vscode.workspace.textDocuments.some(document => document.isDirty && sameFile(document.fileName, owner)));
  return {
    mapPrefixes: configuredPrefixes(config, 'mapPrefixes', 'mapPrefix'),
    functionPrefixes: configuredPrefixes(config, 'functionPrefixes', 'functionPrefix'),
    opponentAvailability: authorName ? config.get('authorRules.opponentAvailability', 'off') : 'off',
    unusedLetSeverity: config.get('diagnostics.unusedLetSeverity', 'error'),
    commandNames: commandCatalog?.complete && !ownerHasUnsavedAssignment ? commandCatalog.names : undefined,
    commandCatalog: commandCatalog?.complete && !ownerHasUnsavedAssignment ? commandCatalog : undefined,
    capabilities: activeCapabilityResolver(resource),
    syntaxDiagnostics: {
      enabled: config.get('diagnostics.syntax.enabled', true),
      debugFloods: config.get('diagnostics.syntax.debugFloods', true),
      missingSemicolons: config.get('diagnostics.syntax.missingSemicolons', true),
      duplicateParameters: config.get('diagnostics.syntax.duplicateParameters', true),
      unknownControllers: config.get('diagnostics.syntax.unknownControllers', true),
      unknownTriggers: config.get('diagnostics.syntax.unknownTriggers', false),
      structure: config.get('diagnostics.syntax.structure', true),
      controlFlow: config.get('diagnostics.syntax.controlFlow', true),
      ignoredNames: config.get('diagnostics.syntax.ignoredNames', [])
    },
    authorName
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
  }[severity] ?? vscode.DiagnosticSeverity.Warning;
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

let diagnosticAssignments;
const analyzedAssignedDocuments=new WeakSet();
function assignedLegacyText(document) {
  return document?.uri?.scheme === 'file' && Boolean(document.fileName) &&
    Boolean(diagnosticAssignments?.ownersOf(document.fileName).length);
}

function analyzeDocument(document) {
  const assigned=assignedLegacyText(document);
  const defDocument=!assigned && Boolean(document&&/\.def$/i.test(document.fileName || document.uri?.fsPath || ''));
  if (assigned) analyzedAssignedDocuments.add(document);
  else if (document && analyzedAssignedDocuments.delete(document)) diagnosticCollection.delete(document.uri);
  const filename=document?.fileName||document?.uri?.fsPath||'',languageId=document?.languageId==='zss'?'zss':assigned?'ikemen-cns':/\.zss$/i.test(filename)?'zss':/\.(?:cns|st)$/i.test(filename)?'ikemen-cns':document?.languageId;
  if (!document || !['zss', 'ikemen-cns'].includes(languageId) && !defDocument) return { issues: [], records: {} };
  const options = analyzerOptions(document.uri), result = defDocument
    ? {issues:[...defMapCapabilityIssues(document.getText(),options.capabilities,document.fileName||document.uri?.fsPath||'character.def'),...defMapValueIssues(document.getText(),options.capabilities),...typedConstantIssues(document.getText(),options.capabilities,{legacy:true}),...missingFileIssues(document.getText(),document.fileName||document.uri?.fsPath||'character.def')],records:{}}
    : languageId === 'zss'
    ? analyzeZss(document.getText(), options)
    : { issues: [...cnsCatalogCapabilityIssues(document.getText(),options.capabilities),...analyzeCommandReferences(document.getText(), options.commandNames, { semicolonComments: true }),...typedConstantIssues(document.getText(),options.capabilities,{legacy:true})], records: {} };
  if (!defDocument) result.issues.push(...basicSyntaxIssues(document.getText(), languageId, options.syntaxDiagnostics));
  if (require('./command_sequence_syntax').isCommandFile(document.fileName || document.uri?.fsPath || '')) result.issues.push(...require('./command_sequence_syntax').commandSequenceIssues(document.getText()), ...commandDocumentTargetDiagnostics(document.getText(), { capabilities: options.capabilities }, document.fileName || document.uri?.fsPath || ''));
  const settings = validationSettings(document.uri), diagnostics = result.issues.filter((entry) => validationLevels.enabled({ ...entry, level: validationLevel(entry) }, settings)).map((entry) => {
    const line = Math.min(entry.line, document.lineCount - 1);
    const max = document.lineAt(line).text.length;
    const range = new vscode.Range(line, Math.min(entry.start, max), line, Math.min(entry.start + entry.length, max));
    const diagnostic = new vscode.Diagnostic(range, entry.message, vscodeSeverity(validationLevel(entry)));
    diagnostic.code = entry.code;
    diagnostic.source = `${defDocument ? 'IKEMEN DEF' : languageId === 'zss' ? 'IKEMEN ZSS' : 'IKEMEN CNS'} · ${require('./lua_target_catalog').targetLabel(options.capabilities)}`;
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

const { collectFrameSyncScopes, createLatestAuditRunner } = require('./frame_sync_scope');
const auditFirstActiveElementConstants = createLatestAuditRunner(async (options = {}) => {
  const contexts = require('./authoring_context_registry').openContexts();
  const scopes = await collectFrameSyncScopes(vscode, options.document, {
    ...options, contexts, nearestDef: require('./character_picker').nearestCharacterDef
  });
  if (options.cancelled()) return 0;
  const documents = new Map(scopes.flat().map(document => [document.fileName.toLowerCase(), document]));
  const issues = scopes.flatMap(scope => auditFirstActiveElements(scope.map(document => ({ path: document.fileName, text: document.getText() }))));

  const issuesByFile = new Map();
  for (const issue of issues) {
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
});

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
    return documentOutline(document.getText()).map((symbol) => {
      const kind = symbol.kind === 'state'
        ? vscode.SymbolKind.Class
        : vscode.SymbolKind.Function;
      const result = new vscode.DocumentSymbol(
        symbol.label,
        symbol.detail,
        kind,
        rangeFor(document, symbol),
        selectionFor(document, symbol)
      );
      result.children = symbol.children.map((child) => new vscode.DocumentSymbol(
        child.label,
        child.detail,
        child.kind === 'controller' ? vscode.SymbolKind.Method : child.kind === 'call' ? vscode.SymbolKind.Function : child.kind === 'transition' ? vscode.SymbolKind.Event : child.kind === 'command' ? (vscode.SymbolKind.Key??vscode.SymbolKind.Event) : child.kind === 'resource' ? (vscode.SymbolKind.Object??vscode.SymbolKind.Variable) : child.kind === 'constant' ? (vscode.SymbolKind.Constant??vscode.SymbolKind.Variable) : child.kind === 'map' ? (vscode.SymbolKind.Key??vscode.SymbolKind.Variable) : child.kind === 'redirect' ? (vscode.SymbolKind.Interface??vscode.SymbolKind.Variable) : child.kind === 'parameter' ? vscode.SymbolKind.Field : vscode.SymbolKind.Variable,
        new vscode.Range(child.line, 0, child.line, document.lineAt(child.line).text.length),
        new vscode.Range(child.line, child.start, child.line, child.start + child.length)
      ));
      return result;
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
    // DEF-assigned code files with otherwise unrecognized extensions (GotenksZ2 st8 = config.txt).
    this.assignments = typeof codeNavigatorAssignments !== 'undefined' ? new codeNavigatorAssignments.DefAssignmentIndex() : null;
    if (this.assignments && typeof vscode.workspace.createFileSystemWatcher === 'function') {
      const watcher = vscode.workspace.createFileSystemWatcher('**/*.def');
      const changed = () => this.invalidateAssignments();
      watcher.onDidCreate(changed); watcher.onDidChange(changed); watcher.onDidDelete(changed);
      context?.subscriptions?.push?.(watcher);
    }
  }

  refresh() {
    this.changeEmitter.fire(undefined);
  }

  // Explicit Refresh command: also re-reads DEF [Files] assignments.
  refreshAll() {
    this.invalidateAssignments();
  }

  invalidateAssignments() {
    this.assignments?.invalidate();
    this.refresh();
  }

  // Cache-only; used by per-keystroke change handlers.
  isKnownAssignedFile(file) {
    return Boolean(this.assignments?.isKnownAssignedFile(file));
  }

  // Active ZSS / legacy CNS-family document, or an exact DEF-assigned code file.
  activeCodeEntry() {
    const document = vscode.window.activeTextEditor?.document;
    if (!document) return undefined;
    const format = codeNavigatorModel.navigatorFormat(document);
    if (format) return { document, format, owners: [] };
    if (!this.assignments || document.uri?.scheme && document.uri.scheme !== 'file' || !document.fileName) return undefined;
    const owners = this.assignments.ownersOf(document.fileName);
    return owners.length ? { document, format: 'legacy', owners } : undefined;
  }

  activeCodeDocument() {
    return this.activeCodeEntry()?.document;
  }

  activeZssDocument() {
    return this.activeCodeDocument();
  }

  symbolItem(node, uri) {
    const item = new NavigatorItem(node.label, node.children.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None, {
      nodeType: 'symbol', uri, line: node.line, contextValue: node.contextValue, childNodes: node.children
    });
    item.description = node.description;
    if (node.tooltip) item.tooltip = node.tooltip;
    item.iconPath = new vscode.ThemeIcon(node.icon);
    item.command = { command: 'zssNavigator.reveal', title: 'Reveal Code Symbol', arguments: [item] };
    return item;
  }

  async getChildren(element) {
    if (!element) {
      const roots = [];
      const activeEntry = this.activeCodeEntry(), active = activeEntry?.document;
      if (active) {
        const current = new NavigatorItem(
          `Current: ${path.basename(active.fileName)}`,
          vscode.TreeItemCollapsibleState.Expanded,
          { nodeType: 'document', uri: active.uri, contextValue: 'zssCurrentFile', format: activeEntry.format }
        );
        if (activeEntry.owners.length) Object.assign(current, codeNavigatorAssignments.ownerSummary(activeEntry.owners));
        current.iconPath = new vscode.ThemeIcon('symbol-file');
        roots.push(current);
      }

      const config = vscode.workspace.getConfiguration('zssNavigator');
      if (config.get('showWorkspaceFiles', true) && vscode.workspace.workspaceFolders) {
        const workspace = new NavigatorItem(
          'Workspace Code Files',
          vscode.TreeItemCollapsibleState.Collapsed,
          { nodeType: 'workspace', contextValue: 'zssWorkspace' }
        );
        workspace.description = codeNavigatorModel.SOURCE_SUMMARY;
        workspace.iconPath = new vscode.ThemeIcon('files');
        roots.push(workspace);
      }
      if (!roots.length) {
        const empty = new NavigatorItem('Open a ZSS, CNS, or CMD file or workspace folder to begin', vscode.TreeItemCollapsibleState.None,
          { nodeType: 'navigatorEmpty', contextValue: 'zssNavigatorEmpty' });
        empty.description = 'no code navigation source';
        empty.tooltip = `Open a code file (${codeNavigatorModel.SOURCE_SUMMARY}), or add a workspace folder containing one.`;
        empty.iconPath = new vscode.ThemeIcon('info');
        empty.command = { command: 'workbench.action.files.openFile', title: 'Open a Code File' };
        roots.push(empty);
      }
      return roots;
    }

    if (element.nodeType === 'workspace') {
      const limit = vscode.workspace.getConfiguration('zssNavigator').get('maxWorkspaceFiles', 500);
      const uris = await vscode.workspace.findFiles(codeNavigatorModel.WORKSPACE_GLOB, codeNavigatorModel.WORKSPACE_EXCLUDE, limit);
      // DEF-assigned extras (e.g. st8 = config.txt). DEFs are scanned once per invalidation, not per refresh.
      let assigned = [], merged = null;
      if (this.assignments) {
        if (!this.assignments.workspace) {
          const defs = await vscode.workspace.findFiles('**/*.def', codeNavigatorModel.WORKSPACE_EXCLUDE, Math.min(limit, codeNavigatorAssignments.LIMITS.workspaceDefs));
          this.assignments.indexWorkspace(defs.map(uri => uri.fsPath));
        }
        // Current owners first: an active DEF, or the proved owner DEF(s) of the active assigned file,
        // even when the capped global DEF scan missed them. Recomputed on every expansion/refresh.
        const activeDocument = vscode.window.activeTextEditor?.document;
        const activeIsFile = activeDocument && !(activeDocument.uri?.scheme && activeDocument.uri.scheme !== 'file');
        const priorityDefs = activeIsFile && /\.def$/i.test(activeDocument.fileName || '') ? [activeDocument.fileName]
          : (this.activeCodeEntry()?.owners || []).map(row => row.owner);
        merged = this.assignments.workspaceRows(priorityDefs);
        const listed = new Set(uris.map(uri => uri.fsPath.toLowerCase()));
        assigned = merged.rows.filter(row => !listed.has(row.file.toLowerCase()));
      }
      if (!uris.length && !assigned.length) {
        const empty = new NavigatorItem('No ZSS, CNS, or CMD files found in this workspace', vscode.TreeItemCollapsibleState.None,
          { nodeType: 'navigatorWorkspaceEmpty', contextValue: 'zssNavigatorWorkspaceEmpty' });
        empty.description = 'Open or create a code file, then use Refresh.';
        empty.tooltip = `The current workspace folders contain no discoverable ${codeNavigatorModel.NAVIGABLE_EXTENSIONS.map(value => `.${value}`).join(', ')} files.`;
        empty.iconPath = new vscode.ThemeIcon('info');
        empty.command = { command: 'workbench.action.files.openFile', title: 'Open a Code File' };
        return [empty];
      }
      const entries = [
        ...uris.map(uri => ({ uri, format: undefined, owners: [] })),
        ...assigned.map(row => ({ uri: vscode.Uri.file(row.file), format: 'legacy', owners: merged.byFile.get(row.file.toLowerCase()) || [row] }))
      ];
      return entries
        .sort((a, b) => a.uri.fsPath.localeCompare(b.uri.fsPath))
        .map(({ uri, format, owners }) => {
          const relative = vscode.workspace.asRelativePath(uri, false);
          const item = new NavigatorItem(relative, vscode.TreeItemCollapsibleState.Collapsed, {
            nodeType: 'document', uri, contextValue: 'zssFile', format
          });
          item.description = codeNavigatorModel.formatLabel(uri.fsPath);
          item.iconPath = new vscode.ThemeIcon('file-code');
          item.tooltip = uri.fsPath;
          if (owners.length) {
            const summary = codeNavigatorAssignments.ownerSummary(owners);
            item.description = `${path.extname(uri.fsPath).slice(1).toUpperCase()} · ${summary.description}`;
            item.tooltip = `${uri.fsPath}\n${summary.tooltip}`;
          }
          return item;
        });
    }

    if (element.nodeType === 'document') {
      const document = await vscode.workspace.openTextDocument(element.uri);
      const format = element.format || codeNavigatorModel.navigatorFormat(document) || codeNavigatorModel.navigatorFormat({ fileName: element.uri?.fsPath })
        || (this.assignments?.ownersOf(document.fileName || element.uri?.fsPath).length ? 'legacy' : 'zss');
      const nodes = codeNavigatorModel.navigatorNodes(document.getText(), format);
      if (!nodes.length) {
        const notice = codeNavigatorModel.emptyDocumentNotice(format, document.fileName || element.uri?.fsPath);
        const empty = new NavigatorItem(notice.label, vscode.TreeItemCollapsibleState.None,
          { nodeType: 'navigatorDocumentEmpty', contextValue: 'zssNavigatorDocumentEmpty' });
        empty.description = notice.description;
        empty.tooltip = notice.tooltip;
        empty.iconPath = new vscode.ThemeIcon('info');
        return [empty];
      }
      return nodes.map((node) => this.symbolItem(node, document.uri));
    }

    if (element.nodeType === 'symbol' && Array.isArray(element.childNodes)) {
      return element.childNodes.map((node) => this.symbolItem(node, element.uri));
    }

    return [];
  }

  getTreeItem(element) {
    return element;
  }
}

class ZssControllerProvider {
  constructor(catalog = controllerCatalog, getCapabilities = () => ({}), reviewStore = null, reviewAuthority = null) {
    this.catalog = catalog;
    this.getCapabilities = getCapabilities;
    this.reviewStore = reviewStore;
    this.reviewAuthority = reviewAuthority;
    this.filter = '';
    this.changeEmitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.changeEmitter.event;
  }

  refresh() {
    try {
      const review = this.reviewProjection();
      vscode.commands.executeCommand('setContext', 'ikemen.controllerChangesAvailable', Boolean(review.visible && review.unreviewedCount));
    } catch (_) {
      vscode.commands.executeCommand('setContext', 'ikemen.controllerChangesAvailable', false);
    }
    vscode.commands.executeCommand('setContext', 'ikemen.controllerFilterActive', Boolean(this.filter));
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
    return require('./intent_search').matches([
      controller.name,
      controller.status,
      controller.description,
      ...controller.params.map((parameter) => parameter.name)
    ].join(' '), this.filter, vscode.workspace.getConfiguration('ikemenZss').get('authoring.intentAliases', {}));
  }

  matchesStructure(structure) {
    if (!this.filter) return true;
    return require('./intent_search').matches(`${structure.label} ${structure.detail} ${structure.id}`, this.filter, vscode.workspace.getConfiguration('ikemenZss').get('authoring.intentAliases', {}));
  }

  matchesLua(entry) {
    if (!this.filter) return true;
    return require('./intent_search').matches([
      entry.name,
      entry.signature,
      entry.description,
      entry.parameters,
      entry.returns,
      entry.category,
      entry.source
    ].join(' '), this.filter, vscode.workspace.getConfiguration('ikemenZss').get('authoring.intentAliases', {}));
  }

  matchesStage(entry) {
    if (!this.filter) return true;
    return require('./intent_search').matches([entry.scope, entry.name, entry.signature, entry.key, entry.description].join(' '), this.filter, vscode.workspace.getConfiguration('ikemenZss').get('authoring.intentAliases', {}));
  }

  stageSections() {
    const types = stageDefCatalog.types.filter(entry => entry.scope === 'bgctrl' && entry.completable && this.matchesStage(entry));
    const controls = stageDefCatalog.entries.filter(entry => entry.completable && ['bgctrl', 'bgctrldef'].includes(entry.scope) && this.matchesStage(entry));
    const def = stageDefCatalog.entries.filter(entry => entry.completable && !['bgctrl', 'bgctrldef'].includes(entry.scope) && this.matchesStage(entry));
    return [
      { id: 'bgTypes', label: 'BGCtrl types', entries: types },
      { id: 'bgOptions', label: 'BGCtrl options', entries: controls },
      { id: 'defOptions', label: 'Stage DEF options', entries: def }
    ];
  }

  luaProjectFunctions() {
    const document = vscode.window.activeTextEditor?.document;
    if (!document || document.languageId !== 'lua') return [];
    return parseLuaFunctions(document.getText(), document.fileName).definitions.filter((entry) => entry.topLevel && this.matchesLua({ ...entry, signature: `${entry.name}(${entry.params.join(', ')})`, category: 'Current file' }));
  }

  filteredCatalog(status) {
    return filterAvailable(this.catalog, this.getCapabilities(vscode.window.activeTextEditor?.document?.uri)).filter((controller) =>
      controller.status === status && this.matches(controller)
    );
  }

  reviewContext(context = null) {
    const root = context?.root || context?.directory || vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || 'workspace';
    const files = (context?.files || context?.connectedFiles || []).filter((value) => typeof value === 'string').map((value) => path.resolve(value).toLowerCase()).sort().slice(0, 256);
    return JSON.stringify(['State Controllers', path.resolve(root), context?.identity || context?.id || context?.key || '', files]);
  }

  reviewProjectionFor(capabilities, contextIdentity) {
    const acknowledged = this.reviewStore?.acknowledged(contextIdentity) || {};
    return controllerChangeMarkers.project(this.catalog, capabilities, { acknowledged });
  }

  reviewProjection() { const contextIdentity = this.reviewContext(); return this.reviewProjectionFor(this.getCapabilities(vscode.window.activeTextEditor?.document?.uri), contextIdentity); }

  markerFor(controller, review = this.reviewProjection()) {
    return review.items?.find((item) => item.marked && String(item.controller).toLowerCase() === String(controller?.name).toLowerCase()) || null;
  }

  decorateReadOnlyTreeRecord(item) {
    const review = this.reviewProjection();
    if (item?.nodeType === 'controller') {
      const marker = this.markerFor(item.controller, review);
      return marker ? { reviewController: marker.controller, markerText: controllerChangeMarkers.ACCESSIBLE_MARKER, changeMarker: true } : {};
    }
    if (item?.nodeType === 'controllerGroup') {
      const groupId = item.status === 'new' ? 'new' : item.status === 'changed' ? 'changed' : '', group = review.groups?.find((value) => value.id === groupId);
      return group?.unreviewedCount ? { reviewGroup: groupId, markerText: controllerChangeMarkers.ACCESSIBLE_MARKER, changeMarker: true } : {};
    }
    return {};
  }

  async reviewControllerFor(controller, context, expectedSnapshotId = '', isCurrent = () => true, dialect) {
    const contextIdentity = this.reviewContext(context), capabilities = this.getCapabilities(context || vscode.window.activeTextEditor?.document?.uri), review = this.reviewProjectionFor(capabilities, contextIdentity), marked = this.markerFor(controller, review);
    if (!marked) return false;
    if (expectedSnapshotId && review.snapshotId !== expectedSnapshotId) throw new Error('Controller review context changed; refresh Coding Assistance before acknowledging.');
    const issued = this.reviewAuthority.issueDetails(contextIdentity, review, controller.name), options = issued.details.options.map((item) => `${item.name}${item.required ? ' (required)' : ''}: ${item.placeholder || 'value'}${item.description ? ` — ${item.description}` : ''}`).join('\n');
    const actions = this.reviewStore?.available ? ['Acknowledge Reviewed', 'Insert Controller'] : ['Insert Controller'];
    const answer = await vscode.window.showInformationMessage(`${issued.details.controller} — ${issued.details.markerText}`, { modal: true, detail: `${issued.details.description || 'State controller'}\n\nCurrent effective options:\n${options || '(no documented options)'}\n\nTarget: ${issued.details.target}${this.reviewStore?.available ? '' : '\n\nAcknowledgement storage is unavailable; this marker remains read-only.'}` }, ...actions);
    if (answer === 'Insert Controller') return insertController(controller, this.catalog, this.getCapabilities, dialect);
    if (answer !== 'Acknowledge Reviewed') return false;
    if (!isCurrent()) throw new Error('Coding Assistance changed context before controller acknowledgement. Refresh and review again.');
    const currentCapabilities = this.getCapabilities(context || vscode.window.activeTextEditor?.document?.uri), current = this.reviewProjectionFor(currentCapabilities, contextIdentity), records = this.reviewAuthority.consume(issued.receipt, contextIdentity, current);
    await this.reviewStore.acknowledge(contextIdentity, records); this.refresh(); return true;
  }

  async reviewController(controller, dialect) {
    if (controller?.nodeType === 'controller') { dialect = controller.dialect; controller = controller.controller; }
    if (!controller) {
      const review = this.reviewProjection();
      const choices = filterAvailable(this.catalog, this.getCapabilities(vscode.window.activeTextEditor?.document?.uri))
        .filter((candidate) => this.markerFor(candidate, review))
        .map((candidate) => ({ label: candidate.name, description: candidate.description || 'Changed controller contract', controller: candidate }));
      if (!choices.length) return vscode.window.showInformationMessage('No unreviewed controller changes are available for the current project target.');
      const picked = await vscode.window.showQuickPick(choices, { title: 'Review New or Changed Controller', placeHolder: 'Choose the exact controller contract to review.' });
      if (!picked) return false;
      controller = picked.controller;
    }
    return this.reviewControllerFor(controller, null, undefined, undefined, dialect);
  }

  async clearReviewGroupFor(groupId, context, expectedSnapshotId = '', isCurrent = () => true) {
    const contextIdentity = this.reviewContext(context), capabilities = this.getCapabilities(context || vscode.window.activeTextEditor?.document?.uri), review = this.reviewProjectionFor(capabilities, contextIdentity);
    if (!groupId || !this.reviewStore?.available) return false;
    if (expectedSnapshotId && review.snapshotId !== expectedSnapshotId) throw new Error('Controller review context changed; refresh Coding Assistance before acknowledging.');
    const receipt = this.reviewAuthority.issueGroup(contextIdentity, review, groupId), count = receipt.items.length, label = groupId === 'new' ? 'IKEMEN New' : 'Changed / Expanded';
    const answer = await vscode.window.showWarningMessage(`Clear all ${count} change marker${count === 1 ? '' : 's'} in this group?`, { modal: true, detail: `This acknowledges the exact current controller contracts in ${label}. It does not modify source, controller definitions, the selected engine target, or compatibility policy.` }, 'Clear Change Markers');
    if (answer !== 'Clear Change Markers') return false;
    if (!isCurrent()) throw new Error('Coding Assistance changed context before group acknowledgement. Refresh and review again.');
    const currentCapabilities = this.getCapabilities(context || vscode.window.activeTextEditor?.document?.uri), current = this.reviewProjectionFor(currentCapabilities, contextIdentity), records = this.reviewAuthority.consume(receipt, contextIdentity, current);
    await this.reviewStore.acknowledge(contextIdentity, records); this.refresh(); return true;
  }
  async clearReviewGroup(element) {
    let groupId = element?.status === 'new' ? 'new' : element?.status === 'changed' ? 'changed' : '';
    if (!groupId) {
      const review = this.reviewProjection();
      const choices = (review.groups || []).filter((group) => ['new', 'changed'].includes(group.id) && group.unreviewedCount).map((group) => ({
        label: group.id === 'new' ? 'IKEMEN New' : 'Changed / Expanded',
        description: `${group.unreviewedCount} unreviewed controller${group.unreviewedCount === 1 ? '' : 's'}`,
        groupId: group.id
      }));
      if (!choices.length) return vscode.window.showInformationMessage('No controller change-marker groups are available to clear for the current project target.');
      const picked = await vscode.window.showQuickPick(choices, { title: 'Clear Controller Change Markers', placeHolder: 'Choose the exact reviewed group to acknowledge.' });
      if (!picked) return false;
      groupId = picked.groupId;
    }
    return this.clearReviewGroupFor(groupId, null);
  }

  browserSnapshot(context = {}) {
    const contextIdentity = this.reviewContext(context), capabilities = this.getCapabilities(context), review = this.reviewProjectionFor(capabilities, contextIdentity), groups = [['new', 'IKEMEN New'], ['changed', 'Changed / Expanded'], ['old', 'MUGEN Compatible']];
    return { items: groups.map(([status, label]) => {
      const children = filterAvailable(this.catalog, capabilities).filter((controller) => controller.status === status).map((controller) => {
        const marker = this.markerFor(controller, review);
        return { id: `controller:${String(controller.name).toLowerCase()}`, label: `${controller.name}${marker ? ' *' : ''}`, description: `${controller.params.length} options${marker ? ` · ${controllerChangeMarkers.ACCESSIBLE_MARKER}` : ''}`, detail: controller.description || 'State controller', ...(marker ? { reviewController: controller.name, reviewSnapshot: review.snapshotId, markerText: controllerChangeMarkers.ACCESSIBLE_MARKER } : {}) };
      });
      const reviewGroup = review.groups?.find((item) => item.id === status), marked = Boolean(reviewGroup?.unreviewedCount);
      return { id: `controller-group:${status}`, label: `${label} (${children.length})${marked ? ' *' : ''}`, description: marked ? `${reviewGroup.unreviewedCount} unreviewed · group count remains ${children.length}` : `${children.length} controllers`, ...(marked ? { reviewGroup: status, reviewSnapshot: review.snapshotId, markerText: controllerChangeMarkers.ACCESSIBLE_MARKER } : {}), children };
    }).filter((group) => group.children.length), count: review.count, unreviewedCount: review.unreviewedCount, snapshotId: review.snapshotId, note: review.note };
  }

  getChildren(element) {
    if (!element) {
      const quickAccess = new NavigatorItem('Authoring Quick Access', vscode.TreeItemCollapsibleState.Expanded,
        { nodeType: 'authoringQuickRoot', contextValue: 'authoringQuickRoot' });
      quickAccess.iconPath = new vscode.ThemeIcon('star-full');
      const count = ['new', 'changed', 'old'].reduce((sum, status) => sum + this.filteredCatalog(status).length, 0);
      const controllerGroups = this.filter && !count ? [] : ['zss', 'ikemen-cns'].map(dialect => {
        const label = dialect === 'zss' ? 'ZSS' : 'CNS';
        const item = new NavigatorItem(label + ' State Controllers (' + count + ')',
          this.filter ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
          { nodeType: 'controllerDialect', dialect });
        item.id = 'controllers.' + dialect;
        item.iconPath = new vscode.ThemeIcon('symbol-module');
        return item;
      });
      const stageCount = this.stageSections().reduce((count, section) => count + section.entries.length, 0);
      if (stageCount) {
        const stage = new NavigatorItem(`Stage Authoring (${stageCount})`, this.filter ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
          { nodeType: 'stageAuthoringRoot', contextValue: 'stageAuthoringRoot' });
        stage.iconPath = new vscode.ThemeIcon('layers');
        stage.tooltip = 'Read-only Stage DEF and BGCtrl references are available without an open Stage. Open Stage Code for the exact active Stage and its linked sources; character state controllers and triggers belong in attached character code.';
        controllerGroups.push(stage);
      }
      controllerGroups.push(...require("./visual_def_authoring_tree").items(null, vscode, NavigatorItem, this.filter, entry => this.matchesStage(entry)));
      const structureCount = zssStructures.STRUCTURES.filter((item) => this.matchesStructure(item)).length;
      if (structureCount) {
        const structures = new NavigatorItem(
          `ZSS Structure & Logic (${structureCount})`,
          this.filter ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
          { nodeType: 'structureRoot', contextValue: 'zssStructureRoot' }
        );
        structures.iconPath = new vscode.ThemeIcon('symbol-structure');
        structures.tooltip = 'Valid starting structures for conditions, selection, loops, functions, assignments, states, and common safety patterns.';
        controllerGroups.push(structures);
      }
      const luaApiCount = luaApiCatalog.filter((entry) => this.matchesLua(entry)).length;
      const luaProjectCount = this.luaProjectFunctions().length;
      if (luaApiCount || luaProjectCount) {
        const lua = new NavigatorItem(
          `Lua Authoring (${luaApiCount + luaProjectCount})`,
          this.filter ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
          { nodeType: 'luaRoot', contextValue: 'ikemenLuaRoot' }
        );
        lua.iconPath = new vscode.ThemeIcon('code');
        lua.tooltip = 'IKEMEN Lua API functions and hooks, plus top-level functions detected in the active Lua file.';
        controllerGroups.push(lua);
      }
      if (this.filter && !controllerGroups.length) {
        const empty = new NavigatorItem(`No controller, Stage, structure, or Lua matches for “${this.filter}”`, vscode.TreeItemCollapsibleState.None,
          { nodeType: 'authoringFilterEmpty', contextValue: 'authoringFilterEmpty' });
        empty.description = 'Change or clear the filter to restore results.';
        empty.iconPath = new vscode.ThemeIcon('search-stop');
        return [quickAccess, empty];
      }
      return [quickAccess, ...controllerGroups];
    }

    if (element.nodeType === 'controllerDialect') {
      const { dialect } = element;
      const review = this.reviewProjection();
      const groups = [
        ['new', 'IKEMEN New'],
        ['changed', 'Changed / Expanded'],
        ['old', 'MUGEN Compatible']
      ];
      return groups.map(([status, label]) => {
        const count = this.filteredCatalog(status).length;
        const reviewGroup = review.groups?.find((item) => item.id === status), marked = Boolean(reviewGroup?.unreviewedCount);
        const item = new NavigatorItem(
          `${label} (${count})${marked ? ' *' : ''}`,
          this.filter
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed,
          { nodeType: 'controllerGroup', dialect, status, contextValue: marked ? 'zssControllerChangedGroup' : 'zssControllerGroup' }
        );
        item.id = 'controllers.' + dialect + '.' + status;
        item.iconPath = new vscode.ThemeIcon(
          marked ? 'asterisk' : status === 'new' ? 'sparkle' : status === 'changed' ? 'diff-modified' : 'archive',
          marked ? new vscode.ThemeColor('errorForeground') : undefined
        );
        if (marked) item.tooltip = `${controllerChangeMarkers.ACCESSIBLE_MARKER}. ${reviewGroup.unreviewedCount} controller${reviewGroup.unreviewedCount === 1 ? '' : 's'} unreviewed; group count remains ${count}.`;
        return item;
      }).filter((item) => !this.filter || this.filteredCatalog(item.status).length);
    }

    if (element.nodeType === 'authoringQuickRoot') {
      const sections = [];
      const favoriteCount = authoringLibrary.favorites().length;
      const recentCount = authoringLibrary.recents().length;
      if (favoriteCount) sections.push(new NavigatorItem(`Favorites (${favoriteCount})`, vscode.TreeItemCollapsibleState.Expanded, { nodeType: 'authoringFavorites', contextValue: 'authoringFavorites' }));
      if (recentCount) sections.push(new NavigatorItem(`Recent (${recentCount})`, vscode.TreeItemCollapsibleState.Collapsed, { nodeType: 'authoringRecents', contextValue: 'authoringRecents' }));
      const shortcuts = [
        ['Recipe Library…', 'ikemen.authoring.openRecipes', 'book'],
        ['Project Symbols & Contracts…', 'ikemen.authoring.openSymbols', 'symbol-variable'],
        ['Example Templates…', 'ikemen.authoring.openExamples', 'references'],
        ['Manage Favorites…', 'ikemen.authoring.openFavorites', 'star-full']
      ];
      return [...sections, ...shortcuts.map(([label, command, icon]) => {
        const item = new NavigatorItem(label, vscode.TreeItemCollapsibleState.None, { nodeType: 'authoringShortcut', contextValue: 'authoringShortcut' });
        item.iconPath = new vscode.ThemeIcon(icon);
        item.command = { command, title: label };
        return item;
      })];
    }

    if (['visualDefRoot', 'visualDefGroup'].includes(element.nodeType)) {
      return require('./visual_def_authoring_tree').items(element, vscode, NavigatorItem, this.filter, entry => this.matchesStage(entry));
    }
    if (element.nodeType === 'stageAuthoringRoot') {
      const groups = this.stageSections().filter(section => section.entries.length).map(section => {
        const item = new NavigatorItem(`${section.label} (${section.entries.length})`, this.filter ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
          { nodeType: 'stageAuthoringGroup', section: section.id, contextValue: 'stageAuthoringGroup' });
        item.iconPath = new vscode.ThemeIcon(section.id === 'bgTypes' ? 'symbol-method' : 'symbol-property');
        item.tooltip = section.id === 'bgTypes' ? 'Native [BGCtrl] types in the Stage DEF.' : 'Documented Stage DEF parameters; authored values depend on the specific Stage.';
        return item;
      });
      const attached = new NavigatorItem('Attached code references…', vscode.TreeItemCollapsibleState.Collapsed,
        { nodeType: 'stageAttachedReferences', contextValue: 'stageAttachedReferences' });
      attached.iconPath = new vscode.ThemeIcon('references');
      attached.tooltip = 'Stage-related character controllers, triggers, and Lua references. CNS/ZSS controllers and triggers require a linked character owner.';
      return [...groups, attached];
    }

    if (element.nodeType === 'stageAuthoringGroup') {
      const section = this.stageSections().find(section => section.id === element.section);
      if (element.section === 'defOptions') return [...new Set((section?.entries || []).map(entry => entry.scope))].map(scope => {
        const count = section.entries.filter(entry => entry.scope === scope).length;
        const item = new NavigatorItem(`[${scope}] (${count})`, this.filter ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
          { nodeType: 'stageScopeGroup', scope, contextValue: 'stageScopeGroup' });
        item.iconPath = new vscode.ThemeIcon('symbol-module');
        return item;
      });
      return this.stageEntryItems(section?.entries || []);
    }

    if (element.nodeType === 'stageScopeGroup') {
      return this.stageEntryItems(this.stageSections().find(section => section.id === 'defOptions').entries.filter(entry => entry.scope === element.scope));
    }

    if (element.nodeType === 'stageAttachedReferences') {
      const categories = ['Trigger', 'State controller', 'Lua'];
      return categories.map(category => {
        const item = new NavigatorItem(category === 'State controller' ? 'Stage-related character controllers…' : category === 'Trigger' ? 'Stage-related character triggers…' : 'Stage Lua functions…', vscode.TreeItemCollapsibleState.None,
          { nodeType: 'stageAttachedReference', category, contextValue: 'stageAttachedReference' });
        item.iconPath = new vscode.ThemeIcon('book');
        item.tooltip = 'Browse bundled read-only Stage references. Character controllers and triggers are authored in an explicitly linked CNS/ZSS source.';
        item.command = { command: 'ikemen.stage.openReference', title: 'Open Stage reference', arguments: [{ category }] };
        return item;
      });
    }

    if (element.nodeType === 'authoringFavorites' || element.nodeType === 'authoringRecents') {
      const entries = element.nodeType === 'authoringFavorites' ? authoringLibrary.favorites() : authoringLibrary.recents();
      return entries.slice(0, 10).map((entry) => {
        const item = new NavigatorItem(entry.label, vscode.TreeItemCollapsibleState.None, { nodeType: 'authoringCatalogItem', entry, contextValue: 'authoringCatalogItem' });
        item.description = `${entry.kind} · ${entry.source}`;
        item.tooltip = `${entry.detail}\n\nSource: ${entry.source}\nCompatibility: ${entry.compatibility}`;
        item.iconPath = new vscode.ThemeIcon(entry.kind === 'recipe' ? 'book' : entry.kind === 'recipeSection' ? 'symbol-snippet' : entry.kind === 'structure' ? 'symbol-structure' : 'references');
        item.command = ['structure', 'recipeSection'].includes(entry.kind)
          ? { command: 'ikemen.authoring.insertCatalogItem', title: 'Insert authoring item', arguments: [entry] }
          : { command: entry.kind === 'examplePack' ? 'ikemen.authoring.openExamples' : 'ikemen.authoring.openRecipes', title: 'Open authoring library' };
        return item;
      });
    }
    if (element.nodeType === 'controllerGroup') {
      const review = this.reviewProjection();
      return this.filteredCatalog(element.status).map((controller) => {
        const marker = this.markerFor(controller, review);
        const item = new NavigatorItem(
          `${controller.name}${marker ? ' *' : ''}`,
          vscode.TreeItemCollapsibleState.None,
          { nodeType: 'controller', controller, dialect: element.dialect, contextValue: marker ? 'zssControllerChanged' : 'zssController' }
        );
        item.id = 'controllers.' + element.dialect + '.' + element.status + '.' + controller.name;
        item.description = `${controller.params.length} options${marker ? ` · ${controllerChangeMarkers.ACCESSIBLE_MARKER}` : ''}`;
        item.iconPath = new vscode.ThemeIcon(marker ? 'asterisk' : 'symbol-method', marker ? new vscode.ThemeColor('errorForeground') : undefined);
        const tooltip = new vscode.MarkdownString();
        tooltip.appendMarkdown(`**${controller.name}** · ${controller.status}\n\n`);
        tooltip.appendText(controller.description || 'State controller');
        if (marker) tooltip.appendMarkdown(`\n\n**${controllerChangeMarkers.ACCESSIBLE_MARKER}.** Review the current documentation and options to acknowledge it.`);
        tooltip.appendMarkdown(`\n\n[Open merged documentation](${controller.url})`);
        item.tooltip = tooltip;
        item.command = {
          command: marker ? 'zssControllers.reviewChange' : 'zssControllers.insert',
          title: marker ? 'Review Controller Change' : (element.dialect === 'ikemen-cns' ? 'Insert CNS State Controller' : 'Insert ZSS State Controller'),
          arguments: [controller, element.dialect]
        };
        return item;
      });
    }


    if (element.nodeType === 'structureRoot') {
      return zssStructures.GROUPS.map((group) => {
        const count = zssStructures.STRUCTURES.filter((item) => item.group === group.id && this.matchesStructure(item)).length;
        const item = new NavigatorItem(`${group.label} (${count})`, this.filter ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
          { nodeType: 'structureGroup', group: group.id, contextValue: 'zssStructureGroup' });
        item.iconPath = new vscode.ThemeIcon(group.icon);
        return item;
      }).filter((item) => Number(/\((\d+)\)$/.exec(item.label)?.[1] || 0));
    }

    if (element.nodeType === 'structureGroup') {
      return zssStructures.STRUCTURES.filter((structure) => structure.group === element.group && this.matchesStructure(structure)).map((structure) => {
        const item = new NavigatorItem(structure.label, vscode.TreeItemCollapsibleState.None,
          { nodeType: 'structure', structure, contextValue: 'zssStructure' });
        item.description = structure.wrap ? 'insert or wrap' : 'insert';
        item.iconPath = new vscode.ThemeIcon('symbol-snippet');
        const tooltip = new vscode.MarkdownString();
        tooltip.appendMarkdown(`**${structure.label}**\n\n`);
        tooltip.appendText(structure.detail);
        if (structure.wrap) tooltip.appendMarkdown('\n\nSelect complete lines to wrap them, or click with no selection to insert an empty structure.');
        item.tooltip = tooltip;
        item.command = { command: 'zssStructures.insert', title: 'Insert or Wrap ZSS Structure', arguments: [structure] };
        return item;
      });
    }

    if (element.nodeType === 'luaRoot') {
      const nodes = [];
      const project = this.luaProjectFunctions();
      if (project.length) {
        const item = new NavigatorItem(`Current File Functions (${project.length})`, this.filter ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
          { nodeType: 'luaProjectGroup', contextValue: 'ikemenLuaProjectGroup' });
        item.iconPath = new vscode.ThemeIcon('symbol-function');
        item.tooltip = 'Top-level functions authored in the active Lua file. Select one to reveal its definition.';
        nodes.push(item);
      }
      const categories = [...new Set(luaApiCatalog.filter((entry) => this.matchesLua(entry)).map((entry) => entry.category))];
      for (const category of categories) {
        const count = luaApiCatalog.filter((entry) => entry.category === category && this.matchesLua(entry)).length;
        const item = new NavigatorItem(`${category} (${count})`, this.filter ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
          { nodeType: 'luaApiGroup', category, contextValue: 'ikemenLuaApiGroup' });
        item.iconPath = new vscode.ThemeIcon(/hook/i.test(category) ? 'plug' : 'library');
        nodes.push(item);
      }
      return nodes;
    }

    if (element.nodeType === 'luaProjectGroup') {
      return this.luaProjectFunctions().map((entry) => {
        const signature = `${entry.name}(${entry.params.join(', ')})`;
        const item = new NavigatorItem(signature, vscode.TreeItemCollapsibleState.None,
          { nodeType: 'luaProjectFunction', entry, contextValue: 'ikemenLuaProjectFunction' });
        item.description = entry.local ? 'local' : 'project';
        item.iconPath = new vscode.ThemeIcon('symbol-function');
        item.tooltip = entry.documentation || `Authored at line ${entry.line + 1} of ${path.basename(entry.filename)}.`;
        item.command = { command: 'ikemen.lua.goToFunction', title: 'Go to Lua Function', arguments: [entry] };
        return item;
      });
    }

    if (element.nodeType === 'luaApiGroup') {
      return luaApiCatalog.filter((entry) => entry.category === element.category && this.matchesLua(entry)).map((entry) => {
        const item = new NavigatorItem(entry.signature || entry.name, vscode.TreeItemCollapsibleState.None,
          { nodeType: 'luaApi', entry, contextValue: 'ikemenLuaApi' });
        item.description = entry.kind === 'hook' ? 'hook' : 'IKEMEN API';
        item.iconPath = new vscode.ThemeIcon(entry.kind === 'hook' ? 'plug' : 'symbol-method');
        const tooltip = new vscode.MarkdownString();
        tooltip.appendMarkdown(`**${entry.signature || entry.name}**\n\n`);
        tooltip.appendText(entry.description || 'IKEMEN Lua API entry.');
        if (entry.parameters) tooltip.appendMarkdown(`\n\n**Parameters:** ${entry.parameters}`);
        if (entry.returns) tooltip.appendMarkdown(`\n\n**Returns:** ${entry.returns}`);
        if (entry.url) tooltip.appendMarkdown(`\n\n[Open Lua documentation](${entry.url})`);
        item.tooltip = tooltip;
        item.command = { command: 'ikemen.lua.insertApi', title: 'Insert IKEMEN Lua API', arguments: [entry] };
        return item;
      });
    }

    return [];
  }

  stageEntryItems(entries) {
    return entries.map(entry => {
      const label = `${entry.signature || `type = ${entry.name}`}${entry.controller ? ` · ${entry.controller}` : ''}`;
      const item = new NavigatorItem(label, vscode.TreeItemCollapsibleState.None,
        { nodeType: 'stageAuthoringEntry', entry, contextValue: 'stageAuthoringEntry' });
      item.description = entry.name ? 'BGCtrl type' : `[${entry.scope}]`;
      item.iconPath = new vscode.ThemeIcon('book');
      item.tooltip = `${label}\n\n${String(entry.description || '').replace(/\s+/g, ' ').slice(0, 900)}\n\nRead-only bundled reference; no code is inserted.`;
      item.command = { command: 'ikemen.stage.openReference', title: 'Open Stage reference', arguments: [{ catalog: entry.name ? 'types' : 'entries', index: (entry.name ? stageDefCatalog.types : stageDefCatalog.entries).indexOf(entry) }] };
      return item;
    });
  }

  getTreeItem(element) {
    return element;
  }
}

async function insertController(controller, catalog = controllerCatalog, getCapabilities = () => ({}), dialect) {
  const editor = vscode.window.activeTextEditor;
  const language = editor && (assignedLegacyText(editor.document) ? 'ikemen-cns' : editor.document.languageId);
  if (!editor || (language !== 'zss' && language !== 'ikemen-cns')) {
    vscode.window.showWarningMessage('Open a ZSS or CNS file before inserting a state controller.');
    return;
  }
  if (dialect && dialect !== language) {
    return vscode.window.showWarningMessage('Open a ' + (dialect === 'ikemen-cns' ? 'CNS' : 'ZSS') + ' source file to insert from this section.');
  }
  if (!controller || !controller.name) {
    const availableCatalog = filterAvailable(catalog, getCapabilities(editor.document.uri));
    const picked = await vscode.window.showQuickPick(availableCatalog.map((item) => ({ label: item.name, description: item.description, controller: item })), {
      title: 'Insert IKEMEN state controller',
      placeHolder: 'Choose a native controller. Required options will always be reviewed.'
    });
    if (!picked) return;
    controller = picked.controller;
  }
  if (!entryAvailable(controller, getCapabilities(editor.document.uri))) {
    return vscode.window.showWarningMessage('The selected state controller is not supported by this project engine target. Nothing was inserted.');
  }
  controller = filterAvailable([controller], getCapabilities(editor.document.uri))[0];
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
      prompt: `${parameter.required ? 'Required' : 'Selected optional'} IKEMEN option`,
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
}

async function filterControllers(provider) {
  const value = await vscode.window.showInputBox({
    title: 'Filter State Controllers, ZSS Structures, or Lua Authoring',
    prompt: 'Search controller names, options, structures, Lua functions, hooks, signatures, or descriptions',
    value: provider.filter
  });
  if (value !== undefined) provider.setFilter(value);
}

async function insertLuaApi(entry) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'lua') return vscode.window.showWarningMessage('Open a Lua file before inserting an IKEMEN Lua function or hook.');
  if (!entry?.name) {
    const picked = await vscode.window.showQuickPick(luaApiCatalog.map((candidate) => ({ label: candidate.signature || candidate.name, description: candidate.description || candidate.category || 'IKEMEN Lua API', entry: candidate })), {
      title: 'Insert IKEMEN Lua API',
      placeHolder: 'Choose the exact function or hook to insert.'
    });
    if (!picked) return false;
    entry = picked.entry;
  }
  const value = luaAuthoringInsert(entry);
  if (!value) return false;
  await editor.insertSnippet(new vscode.SnippetString(value), editor.selection.active);
  return true;
}

async function goToLuaFunction(entry) {
  if (!entry?.filename || !Number.isInteger(entry.line)) {
    const active = vscode.window.activeTextEditor?.document;
    if (!active || active.languageId !== 'lua') return vscode.window.showWarningMessage('Open a Lua file before choosing an authored Lua function.');
    const definitions = parseLuaFunctions(active.getText(), active.fileName).definitions.filter((candidate) => candidate.topLevel);
    if (!definitions.length) return vscode.window.showInformationMessage('No top-level Lua functions were found in the active file. Add a function, save it, then try again.');
    const picked = await vscode.window.showQuickPick(definitions.map((candidate) => ({ label: `${candidate.name}(${candidate.params.join(', ')})`, description: `Line ${candidate.line + 1}`, entry: candidate })), {
      title: 'Go to Authored Lua Function',
      placeHolder: 'Choose the exact top-level function to reveal.'
    });
    if (!picked) return false;
    entry = picked.entry;
  }
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(entry.filename));
  const editor = await vscode.window.showTextDocument(document, { preview: false });
  const line = Math.max(0, Math.min(entry.line, document.lineCount - 1));
  const position = new vscode.Position(line, 0);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  return editor;
}

async function openControllerDocs(item) {
  let controller = item && item.controller ? item.controller : item;
  if (!controller?.url) {
    const picked = await vscode.window.showQuickPick(require('./live_coding_catalog').controllers.filter((entry) => entry.url).map((entry) => ({ label: entry.name, description: entry.description || 'State controller', controller: entry })), {
      title: 'Open State Controller Documentation',
      placeHolder: 'Choose the controller documentation to open.'
    });
    if (!picked) return false;
    controller = picked.controller;
  }
  await vscode.env.openExternal(vscode.Uri.parse(controller.url));
  return true;
}

async function openLuaApiDocs(item) {
  let entry = item?.entry || item;
  if (!entry?.url) {
    const choices = luaApiCatalog.filter((candidate) => candidate.url).map((candidate) => ({ label: candidate.signature || candidate.name, description: candidate.description || candidate.category || 'IKEMEN Lua API', entry: candidate }));
    if (!choices.length) return vscode.window.showInformationMessage('No Lua API documentation links are available in the bundled catalog.');
    const picked = await vscode.window.showQuickPick(choices, { title: 'Open IKEMEN Lua API Documentation', placeHolder: 'Choose the exact function or hook documentation to open.' });
    if (!picked) return false;
    entry = picked.entry;
  }
  await vscode.env.openExternal(vscode.Uri.parse(entry.url));
  return true;
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

let airClsn2BatchService = null;
async function batchEditClsn2() {
  try {
    const source = await airClsn2BatchService.textSource(vscode.window.activeTextEditor);
    return await airClsn2BatchService.run(source);
  } catch (error) { vscode.window.showErrorMessage(`AIR Clsn2 batch: ${error.message}`); }
}

function sameSelection(left, right) {
  return left?.start?.line === right?.start?.line && left?.start?.character === right?.start?.character
    && left?.end?.line === right?.end?.line && left?.end?.character === right?.end?.character;
}

async function showContextualZssRecommendations() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'zss') return;
  const document = editor.document, selection = editor.selection, capture = {
    uri: document.uri.toString(), version: document.version,
    selection: new vscode.Range(selection.start, selection.end)
  };
  const model = require('./zss_context_recommendations').contextualRecommendations({
    text: document.getText(), line: selection.active.line,
    selectedText: selection.isEmpty ? '' : document.getText(selection),
    favoriteIds: authoringLibrary.favorites().map(item => item.id),
    recentIds: authoringLibrary.recents().map(item => item.id),
    intentAliases: vscode.workspace.getConfiguration('ikemenZss', document.uri).get('authoring.intentAliases', {})
  });
  if (!model.items.length) return;
  const choices = model.items.map(item => ({
    label: `$(sparkle) Insert: ${item.label}`,
    description: [item.favorite ? 'Favorite' : '', item.recent ? 'Recent' : '', item.family || item.source].filter(Boolean).join(' · '),
    detail: `Why offered: ${item.reason} Uses the existing ${item.source} catalog entry; no project convention or value is inferred.`,
    action: 'insert', item
  }));
  choices.push(
    { label: '$(book) Browse the complete Recipe Library', description: 'No insertion', detail: `Why offered: the detected context matched “${model.query}”; browse existing alternatives manually.`, action: 'recipes' },
    { label: '$(star-full) Review Authoring Favorites', description: 'No insertion', detail: 'Why offered: favorites preserve choices you explicitly made for your workflow and project conventions.', action: 'favorites' },
    { label: '$(references) Review Example Templates', description: 'Reference only', detail: 'Why offered: examples can provide context without being treated as universal or inserted automatically.', action: 'examples' }
  );
  const picked = await vscode.window.showQuickPick(choices, {
    title: 'IKEMaker ZSS — Contextual Recommendations',
    placeHolder: 'Nothing is inserted until you explicitly choose an Insert item.',
    matchOnDescription: true, matchOnDetail: true
  });
  if (!picked) return;
  if (picked.action !== 'insert') return authoringLibrary.open(picked.action, document.uri);
  const current = vscode.window.activeTextEditor;
  if (!current || current.document.uri.toString() !== capture.uri || current.document.version !== capture.version || !sameSelection(current.selection, capture.selection)) {
    return vscode.window.showInformationMessage('The source or selection changed while recommendations were open. Run Contextual Recommendations again; nothing was inserted.');
  }
  return vscode.commands.executeCommand('ikemen.authoring.insertCatalogItem', picked.item);
}

function stripBaseIndent(text, base) {
  if (!base) return text;
  return String(text).split(/\r?\n/).map((line) => line.startsWith(base) ? line.slice(base.length) : line).join('\n');
}

function applyBaseIndent(snippet, base, eol) {
  const normalized = String(snippet).replace(/\r?\n/g, eol);
  return base + normalized.split(eol).join(`${eol}${base}`);
}

async function insertZssStructure(structure) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'zss') {
    vscode.window.showWarningMessage('Open a ZSS file before inserting a ZSS structure.');
    return false;
  }
  const selected = !editor.selection.isEmpty && structure.wrap;
  if (!selected) {
    return await editor.insertSnippet(new vscode.SnippetString(structure.snippet), editor.selection.active) !== false;
  }
  const document = editor.document;
  const range = fullLineSelection(document, editor.selection);
  const original = document.getText(range);
  const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
  const nonblank = original.split(/\r?\n/).find((line) => line.trim());
  const base = leadingWhitespace(nonblank || '');
  const body = stripBaseIndent(original, base);
  const snippet = zssStructures.wrapSnippet(structure, body, { eol, indentUnit: editorIndentUnit(editor) });
  return await editor.insertSnippet(new vscode.SnippetString(applyBaseIndent(snippet, base, eol)), range) !== false;
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
  if (!item || !item.uri) {
    await focusIkemenView('zssNavigator');
    return vscode.window.showInformationMessage('Choose a file and authored symbol in the Code Navigator to reveal it.');
  }
  const document = await vscode.workspace.openTextDocument(item.uri);
  const editor = await vscode.window.showTextDocument(document, { preview: false });
  const line = Math.max(0, Math.min(item.line || 0, document.lineCount - 1));
  const position = new vscode.Position(line, 0);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(
    new vscode.Range(position, position),
    vscode.TextEditorRevealType.AtTop
  );
  return editor;
}

async function auditWorkspace(registry, functionDiagnostics, stateDiagnostics) {
  const limit = vscode.workspace.getConfiguration('ikemenZss').get('maxAuditFiles', 1000);
  let uris = [];
  let issueCount = 0;
  let warningCount = 0;
  const scanned = [];
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Auditing IKEMEN ZSS entity and frame safety',
    cancellable: true
  }, async (progress, token) => {
    const result = await require('./workspace_audit_sources').visitWorkspaceAuditDocuments(vscode, limit, async (document, uri, index, total) => {
      const result = /\.zss$/i.test(document.fileName || '') ? analyzeDocument(document) : { issues: [], records: { calls: [], functions: [] } };
      scanned.push({ document, result });
      issueCount += result.issues.length;
      warningCount += result.issues.filter((entry) => ['error', 'warning'].includes(entry.severity)).length;
      progress.report({ increment: 100 / Math.max(1, total), message: vscode.workspace.asRelativePath(uri, false) });
    }, { cancelled: () => token.isCancellationRequested });
    uris = result.uris;
  });

  for (const entry of scanned) {
    const additions = [];
    const lineRange = (record) => {
      const line = Math.min(record.line, entry.document.lineCount - 1);
      const max = entry.document.lineAt(line).text.length;
      return new vscode.Range(line, Math.min(record.start, max), line, Math.min(record.start + record.name.length, max));
    };
    // The live registrar is the sole owner of assigned-character function
    // findings. Await it here so a full audit preserves coverage and counts
    // without publishing the same problem through a second collection.
    const liveFunctionDiagnostics = functionDiagnostics && /\.zss$/i.test(entry.document.fileName || '') ? await functionDiagnostics.update(entry.document) : [];
    issueCount += liveFunctionDiagnostics.length;
    warningCount += liveFunctionDiagnostics.length;
    // State-transfer findings remain owned by their live collection. Awaiting
    // that owner preserves full-audit coverage without cloning diagnostics into
    // the general analyzer collection.
    const liveStateDiagnostics = stateDiagnostics ? await stateDiagnostics.update(entry.document) : [];
    issueCount += liveStateDiagnostics.length;
    warningCount += liveStateDiagnostics.length;
    for (const call of entry.result.records.calls) {
      const sameFileLater = entry.result.records.functions.find(item => item.name.toLowerCase() === call.name.toLowerCase() && item.line > call.line);
      if (sameFileLater) {
        const diagnostic = new vscode.Diagnostic(lineRange(call), `${call.name} is declared later in this file; ZSS functions may only call predefined functions.`, vscode.DiagnosticSeverity.Warning);
        diagnostic.source = `IKEMEN ZSS · ${require('./lua_target_catalog').targetLabel(activeCapabilityResolver(document.uri))}`; diagnostic.code = 'function-order'; additions.push(diagnostic);
      }
    }
    for (const declaration of entry.result.records.functions) {
      const sameFile = entry.result.records.functions.filter(item => item.name.toLowerCase() === declaration.name.toLowerCase());
      if (sameFile.length > 1) {
        const diagnostic = new vscode.Diagnostic(lineRange(declaration), `Function ${declaration.name} is declared ${sameFile.length} times in this file.`, vscode.DiagnosticSeverity.Error);
        diagnostic.source = `IKEMEN ZSS · ${require('./lua_target_catalog').targetLabel(activeCapabilityResolver(document.uri))}`; diagnostic.code = 'duplicate-function'; additions.push(diagnostic);
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
  const visualDefAuthoring = require('./visual_def_authoring_tree');
  context.subscriptions.push(vscode.commands.registerCommand(visualDefAuthoring.command, (...args) => visualDefAuthoring.useExample(vscode, ...args)));
  // The synchronized entity host must exist before any viewer or companion can
  // attach.  Individual surfaces still opt in only after their exact source is
  // bound, so activation does not create panels or write project assets.
  require('./entity_switch_runtime').initializeEntitySwitchRuntime(vscode, context);
  companionSwitch.register(vscode, context);
  textEditorToolbar.register(vscode, context, assignedLegacyText);
  airClsn2BatchService = createAirClsn2BatchService(vscode, context);
  require('./pending_changes_ui').register(vscode, context);
  const modeExistingKeys=context.globalState.keys?.()||[];
  require('./interface_mode').register(vscode,context);
  require('./workspace_setup').register(vscode,context);
  require('./asset_workspace').configure(vscode);
  require('./asset_workspace').register(context);
  require('./sff_private_storage').register(context);
  require('./save_controls').register(context);
  require('./visual_authoring_browser_service').register(context, vscode);
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
  diagnosticAssignments=navigator.assignments;
  const persistedControllerCatalog = context.globalState.get('ikemenZss.controllerCatalog.v1', controllerCatalog);
  const codingCatalog = require('./live_coding_catalog');
  codingCatalog.apply(persistedControllerCatalog, context.globalState.get('ikemenZss.triggerCatalog.v1'));
  const savedControllerCatalog = codingCatalog.controllers;
  const { RUNTIME_CAPABILITY_IDS: capabilityIds } = require('./runtime_capability_ids');
  const runtimeStringCapability=(input={})=>{
    const source=input?.fsPath||input?.fileName||input?.files?.[0]||input?.connectedFiles?.[0]||vscode.window.activeTextEditor?.document?.fileName||'';
    const root=input?.root||require('./character_context').gameRoot(source)||vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath||path.dirname(source||'.');
    const binding=engineRuntime.targetFor(root,source),catalog=readEngineCatalog(context);
    const capabilities=engineCapabilityPolicy.decisions(catalog,binding.target,capabilityIds);
    const enabledCapabilities=capabilityIds.filter(id=>capabilities[id].enabled);
    return {nightlyStringsEnabled:capabilities['zss.runtime-strings'].enabled,target:binding.target,status:capabilities['zss.runtime-strings'].status,enabledCapabilities,capabilities};
  };
  activeCapabilityResolver = runtimeStringCapability;
  const controllerReviewStore = new ControllerChangeReviewStore(context.workspaceState), controllerReviewAuthority = new ControllerChangeReviewAuthority();
  const controllers = new ZssControllerProvider(savedControllerCatalog, runtimeStringCapability, controllerReviewStore, controllerReviewAuthority);
  controllerReviewStore.refresh().then(() => controllers.refresh(), (error) => vscode.window.showWarningMessage(`Controller change review state could not be loaded; markers remain read-only for this session: ${error.message}`));
  context.subscriptions.push(require('./engine_capability_events').onDidChangeEngineCapabilities(() => {
    controllers.refresh();
    for (const document of vscode.workspace.textDocuments || []) if (['zss','ikemen-cns'].includes(document.languageId) || /\.(?:cmd|inp|jnp|def)$/i.test(document.fileName || document.uri?.fsPath || '')) analyzeDocument(document);
  }));
  authoringLibrary.register(vscode, context, {capabilities:runtimeStringCapability});
  const zssIndex = new WorkspaceZssIndex(vscode);
  const functionCatalogModel = require('./zss_function_catalog');
  const {FunctionCatalogQueryCache}=require('./function_catalog_query_cache'),functionCatalogCache=new FunctionCatalogQueryCache(document=>functionCatalogModel.buildZssFunctionCatalog(vscode,document.uri),catalog=>functionCatalogModel.catalogStillCurrent(vscode,catalog));
  const functionCatalog = document => functionCatalogCache.get(document);
  const invalidateFunctionCatalog=()=>{functionCatalogCache.invalidate();functionCatalogModel.invalidateFunctionOwnerCache();};
  context.subscriptions.push(require('./engine_capability_events').onDidChangeEngineCapabilities(invalidateFunctionCatalog));
  const stateCatalogModel = require('./state_transfer_catalog');
  const stateCatalog = async document => {
    const service = require('./map_registry_service').current(), catalog = await stateCatalogModel.buildStateTransferCatalog(vscode, document.uri, service, { capabilities: runtimeStringCapability(document.uri) });
    return catalog.complete && await stateCatalogModel.stateCatalogStillCurrent(vscode, catalog, service) ? catalog : { ...catalog, complete: false };
  };
  require('./statedef_authoring_workspace').register(vscode, context, { getCatalog: () => controllers.catalog, getCapabilities: runtimeStringCapability, getStateCatalog: stateCatalog });
  const assetCatalog = document => require('./zss_asset_catalog').buildZssAssetCatalog(vscode, document.uri);
  registerLanguageProviders(vscode, context, () => controllers.catalog, document => analyzerOptions(document.uri).commandCatalog, functionCatalog, assetCatalog, stateCatalog, runtimeStringCapability, async document => {const model=require('./lua_function_catalog'),catalog=await model.buildLuaFunctionCatalog(vscode,document);return model.luaCatalogStillCurrent(vscode,catalog,document)?catalog:{complete:false,definitions:[],limitations:['Lua source or a required module changed before assistance publication.']};});
  registerZssAssetDiagnostics(vscode, context, assetCatalog);
  registerLuaSupport(context,runtimeStringCapability);
  registerDefSemanticHighlighting(vscode, context);
  require('./def_outline').register(vscode, context);
  registerNativeDocumentOutlines(vscode, context);
  require('./batch_cmd_detection').registerBatchCmdDetection(vscode, context);
  registerNavigationProviders(vscode, context, zssIndex, functionCatalog, stateCatalog, runtimeStringCapability);
  registerMutationHistory(context);
  registerDiagnosticExplanations(vscode, context);
  registerCommentAssistance(vscode, context);
  require('./copied_layer_links').activate(context.workspaceState);
  require('./authoring_links_workspace').register(vscode, context);
  registerTriggerExpressionPicker(vscode, context, runtimeStringCapability);
  registerFunctionCallPicker(vscode, context, functionCatalog, runtimeStringCapability);
  require('./coding_assistance_insights').register(vscode, context);
  require('./debug_flood_actions').registerDebugFloodFixes(vscode,context,assignedLegacyText);
  require('./cns_trigger_groups').registerTriggerFixes(vscode,context,assignedLegacyText);
  require('./unused_let_code_actions').registerUnusedLetCodeActions(vscode, context);
  require('./scoped_local_code_actions').registerScopedLocalCodeActions(vscode, context);
  require('./contextual_recommendation_code_actions').registerContextualRecommendationCodeActions(vscode, context, {
    favorites: () => authoringLibrary.favorites().map(item => item.id),
    recents: () => authoringLibrary.recents().map(item => item.id)
  });
  registerAnimationStandardDiagnostics(vscode, context);
  const registry = new ZssRegistryProvider();
  const controllerBrowserReader = async (browserContext = {}) => {
    const capabilities = runtimeStringCapability(browserContext), controllerTree = controllers.browserSnapshot(browserContext), triggers = require('./authoring_browser_model').triggerProjection(undefined, { capabilities });
    return { items: [...(controllerTree.items || []), ...(triggers.items || [])], count: controllerTree.count + triggers.count, unreviewedCount: controllerTree.unreviewedCount, snapshotId: controllerTree.snapshotId, note: controllerTree.note, truncated: triggers.truncated };
  };
  controllerBrowserReader.reviewController = (name, browserContext, expectedSnapshotId, isCurrent) => controllers.reviewControllerFor(controllers.catalog.find((item) => String(item.name).toLowerCase() === String(name).toLowerCase()), browserContext, expectedSnapshotId, isCurrent);
  controllerBrowserReader.clearGroup = (groupId, browserContext, expectedSnapshotId, isCurrent) => controllers.clearReviewGroupFor(groupId, browserContext, expectedSnapshotId, isCurrent);
  registerAuthoringWorkspace(vscode, context, {
    'code-navigator': () => readOnlyTreeSnapshot(navigator),
    'project-data': async browserContext => { const base=await readOnlyTreeSnapshot(registry),insights=require('./coding_assistance_insights'),coding=insights.buildCodingAssistanceInsights(vscode,browserContext,{codingScenarios:insights.scenarios(context),conditionValues:insights.conditionValues(context,browserContext.ownerDef)});return{...base,items:[coding,...(base.items||[])]}; },
    recipes: () => ({ items: require('./authoring_browser_model').recipeProjection({ nightlyStringsEnabled:false }).items }),
    controllers: controllerBrowserReader,
    capabilities: runtimeStringCapability
  });
  require('./map_registry_ui').register(vscode, context, { capabilities: runtimeStringCapability });
  const mapRegistryService = require('./map_registry_service').current();
  context.subscriptions.push(require('./engine_capability_events').onDidChangeEngineCapabilities(() => mapRegistryService?.invalidate()));
  let stateDiagnostics;
  const functionDiagnostics = registerZssFunctionDiagnostics(
    vscode,
    context,
    functionCatalog,
    document => ({ ownedPrefixes: analyzerOptions(document.uri).functionPrefixes, capabilities: runtimeStringCapability(document.uri) }),
    {
      invalidateAuthority: invalidateFunctionCatalog,
      onAuthorityChanged: () => stateDiagnostics.refreshOpen(),
      onDidInvalidate: listener => mapRegistryService?.onDidChange(listener) || { dispose() {} },
      isDependency: document => /\.def$/i.test(document?.fileName || '')
        || require('./map_registry_grammar').supportedNative(document?.fileName || '')
        || Boolean(require('./map_registry_grammar').textGrammar(document, mapRegistryService?.context))
    }
  );
  context.subscriptions.push(require('./engine_capability_events').onDidChangeEngineCapabilities(() => functionDiagnostics.refreshOpenZss()));
  stateDiagnostics = registerStateTransferDiagnostics(vscode, context, stateCatalog, {
    getCapabilities: runtimeStringCapability,
    validateCatalog: catalog => stateCatalogModel.stateCatalogStillCurrent(vscode, catalog, mapRegistryService),
    invalidateAuthority: invalidateFunctionCatalog,
    ensureAuthorityWatchers: functionDiagnostics.ensureAuthorityWatchers,
    onDidInvalidate: listener => mapRegistryService?.onDidChange(listener) || { dispose() {} },
    isDependency: document => /\.(?:def|ini|cns|cmd|st|zss)$/i.test(document?.fileName || '')
  });
  const updates = createUpdateMonitor(vscode, context, controllerCatalog, (catalog, triggers) => {
    codingCatalog.apply(catalog, triggers);
    controllers.setCatalog(codingCatalog.controllers);
    for (const document of vscode.workspace.textDocuments || []) analyzeDocument(document);
  });
  registerSffCommands(context);
  registerSffViewer(context);
  context.subscriptions.push(vscode.commands.registerCommand('ikemen.quickTransfer',async()=>{
    const choices=[{label:'SFF - Sprites',command:'sff.quickTransfer'},{label:'AIR - Animations',command:'air.quickTransfer'},{label:'SND - Sounds',command:'snd.quickTransfer'}];
    const picked=await vscode.window.showQuickPick(choices,{title:'Quick Transfer',placeHolder:'Choose the type of item to copy'});
    if(picked)return vscode.commands.executeCommand(picked.command);
  }));
  registerSffTransferHost(context);
  registerSndTransferHost(context);
  registerAirTransferHost(context);
  require('./sff_browser').register(context);
  registerAirViewer(context, airClsn2BatchService, activeCapabilityResolver);
  require('./air_docking_workspace').register(context);
    registerSndViewer(context);
    require('./snd_browser').register(context);
    require('./snd_intake_workspace').register(context);
  registerDirectAssetOpening(vscode, context, assignedLegacyText);
  registerAssetGroupLogs(context);
  registerAssetCreation(context);
  registerCharacterWorkbenches(context);
  registerCharacterDependencyWorkspace(context);
  registerCharacterHealthWorkspace(context);
  registerCnsConverter(context);
  registerProjectContext(context);
  registerProjectManagerWorkspace(context);
  registerProjectBible(vscode, context);
  registerEngineMigration(context);
  registerWorkspacePresets(context);
  require('./docking_prototype').register(context);
  registerImpactPreview(context);
  registerOwnershipAudit(context);
  registerStageWorkspace(context);
  registerScreenpackWorkspace(context);
  registerCommandMovelistWorkspace(context, { getCapabilities: runtimeStringCapability });
  registerCodeStructureWorkspace(vscode, context, runtimeStringCapability);
  registerSelectDefWorkspace(context);
  registerMenuModesWorkspace(context);
  registerStoryDialogueWorkspace(context);
  registerStoryboardWorkspace(context);
  require('./layered_psd_workspace').register(context);
  registerPaletteIndexOrganizer(context);
  registerMoveConstantsWorkspace(context, { getCapabilities: runtimeStringCapability });
  registerCharacterScaleReview(vscode, context);
  registerMoveLab(context);
  registerHitDefWorkspace(context);
  registerThrowCreator(context);
  registerSpatialComposer(context);
  registerTrajectoryWorkspace(context);
  registerHelperLab(context);
  registerPaletteImportWorkspace(context);
  registerPlayerPaletteWorkspace(context);
  registerArtistIntake(context);
  registerSffAssembly(context);
  context.subscriptions.push(require('./sff_writer_preference').register(context));
  require('./sff_sheet_drafts').configure(context.globalStorageUri?.fsPath);
  require('./sff_creator_workspace').register(context);
  require('./sff_add_sprites_workspace').register(context);
  context.subscriptions.push(vscode.commands.registerCommand('ikemen.fontLab.open', options => require('./font_lab').createFontLabPanel(vscode, context.extensionUri, options?.fsPath ? {} : options || {})));
  require('./shader_workshop_host').registerShaderWorkshop(context);
  registerProductionWorkflow(context);
  registerReleaseBuilder(context);
  registerTestSessionWorkspace(context);
  registerRelatedWork(context);
  require('./viewer_navigation').registerViewerNavigation(context);
  require('./viewer_native_shortcuts').register(context, vscode);
  require('./viewer_sources').registerSources(context);
  require('./viewer_comparison').registerComparison(context);
  registerOfflineDocs(vscode, context, updates.refreshCodingCatalogs);
  registerHelpWorkspace(context);
  registerExperience(context);
  registerAuthoringBridge(context);
  require('./def_workspace').registerDefWorkspace(context);
  require('./ikemen_hub').registerIkemenHub(context, { getCapabilities: runtimeStringCapability });
  registerExtensionUpdater(vscode, context);
  registerUpdateCenter(vscode, context);
  let analysisTimer;
  let commandReferenceTimer;
  let frameSyncTimer;
  const scheduleAnalysis = (document) => {
    clearTimeout(analysisTimer);
    analysisTimer = setTimeout(() => analyzeDocument(document), 250);
  };
  const scheduleCommandReferenceAnalysis = () => {
    clearTimeout(commandReferenceTimer);
    commandReferenceTimer = setTimeout(() => {
      for (const document of vscode.workspace.textDocuments) if (['zss', 'ikemen-cns'].includes(document.languageId)) analyzeDocument(document);
    }, 250);
  };
  const scheduleFrameSync = (document) => {
    auditFirstActiveElementConstants.invalidate();
    clearTimeout(frameSyncTimer);
    frameSyncTimer = setTimeout(() => { void auditFirstActiveElementConstants({ document }).catch(error => console.warn('IKEMEN frame sync:', error)); }, 400);
  };

  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(selector, new ZssDocumentSymbolProvider()),
    vscode.languages.registerFoldingRangeProvider(selector, new ZssFoldingProvider()),
    vscode.window.registerTreeDataProvider('zssNavigator', navigator),
    vscode.window.registerTreeDataProvider('zssStateControllers', controllers),
    vscode.window.registerTreeDataProvider('zssRegistry', registry),
    vscode.commands.registerCommand('zssNavigator.refresh', () => navigator.refreshAll()),
    vscode.commands.registerCommand('zssNavigator.reveal', revealSymbol),
		vscode.commands.registerCommand('zss.goToLine', goToLine),
		vscode.commands.registerCommand('zss.toggleLineComment', () => vscode.commands.executeCommand('editor.action.commentLine')),
		vscode.commands.registerCommand('zss.openProjectData', () => focusIkemenView('zssRegistry')),
		vscode.commands.registerCommand('zss.openControllers', () => focusIkemenView('zssStateControllers')),
		vscode.commands.registerCommand('zss.contextualRecommendations', showContextualZssRecommendations),
		vscode.commands.registerCommand('ikemen.zssLearning.open', async () => {
			const document = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(context.extensionUri, 'data', 'zss-learning-criteria.md'));
			return vscode.window.showTextDocument(document, { preview: false });
		}),
		vscode.commands.registerCommand('zss.openPalFxEditor', (uri, options) => openPalFxEditor(context, uri, options)),
    vscode.commands.registerCommand('zssControllers.search', () => filterControllers(controllers)),
    vscode.commands.registerCommand('zssControllers.clearFilter', () => controllers.setFilter('')),
    vscode.commands.registerCommand('zssControllers.insert', (controller, dialect) => insertController(controller, controllers.catalog, runtimeStringCapability, dialect)),
    vscode.commands.registerCommand('zssControllers.openDocs', openControllerDocs),
    vscode.commands.registerCommand('ikemen.lua.insertApi', insertLuaApi),
    vscode.commands.registerCommand('ikemen.lua.goToFunction', goToLuaFunction),
    vscode.commands.registerCommand('ikemen.lua.openApiDocs', openLuaApiDocs),
    vscode.commands.registerCommand('zssControllers.reviewChange', (controller, dialect) => controllers.reviewController(controller, dialect)),
    vscode.commands.registerCommand('zssControllers.reviewChangeByName', (name) => controllers.reviewController(controllers.catalog.find((item) => String(item.name).toLowerCase() === String(name).toLowerCase()))),
    vscode.commands.registerCommand('zssControllers.clearChangeGroup', (group) => controllers.clearReviewGroup(group)),
    vscode.commands.registerCommand('zssControllers.clearChangeGroupById', (groupId) => controllers.clearReviewGroup({ status: groupId, label: groupId === 'new' ? 'IKEMEN New' : 'Changed / Expanded' })),
    vscode.commands.registerCommand('zssStructures.insert', insertZssStructure),
    vscode.commands.registerCommand('ikemen.authoring.refreshSidebar', () => controllers.refresh()),
    vscode.commands.registerCommand('ikemen.authoring.insertCatalogItem',entry=>require('./authoring_catalog_insertion').insertCatalogItem(vscode,entry,{capabilities:runtimeStringCapability,entryAvailable,insertReviewedLiteral:require('./authoring_literal_insertion').insertReviewedLiteral,insertStructure:insertZssStructure,structureById:zssStructures.structureById,recordRecent:authoringLibrary.recordRecent})),
    vscode.commands.registerCommand('zssStructures.browse', async () => {
      const picked = await vscode.window.showQuickPick(zssStructures.STRUCTURES.map((structure) => ({
        label: structure.label,
        description: zssStructures.GROUPS.find((group) => group.id === structure.group)?.label || '',
        detail: structure.detail,
        structure
      })), { title: 'Insert or wrap with ZSS Structure & Logic', placeHolder: 'Search by syntax or use case; selected complete lines are wrapped when supported.' });
      if (picked) await insertZssStructure(picked.structure);
    }),
    vscode.commands.registerCommand('zss.wrap.if', () => insertZssStructure(zssStructures.structureById('if'))),
    vscode.commands.registerCommand('zss.wrap.ifElse', () => insertZssStructure(zssStructures.structureById('ifElse'))),
    vscode.commands.registerCommand('zss.wrap.for', () => insertZssStructure(zssStructures.structureById('for'))),
    vscode.commands.registerCommand('zss.wrap.targetGuard', () => insertZssStructure(zssStructures.structureById('targetGuard'))),
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
    vscode.commands.registerCommand('zss.audit.workspace', async () => { await auditFirstActiveElementConstants({ workspace: true }); return auditWorkspace(registry, functionDiagnostics, stateDiagnostics); }),
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
      controllers.refresh();
      if (editor) scheduleFrameSync(editor.document);
      if (editor && (['zss', 'ikemen-cns'].includes(editor.document.languageId)||assignedLegacyText(editor.document)||/\.def$/i.test(editor.document.fileName||''))) analyzeDocument(editor.document);
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.languageId === 'lua') controllers.refresh();
      // A saved DEF can change [Files] assignments (e.g. st8 = config.txt): re-read them once.
      if (/\.def$/i.test(document.fileName || '')) {
        navigator.invalidateAssignments();
        for (const open of vscode.workspace.textDocuments || []) if (open.languageId==='plaintext' && /\.txt$/i.test(open.fileName||'')) analyzeDocument(open);
      }
      else if (codeNavigatorModel.navigatorRefreshNeeded(document, file => navigator.isKnownAssignedFile(file))) navigator.refresh();
      if (['zss', 'ikemen-cns'].includes(document.languageId)||assignedLegacyText(document)||/\.def$/i.test(document.fileName||'')) {
        if (document.languageId === 'zss') registry.refresh();
        analyzeDocument(document);
      }
      if (/\.(?:cmd|inp|jnp|def)$/i.test(document.fileName)) scheduleCommandReferenceAnalysis();
      if (/\.(?:zss|cns|air|def)$/i.test(document.fileName)) scheduleFrameSync(document);
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId === 'lua') controllers.refresh();
      if (codeNavigatorModel.navigatorRefreshNeeded(event.document, file => navigator.isKnownAssignedFile(file))) navigator.refresh();
      if (['zss', 'ikemen-cns'].includes(event.document.languageId)||assignedLegacyText(event.document)||/\.def$/i.test(event.document.fileName||'')) {
        scheduleAnalysis(event.document);
      }
      if (/\.(?:cmd|inp|jnp|def)$/i.test(event.document.fileName)) scheduleCommandReferenceAnalysis();
      if (/\.(?:zss|cns|air|def)$/i.test(event.document.fileName)) scheduleFrameSync(event.document);
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      diagnosticCollection.delete(document.uri);
      if (/\.(?:cmd|inp|jnp|def)$/i.test(document.fileName)) scheduleCommandReferenceAnalysis();
    }),
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
  scheduleFrameSync(vscode.window.activeTextEditor?.document);
  updates.schedule();
  void require('./interface_mode').onboard(modeExistingKeys).catch(error=>vscode.window.showErrorMessage('IKEMaker mode setup: '+error.message));
}

function deactivate() {}

module.exports = { activate, deactivate, ZssControllerProvider };
